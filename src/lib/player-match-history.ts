import { createServerClient } from './supabase';
import {
  type MatchHistoryEntry,
  type MatchParticipationStatus,
  type PlayerMatchRating,
} from './admin-player-history';
import type { Match } from './matches';

/**
 * Öffentlicher Verlaufseintrag: ein vergangenes Spiel angereichert um
 * Nominierungsstatus, Note, Minuten, Tore, Vorlagen und ggf.
 * Einwechselspieler. `recorded` markiert, ob die Redaktion für dieses Spiel
 * überhaupt einen Eintrag gepflegt hat; `substitutedByName` löst die ID des
 * Einwechselspielers auf.
 */
export interface PublicMatchHistoryEntry extends MatchHistoryEntry {
  recorded: boolean;
  substitutedByName: string | null;
}

/**
 * Baut die öffentliche Spielhistorie eines Spielers aus den Vereinsspielen
 * und den Verlaufseinträgen. Reine Funktion, damit sie sich ohne Datenbank
 * testen lässt. Chronologisch aufsteigend sortiert, damit das nächste Spiel
 * am Ende der Timeline steht; abgesagte Spiele werden ignoriert.
 */
export function toPublicMatchHistory(
  matches: Match[],
  ratings: PlayerMatchRating[],
  substituteNames: Map<number, string>,
): PublicMatchHistoryEntry[] {
  const ratingByMatch = new Map(
    ratings.map((rating) => [rating.match_id, rating]),
  );
  return [...matches]
    .filter((match) => !match.cancelled)
    .sort(
      (a, b) =>
        (a.kickoff_at ?? '').localeCompare(b.kickoff_at ?? '') || a.id - b.id,
    )
    .map((match) => {
      const rating = ratingByMatch.get(match.id);
      const entry: MatchHistoryEntry = {
        match,
        rating: rating?.rating ?? null,
        status: (rating?.status ?? 'played') as MatchParticipationStatus,
        minutesPlayed: rating?.minutes_played ?? null,
        subMinute: rating?.sub_minute ?? null,
        substitutedBy: rating?.substituted_by_player_id ?? null,
        goals: rating?.goals ?? 0,
        assists: rating?.assists ?? 0,
        note: rating?.note ?? null,
      };
      return {
        ...entry,
        recorded: ratingByMatch.has(match.id),
        substitutedByName:
          entry.substitutedBy === null
            ? null
            : (substituteNames.get(entry.substitutedBy) ?? null),
      };
    });
}

/**
 * Prüft, ob ein Spieler mindestens ein Spiel für den Verein anwesend war —
 * also im Einsatz, eingewechselt oder ausgewechselt wurde. „Nicht nominiert“,
 * reine Bank ohne Minute und nicht redaktionell erfasste Spiele zählen nicht
 * als anwesend; hat ein Spieler kein solches Spiel, bleibt die Spielhistorie
 * auf dem Profil ausgeblendet.
 */
export function hasMatchAppearances(
  entries: PublicMatchHistoryEntry[],
): boolean {
  return entries.some(
    (entry) =>
      entry.recorded &&
      entry.status !== 'not_nominated' &&
      entry.status !== 'benched',
  );
}

/**
 * Lädt die Spielhistorie eines Spielers für das öffentliche Profil: die
 * absolvierten, nicht abgesagten Spiele des Vereins samt Verlaufseinträgen
 * des Spielers, plus das nächste kommende Spiel als letzter Eintrag, und
 * den Namen der Einwechselspieler.
 */
export async function getPlayerMatchHistory(
  playerId: number,
  limit = 30,
): Promise<PublicMatchHistoryEntry[]> {
  const supabase = createServerClient();
  const now = new Date();
  const [
    { data: pastMatches, error: matchError },
    { data: ratings, error: ratingError },
    { data: nextMatches, error: nextMatchError },
  ] = await Promise.all([
    supabase
      .from('matches')
      .select('*')
      .eq('cancelled', false)
      .lte('kickoff_at', now.toISOString())
      // Absteigend + Limit holt die neuesten `limit` Spiele; die
      // aufsteigende Sortierung übernimmt toPublicMatchHistory.
      .order('kickoff_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit),
    supabase.from('player_match_ratings').select('*').eq('player_id', playerId),
    supabase
      .from('matches')
      .select('*')
      .eq('cancelled', false)
      .gt('kickoff_at', now.toISOString())
      .order('kickoff_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1),
  ]);
  if (matchError) throw matchError;
  if (ratingError) throw ratingError;
  if (nextMatchError) throw nextMatchError;

  const matches = [...(pastMatches ?? []), ...(nextMatches ?? [])];
  const entries = toPublicMatchHistory(matches, ratings ?? [], new Map());
  const substituteIds = [
    ...new Set(
      entries
        .map((entry) => entry.substitutedBy)
        .filter((id): id is number => id !== null),
    ),
  ];
  const names = new Map<number, string>();
  if (substituteIds.length > 0) {
    const { data: players, error: playerError } = await supabase
      .from('players')
      .select('id, name')
      .in('id', substituteIds);
    if (playerError) throw playerError;
    for (const player of players ?? []) names.set(player.id, player.name);
  }
  return toPublicMatchHistory(matches, ratings ?? [], names);
}
