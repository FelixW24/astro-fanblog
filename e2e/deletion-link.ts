import { loadEnv } from 'vite';
import { accountDeletionToken } from '../src/lib/account-deletion-token';

const env = loadEnv('development', process.cwd(), '');

// Der Server signiert den Bestätigungslink mit der Secret-Kette aus
// src/config/app-config.ts. Lokal ist kein SMTP für die Anwendung
// konfiguriert (Mailpit hat im Supabase-Stack keinen offenen SMTP-Port),
// deshalb minten die E2E-Tests den Mail-Link selbst — mit demselben Secret,
// damit Seite und Token-Prüfung echt durchlaufen werden.
function secret(supabaseSecretKey: string): string {
  const read = (name: string) => process.env[name] ?? env[name];
  const candidates = [
    read('ACCOUNT_DELETION_TOKEN_SECRET'),
    read('NOTIFICATION_UNSUBSCRIBE_SECRET'),
    read('NEWSLETTER_TOKEN_SECRET'),
    read('SUPABASE_AUTH_SECRET_KEY'),
    supabaseSecretKey,
  ];
  const found = candidates.find(
    (value) => typeof value === 'string' && value.length >= 32,
  );
  if (!found)
    throw new Error(
      'Kein Secret für den Löschlink gefunden. Setze SUPABASE_AUTH_SECRET_KEY (SECRET_KEY aus `supabase status`).',
    );
  return found;
}

export function accountDeletionLinkFor(
  userId: string,
  supabaseSecretKey: string,
  origin: string,
): string {
  const token = accountDeletionToken(secret(supabaseSecretKey), userId);
  if (!token) throw new Error('Löschlink konnte nicht erzeugt werden.');
  return `${origin}/konto-loeschen/bestaetigen?token=${encodeURIComponent(token)}`;
}
