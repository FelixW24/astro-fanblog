// Benutzerverwaltung in der Redaktion (/admin/benutzer): Alle Zugriffe laufen
// serverseitig ueber den Admin-Client (Service-Schluessel bleibt auf dem
// Server). Die Seite und jede Aktion pruefen zusaetzlich is_admin ueber
// getSiteAdmin() plus Same-Origin; hier liegen nur die fachlichen Aktionen.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { minimumAgeError, underMinimumAge } from './reader';
import { normalizeUsername, profileSaveUsernameError } from './username-check';
import { ensureReaderProfile } from './reader-profile';
import { logAdminAction } from './audit-log';

type Client = SupabaseClient<Database>;

export const userListPageSize = 25;
export const userSearchMaxLength = 120;

export type UserRoleFilter = 'alle' | 'leser' | 'redaktion' | 'geister';
export const userRoleFilters: UserRoleFilter[] = [
  'alle',
  'leser',
  'redaktion',
  'geister',
];

export type AdminUserRole = 'admin' | 'redaktion' | 'leser';

export interface AdminUserRow {
  id: string;
  email: string;
  createdAt: string;
  role: AdminUserRole;
  username: string | null;
  avatarUrl: string | null;
  isGhost: boolean;
  hasProfile: boolean;
}

export interface UserListParams {
  search: string;
  role: UserRoleFilter;
  page: number;
}

