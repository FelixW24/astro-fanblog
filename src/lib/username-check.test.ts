import { describe, expect, it } from 'vitest';
import {
  isLiveCheckableUsername,
  normalizeUsername,
  parseUsernameCheckResponse,
  profileSaveUsernameError,
  usernameCheckUrl,
  usernameLiveCheckDebounceMs,
} from './username-check';

describe('normalizeUsername', () => {
  it('trims, lowercases and applies NFC', () => {
    expect(normalizeUsername('  NormalerFan48 ')).toBe('normalerfan48');
    expect(normalizeUsername('ÄDMin')).toBe('ädmin');
  });
});

describe('isLiveCheckableUsername', () => {
  it.each(['admin', 'NormalerFan48', ' admin ', 'a_1'])(
    'allows %s',
    (value) => {
      expect(isLiveCheckableUsername(value)).toBe(true);
    },
  );
  it.each(['ab', 'a'.repeat(31), 'adm!n', 'adm-in', ''])(
    'rejects %s',
    (value) => {
      expect(isLiveCheckableUsername(value)).toBe(false);
    },
  );
});

describe('usernameCheckUrl', () => {
  it('builds the encoded live-check URL', () => {
    expect(usernameCheckUrl(' NormalerFan48 ')).toBe(
      '/api/username-verfuegbar?username=normalerfan48',
    );
  });
  it('returns null for uncheckable values', () => {
    expect(usernameCheckUrl('ab')).toBeNull();
    expect(usernameCheckUrl('adm!n')).toBeNull();
  });
});

describe('parseUsernameCheckResponse', () => {
  it('reads the availability flag', () => {
    expect(parseUsernameCheckResponse({ available: true })).toBe(true);
    expect(parseUsernameCheckResponse({ available: false })).toBe(false);
  });
  it.each([null, {}, { available: 'ja' }, 'frei', { other: 1 }])(
    'rejects malformed payloads %s',
    (payload) => {
      expect(parseUsernameCheckResponse(payload)).toBeNull();
    },
  );
});

describe('profileSaveUsernameError', () => {
  it('maps the duplicate constraint to a friendly message', () => {
    expect(profileSaveUsernameError('23505', 'duplicate key')).toBe(
      'Dieser Username ist bereits vergeben. Bitte wähle einen anderen.',
    );
  });
  it('surfaces the reserved-name trigger message', () => {
    expect(
      profileSaveUsernameError('P0001', 'Dieser Benutzername ist reserviert.'),
    ).toBe(
      'Dieser Benutzername ist reserviert. Bitte wähle einen anderen Namen.',
    );
  });
  it('maps the DB minimum-age error to the AGB notice', () => {
    expect(
      profileSaveUsernameError('22023', 'Minimum age 13 required'),
    ).toBe(
      'Laut unseren AGB ist ein Leserkonto erst ab 13 Jahren möglich. Bitte prüfe dein Geburtsdatum.',
    );
  });
  it('falls back to the caller for unrelated errors', () => {
    expect(profileSaveUsernameError('P0001', 'Invalid username')).toBeNull();
    expect(profileSaveUsernameError(undefined, undefined)).toBeNull();
  });
});

describe('usernameLiveCheckDebounceMs', () => {
  it('waits at least 300 ms before checking', () => {
    expect(usernameLiveCheckDebounceMs).toBeGreaterThanOrEqual(300);
  });
});
