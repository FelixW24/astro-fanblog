// Bearbeitung der Profildaten im Profil-Modal: Leser mit eingerichtetem
// Profil ändern Username, Name und Geburtsdatum über dieselben Regeln
// wie bei der Einrichtung – inklusive Mindestalter.

import { minimumAgeError, underMinimumAge } from './reader';

export function parseProfileEdit(
  form: FormData,
  today = new Date().toISOString().slice(0, 10),
) {
  const values = {
    username: String(form.get('username') ?? '')
      .trim()
      .toLowerCase(),
    full_name: String(form.get('full_name') ?? '').trim(),
    birth_date: String(form.get('birth_date') ?? ''),
  };
  let error: string | null = null;
  if (values.full_name.length < 2 || values.full_name.length > 120)
    error = 'Bitte gib deinen Namen mit 2 bis 120 Zeichen an.';
  else if (
    !/^\d{4}-\d{2}-\d{2}$/.test(values.birth_date) ||
    Number.isNaN(Date.parse(values.birth_date)) ||
    new Date(values.birth_date).toISOString().slice(0, 10) !==
      values.birth_date ||
    values.birth_date < '1900-01-01' ||
    values.birth_date > today
  )
    error = 'Bitte gib ein gültiges Geburtsdatum an.';
  else if (underMinimumAge(values.birth_date, today))
    error = minimumAgeError;
  else if (!/^[a-z0-9_]{3,30}$/.test(values.username))
    error =
      'Der Username benötigt 3 bis 30 Kleinbuchstaben, Zahlen oder Unterstriche.';
  return { values, error };
}
