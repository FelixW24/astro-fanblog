import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from './database.types';
import {
  accountDeletionLink,
  accountDeletionUserId,
  confirmAccountDeletion,
  deletionMailUnavailable,
  renderAccountDeletionMail,
  requestAccountDeletion,
} from './account-deletion';
import {
  ACCOUNT_DELETION_TOKEN_TTL_SECONDS,
  accountDeletionToken,
} from './account-deletion-token';

// Audit-Log mocken, damit Sentry nicht tatsächlich aufgerufen wird.
vi.mock('./audit-log', () => ({
  logReaderAction: vi.fn(),
}));

import { logReaderAction } from './audit-log';

const SECRET = 'test-secret-mit-mindestens-32-zeichen-laenge';

beforeEach(() => {
  vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', SECRET);
  vi.stubEnv('NEWSLETTER_TOKEN_SECRET', '');
  vi.stubEnv('ACCOUNT_DELETION_TOKEN_SECRET', '');
  vi.mocked(logReaderAction).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function setup() {
  const user = { id: 'own-id', email: 'own@example.org' } as User;
  const form = new FormData();
  form.set('email', user.email!);
  form.set('password', 'Current-password!');
  form.set('confirm_delete', 'on');
  const signInWithPassword = vi
    .fn()
    .mockResolvedValue({ data: { session: {}, user }, error: null });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const listFactors = vi
    .fn()
    .mockResolvedValue({ data: { totp: [] }, error: null });
  const challengeAndVerify = vi.fn().mockResolvedValue({ error: null });
  const verification = {
    auth: {
      signInWithPassword,
      signOut,
      mfa: { listFactors, challengeAndVerify },
    },
  } as unknown as SupabaseClient<Database>;
  const sendMail = vi.fn().mockResolvedValue(true);
  return {
    user,
    form,
    verification,
    sendMail,
    signInWithPassword,
    signOut,
    listFactors,
    challengeAndVerify,
  };
}

describe('Kontolöschung: Antrag per Bestätigungsmail', () => {
  it('verschickt nach der Prüfung nur die Bestätigungsmail und löscht nichts', async () => {
    const s = setup();
    expect(
      await requestAccountDeletion(s.user, s.form, s.verification, {
        sendMail: s.sendMail,
        origin: 'https://blog.example',
      }),
    ).toBeNull();
    expect(s.sendMail).toHaveBeenCalledTimes(1);
    const mail = s.sendMail.mock.calls[0][0];
    expect(mail.to).toBe('own@example.org');
    expect(mail.text).toContain('/konto-loeschen/bestaetigen?token=');
    expect(mail.text).toContain('24 Stunden');
    // Die temporäre Prüfsitzung wird aufgeräumt, die Browsersitzung bleibt.
    expect(s.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(s.signOut).not.toHaveBeenCalledWith({ scope: 'global' });
  });

  it.each(['email', 'password', 'confirm_delete'])(
    'weist fehlendes %s vor der Reauthentifizierung zurück',
    async (key) => {
      const s = setup();
      s.form.delete(key);
      expect(
        await requestAccountDeletion(s.user, s.form, s.verification, {
          sendMail: s.sendMail,
        }),
      ).toBeTruthy();
      expect(s.signInWithPassword).not.toHaveBeenCalled();
      expect(s.sendMail).not.toHaveBeenCalled();
    },
  );

  it('weist ein anderes Konto zurück', async () => {
    const s = setup();
    s.form.set('email', 'other@example.org');
    await requestAccountDeletion(s.user, s.form, s.verification, {
      sendMail: s.sendMail,
    });
    expect(s.signInWithPassword).not.toHaveBeenCalled();
  });

  it('verschickt bei falschem Passwort keine Mail und loggt den Fehlversuch', async () => {
    const s = setup();
    s.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: {},
    });
    expect(
      await requestAccountDeletion(s.user, s.form, s.verification, {
        sendMail: s.sendMail,
        ipAddress: '203.0.113.42',
      }),
    ).toContain('nicht korrekt');
    expect(s.sendMail).not.toHaveBeenCalled();
    expect(logReaderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'request',
        entity: 'account-deletion',
        userId: 'own-id',
        ipAddress: '203.0.113.42',
        detail: expect.stringContaining('Authentifizierung'),
      }),
    );
  });

  it('loggt erfolgreiche Anträge mit IP-Adresse', async () => {
    const s = setup();
    await requestAccountDeletion(s.user, s.form, s.verification, {
      sendMail: s.sendMail,
      ipAddress: '203.0.113.42',
    });
    expect(logReaderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'request',
        entity: 'account-deletion',
        userId: 'own-id',
        actorEmail: 'own@example.org',
        ipAddress: '203.0.113.42',
        detail: 'Bestätigungsmail versendet',
      }),
    );
  });

  it('loggt SMTP-Fehler', async () => {
    const s = setup();
    s.sendMail.mockResolvedValue(false);
    await requestAccountDeletion(s.user, s.form, s.verification, {
      sendMail: s.sendMail,
      ipAddress: '203.0.113.42',
    });
    expect(logReaderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'request',
        entity: 'account-deletion',
        detail: expect.stringContaining('SMTP'),
        ipAddress: '203.0.113.42',
      }),
    );
  });

  it('verlangt einen verifizierten MFA-Faktor und räumt die temporäre Sitzung auf', async () => {
    const s = setup();
    s.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor', status: 'verified' }] },
      error: null,
    });
    expect(
      await requestAccountDeletion(s.user, s.form, s.verification, {
        sendMail: s.sendMail,
      }),
    ).toContain('Authenticator');
    expect(s.sendMail).not.toHaveBeenCalled();
    expect(s.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('prüft den MFA-Code vor dem Versand', async () => {
    const s = setup();
    s.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor', status: 'verified' }] },
      error: null,
    });
    s.form.set('factor_id', 'factor');
    s.form.set('code', '123456');
    s.challengeAndVerify.mockResolvedValue({ error: {} });
    expect(
      await requestAccountDeletion(s.user, s.form, s.verification, {
        sendMail: s.sendMail,
      }),
    ).toContain('ungültig');
    expect(s.sendMail).not.toHaveBeenCalled();
    s.challengeAndVerify.mockResolvedValue({ error: null });
    expect(
      await requestAccountDeletion(s.user, s.form, s.verification, {
        sendMail: s.sendMail,
      }),
    ).toBeNull();
    expect(s.sendMail).toHaveBeenCalledTimes(1);
  });

  it('meldet einen Versandfehler als nicht ausgelöste Löschung', async () => {
    const s = setup();
    s.sendMail.mockResolvedValue(false);
    expect(
      await requestAccountDeletion(s.user, s.form, s.verification, {
        sendMail: s.sendMail,
      }),
    ).toBe(deletionMailUnavailable);
  });

  it('bricht ab, wenn die Sicherheitsprüfung fehlschlägt', async () => {
    const s = setup();
    s.listFactors.mockResolvedValue({ data: null, error: {} });
    expect(
      await requestAccountDeletion(s.user, s.form, s.verification, {
        sendMail: s.sendMail,
      }),
    ).toBeTruthy();
    expect(s.sendMail).not.toHaveBeenCalled();
  });
});

