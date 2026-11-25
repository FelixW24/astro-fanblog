import { describe, expect, it } from 'vitest';
import {
  clearCsrfToken,
  generateCsrfToken,
  verifyCsrfToken,
} from './csrf';

function fakeSession(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => {
      store.set(key, value);
    },
    delete: (key: string) => {
      store.delete(key);
    },
    _store: store,
  };
}

describe('CSRF-Token', () => {
  it('generiert ein Token und legt es in der Session ab', () => {
    const session = fakeSession();
    const token = generateCsrfToken(session);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.get('csrf_token')).toBe(token);
  });

  it('verifiziert ein gültiges Token', () => {
    const session = fakeSession();
    const token = generateCsrfToken(session);
    expect(verifyCsrfToken(session, token)).toBe(true);
  });

  it('weist ein falsches Token zurück', () => {
    const session = fakeSession();
    generateCsrfToken(session);
    expect(verifyCsrfToken(session, 'falsches-token')).toBe(false);
    expect(verifyCsrfToken(session, null)).toBe(false);
    expect(verifyCsrfToken(session, undefined)).toBe(false);
    expect(verifyCsrfToken(session, '')).toBe(false);
  });

  it('weist Tokens ohne Session-Eintrag zurück', () => {
    const session = fakeSession();
    expect(verifyCsrfToken(session, 'egal')).toBe(false);
  });

  it('verhindert Wiederverwendung nach dem Löschen', () => {
    const session = fakeSession();
    const token = generateCsrfToken(session);
    expect(verifyCsrfToken(session, token)).toBe(true);
    clearCsrfToken(session);
    expect(verifyCsrfToken(session, token)).toBe(false);
  });

  it('akzeptiert kein Token mit anderer Länge (Timing-Safe-Vergleich)', () => {
    const session = fakeSession();
    const token = generateCsrfToken(session);
    expect(verifyCsrfToken(session, token + 'x')).toBe(false);
    expect(verifyCsrfToken(session, token.slice(1))).toBe(false);
  });
});
