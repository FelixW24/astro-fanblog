import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { appEnv } from '../config/app-config';

// SQLite keeps counters across restarts and shares them between Node workers.
// Deployments must place this file on a persistent local volume (not NFS).
export function createAuthLimiter(path: string) {
  if (path !== ':memory:')
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(
    'PRAGMA busy_timeout = 3000; PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires INTEGER NOT NULL)',
  );
  const consume = db.prepare(`INSERT INTO auth_limits VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN expires <= ? THEN 1 ELSE hits + 1 END,
    expires = CASE WHEN expires <= ? THEN excluded.expires ELSE expires END
    RETURNING hits, expires`);
  // peek liest ohne Zählererhöhung: blockiert, sobald das Budget voll ist.
  const peekStmt = db.prepare(
    'SELECT hits, expires FROM auth_limits WHERE key = ?',
  );
  const clean = db.prepare('DELETE FROM auth_limits WHERE expires <= ?');
  // Test-Umgebungen heben die Login-Budgets (Astro markiert sie über
  // PLAYWRIGHT_TEST); einzelne Warte­läufe überschreiben sie per Env.
  // Produktion bleibt bei den strengen Defaults, wenn nichts gesetzt ist.
  const envBudget = (name: string) => {
    const raw = Number(appEnv(name));
    return Number.isInteger(raw) && raw > 0 ? raw : undefined;
  };
  const testRun = process.env.PLAYWRIGHT_TEST === '1';
  const loginBudget = (envName: string, fallback: number) =>
    envBudget(envName) ?? (testRun ? 100 : fallback);
  const budgets = {
    email: { window: 10 * 60_000, limit: 5 },
    auth: {
      window: 60_000,
      limit: loginBudget('AUTH_RATE_LIMIT_LOGIN_IP_BUDGET', 20),
    },
    'auth-email': {
      window: 60_000,
      limit: loginBudget('AUTH_RATE_LIMIT_LOGIN_EMAIL_BUDGET', 6),
    },
    mfa: { window: 60_000, limit: 10 },
    verification: { window: 60_000, limit: 10 },
    // Fehlermeldungen aus dem Footer-Modal: ein Bericht pro Leser und 5 Minuten.
    'bug-report': { window: 5 * 60_000, limit: 1 },
    // Erneuter Versand der Bestätigungsmail: eine pro Minute und Adresse.
    'signup-resend': { window: 60_000, limit: 1 },
    // Newsletter-Anmeldung aus dem Willkommens-Modal: 10 Versuche pro IP
    // und 10 Minuten; pro Adresse zusätzlich 2 Bestätigungsmails pro Minute.
    newsletter: { window: 10 * 60_000, limit: 10 },
    'newsletter-email': { window: 60_000, limit: 2 },
    // Tracking-Events (Views/Besuche): großzügig, aber pro IP begrenzt.
    tracking: { window: 60_000, limit: 120 },
  } as const;
  let nextCleanup = 0;
  return {
    consume(address: string, kind: keyof typeof budgets, now = Date.now()) {
      if (now >= nextCleanup) {
        clean.run(now);
        nextCleanup = now + 60_000;
      }
      const { window, limit } = budgets[kind];
      const key = createHash('sha256')
        .update(`${kind}:${address}`)
        .digest('hex');
      const row = consume.get(key, now + window, now, now) as {
        hits: number;
        expires: number;
      };
      return row.hits <= limit
        ? 0
        : Math.max(1, Math.ceil((row.expires - now) / 1000));
    },
    peek(address: string, kind: keyof typeof budgets, now = Date.now()) {
      const { limit } = budgets[kind];
      const key = createHash('sha256')
        .update(`${kind}:${address}`)
        .digest('hex');
      const row = peekStmt.get(key) as
        | {
            hits: number;
            expires: number;
          }
        | undefined;
      if (!row || row.expires <= now || row.hits < limit) return 0;
      return Math.max(1, Math.ceil((row.expires - now) / 1000));
    },
    close() {
      db.close();
    },
  };
}

