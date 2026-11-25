import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { changeOwnPassword, verifyOwnPassword } from './password-change';

const newPassword = 'NeuSicher123!passwort';

function setup() {
  const user = { id: 'own-id', email: 'own@example.org' } as User;
  const form = new FormData();
  form.set('action', 'change-password');
  form.set('current_password', 'Current-password!');
  form.set('password', newPassword);
  form.set('password_confirmation', newPassword);
  const signInWithPassword = vi
    .fn()
    .mockResolvedValue({ data: { session: {}, user }, error: null });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const listFactors = vi
    .fn()
    .mockResolvedValue({ data: { totp: [] }, error: null });
  const challengeAndVerify = vi.fn().mockResolvedValue({ error: null });
  const updateUser = vi.fn().mockResolvedValue({ error: null });
  const verification = {
    auth: {
      signInWithPassword,
      signOut,
      mfa: { listFactors, challengeAndVerify },
      updateUser,
    },
  } as unknown as SupabaseClient<Database>;
  return {
    user,
    form,
    verification,
    signInWithPassword,
    signOut,
    listFactors,
    challengeAndVerify,
    updateUser,
  };
}

describe('Passwortprüfung im Profil-Modal', () => {
  it('bestätigt das eigene Passwort und beendet den Prüf-Login sofort', async () => {
    const s = setup();
    const check = new FormData();
    check.set('action', 'verify-password');
    check.set('password', 'Current-password!');
    expect(await verifyOwnPassword(s.user, check, s.verification)).toBeNull();
    expect(s.signInWithPassword).toHaveBeenCalledWith({
      email: 'own@example.org',
      password: 'Current-password!',
    });
    expect(s.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('weist ein falsches Passwort zurück', async () => {
    const s = setup();
    s.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: {},
    });
    const check = new FormData();
    check.set('password', 'Falsch');
    const error = await verifyOwnPassword(s.user, check, s.verification);
    expect(error).toContain('nicht korrekt');
    expect(s.signOut).not.toHaveBeenCalled();
  });
  it('weist einen Login für ein anderes Konto ab', async () => {
    const s = setup();
    s.signInWithPassword.mockResolvedValue({
      data: { session: {}, user: { id: 'other-id' } },
      error: null,
    });
    const check = new FormData();
    check.set('password', 'Current-password!');
    expect(await verifyOwnPassword(s.user, check, s.verification)).toContain(
      'nicht korrekt',
    );
    expect(s.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('verlangt eine Eingabe', async () => {
    const s = setup();
    const check = new FormData();
    check.set('password', '');
    expect(await verifyOwnPassword(s.user, check, s.verification)).toContain(
      'Bitte gib',
    );
    expect(s.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('Passwortwechsel im Profil-Modal', () => {
  it('prüft das aktuelle Passwort erneut, setzt das neue und widerruft alle Sitzungen', async () => {
    const s = setup();
    expect(await changeOwnPassword(s.user, s.form, s.verification)).toBeNull();
    expect(s.signInWithPassword).toHaveBeenCalledWith({
      email: 'own@example.org',
      password: 'Current-password!',
    });
    expect(s.updateUser).toHaveBeenCalledWith({
      password: newPassword,
      current_password: 'Current-password!',
    });
    expect(s.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(s.updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      s.signOut.mock.invocationCallOrder[0],
    );
  });
  it('weist ein ungültiges neues Passwort vor der Reauthentifizierung zurück', async () => {
    const s = setup();
    s.form.set('password_confirmation', 'Anders123!passwort');
    expect(await changeOwnPassword(s.user, s.form, s.verification)).toContain(
      'überein',
    );
    expect(s.signInWithPassword).not.toHaveBeenCalled();
    expect(s.updateUser).not.toHaveBeenCalled();
  });
  it('ändert bei falschem aktuellem Passwort nichts', async () => {
    const s = setup();
    s.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: {},
    });
    expect(await changeOwnPassword(s.user, s.form, s.verification)).toContain(
      'nicht korrekt',
    );
    expect(s.updateUser).not.toHaveBeenCalled();
  });
  it('verlangt bei aktiver 2FA einen gültigen Authenticator-Code', async () => {
    const s = setup();
    s.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1', status: 'verified' }] },
      error: null,
    });
    let error = await changeOwnPassword(s.user, s.form, s.verification);
    expect(error).toContain('Authenticator-Code');
    expect(s.updateUser).not.toHaveBeenCalled();
    s.form.set('factor_id', 'factor-1');
    s.form.set('code', '123456');
    s.challengeAndVerify.mockResolvedValue({ error: {} });
    error = await changeOwnPassword(s.user, s.form, s.verification);
    expect(error).toContain('ungültig oder abgelaufen');
    expect(s.updateUser).not.toHaveBeenCalled();
    s.challengeAndVerify.mockResolvedValue({ error: null });
    expect(await changeOwnPassword(s.user, s.form, s.verification)).toBeNull();
    expect(s.updateUser).toHaveBeenCalledWith({
      password: newPassword,
      current_password: 'Current-password!',
    });
  });
  it('meldet einen fehlgeschlagenen Update und räumt den Prüf-Login auf', async () => {
    const s = setup();
    s.updateUser.mockResolvedValue({ error: {} });
    expect(await changeOwnPassword(s.user, s.form, s.verification)).toContain(
      'konnte nicht geändert werden',
    );
    expect(s.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(s.signOut).not.toHaveBeenCalledWith({ scope: 'global' });
  });
});
