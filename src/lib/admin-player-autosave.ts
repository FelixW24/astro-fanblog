import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import {
  parsePlayerForm,
  playerFormValuesEqual,
  playerPayload,
  playerToFormValues,
} from './admin-player';
import { savePlayerLoan } from './admin-loan';
import {
  mergePlayerMatchHistory,
  parseMatchRatingEntry,
  saveChangedMatchRatings,
} from './admin-player-history';

type Client = SupabaseClient<Database>;

export interface PlayerAutosaveResult {
  /** true, wenn das Profil wegen geänderter Felder geschrieben wurde. */
  profileSaved: boolean;
  /** Anzahl gespeicherter Verlaufseinträge. */
  ratingsSaved: number;
  /** Anzahl entfernter Verlaufseinträge. */
  ratingsRemoved: number;
  /** Validierungs-/Speicherfehler der Verlaufseinträge (werden nicht gespeichert). */
  ratingErrors: { matchId: number; error: string }[];
  /** Fehlermeldung, wenn das Spielerprofil nicht existiert. */
  notFound: boolean;
}

/**
 * Wendet den unsichtbaren Autosave an: Profilfelder und Verlaufseinträge aus
 * der Profilsammel-Form werden gespeichert, soweit sie sich geändert haben.
 * Ungültige Profilfelder werden übersprungen (der zentrale Speichern-Button
 * meldet sie sichtbar), Chart-Felder werden bewusst ignoriert — Charts legen
 * weiterhin nur der zentrale Button an. Verlaufseinträge mit
 * Validierungsfehler landen in `ratingErrors` und werden nicht gespeichert.
 */
export async function applyPlayerAutosave(
  supabase: Client,
  playerId: number,
  formData: FormData,
): Promise<PlayerAutosaveResult> {
  const empty: PlayerAutosaveResult = {
    profileSaved: false,
    ratingsSaved: 0,
    ratingsRemoved: 0,
    ratingErrors: [],
    notFound: false,
  };

  const { data: player } = await supabase
    .from('players')
    .select('*, loans(*)')
    .eq('id', playerId)
    .maybeSingle();
  if (!player) return { ...empty, notFound: true };

  const parsed = parsePlayerForm(formData);
  if (
    !parsed.error &&
    !playerFormValuesEqual(
      playerToFormValues(player, player.loans ?? []),
      parsed.values,
    )
  ) {
    const { error } = await supabase
      .from('players')
      .update(playerPayload(parsed.values))
      .eq('id', playerId);
    if (!error) {
      await savePlayerLoan(supabase, playerId, parsed.values);
      empty.profileSaved = true;
    }
  }

  const now = new Date();
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('cancelled', false)
    .lte('kickoff_at', now.toISOString())
    .order('kickoff_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(50);
  const { data: ratings } = await supabase
    .from('player_match_ratings')
    .select('*')
    .eq('player_id', playerId);
  const history = mergePlayerMatchHistory(matches ?? [], ratings ?? [], now);
  const parsedEntries = history.map((entry) =>
    parseMatchRatingEntry(formData, entry.match.id),
  );
  const ratingResult = await saveChangedMatchRatings(
    supabase,
    playerId,
    history,
    parsedEntries,
  );

  return {
    profileSaved: empty.profileSaved,
    ratingsSaved: ratingResult.saved,
    ratingsRemoved: ratingResult.removed,
    ratingErrors: ratingResult.errors,
    notFound: false,
  };
}
