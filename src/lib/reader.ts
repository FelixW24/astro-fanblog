export const readerGenders = [
  { value: 'M', label: 'M – Männlich', avatar: 'male' },
  { value: 'W', label: 'W – Weiblich', avatar: 'female' },
  { value: 'D', label: 'D – Divers', avatar: 'diverse' },
] as const;

// Storage-Pfad eines eigenen Profilbilds, z. B.
// „0d1a…/avatar.webp“. Die Zuordnung zum eigenen Konto prüft die Datenbank.
export const readerAvatarPathPattern = /^[0-9a-f-]{36}\/avatar\.(webp|jpeg|png)$/;

export function safeReturnPath(value: string | null): string {
  if (value === '/profil') return value;
  if (!value || !/^\/beitraege\/[a-z0-9-]+(?:#kommentare)?$/.test(value))
    return '/profil';
  return value;
}

// Mindestalter für ein Leserkonto (siehe AGB, Abschnitt „Leserkonto“).
export const minimumAccountAge = 13;

export const minimumAgeError = `Laut unseren AGB ist ein Leserkonto erst ab ${minimumAccountAge} Jahren möglich. Bitte prüfe dein Geburtsdatum.`;

// Vergleicht ISO-Datumstrings lexikographisch: Wer nach dem Stichtag
// (heute minus 13 Jahre) geboren ist, ist heute noch nicht 13.
// today ist für Tests austauschbar; bei ungültigem Format wird auf das
// reale heutige Datum zurückgefallen, statt fälschlich „älter als 13"
// zu liefern.
export function underMinimumAge(
  birthDate: string,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(today)) today = new Date().toISOString().slice(0, 10);
  const [year, month, day] = today.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return false;
  const cutoff = `${year - minimumAccountAge}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isoDate.test(birthDate) && birthDate > cutoff;
}

const passwordRequirements: [RegExp, string][] = [
  [/[A-Z]/, 'einen Großbuchstaben'],
  [/[a-z]/, 'einen Kleinbuchstaben'],
  [/\d/, 'eine Zahl'],
  [/[^A-Za-z0-9]/, 'ein Sonderzeichen'],
];

export function passwordRequirementError(password: string) {
  const missing = passwordRequirements
    .filter(([pattern]) => !pattern.test(password))
    .map(([, label]) => label);
  if (!missing.length) return null;
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} und ${missing[missing.length - 1]}`;
  return `Das Passwort muss mindestens ${list} enthalten.`;
}

export function parseAccountRegistration(form: FormData) {
  const values = {
    email: String(form.get('email') ?? '').trim(),
    password: String(form.get('password') ?? ''),
    password_confirmation: String(form.get('password_confirmation') ?? ''),
  };
  const requirement = passwordRequirementError(values.password);
  let error: string | null = null;
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) ||
    values.email.length > 254
  )
    error = 'Bitte gib eine gültige E-Mail-Adresse an.';
  else if (values.password.length < 8 || values.password.length > 128)
    error = 'Das Passwort muss 8 bis 128 Zeichen lang sein.';
  else if (requirement) error = requirement;
  else if (values.password !== values.password_confirmation)
    error = 'Die beiden Passwörter stimmen nicht überein.';
  else if (form.get('session_acknowledged') !== 'on')
    error =
      'Bitte bestätige, dass du die Datenschutzhinweise zur Kenntnis genommen hast.';
  else if (form.get('terms_accepted') !== 'on')
    error = 'Bitte akzeptiere die AGB.';
  return { values, error };
}

// SignUp-Fehler beim Auth-Dienst unterscheiden: 4xx zeigen auf die Angaben
// des Nutzers, 5xx (oder ein Fehler ohne Status, z. B. Netzwerk) auf eine
// Störung, die später erneut versucht werden kann.
export function registrationAuthFailure(status: number | undefined) {
  if ((status ?? 500) >= 500)
    return {
      serverError: true as const,
      message:
        'Die Registrierung ist im Moment nicht möglich. Bitte versuche es später erneut.',
    };
  return {
    serverError: false as const,
    message:
      'Die Registrierung ist fehlgeschlagen. Prüfe deine Angaben oder melde dich mit deinem bestehenden Konto an.',
  };
}

export function parseProfileSetup(
  form: FormData,
  today = new Date().toISOString().slice(0, 10),
) {
  const gender = String(form.get('gender') ?? '');
  const avatar =
    readerGenders.find((option) => option.value === gender)?.avatar ?? '';
  const values = {
    full_name: String(form.get('full_name') ?? '').trim(),
    birth_date: String(form.get('birth_date') ?? ''),
    username: String(form.get('username') ?? '')
      .trim()
      .toLowerCase(),
    gender,
    avatar,
    avatar_path: String(form.get('avatar_path') ?? ''),
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
  else if (!avatar) error = 'Bitte wähle M, W oder D für dein Geschlecht.';
  else if (values.avatar_path && !readerAvatarPathPattern.test(values.avatar_path))
    error =
      'Das Profilbild konnte nicht übernommen werden. Bitte lade die Seite neu und versuche es erneut.';
  else if (form.get('privacy_acknowledged') !== 'on')
    error = 'Bitte bestätige, dass du die Datenschutzhinweise gelesen hast.';
  return { values, error };
}

export function parseNewPassword(form: FormData) {
  const password = String(form.get('password') ?? '');
  const confirmation = String(form.get('password_confirmation') ?? '');
  const requirement = passwordRequirementError(password);
  let error: string | null = null;
  if (password.length < 8 || password.length > 128)
    error = 'Das Passwort muss 8 bis 128 Zeichen lang sein.';
  else if (requirement) error = requirement;
  else if (password !== confirmation)
    error = 'Die beiden Passwörter stimmen nicht überein.';
  return { password, error };
}
