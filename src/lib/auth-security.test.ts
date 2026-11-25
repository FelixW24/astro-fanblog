import { describe, expect, it, vi } from 'vitest';
import {
  authEmailHash,
  hasSecondFactor,
  issueTrustedDeviceCookie,
  logAuthFailure,
  signOutSafely,
  TRUSTED_DEVICE_TTL_MS,
  trustedDeviceEnabled,
  validEmailProof,
  validRecoveryApproval,
  validTrustedDeviceCookie,
} from './auth-security';

const SECRET = 'test-secret-' + 'x'.repeat(32);

describe('Vertrauens-Cookie für die Redaktion (24h)', () => {
  it('ist ohne konfiguriertes Secret deaktiviert', () => {
    vi.stubEnv('EDITOR_TRUST_SECRET', '');
    expect(trustedDeviceEnabled()).toBe(false);
    expect(issueTrustedDeviceCookie('user-1')).toBeNull();
    expect(validTrustedDeviceCookie('v1.user-1.1.abc', 'user-1')).toBe(false);
    vi.unstubAllEnvs();
  });
  it('signiert und akzeptiert nur eigene, frische Cookies', () => {
    vi.stubEnv('EDITOR_TRUST_SECRET', SECRET);
    const now = 1_000_000;
    const cookie = issueTrustedDeviceCookie('user-1', now);
    expect(cookie).not.toBeNull();
    expect(cookie!.split('.')).toHaveLength(4);
    expect(cookie!.startsWith('v1.user-1.')).toBe(true);
    expect(validTrustedDeviceCookie(cookie, 'user-1', now)).toBe(true);
    // 24 Stunden lang gültig, danach abgelaufen.
    expect(
      validTrustedDeviceCookie(cookie, 'user-1', now + TRUSTED_DEVICE_TTL_MS - 1),
    ).toBe(true);
    expect(
      validTrustedDeviceCookie(cookie, 'user-1', now + TRUSTED_DEVICE_TTL_MS),
    ).toBe(false);
    // Fremde Benutzer-ID wird abgelehnt.
    expect(validTrustedDeviceCookie(cookie, 'user-2', now)).toBe(false);
    vi.unstubAllEnvs();
  });
  it('lehnt manipulierte Ablaufdaten und Signaturen ab', () => {
    vi.stubEnv('EDITOR_TRUST_SECRET', SECRET);
    const now = 1_000_000;
    const cookie = issueTrustedDeviceCookie('user-1', now)!;
    const [v, userId, expires, signature] = cookie.split('.');
    // Abgelaufen, aber mit gültiger Signatur für das alte Datum erneut signiert
    // -> Signatur passt nicht mehr zum manipulierten Datum.
    const tamperedExpiry = `v1.${userId}.${now + 10 * TRUSTED_DEVICE_TTL_MS}.${signature}`;
    expect(validTrustedDeviceCookie(tamperedExpiry, 'user-1', now)).toBe(false);
    const tamperedSignature = `v1.${userId}.${expires}.${'a'.repeat(64)}`;
    expect(validTrustedDeviceCookie(tamperedSignature, 'user-1', now)).toBe(
      false,
    );
    expect(validTrustedDeviceCookie(undefined, 'user-1', now)).toBe(false);
    expect(validTrustedDeviceCookie('v1.user-1', 'user-1', now)).toBe(false);
    expect(validTrustedDeviceCookie(v + '.' + userId, 'user-1', now)).toBe(
      false,
    );
    vi.unstubAllEnvs();
  });
});

describe('Auth-Sicherheitsgrenzen', () => {
  it('bindet Recovery-Freigaben an Benutzer, Sitzung und Ablaufzeit', () => {
    const approval = { userId: 'u1', sessionId: 's1', expiresAt: 101 };
    expect(validRecoveryApproval(approval, 'u1', 's1', 100)).toBe(true);
    expect(validRecoveryApproval(approval, 'u2', 's1', 100)).toBe(false);
    expect(validRecoveryApproval(approval, 'u1', 's2', 100)).toBe(false);
    expect(validRecoveryApproval(approval, 'u1', 's1', 101)).toBe(false);
  });
  it('akzeptiert nur zeitlich gültige E-Mail-Nachweise', () => {
    expect(validEmailProof(undefined)).toBe(false);
    expect(
      validEmailProof({ tokenHash: 'a'.repeat(56), expiresAt: 101 }, 100),
    ).toBe(true);
    expect(
      validEmailProof(
        { tokenHash: 'pkce_' + 'a'.repeat(56), expiresAt: 101 },
        100,
      ),
    ).toBe(true);
    expect(
      validEmailProof({ tokenHash: 'a'.repeat(56), expiresAt: 100 }, 100),
    ).toBe(false);
    expect(
      validEmailProof({ tokenHash: '<script>', expiresAt: 101 }, 100),
    ).toBe(false);
  });
  it('beendet ausschließlich die aktuelle Sitzung und meldet Widerrufsfehler', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { signOut } } as never;
    expect(await signOutSafely(client)).toBe(true);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    signOut.mockResolvedValue({ error: { status: 503, message: 'secret' } });
    expect(await signOutSafely(client)).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    signOut.mockRejectedValue(new Error('secret'));
    expect(await signOutSafely(client)).toBe(false);
    log.mockRestore();
  });
  it('verweigert MFA-Zugang bei AAL1 oder fehlgeschlagener Prüfung', async () => {
    for (const result of [
      { data: { currentLevel: 'aal1' }, error: null },
      { data: null, error: {} },
    ]) {
      const client = {
        auth: { mfa: { getAuthenticatorAssuranceLevel: async () => result } },
      } as never;
      expect(await hasSecondFactor(client)).toBe(false);
    }
  });
  it('protokolliert Login-Fehlschläge ohne Klartext-Personendaten', () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const emailHash = authEmailHash('Fan@Example.ORG ');
      expect(emailHash).toBe(authEmailHash('fan@example.org'));
      expect(emailHash).not.toContain('fan@example.org');
      logAuthFailure(
        'login_failed',
        { status: 400, code: 'invalid_credentials' },
        { address: '203.0.113.9', emailHash },
      );
      expect(log).toHaveBeenCalledWith('auth.login_failed', {
        status: 400,
        code: 'invalid_credentials',
        address: '203.0.113.9',
        emailHash,
      });
      logAuthFailure('admin_login_failed', {});
      expect(log).toHaveBeenCalledWith('auth.admin_login_failed', {
        status: 0,
        code: 'unknown',
      });
    } finally {
      log.mockRestore();
    }
  });
});