describe('Kontolöschung: Bestätigung per Link', () => {
  function admin(deleteUser: ReturnType<typeof vi.fn>) {
    return {
      auth: { admin: { deleteUser } },
    } as unknown as SupabaseClient<Database>;
  }

  it('löscht das Konto aus einem gültigen Token und loggt die Löschung', async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    const token = accountDeletionToken(SECRET, 'own-id')!;
    expect(
      await confirmAccountDeletion(token, admin(deleteUser), {
        ipAddress: '203.0.113.42',
        actorEmail: 'own@example.org',
      }),
    ).toBe('deleted');
    expect(deleteUser).toHaveBeenCalledWith('own-id');
    expect(logReaderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        entity: 'account-deletion',
        userId: 'own-id',
        actorEmail: 'own@example.org',
        ipAddress: '203.0.113.42',
        detail: 'Konto endgültig gelöscht',
      }),
    );
  });

  it('loggt ungültige Tokens ohne Nutzer-ID', async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    await confirmAccountDeletion('v1.ungültig', admin(deleteUser), {
      ipAddress: '203.0.113.42',
    });
    expect(logReaderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'confirm',
        entity: 'account-deletion',
        detail: expect.stringContaining('Token'),
        ipAddress: '203.0.113.42',
      }),
    );
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('weist ungültige und abgelaufene Tokens zurück', async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    const now = Date.UTC(2026, 10, 1, 12, 0, 0);
    const expired = accountDeletionToken(SECRET, 'own-id', now)!;
    expect(
      await confirmAccountDeletion(expired, admin(deleteUser), {
        now: now + ACCOUNT_DELETION_TOKEN_TTL_SECONDS * 1000,
      }),
    ).toBe('invalid');
    expect(await confirmAccountDeletion('v1.quatsch', admin(deleteUser))).toBe(
      'invalid',
    );
    expect(await confirmAccountDeletion('', admin(deleteUser))).toBe('invalid');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('meldet ein bereits gelöschtes Konto als solches', async () => {
    const deleteUser = vi
      .fn()
      .mockResolvedValue({ error: { status: 404, message: 'not found' } });
    const token = accountDeletionToken(SECRET, 'own-id')!;
    expect(await confirmAccountDeletion(token, admin(deleteUser))).toBe(
      'missing',
    );
  });

  it('meldet Fehler beim Löschen', async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: { status: 500 } });
    const token = accountDeletionToken(SECRET, 'own-id')!;
    expect(await confirmAccountDeletion(token, admin(deleteUser))).toBe(
      'failed',
    );
    deleteUser.mockRejectedValue(new Error('boom'));
    expect(await confirmAccountDeletion(token, admin(deleteUser))).toBe(
      'failed',
    );
  });
});

describe('Bestätigungslink und -mail', () => {
  it('kodiert die Nutzer-ID im Link und liest sie wieder aus', () => {
    const link = accountDeletionLink('own-id', 'https://blog.example')!;
    expect(
      link.startsWith('https://blog.example/konto-loeschen/bestaetigen?token='),
    ).toBe(true);
    const token = decodeURIComponent(link.split('token=')[1]);
    expect(accountDeletionUserId(token)).toBe('own-id');
  });

  it('erzeugt keinen Link und kein Token ohne Secret', () => {
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', '');
    vi.stubEnv('SUPABASE_AUTH_SECRET_KEY', '');
    expect(accountDeletionLink('own-id')).toBeNull();
    expect(accountDeletionUserId('v1.egal')).toBeNull();
  });

  it('rendert eine Mail mit Link, Frist und Hinweis auf die Anonymisierung', () => {
    const mail = renderAccountDeletionMail({
      url: 'https://blog.example/konto-loeschen/bestaetigen?token=abc',
      origin: 'https://blog.example',
    });
    expect(mail.subject).toContain('bestätige die Löschung');
    expect(mail.text).toContain(
      'https://blog.example/konto-loeschen/bestaetigen?token=abc',
    );
    expect(mail.text).toContain('ohne Zuordnung zu deinem Konto');
    expect(mail.html).toContain('Löschung bestätigen');
    expect(mail.html).toContain('Impressum');
  });
});
