import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

type AdminClient = SupabaseClient<Database>;

// Redaktionskonten haben serverseitig kein Leserkonto: Der Auth-Trigger legt
// reader_profiles nur an, wenn bei der Registrierung Username-Metadaten
// vorliegen. Alle Leserkonto-Berechtigungen hängen an FK-Referenzen auf
// reader_profiles (comments, comment_votes, notifications,
// article_notification_preferences), daher wird das Profil hier automatisch
// nachgezogen. Redaktionskonten sind von der Username-Blacklist ausgenommen
// (siehe Migration 20261030120000), der generierte Name ist also zulässig.
export async function ensureReaderProfile(
  adminClient: AdminClient,
  userId: string,
): Promise<void> {
  const { data: existing } = await adminClient
    .from('reader_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (existing) return;
  const username = `redaktion_${userId.replace(/-/g, '').slice(0, 12)}`;
  const { error } = await adminClient.from('reader_profiles').insert({
    id: userId,
    username,
    avatar: 'male',
  });
  if (error) {
    // Ein paralleler Aufruf kann das Profil bereits angelegt haben.
    const { data: retry } = await adminClient
      .from('reader_profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (!retry) throw error;
  }
}
