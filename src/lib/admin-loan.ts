import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { loanPayload, type PlayerFormValues } from './admin-player';

type Client = SupabaseClient<Database>;

/**
 * Persists the loan details of a player whose squad status is a loan status.
 * The active loan row is updated in place so the loan history stays intact.
 * When the player leaves the loan statuses, active loans are marked as
 * completed instead of lingering as active rows.
 */
export async function savePlayerLoan(
  supabase: Client,
  playerId: number,
  values: PlayerFormValues,
): Promise<string | null> {
  const loan = loanPayload(values);
  if (!loan) {
    const { error: endError } = await supabase
      .from('loans')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('player_id', playerId)
      .eq('status', 'active');
    if (endError)
      return 'Die vorhandenen Leihdaten konnten nicht abgeschlossen werden. Bitte versuche es erneut.';
    return null;
  }
  const { data: activeLoans, error: lookupError } = await supabase
    .from('loans')
    .select('id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .order('starts_on', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);
  if (lookupError)
    return 'Die vorhandenen Leihdaten konnten nicht geladen werden. Bitte versuche es erneut.';
  const existingId = activeLoans?.[0]?.id;
  const mutation = existingId
    ? await supabase.from('loans').update(loan).eq('id', existingId)
    : await supabase.from('loans').insert({ ...loan, player_id: playerId });
  if (mutation.error)
    return 'Die Leihdaten konnten nicht gespeichert werden. Bitte versuche es erneut.';
  return null;
}
