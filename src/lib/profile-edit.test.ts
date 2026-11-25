import { describe, expect, it } from 'vitest';
import { parseProfileEdit } from './profile-edit';

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

const valid = {
  username: 'JustFelix',
  full_name: ' Max Mustermann ',
  birth_date: '2004-04-02',
};

describe('parseProfileEdit', () => {
  it('normalizes a complete submission', () => {
    const { values, error } = parseProfileEdit(form(valid), '2026-10-29');
    expect(error).toBeNull();
    expect(values).toEqual({
      username: 'justfelix',
      full_name: 'Max Mustermann',
      birth_date: '2004-04-02',
    });
  });
  it.each(['F', 'x'.repeat(121), ''])(
    'rejects the full name %s',
    (full_name) => {
      const { error } = parseProfileEdit(
        form({ ...valid, full_name }),
        '2026-10-29',
      );
      expect(error).toBe('Bitte gib deinen Namen mit 2 bis 120 Zeichen an.');
    },
  );
  it.each(['2026-04-31', '31.12.2004', '1800-01-01', '2100-01-01'])(
    'rejects the birth date %s',
    (birth_date) => {
      const { error } = parseProfileEdit(
        form({ ...valid, birth_date }),
        '2026-10-29',
      );
      expect(error).toBe('Bitte gib ein gültiges Geburtsdatum an.');
    },
  );
  it.each(['2013-10-30', '2020-05-05'])(
    'rejects the under-13 birth date %s with the AGB notice',
    (birth_date) => {
      const { error } = parseProfileEdit(
        form({ ...valid, birth_date }),
        '2026-10-29',
      );
      expect(error).toBe(
        'Laut unseren AGB ist ein Leserkonto erst ab 13 Jahren möglich. Bitte prüfe dein Geburtsdatum.',
      );
    },
  );
  it('accepts exactly 13 years on the cutoff day', () => {
    const { error } = parseProfileEdit(
      form({ ...valid, birth_date: '2013-10-29' }),
      '2026-10-29',
    );
    expect(error).toBeNull();
  });
  it.each(['ab', 'Änderung!', 'zu_langer_username_mit_vielen_zeichen'])(
    'rejects the username %s',
    (username) => {
      const { error } = parseProfileEdit(
        form({ ...valid, username }),
        '2026-10-29',
      );
      expect(error).toBe(
        'Der Username benötigt 3 bis 30 Kleinbuchstaben, Zahlen oder Unterstriche.',
      );
    },
  );
});
