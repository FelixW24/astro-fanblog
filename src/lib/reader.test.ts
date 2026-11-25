import { describe, expect, it } from 'vitest';
import {
  minimumAgeError,
  parseAccountRegistration,
  parseNewPassword,
  parseProfileSetup,
  registrationAuthFailure,
  safeReturnPath,
  underMinimumAge,
} from './reader';

const valid = () => {
  const form = new FormData();
  Object.entries({
    full_name: 'Anna Fan',
    birth_date: '1995-02-28',
    username: 'Anna_Fan',
    gender: 'W',
    privacy_acknowledged: 'on',
  }).forEach(([key, value]) => form.set(key, value));
  return form;
};
describe('Leserregistrierung', () => {
  it('validiert die reine Kontoerstellung', () => {
    const form = new FormData();
    form.set('email', 'anna@example.org');
    form.set('password', 'EinPasswort123!');
    form.set('password_confirmation', 'EinPasswort123!');
    form.set('session_acknowledged', 'on');
    form.set('terms_accepted', 'on');
    expect(parseAccountRegistration(form).error).toBeNull();
  });
  it.each([
    ['email', 'keine-email'],
    ['password', 'kurz'],
    ['password_confirmation', 'anderes-passwort'],
    ['session_acknowledged', ''],
    ['terms_accepted', ''],
  ])('verwirft ungültige Kontodaten im Feld %s', (key, value) => {
    const form = new FormData();
    form.set('email', 'anna@example.org');
    form.set('password', 'EinPasswort123!');
    form.set('password_confirmation', 'EinPasswort123!');
    form.set('session_acknowledged', 'on');
    form.set('terms_accepted', 'on');
    form.set(key, value);
    expect(parseAccountRegistration(form).error).not.toBeNull();
  });
  it('normalisiert den öffentlichen Username', () => {
    const result = parseProfileSetup(valid());
    expect(result.error).toBeNull();
    expect(result.values.username).toBe('anna_fan');
  });
  it.each([
    ['kleinespasswort123!', 'einen Großbuchstaben'],
    ['GROSSPASSWORT123!', 'einen Kleinbuchstaben'],
    ['GrossesPasswort!', 'eine Zahl'],
    ['GrossesPasswort123', 'ein Sonderzeichen'],
  ])('nennt die fehlende Passwort-Anforderung für %s', (password, missing) => {
    const form = new FormData();
    form.set('email', 'anna@example.org');
    form.set('password', password);
    form.set('password_confirmation', password);
    form.set('session_acknowledged', 'on');
    form.set('terms_accepted', 'on');
    expect(parseAccountRegistration(form).error).toContain(missing);
  });
  it.each([
    ['M', 'male'],
    ['W', 'female'],
    ['D', 'diverse'],
  ])('leitet das Icon für Geschlecht %s serverseitig ab', (gender, avatar) => {
    const form = valid();
    form.set('gender', gender);
    form.set('avatar', 'forged');
    const result = parseProfileSetup(form);
    expect(result.error).toBeNull();
    expect(result.values.gender).toBe(gender);
    expect(result.values.avatar).toBe(avatar);
  });
  it.each(['', 'male', 'female', 'X', 'm'])(
    'verwirft ungültiges Geschlecht %s',
    (gender) => {
      const form = valid();
      form.set('gender', gender);
      form.set('avatar', 'male');
      expect(parseProfileSetup(form).error).toContain('Geschlecht');
    },
  );
  it.each([
    ['2013-09-22', '2026-09-21'],
    ['2020-01-01', '2026-09-21'],
    ['2013-10-30', '2026-10-29'],
  ])('verwirft unter 13 Jahren geborenes Datum %s (heute %s)', (date, today) => {
    const form = valid();
    form.set('birth_date', date);
    expect(parseProfileSetup(form, today).error).toBe(minimumAgeError);
  });
  it.each([
    ['2013-09-21', '2026-09-21'],
    ['2013-09-20', '2026-09-21'],
    ['1995-02-28', '2026-09-21'],
  ])(
    'akzeptiert %s am Stichtag %s (13 Jahre oder älter)',
    (date, today) => {
      const form = valid();
      form.set('birth_date', date);
      expect(parseProfileSetup(form, today).error).toBeNull();
    },
  );
  it('erkennt den Mindestalter-Stichtag lexikographisch', () => {
    expect(underMinimumAge('2013-09-22', '2026-09-21')).toBe(true);
    expect(underMinimumAge('2013-09-21', '2026-09-21')).toBe(false);
    expect(underMinimumAge('2013-09-20', '2026-09-21')).toBe(false);
  });
  it('fällt bei ungültigem today auf das reale Datum zurück', () => {
    // 2999 ist für jedes reale „heute" unter 13, egal wann der Test läuft.
    expect(underMinimumAge('2999-01-01', 'kaputt')).toBe(true);
    expect(underMinimumAge('1990-01-01', 'kaputt')).toBe(false);
    expect(underMinimumAge('2999-01-01')).toBe(true);
  });
  it('behandelt ein ungültiges Geburtsdatum als nicht prüfbar', () => {
    expect(underMinimumAge('kaputt', '2026-09-21')).toBe(false);
    expect(underMinimumAge('', '2026-09-21')).toBe(false);
  });
  it.each(['1995-02-30', '2100-01-01', '1899-12-31', '', 'invalid'])(
    'verwirft ungültiges Geburtsdatum %s',
    (date) => {
      const form = valid();
      form.set('birth_date', date);
      expect(parseProfileSetup(form, '2026-09-21').error).toContain(
        'Geburtsdatum',
      );
    },
  );
  it.each([
    ['full_name', 'A'],
    ['username', '<script>'],
    ['gender', 'https://image.invalid'],
    ['privacy_acknowledged', ''],
  ])('verwirft ungültiges Feld %s', (key, value) => {
    const form = valid();
    form.set(key, value);
    expect(parseProfileSetup(form).error).not.toBeNull();
  });
  it('übernimmt den Storage-Pfad eines hochgeladenen Profilbilds', () => {
    const form = valid();
    form.set(
      'avatar_path',
      '0d1a3f4c-2b5e-4f6a-8c9d-0e1f2a3b4c5d/avatar.webp',
    );
    const result = parseProfileSetup(form);
    expect(result.error).toBeNull();
    expect(result.values.avatar_path).toBe(
      '0d1a3f4c-2b5e-4f6a-8c9d-0e1f2a3b4c5d/avatar.webp',
    );
  });
  it('lässt das Profilbild optional weg', () => {
    const result = parseProfileSetup(valid());
    expect(result.error).toBeNull();
    expect(result.values.avatar_path).toBe('');
  });
  it.each([
    'avatar.webp',
    '../fremd/avatar.png',
    '0d1a3f4c-2b5e-4f6a-8c9d-0e1f2a3b4c5d/avatar.gif',
    '0d1a3f4c-2b5e-4f6a-8c9d-0e1f2a3b4c5d/unterordner/avatar.webp',
    'https://image.invalid/avatar.webp',
  ])('verwirft den ungültigen Profilbild-Pfad %s', (path) => {
    const form = valid();
    form.set('avatar_path', path);
    expect(parseProfileSetup(form).error).toContain('Profilbild');
  });
});
describe('Registrierungsfehler vom Auth-Dienst', () => {
  it.each([500, 502, 503, 504])(
    'meldet Status %s als Störung mit Später-Hinweis',
    (status) => {
      const result = registrationAuthFailure(status);
      expect(result.serverError).toBe(true);
      expect(result.message).toContain('später');
      expect(result.message).not.toContain('Prüfe deine Angaben');
    },
  );
  it('behandelt Fehler ohne Status als Störung', () => {
    const result = registrationAuthFailure(undefined);
    expect(result.serverError).toBe(true);
    expect(result.message).toContain('später');
  });
  it.each([400, 422, 429])(
    'führt Status %s auf die Angaben des Nutzers zurück',
    (status) => {
      const result = registrationAuthFailure(status);
      expect(result.serverError).toBe(false);
      expect(result.message).toContain('Prüfe deine Angaben');
    },
  );
});
describe('Passwort zurücksetzen', () => {
  it('akzeptiert zwei übereinstimmende sichere Passwörter', () => {
    const form = new FormData();
    form.set('password', 'NeuesPasswort123!');
    form.set('password_confirmation', 'NeuesPasswort123!');
    expect(parseNewPassword(form)).toEqual({
      password: 'NeuesPasswort123!',
      error: null,
    });
  });
  it.each([
    ['kurz', 'kurz'],
    ['NeuesPasswort123!', 'AnderesPasswort123!'],
  ])('verwirft ungültige neue Passwörter', (password, confirmation) => {
    const form = new FormData();
    form.set('password', password);
    form.set('password_confirmation', confirmation);
    expect(parseNewPassword(form).error).not.toBeNull();
  });
  it('nennt alle fehlenden Passwort-Anforderungen gemeinsam', () => {
    const form = new FormData();
    form.set('password', 'kleinespasswort');
    form.set('password_confirmation', 'kleinespasswort');
    expect(parseNewPassword(form).error).toBe(
      'Das Passwort muss mindestens einen Großbuchstaben, eine Zahl und ein Sonderzeichen enthalten.',
    );
  });
});
describe('Rückkehr nach Anmeldung', () => {
  it('erlaubt Artikel und Kommentaranker', () =>
    expect(safeReturnPath('/beitraege/fc-news#kommentare')).toBe(
      '/beitraege/fc-news#kommentare',
    ));
  it.each(['//evil.org', '/\\evil.org', 'https://evil.org', '/admin', null])(
    'blockiert %s',
    (path) => expect(safeReturnPath(path)).toBe('/profil'),
  );
});
