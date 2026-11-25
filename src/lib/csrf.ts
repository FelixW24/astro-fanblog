import { randomBytes, timingSafeEqual } from 'node:crypto';

// Synchronizer-Token-Pattern für formularbasierte Aktionen: Beim GET wird ein
// zufälliges Token in die Astro-Session geschrieben und als hidden input in
// das Formular eingebettet. Beim POST wird geprüft, dass das gesendete Token
// mit dem in der Session übereinstimmt. Das schützt vor CSRF, wenn die
// Same-Origin-Prüfung allein nicht ausreicht (z. B. bei älteren Browsern oder
// wenn der Origin-Header fehlt).

const SESSION_KEY = 'csrf_token';
const TOKEN_BYTES = 32;

export function generateCsrfToken(session: {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}): string {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  session.set(SESSION_KEY, token);
  return token;
}

export function verifyCsrfToken(
  session: { get: (key: string) => unknown },
  submitted: string | null | undefined,
): boolean {
  const stored = session.get(SESSION_KEY);
  if (typeof stored !== 'string' || !stored) return false;
  if (!submitted || typeof submitted !== 'string') return false;
  const storedBuf = Buffer.from(stored, 'utf8');
  const submittedBuf = Buffer.from(submitted, 'utf8');
  if (storedBuf.length !== submittedBuf.length) return false;
  return timingSafeEqual(storedBuf, submittedBuf);
}

// Löscht das Token nach erfolgreicher Prüfung, damit es nicht wiederverwendet
// werden kann (One-Time-Token).
export function clearCsrfToken(session: {
  delete: (key: string) => void;
}): void {
  session.delete(SESSION_KEY);
}
