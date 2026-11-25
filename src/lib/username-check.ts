// Live-Prüfung des Benutzernamens: Das Frontend fragt die Server-RPC
// check_username an und zeigt sofort Feedback, ohne die Blacklist selbst zu
// kennen. Reservierte Namen und Duplikate erzwingt unabhängig davon der
// Datenbank-Trigger auf public.reader_profiles.

import { minimumAgeError } from './reader';

export const usernameLiveCheckDebounceMs = 300;
export const usernameLiveCheckRoute = '/api/username-verfuegbar';

export const usernameTakenMessage =
  'Dieser Name ist bereits vergeben oder reserviert.';
export const usernameReservedMessage =
  'Dieser Benutzername ist reserviert. Bitte wähle einen anderen Namen.';
export const usernameDuplicateMessage =
  'Dieser Username ist bereits vergeben. Bitte wähle einen anderen.';

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().normalize('NFC');
}

export function isLiveCheckableUsername(value: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(normalizeUsername(value));
}

export function usernameCheckUrl(username: string): string | null {
  if (!isLiveCheckableUsername(username)) return null;
  return `${usernameLiveCheckRoute}?username=${encodeURIComponent(
    normalizeUsername(username),
  )}`;
}

export function parseUsernameCheckResponse(payload: unknown): boolean | null {
  if (typeof payload === 'object' && payload !== null) {
    const { available } = payload as { available?: unknown };
    if (typeof available === 'boolean') return available;
  }
  return null;
}

// Mappt den Datenbankfehler einer Profil-Speicherung (Trigger bzw.
// Unique-Constraint) auf eine nutzerfreundliche Meldung; null bedeutet, dass
// der Aufrufer seine generische Meldung zeigen soll.
export function profileSaveUsernameError(
  code?: string | null,
  message?: string | null,
): string | null {
  if (code === '23505') return usernameDuplicateMessage;
  if (message?.includes('reserviert')) return usernameReservedMessage;
  // Von complete_reader_profile/update_reader_profile bei unter 13 Jahren.
  if (message?.includes('Minimum age 13')) return minimumAgeError;
  return null;
}