export interface UserListResult {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export function roleLabel(role: AdminUserRole) {
  return role === 'admin'
    ? 'Admin'
    : role === 'redaktion'
      ? 'Redaktion'
      : 'Leser';
}

export function parseUserListParams(
  searchParams: URLSearchParams,
): UserListParams {
  const rawRole = searchParams.get('rolle') ?? 'alle';
  return {
    search: (searchParams.get('suche') ?? '')
      .trim()
      .toLowerCase()
      .slice(0, userSearchMaxLength),
    role: (userRoleFilters as string[]).includes(rawRole)
      ? (rawRole as UserRoleFilter)
      : 'alle',
    page: Math.max(1, Math.min(10000, Number(searchParams.get('seite')) || 1)),
  };
}

export function userListQuery(params: UserListParams, page: number) {
  const query = new URLSearchParams();
  if (params.search) query.set('suche', params.search);
  if (params.role !== 'alle') query.set('rolle', params.role);
  if (page > 1) query.set('seite', String(page));
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

// Auth-Nutzer und Profilzeilen zu Listenreihen verbinden. is_admin schlaegt
// bei der Anzeige vor is_editor (Admin ist gleichzeitig Redakteur).
export function composeUserRows(
  authUsers: Pick<User, 'id' | 'email' | 'created_at' | 'app_metadata'>[],
  profiles: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_ghost: boolean;
  }[],
): AdminUserRow[] {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  return authUsers
    .map((authUser) => {
      const profile = profileById.get(authUser.id);
      const isAdmin = authUser.app_metadata?.is_admin === true;
      const isEditor = authUser.app_metadata?.is_editor === true;
      return {
        id: authUser.id,
        email: authUser.email ?? '',
        createdAt: authUser.created_at ?? '',
        role: (isAdmin
          ? 'admin'
          : isEditor
            ? 'redaktion'
            : 'leser') as AdminUserRole,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        isGhost: profile?.is_ghost ?? false,
        hasProfile: Boolean(profile),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function filterUserRows(
  users: AdminUserRow[],
  params: Pick<UserListParams, 'search' | 'role'>,
): AdminUserRow[] {
  const search = params.search.trim().toLowerCase();
  return users.filter((user) => {
    if (params.role === 'leser' && user.role !== 'leser') return false;
    if (params.role === 'redaktion' && user.role === 'leser') return false;
    if (params.role === 'geister' && !user.isGhost) return false;
    if (!search) return true;
    return (
      user.email.toLowerCase().includes(search) ||
      (user.username ?? '').toLowerCase().includes(search)
    );
  });
}

export function paginateUserRows(
  users: AdminUserRow[],
  page: number,
  pageSize = userListPageSize,
): UserListResult {
  const pageCount = Math.max(1, Math.ceil(users.length / pageSize));
  const current = Math.max(1, Math.min(pageCount, page));
  return {
    users: users.slice((current - 1) * pageSize, current * pageSize),
    total: users.length,
    page: current,
    pageCount,
    pageSize,
  };
}

// Alle Auth-Konten seitenweise laden (listUsers unterstuetzt keine Suche;
// Suche und Filter gebeuren serverseitig in compose/filterUserRows).
export async function fetchAllAuthUsers(
  admin: Client,
): Promise<Pick<User, 'id' | 'email' | 'created_at' | 'app_metadata'>[]> {
  const perPage = 200;
  const users: Pick<User, 'id' | 'email' | 'created_at' | 'app_metadata'>[] =
    [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error || !data?.users) return [];
    users.push(...data.users);
    if (data.users.length < perPage) break;
  }
  return users;
}

export async function listAdminUsers(
  admin: Client,
  params: UserListParams,
): Promise<UserListResult> {
  const authUsers = await fetchAllAuthUsers(admin);
  const profiles: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_ghost: boolean;
  }[] = [];
  for (let index = 0; index < authUsers.length; index += 200) {
    const ids = authUsers.slice(index, index + 200).map((user) => user.id);
    const { data } = await admin
      .from('reader_profiles')
      .select('id, username, avatar_url, is_ghost')
      .in('id', ids);
    profiles.push(...(data ?? []));
  }
  const rows = composeUserRows(authUsers, profiles);
  return paginateUserRows(filterUserRows(rows, params), params.page);
}

export interface AdminProfileValues {
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  birthDate: string;
}

// Vorschlag fuer die Aufteilung eines bestehenden full_name: letztes Wort als
// Nachname, der Rest als Vorname.
export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function collapseSpaces(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

// Dieselben fachlichen Grenzen wie im Leser-Profil (parseProfileEdit):
// Username-Format, zusammengesetzter Name 2..120 Zeichen, gueltiges
// Geburtsdatum ab 1900, Mindestalter 13. Eindeutigkeit und reservierte Namen
// erzwingt zusaetzlich die Datenbank (Unique-Constraint, Trigger).
export function parseAdminProfileForm(
  form: FormData,
  today = new Date().toISOString().slice(0, 10),
) {
  const values: AdminProfileValues = {
    username: normalizeUsername(String(form.get('username') ?? '')),
    firstName: collapseSpaces(String(form.get('first_name') ?? '')),
    lastName: collapseSpaces(String(form.get('last_name') ?? '')),
    fullName: '',
    birthDate: String(form.get('birth_date') ?? ''),
  };
  values.fullName = `${values.firstName} ${values.lastName}`.trim();
  let error: string | null = null;
  if (values.fullName.length < 2 || values.fullName.length > 120)
    error = 'Vor- und Nachname zusammen benötigen 2 bis 120 Zeichen.';
  else if (
    !/^\d{4}-\d{2}-\d{2}$/.test(values.birthDate) ||
    Number.isNaN(Date.parse(values.birthDate)) ||
    new Date(values.birthDate).toISOString().slice(0, 10) !==
      values.birthDate ||
    values.birthDate < '1900-01-01' ||
    values.birthDate > today
  )
    error = 'Bitte gib ein gültiges Geburtsdatum an.';
  else if (underMinimumAge(values.birthDate, today)) error = minimumAgeError;
  else if (!/^[a-z0-9_]{3,30}$/.test(values.username))
    error =
      'Der Username benötigt 3 bis 30 Kleinbuchstaben, Zahlen oder Unterstriche.';
  return { values, error };
}

function audit(
  actor: User,
  action: 'update' | 'delete',
  entity: string,
  targetId: string,
  fields: string,
) {
  logAdminAction({
    action,
    entity,
    entityId: targetId,
    actorEmail: actor.email ?? undefined,
    // Nur Admin-ID, Ziel-ID und Feldnamen - keine Namen, Geburtsdaten,
    // Bildinhalte oder Authenticator-Codes.
    detail: `actor=${actor.id}; fields=${fields}`,
  });
}

async function getAuthUser(admin: Client, targetId: string) {
  const { data, error } = await admin.auth.admin.getUserById(targetId);
  return error ? null : (data.user ?? null);
}

export function isProtectedAdminTarget(target: User | null) {
  return target?.app_metadata?.is_admin === true;
}

// Profilfelder eines Kontos bearbeiten. Username-Eindeutigkeit und reservierte
// Namen prueft die Datenbank (Unique-Constraint bzw. Trigger), das
// Geburtsdatum die Check-Constraint der Tabelle.
export async function updateUserProfile(
  admin: Client,
  actor: User,
  targetId: string,
  values: AdminProfileValues,
): Promise<string | null> {
  const profileUpdate = await admin
    .from('reader_profiles')
    .update({ username: values.username })
    .eq('id', targetId)
    .select('id');
  if (profileUpdate.error) {
    const usernameError = profileSaveUsernameError(
      profileUpdate.error.code,
      profileUpdate.error.message,
    );
    if (usernameError) return usernameError;
    return 'Der Username konnte nicht gespeichert werden.';
  }
  if (!profileUpdate.data?.length)
    return 'Für dieses Konto existiert kein Leserprofil.';
  const detailsUpdate = await admin.from('reader_details').upsert(
    {
      id: targetId,
      full_name: values.fullName,
      birth_date: values.birthDate,
    },
    { onConflict: 'id' },
  );
  if (detailsUpdate.error) {
    if (detailsUpdate.error.message.includes('reader_details_birth_date_check'))
      return minimumAgeError;
    return 'Die Angaben konnten nicht gespeichert werden.';
  }
  audit(
    actor,
    'update',
    'user_profile',
    targetId,
    'username,full_name,birth_date',
  );
  return null;
}

// Wechsel zwischen Leser und Redaktion: setzt/entfernt serverseitig
// app_metadata.is_editor. is_admin wird nie angefasst; Admin-Konten duerfen
// nicht herabgestuft werden. Beim Herabstufen wird ein fehlendes Leserprofil
// nachgezogen. Eine Redaktionsrolle verleiht keine Admin-Berechtigung.
export async function setUserEditorRole(
  admin: Client,
  actor: User,
  targetId: string,
  makeEditor: boolean,
): Promise<string | null> {
  const target = await getAuthUser(admin, targetId);
  if (!target) return 'Das Konto wurde nicht gefunden.';
  if (isProtectedAdminTarget(target))
    return 'Admin-Konten können über diesen Bereich nicht herabgestuft werden.';
  const metadata = { ...(target.app_metadata ?? {}) };
  if ((metadata.is_editor === true) === makeEditor) return null;
  metadata.is_editor = makeEditor;
  const { error } = await admin.auth.admin.updateUserById(targetId, {
    app_metadata: metadata,
  });
  if (error) return 'Die Rolle konnte nicht geändert werden.';
  if (!makeEditor) await ensureReaderProfile(admin, targetId);
  audit(actor, 'update', 'user_role', targetId, 'is_editor');
  return null;
}

// Bekannte Avatar-Dateien eines Kontos aus dem Bucket entfernen. Wiederholbar:
// ein zweiter Aufruf findet keine Dateien mehr und ist damit erfolgreich.
export async function removeAvatarFiles(
  admin: Client,
  userId: string,
): Promise<string | null> {
  const bucket = admin.storage.from('reader-avatars');
  const { data: files, error: listError } = await bucket.list(userId, {
    limit: 100,
  });
  if (listError) return 'Die Avatar-Dateien konnten nicht aufgelistet werden.';
  const paths = (files ?? []).map((file) => `${userId}/${file.name}`);
  if (paths.length) {
    const { error: removeError } = await bucket.remove(paths);
    if (removeError)
      return 'Das Profilbild konnte nicht aus dem Speicher entfernt werden.';
  }
  return null;
}

// Profilbild löschen: Datei(en) aus reader-avatars entfernen und avatar_url
// zurücksetzen. Fehlschläge werden als Fehler gemeldet und können erneut
// ausgeführt werden.
export async function deleteUserAvatar(
  admin: Client,
  actor: User,
  targetId: string,
): Promise<string | null> {
  const storageError = await removeAvatarFiles(admin, targetId);
  const { error } = await admin
    .from('reader_profiles')
    .update({ avatar_url: null })
    .eq('id', targetId);
  if (error) return 'Das Profilbild konnte nicht zurückgesetzt werden.';
  audit(actor, 'update', 'user_avatar', targetId, 'avatar_url,avatar_file');
  return storageError;
}

// Geistermodus umschalten. Beim Aktivieren wird das Profilbild gelöscht
// (und nicht wiederhergestellt). Admin-Konten sind ausgeschlossen.
export async function setUserGhost(
  admin: Client,
  actor: User,
  targetId: string,
  ghost: boolean,
): Promise<string | null> {
  const target = await getAuthUser(admin, targetId);
  if (!target) return 'Das Konto wurde nicht gefunden.';
  if (isProtectedAdminTarget(target))
    return 'Admin-Konten können nicht in den Geistermodus versetzt werden.';
  await ensureReaderProfile(admin, targetId);
  if (ghost) {
    const storageError = await removeAvatarFiles(admin, targetId);
    if (storageError) return storageError;
  }
  const { error } = await admin
    .from('reader_profiles')
    .update({ is_ghost: ghost, ...(ghost ? { avatar_url: null } : {}) })
    .eq('id', targetId);
  if (error) return 'Der Geistermodus konnte nicht gespeichert werden.';
  audit(
    actor,
    'update',
    'user_ghost',
    targetId,
    ghost ? 'is_ghost,avatar_url,avatar_file' : 'is_ghost',
  );
  return null;
}

const deletionUnavailable =
  'Die Kontolöschung ist gerade nicht verfügbar. Bitte versuche es erneut.';

// Konto endgültig löschen: nur mit frischem Authenticator-Code des angemeldeten
// Admins (bei jedem Vorgang, auch auf vertrauten Geräten) und eindeutiger
// Bestätigung. Ohne eingerichteten zweiten Faktor ist keine Löschung möglich.
// Admin-Konten und die Selbstlöschung sind ausgeschlossen. Vor der
// Auth-Löschung werden bekannte Avatar-Dateien entfernt; Storage und Auth sind
// keine gemeinsame Transaktion, daher ist jeder Schritt wiederholbar.
export async function deleteUserAccount(
  requestClient: Client,
  admin: Client,
  actor: User,
  targetId: string,
  form: FormData,
): Promise<string | null> {
  if (targetId === actor.id)
    return 'Die Selbstlöschung des eigenen Admin-Kontos ist ausgeschlossen.';
  if (form.get('confirm_delete') !== 'on')
    return 'Bitte bestätige die endgültige Löschung des Kontos.';
  const target = await getAuthUser(admin, targetId);
  if (!target) return 'Das Zielkonto wurde nicht gefunden.';
  if (isProtectedAdminTarget(target))
    return 'Admin-Konten können über diesen Bereich nicht gelöscht werden.';
  // Frischer TOTP-Nachweis unmittelbar vor der Aktion; challengeAndVerify
  // hebt die Sitzung für diesen Vorgang auf AAL2, auch auf vertrauten Geräten.
  const factors = await requestClient.auth.mfa.listFactors();
  if (factors.error) return deletionUnavailable;
  const verified = factors.data.totp.filter(
    (factor) => factor.status === 'verified',
  );
  if (!verified.length)
    return 'Ohne eingerichteten zweiten Faktor ist die Kontolöschung nicht möglich.';
  const factorId = String(form.get('factor_id') ?? '');
  const code = String(form.get('code') ?? '').trim();
  if (
    !verified.some((factor) => factor.id === factorId) ||
    !/^\d{6}$/.test(code)
  )
    return 'Bitte gib deinen sechsstelligen Authenticator-Code ein.';
  const mfa = await requestClient.auth.mfa.challengeAndVerify({
    factorId,
    code,
  });
  if (mfa.error) return 'Der Authenticator-Code ist ungültig oder abgelaufen.';
  const storageError = await removeAvatarFiles(admin, targetId);
  if (storageError) return storageError;
  await admin
    .from('reader_profiles')
    .update({ avatar_url: null })
    .eq('id', targetId);
  const deletion = await admin.auth.admin.deleteUser(targetId);
  if (deletion.error) return deletionUnavailable;
  audit(actor, 'delete', 'user_account', targetId, 'account,avatar_files');
  return null;
}
