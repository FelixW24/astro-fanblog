import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { parseNewPassword } from './reader';

type Client = SupabaseClient<Database>;
const unavailable =
  'Der Passwortwechsel konnte nicht durchgeführt werden. Bitte versuche es später erneut.';
const incorrect =
  'Das aktuelle Passwort ist nicht korrekt. Bitte prüfe deine Eingabe.';

// Prüft das aktuelle Passwort für die Feldfreigabe im Profil-Modal. Der
// kurzlebige Login läuft auf einem eigenen Client und wird sofort beendet.
export async function verifyOwnPassword(
  user: User,
  form: FormData,
  verification: Client,
): Promise<string | null> {
  const password = String(form.get('password') ?? '');
  if (!password || password.length > 1024)
    return 'Bitte gib dein aktuelles Passwort ein.';
  if (!user.email) return unavailable;
  let signedIn = false;
  try {
    const login = await verification.auth.signInWithPassword({
      email: user.email,
      password,
    });
    signedIn = Boolean(login.data.session);
    if (login.error || !login.data.session || login.data.user?.id !== user.id)
      return incorrect;
    return null;
  } catch {
    console.error('auth.password_check_failed');
    return unavailable;
  } finally {
    if (signedIn) {
      try {
        await verification.auth.signOut({ scope: 'local' });
      } catch {
        console.error('auth.verification_session_cleanup_failed');
      }
    }
  }
}

// Passwortwechsel aus dem Profil-Modal: Das aktuelle Passwort wird erneut
// geprüft (die Freigabe im Browser ist nur Bedienhilfe), bei aktiver 2FA
// zählt ein Authenticator-Code. Danach laufen alle Sitzungen ab.
export async function changeOwnPassword(
  user: User,
  form: FormData,
  verification: Client,
): Promise<string | null> {
  const current = String(form.get('current_password') ?? '');
  if (!current || current.length > 1024)
    return 'Bitte gib dein aktuelles Passwort ein.';
  const parsed = parseNewPassword(form);
  if (parsed.error) return parsed.error;
  if (!user.email) return unavailable;
  let signedIn = false;
  try {
    const login = await verification.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    signedIn = Boolean(login.data.session);
    if (login.error || !login.data.session || login.data.user?.id !== user.id)
      return incorrect;
    const factors = await verification.auth.mfa.listFactors();
    if (factors.error) return unavailable;
    const verified = factors.data.totp.filter((f) => f.status === 'verified');
    if (verified.length) {
      const factorId = String(form.get('factor_id') ?? '');
      const code = String(form.get('code') ?? '').trim();
      if (!verified.some((f) => f.id === factorId) || !/^\d{6}$/.test(code))
        return 'Bestätige den Passwortwechsel zusätzlich mit deinem Authenticator-Code.';
      const mfa = await verification.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (mfa.error)
        return 'Der Authenticator-Code ist ungültig oder abgelaufen.';
    }
    // secure_password_change verlangt bei Passwort-Grant-Sitzungen das aktuelle
    // Passwort zusätzlich im Body; der Client schluckt es als Attribut.
    const update = await verification.auth.updateUser({
      password: parsed.password,
      ...({ current_password: current } as Record<string, string>),
    });
    if (update.error)
      return 'Das Passwort konnte nicht geändert werden. Wähle ein anderes sicheres Passwort.';
    const logout = await verification.auth.signOut({ scope: 'global' });
    if (logout.error) return unavailable;
    signedIn = false;
    return null;
  } catch {
    console.error('auth.password_change_failed');
    return unavailable;
  } finally {
    if (signedIn) {
      try {
        await verification.auth.signOut({ scope: 'local' });
      } catch {
        console.error('auth.verification_session_cleanup_failed');
      }
    }
  }
}
