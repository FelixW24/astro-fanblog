import { URL } from 'node:url';

export class EditorSetupError extends Error {}

export function readEditorCheckConfig(env, production = false) {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase() ?? '';
  const key = env.SUPABASE_AUTH_SECRET_KEY?.trim() ?? '';
  let url;
  try {
    url = new URL(env.PUBLIC_SUPABASE_URL);
  } catch {
    throw new EditorSetupError('PUBLIC_SUPABASE_URL fehlt oder ist ungültig.');
  }
  const local = url.origin === 'http://127.0.0.1:55321';
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new EditorSetupError('PUBLIC_SUPABASE_URL muss die Basis-URL ohne Zugangsdaten sein.');
  }
  if (!local && (!production || url.protocol !== 'https:')) {
    throw new EditorSetupError('Externe Instanzen benötigen HTTPS und --production.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === 'redaktion@example.com') {
    throw new EditorSetupError('ADMIN_EMAIL muss eine eigene gültige E-Mail-Adresse sein.');
  }
  if (email === 'admin@fanblog.local') {
    throw new EditorSetupError('Das mitgelieferte Beispielkonto zählt nicht als eigenes Redaktionskonto. npm run admin:setup ausführen.');
  }
  if (!key) throw new EditorSetupError('SUPABASE_AUTH_SECRET_KEY fehlt.');
  return { url: url.origin, email, key };
}

export function readEditorSetupConfig(env, production = false) {
  const config = readEditorCheckConfig(env, production);
  const password = env.ADMIN_PASSWORD ?? '';
  if (password.length < 10 || password === 'ein-langes-zufaelliges-passwort') {
    throw new EditorSetupError('ADMIN_PASSWORD muss ein eigenes Passwort mit mindestens 10 Zeichen sein.');
  }
  return { ...config, password };
}

async function findEditorAccount(admin, email) {
  const perPage = 100;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error || !data?.users) {
      throw new EditorSetupError('Kontoprüfung fehlgeschlagen. Auth-Dienst und SUPABASE_AUTH_SECRET_KEY prüfen.');
    }
    const existing = data.users.find(
      (user) => user.email?.trim().toLowerCase() === email,
    );
    if (existing) return existing;
    if (data.users.length < perPage) return null;
  }
}

export async function requireEditorAccount(admin, config) {
  const user = await findEditorAccount(admin, config.email);
  if (
    !user ||
    user.id === '10000000-0000-0000-0000-000000000001' ||
    user.app_metadata?.is_editor !== true ||
    !user.email_confirmed_at ||
    (user.banned_until && Date.parse(user.banned_until) > Date.now())
  ) {
    throw new EditorSetupError('Start abgebrochen: Kein nutzbares eigenes Redaktionskonto für ADMIN_EMAIL. Zuerst npm run admin:setup ausführen. Anleitung: docs/redaktionskonto.md');
  }
}

export async function setupEditor(admin, config) {
  const existing = await findEditorAccount(admin, config.email);
  if (existing) {
    if (existing.app_metadata?.is_editor !== true) {
      throw new EditorSetupError('Das Konto existiert bereits ohne Redaktionsrechte. Keine Änderung vorgenommen.');
    }
    // Das bestehende Admin-Konto wird ausdrücklich als Admin festgelegt
    // (is_admin für die Benutzerverwaltung unter /admin/benutzer). is_editor
    // und alle anderen Metadaten bleiben unberührt.
    if (existing.app_metadata?.is_admin !== true) {
      const updated = await admin.updateUserById(existing.id, {
        app_metadata: { ...(existing.app_metadata ?? {}), is_admin: true },
      });
      if (updated.error || updated.data?.user?.app_metadata?.is_admin !== true) {
        throw new EditorSetupError('Admin-Recht konnte nicht gesetzt werden. Konto in Supabase prüfen.');
      }
    }
    return 'existing';
  }

  const created = await admin.createUser({
    email: config.email,
    password: config.password,
    email_confirm: true,
    app_metadata: { is_editor: true, is_admin: true },
  });
  if (created.error || !created.data?.user?.id) {
    throw new EditorSetupError('Redaktionskonto konnte nicht angelegt werden. Konfiguration und Auth-Dienst prüfen.');
  }
  const verified = await admin.getUserById(created.data.user.id);
  if (
    verified.error ||
    verified.data?.user?.email?.toLowerCase() !== config.email ||
    verified.data?.user?.app_metadata?.is_editor !== true ||
    verified.data?.user?.app_metadata?.is_admin !== true ||
    !verified.data?.user?.email_confirmed_at
  ) {
    throw new EditorSetupError('Konto wurde angelegt, die anschließende Prüfung ist fehlgeschlagen. Konto in Supabase prüfen.');
  }
  return 'created';
}
