import { safeReturnPath } from './reader';

// Erneuter Versand der Bestätigungsmail: Die Bestätigungskarte nach der
// Registrierung bietet den Versand einmal pro Minute pro Adresse an.

export const signupResendCooldownSeconds = 60;

export const resendUnavailableMessage =
  'Der Versand ist im Moment nicht möglich. Bitte versuche es später erneut.';

export function parseResendRequest(form: FormData) {
  const email = String(form.get('email') ?? '').trim();
  let error: string | null = null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    error = 'Bitte gib eine gültige E-Mail-Adresse an.';
  return {
    email,
    next: safeReturnPath(String(form.get('weiter') ?? '')),
    error,
  };
}

// Sekunden als Countdown „m:ss“, z. B. 60 → „1:00“, 9 → „0:09“.
export function formatResendCountdown(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

// Auth-Dienst-Fehler beim Resend: 5xx und 429 (eigenes Limit des
// Auth-Dienstes) sind vorübergehende Störungen und verbrauchen den
// Cooldown nicht. Andere Fehler (Adresse unbekannt oder bereits
// bestätigt) bleiben ohne Hinweis, damit die Kontoverfügbarkeit
// nicht verraten wird.
export function resendUnavailable(status: number | undefined) {
  return (status ?? 500) >= 500 || status === 429;
}
