import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

type AdminAuthClient = SupabaseClient<Database>;

// Prüft serverseitig über den Admin-Auth-Client, ob zu einer Adresse ein
// Konto existiert. Ergebnis: true = Konto bekannt, false = kein Konto,
// undefined = unklar (Suche fehlgeschlagen). Bei undefined zeigen
// Aufrufer keinen Hinweis und bleiben beim bisherigen Verhalten, damit
// eine gestörte Suche keine Kontoverfügbarkeit verrät.
export async function emailHasAccount(
  adminClient: AdminAuthClient,
  email: string,
): Promise<boolean | undefined> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  let page = 1;
  let visited = 0;
  while (visited < 100000) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error || !data || !Array.isArray(data.users)) return undefined;
    if (
      data.users.some((user) => user.email?.toLowerCase() === normalized)
    )
      return true;
    visited += data.users.length;
    // next_page/total liefert GoTrue mit jeder Antwort; ohne die Header
    // endet die Suche an der leeren Seite statt früh abzuschneiden.
    if (
      data.users.length === 0 ||
      data.nextPage === null ||
      visited >= (data.total ?? Infinity)
    )
      return false;
    page = data.nextPage ?? page + 1;
  }
  return undefined;
}
