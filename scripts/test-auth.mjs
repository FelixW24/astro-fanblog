import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createClient } from '@supabase/supabase-js';
import { totp } from '../e2e/totp.mjs';

// Sucht einen freien lokalen Port. Isolierte Laeufe duerfen nicht um den
// festen Port 4330 konkurrieren: Parallele Laeufe und liegengebliebene
// Dev-Server verweigern sonst den Start oder beenden den Dev-Server des
// anderen Laufs mitten im Test (siehe playwright.config.ts).
const findFreePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const status = JSON.parse(
  execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
);
if (status.API_URL !== 'http://127.0.0.1:55321')
  throw new Error('Auth-Tests dürfen nur den lokalen Blog-Stack verwenden.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);
const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
const email = `auth-test-${randomUUID()}@example.org`;
const password = `Auth-Test-${randomUUID()}!`;
const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { is_editor: true },
});
if (error)
  throw new Error('Lokales Auth-Testkonto konnte nicht angelegt werden.');
let accountRemoved = false;
const removeAccount = async () => {
  if (accountRemoved) return;
  const removed = await admin.auth.admin.deleteUser(data.user.id);
  if (removed.error) {
    console.error('Temporäres Auth-Testkonto konnte nicht entfernt werden.');
    process.exitCode = 1;
  } else {
    accountRemoved = true;
  }
};
// Ein Abbruch per Ctrl+C waehrend des Laufs darf kein Testkonto in der
// Datenbank zuruecklassen; make bricht den Lauf mit SIGINT bzw. SIGTERM ab.
let interrupted = false;
const onInterrupt = async (code) => {
  if (interrupted) return;
  interrupted = true;
  try {
    await removeAccount();
  } finally {
    process.exit(code);
  }
};
process.once('SIGINT', () => void onInterrupt(130));
process.once('SIGTERM', () => void onInterrupt(143));
try {
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error('Testanmeldung fehlgeschlagen.');
  const enrolled = await client.auth.mfa.enroll({ factorType: 'totp' });
  if (enrolled.error) throw new Error('MFA-Testeinrichtung fehlgeschlagen.');
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code: totp(enrolled.data.totp.secret),
  });
  if (verified.error) throw new Error('MFA-Testbestätigung fehlgeschlagen.');
  await client.auth.signOut({ scope: 'local' });
  const requestedFiles = process.argv.slice(2);
  const fullSuite = requestedFiles.length === 1 && requestedFiles[0] === 'e2e';
  const files = fullSuite
    ? readdirSync('e2e')
        .filter((file) => file.endsWith('.spec.ts'))
        .sort()
        .map((file) => join('e2e', file))
    : [
        ...(requestedFiles.length
          ? requestedFiles
          : [
              'e2e/auth-security.spec.ts',
              'e2e/admin-login.spec.ts',
              'e2e/readers.spec.ts',
            ]),
      ];
  // Mehrere angeforderte Dateien laufen wie die Voll-Suite pro Datei mit
  // eigenem Rate-Limit-Speicher und eigenem Dev-Server, weil Budgets wie
  // das MFA-Limit sonst zwischen den Dateien kollidieren.
  const isolateFiles = fullSuite || requestedFiles.length > 1;
  const limitsDir = isolateFiles
    ? mkdtempSync(join(tmpdir(), 'blog-auth-limits-'))
    : null;
  try {
    for (const [index, file] of (isolateFiles ? files : [null]).entries()) {
      if (interrupted) break;
      // Freier Lauf-Port pro Datei (siehe findFreePort). CI setzt SITE_ORIGIN
      // per write-ci-env.mjs auf Port 4330; ohne Anpassung wuerden
      // Formularpruefungen wie isSameOrigin jede Server-Action des Laufs
      // ablehnen. Ein gesetztes SITE_ORIGIN folgt daher dem Lauf-Port;
      // lokal (SITE_ORIGIN leer) prueft die App gegen den Request-Origin.
      const port = await findFreePort();
      const siteOrigin = process.env.SITE_ORIGIN
        ? new URL(process.env.SITE_ORIGIN).origin.replace(/:\d+$/, `:${port}`)
        : null;
      const child = spawn(
        'node_modules/.bin/playwright',
        ['test', ...(file ? [file] : files), '--workers=1'],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            ADMIN_EMAIL: email,
            ADMIN_PASSWORD: password,
            ADMIN_TOTP_SECRET: enrolled.data.totp.secret,
            SUPABASE_AUTH_SECRET_KEY: status.SECRET_KEY,
            ...(limitsDir
              ? {
                  AUTH_RATE_LIMIT_DB: join(limitsDir, `${index}.sqlite`),
                  PLAYWRIGHT_REUSE_SERVER: '0',
                  PLAYWRIGHT_PORT: String(port),
                  ...(siteOrigin ? { SITE_ORIGIN: siteOrigin } : {}),
                  PLAYWRIGHT_OUTPUT_DIR: join('test-results', `spec-${index}`),
                  PLAYWRIGHT_REPORT_DIR: join(
                    'playwright-report',
                    `spec-${index}`,
                  ),
                }
              : {}),
          },
        },
      );
      const code = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', (value) => resolve(value ?? 1));
      });
      if (code !== 0) process.exitCode = 1;
    }
  } finally {
    if (limitsDir) rmSync(limitsDir, { recursive: true, force: true });
  }
} finally {
  await removeAccount();
}
