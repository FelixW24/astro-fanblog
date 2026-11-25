import { readFileSync } from 'node:fs';
import process from 'node:process';

type AppEnv = Record<string, string | boolean | undefined>;

const buildEnv = import.meta.env as AppEnv;

/** Read a value from the protected server environment, with Astro's build
 * environment as a fallback for values configured at build time. */
export function appEnv(
  name: string,
  runtimeEnv: AppEnv = process.env,
  astroBuildEnv: AppEnv = buildEnv,
): string | undefined {
  const runtimeValue = runtimeEnv[name];
  const value =
    runtimeValue === undefined || runtimeValue === ''
      ? astroBuildEnv[name]
      : runtimeValue;
  return typeof value === 'string' ? value : undefined;
}

function first(...values: (string | undefined)[]) {
  return values.find((value) => value !== undefined && value !== '');
}

function readSecretFile(path: string | undefined) {
  if (!path) return undefined;
  try {
    return readFileSync(path, 'utf8').trimEnd();
  } catch {
    return undefined;
  }
}

/** Central server-side application configuration. Secrets are read at runtime
 * first so production credentials do not need to be embedded during builds. */
export function appConfig() {
  const smtpHost = first(
    appEnv('MAIL_SMTP_HOST'),
    appEnv('BUG_REPORT_SMTP_HOST'),
  );
  const smtpUser = first(
    appEnv('MAIL_SMTP_USER'),
    appEnv('BUG_REPORT_SMTP_USER'),
  );
  const smtpPassword = first(
    appEnv('MAIL_SMTP_PASSWORD'),
    readSecretFile(appEnv('MAIL_SMTP_PASSWORD_FILE')),
    appEnv('BUG_REPORT_SMTP_PASS'),
  );
  const mailFrom = first(appEnv('MAIL_FROM'), appEnv('BUG_REPORT_MAIL_FROM'));

  return {
    siteOrigin: first(appEnv('SITE_ORIGIN'), 'https://example.com')!,
    supabase: {
      url: appEnv('PUBLIC_SUPABASE_URL'),
      publishableKey: appEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
      authSecretKey: appEnv('SUPABASE_AUTH_SECRET_KEY'),
    },
    mail: {
      smtpHost,
      smtpPort:
        Number(
          first(appEnv('MAIL_SMTP_PORT'), appEnv('BUG_REPORT_SMTP_PORT')),
        ) || 465,
      smtpUser,
      smtpPassword,
      from: first(mailFrom, smtpUser),
    },
    editor: {
      email: appEnv('ADMIN_EMAIL')?.trim().toLowerCase() ?? '',
      password: appEnv('ADMIN_PASSWORD') ?? '',
      trustSecret: appEnv('EDITOR_TRUST_SECRET'),
    },
    notifications: {
      unsubscribeSecret: appEnv('NOTIFICATION_UNSUBSCRIBE_SECRET'),
    },
    newsletter: {
      // HMAC-Secret für die signierten Bestätigungs- und Abmeldelinks des
      // Newsletters. Fällt auf das Notification-Secret zurück, damit ein
      // bestehendes Secret weiterverwendet werden kann.
      tokenSecret: first(
        appEnv('NEWSLETTER_TOKEN_SECRET'),
        appEnv('NOTIFICATION_UNSUBSCRIBE_SECRET'),
      ),
    },
    accountDeletion: {
      // HMAC-Secret für den Bestätigungslink der Kontolöschung. Fällt auf die
      // übrigen App-Secrets zurück und zuletzt auf den serverseitigen
      // Auth-Schlüssel: Die zugesagte Löschmöglichkeit darf nicht an einer
      // vergessenen Secret-Konfiguration scheitern. Der Zweck ist im Token
      // einkodiert, deshalb sind die Tokens der anderen Abläufe nicht
      // wiederverwendbar.
      tokenSecret: first(
        appEnv('ACCOUNT_DELETION_TOKEN_SECRET'),
        appEnv('NOTIFICATION_UNSUBSCRIBE_SECRET'),
        appEnv('NEWSLETTER_TOKEN_SECRET'),
        appEnv('SUPABASE_AUTH_SECRET_KEY'),
      ),
    },
  };
}