let limiter: ReturnType<typeof createAuthLimiter> | undefined;
export function authRateLimit(
  address: string,
  pathname: string,
  email?: string,
) {
  limiter ??= createAuthLimiter(
    appEnv('AUTH_RATE_LIMIT_DB') ?? '.data/auth-limits.sqlite',
  );
  const kind = ['/registrieren', '/passwort-vergessen'].includes(pathname)
    ? 'email'
    : pathname === '/admin/sicherheit'
      ? 'mfa'
      : ['/passwort-neu', '/auth/bestaetigen'].includes(pathname)
        ? 'verification'
        : pathname === '/api/newsletter/anmelden'
          ? 'newsletter'
          : 'auth';
  const retry = limiter.consume(address, kind);
  // Login-Versuche zählen zusätzlich pro E-Mail-Adresse. So bleiben
  // geteilte IP-Segmente (Mobilfunk, Firmennetze) für einzelne Konten nutzbar.
  if (kind === 'auth' && email)
    return Math.max(retry, limiter.consume(`email:${email}`, 'auth-email'));
  return retry;
}

// Cooldown für Fehlerberichte: 0 = erlaubt, sonst verbleibende Sekunden.
export function bugReportRateLimit(userId: string) {
  limiter ??= createAuthLimiter(
    appEnv('AUTH_RATE_LIMIT_DB') ?? '.data/auth-limits.sqlite',
  );
  return limiter.consume(userId, 'bug-report');
}

// Verbleibender Bug-Report-Cooldown ohne Erhöhung des Zählers. Die Route
// prüft damit vorab und zählt erst nach erfolgreichem Versand.
export function bugReportCooldown(userId: string) {
  limiter ??= createAuthLimiter(
    appEnv('AUTH_RATE_LIMIT_DB') ?? '.data/auth-limits.sqlite',
  );
  return limiter.peek(userId, 'bug-report');
}

// Cooldown für den erneuten Versand der Bestätigungsmail, keyed über die
// (kleingeschriebene) Adresse. 0 = erlaubt, sonst verbleibende Sekunden.
export function signupResendRateLimit(email: string) {
  limiter ??= createAuthLimiter(
    appEnv('AUTH_RATE_LIMIT_DB') ?? '.data/auth-limits.sqlite',
  );
  return limiter.consume(email.toLowerCase(), 'signup-resend');
}

// Verbleibender Resend-Cooldown ohne Erhöhung des Zählers. Der Signup
// selbst startet den Cooldown, die Route prüft damit vorab.
export function signupResendCooldown(email: string) {
  limiter ??= createAuthLimiter(
    appEnv('AUTH_RATE_LIMIT_DB') ?? '.data/auth-limits.sqlite',
  );
  return limiter.peek(email.toLowerCase(), 'signup-resend');
}

// Verbleibender Newsletter-Cooldown pro Adresse ohne Erhöhung des Zählers.
// Die Route prüft damit vorab und zählt erst nach erfolgreichem Versand der
// Bestätigungsmail (ein SMTP-Fehler verbraucht das Budget nicht).
export function newsletterSignupCooldown(email: string) {
  limiter ??= createAuthLimiter(
    appEnv('AUTH_RATE_LIMIT_DB') ?? '.data/auth-limits.sqlite',
  );
  return limiter.peek(email.toLowerCase(), 'newsletter-email');
}

// Cooldown für die Newsletter-Bestätigungsmail pro Adresse: 0 = erlaubt,
// sonst verbleibende Sekunden.
export function newsletterSignupRateLimit(email: string) {
  limiter ??= createAuthLimiter(
    appEnv('AUTH_RATE_LIMIT_DB') ?? '.data/auth-limits.sqlite',
  );
  return limiter.consume(email.toLowerCase(), 'newsletter-email');
}

// Cooldown für Tracking-API-Aufrufe: 0 = erlaubt, sonst verbleibende Sekunden.
export function trackingRateLimit(address: string) {
  limiter ??= createAuthLimiter(
    appEnv('AUTH_RATE_LIMIT_DB') ?? '.data/auth-limits.sqlite',
  );
  return limiter.consume(address, 'tracking');
}

export const authPostPaths = new Set([
  '/api/profil/konto-loeschen',
  // Bestätigung der Kontolöschung aus der E-Mail: pro IP begrenzt und nur
  // same-origin, damit Links nicht massenhaft durchprobiert werden.
  '/konto-loeschen/bestaetigen',
  '/api/profil/passwort-pruefen',
  '/api/profil/passwort',
  '/api/bug-report',
  '/api/newsletter/anmelden',
  '/api/registrierung/erneut-senden',
  '/anmelden',
  '/admin/login',
  '/registrieren',
  '/passwort-vergessen',
  '/passwort-neu',
  '/auth/bestaetigen',
  '/admin/sicherheit',
]);
