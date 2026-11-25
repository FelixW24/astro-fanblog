// Setup-Gate für Leserkonten: Wer seine E-Mail bestätigt hat, aber das
// Profil noch nicht eingerichtet hat, wird von jeder Seite in die
// Profileinrichtung geführt. Freie Seiten sind der Workflow selbst, Abmeldung,
// Rechtsseiten sowie technische und administrative Routen.

import { safeReturnPath } from './reader';

const profileGatePages = new Set([
  '/profil/einrichten',
  '/abmelden',
  '/datenschutz',
  '/agb',
  '/impressum',
  // Passwort-Recovery bleibt erreichbar: Der Link des ersten Versuchs legt
  // bereits eine Sitzung an, bevor der Authenticator-Code geprüft wird.
  '/passwort-neu',
  '/passwort-vergessen',
  // Bestätigung der Kontolöschung per E-Mail: Der Link muss auch ohne
  // eingerichtetes Profil funktionieren.
  '/konto-loeschen/bestaetigen',
]);

const profileGatePrefixes = [
  '/api/',
  '/auth/',
  '/admin/',
  '/_astro/',
  '/_image/',
];

export function profileGateExempt(path: string): boolean {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (profileGatePages.has(normalized)) return true;
  if (profileGatePrefixes.some((prefix) => normalized.startsWith(prefix)))
    return true;
  // Dateiähnliche Pfade (favicon.ico, robots.txt, Feeds) sind keine Seiten.
  return /\.[a-zA-Z0-9]+$/.test(normalized);
}

// Nach der Einrichtung geht es dorthin zurück, wo der Nutzer ursprünglich
// hin wollte; andere Ziele landen wie ohnehin auf /profil.
export function profileGateTarget(path: string): string {
  const destination = safeReturnPath(path);
  return destination === '/profil'
    ? '/profil/einrichten'
    : `/profil/einrichten?weiter=${encodeURIComponent(destination)}`;
}
