import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_DELETION_TOKEN_TTL_SECONDS,
  accountDeletionToken,
  accountDeletionTokenUserId,
} from './account-deletion-token';

const SECRET = 'e2e-secret-mit-mindestens-32-zeichen-laenge';
const USER = '7d1a2b3c-0000-4000-8000-123456789abc';
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);

describe('accountDeletionToken', () => {
  it('erzeugt ein Token, das die eigene Nutzer-ID zurückgibt', () => {
    const token = accountDeletionToken(SECRET, USER, NOW);
    expect(token).toBeTruthy();
    expect(accountDeletionTokenUserId(SECRET, token, NOW)).toBe(USER);
  });

  it('kodiert Zweck und Ablauf mit', () => {
    const parts = accountDeletionToken(SECRET, USER, NOW)!.split('.');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('v1');
    expect(parts[1]).toBe(USER);
    expect(parts[2]).toBe('delete-account');
    expect(Number(parts[3])).toBe(
      Math.floor(NOW / 1000) + ACCOUNT_DELETION_TOKEN_TTL_SECONDS,
    );
  });

  it('läuft nach der Gültigkeitsdauer ab', () => {
    const token = accountDeletionToken(SECRET, USER, NOW)!;
    const stillValid = NOW + (ACCOUNT_DELETION_TOKEN_TTL_SECONDS - 1) * 1000;
    expect(accountDeletionTokenUserId(SECRET, token, stillValid)).toBe(USER);
    const expired = NOW + ACCOUNT_DELETION_TOKEN_TTL_SECONDS * 1000;
    expect(accountDeletionTokenUserId(SECRET, token, expired)).toBeNull();
  });

  it('weist manipulierte Nutzer-IDs und Ablaufzeiten zurück', () => {
    const token = accountDeletionToken(SECRET, USER, NOW)!;
    const parts = token.split('.');
    const otherUser = ['v1', 'andere-id', ...parts.slice(2)].join('.');
    expect(accountDeletionTokenUserId(SECRET, otherUser, NOW)).toBeNull();
    const laterExpiry = [...parts];
    laterExpiry[3] = String(Number(parts[3]) + 86_400);
    expect(
      accountDeletionTokenUserId(SECRET, laterExpiry.join('.'), NOW),
    ).toBeNull();
  });

  it('weist Tokens mit anderem Secret, anderem Zweck und falschem Format zurück', () => {
    const token = accountDeletionToken(SECRET, USER, NOW)!;
    expect(
      accountDeletionTokenUserId(
        'ein-anderes-secret-mit-32-zeichen-laenge',
        token,
        NOW,
      ),
    ).toBeNull();
    const newsletterShape = `v1.${USER}.confirm.${Math.floor(NOW / 1000) + 60}.${token.split('.')[4]}`;
    expect(accountDeletionTokenUserId(SECRET, newsletterShape, NOW)).toBeNull();
    expect(
      accountDeletionTokenUserId(SECRET, token.replace('v1', 'v2'), NOW),
    ).toBeNull();
    expect(accountDeletionTokenUserId(SECRET, `${token}.`, NOW)).toBeNull();
    expect(accountDeletionTokenUserId(SECRET, 'v1.kurz', NOW)).toBeNull();
    expect(accountDeletionTokenUserId(SECRET, '', NOW)).toBeNull();
  });

  it('erzeugt ohne Secret kein Token', () => {
    expect(accountDeletionToken(null, USER, NOW)).toBeNull();
    expect(accountDeletionToken('', USER, NOW)).toBeNull();
    expect(accountDeletionToken(SECRET, '', NOW)).toBeNull();
    expect(accountDeletionTokenUserId(null, 'egal', NOW)).toBeNull();
  });
});
