import { createHmac, timingSafeEqual } from 'node:crypto';

// Signiertes Token für den Bestätigungslink der Kontolöschung. Das Secret
// wird bewusst als Parameter übergeben: So bleibt die Prüfung ohne
// Serverkonfiguration testbar (Unit-Tests und E2E minten Tokens selbst).
export const ACCOUNT_DELETION_TOKEN_TTL_SECONDS = 24 * 60 * 60;

const PURPOSE = 'delete-account';

// Format v1.<userId>.<zweck>.<ablauf>.<hmac-base64url>. Der Zweck ist
// einkodiert, damit Newsletter- und Benachrichtigungslinks (gleiche
// Secret-Kette) nicht als Löschbestätigung durchgehen. Der Ablauf ist ein
// Unix-Zeitstempel in Sekunden und mit signiert, damit er nicht verlängert
// werden kann.
export function accountDeletionToken(
  secret: string | null | undefined,
  userId: string,
  now = Date.now(),
): string | null {
  if (!secret || !userId) return null;
  const expiry = Math.floor(now / 1000) + ACCOUNT_DELETION_TOKEN_TTL_SECONDS;
  const payload = `v1.${userId}.${PURPOSE}.${expiry}`;
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

// Liefert die Nutzer-ID aus einem gültigen Token, sonst null. Abgelaufene,
// manipulierte und fremde Tokens (anderer Zweck) werden abgewiesen.
export function accountDeletionTokenUserId(
  secret: string | null | undefined,
  token: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!secret || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') return null;
  const [, userId, purpose, expiry, signature] = parts;
  if (!userId || purpose !== PURPOSE) return null;
  if (!/^\d{1,10}$/.test(expiry) || Number(expiry) * 1000 <= now) return null;
  // HMAC-SHA256 als base64url ohne Padding ist immer 43 Zeichen; strikte
  // Zeichensatz-Prüfung, damit gepaddete oder angehängte Suffixe nicht als
  // gültig durchgehen.
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const payload = `v1.${userId}.${PURPOSE}.${expiry}`;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(signature, 'base64url');
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;
  return userId;
}
