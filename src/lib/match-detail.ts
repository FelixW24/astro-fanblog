import { createServerClient } from './supabase';
import type { Match } from './matches';
import type { PlayerMatchRating } from './admin-player-history';

/** Spieler-Eintrag in der Aufstellungs-Ansicht der Spieldetailseite. */
export interface LineupPlayer {
  id: number;
  name: string;
  shirtNumber: number | null;
  position: string;
}

/** Ein Wechsel: ausgewechselter Spieler geht (out), Einwechselspieler kommt (in). */
export interface SubstitutionEvent {
  minute: number;
  out: LineupPlayer | null;
  in: LineupPlayer | null;
}

export interface MatchLineup {
  starters: LineupPlayer[];
  bench: LineupPlayer[];
  substitutions: SubstitutionEvent[];
}

type PlayerRow = {
  id: number;
  name: string;
  shirt_number: number | null;
  position: string;
};

function toLineupPlayer(player: PlayerRow): LineupPlayer {
  return {
    id: player.id,
    name: player.name,
    shirtNumber: player.shirt_number,
    position: player.position,
  };
}

function byShirtThenName(a: LineupPlayer, b: LineupPlayer) {
  return (
    (a.shirtNumber ?? 999) - (b.shirtNumber ?? 999) ||
    a.name.localeCompare(b.name, 'de')
  );
}

/**
 * Baut die Aufstellung des FC Example aus den Verlaufseinträgen: Stammspieler
 * („Im Einsatz“ und „Ausgewechselt“) bilden die Startelf, „Bank“ und
 * „Eingewechselt“ die Bank. Wechsel werden chronologisch nach Minute
 * sortiert; „out“ ist der ausgewechselte Spieler, „in“ der Einwechselspieler.
 * Reine Funktion, damit sie sich ohne Datenbank testen lässt.
 */
export function buildMatchLineup(
  ratings: PlayerMatchRating[],
  players: PlayerRow[],
): MatchLineup {
  const byId = new Map(players.map((player) => [player.id, player]));
  const starters: LineupPlayer[] = [];
  const bench: LineupPlayer[] = [];
  const substitutions: SubstitutionEvent[] = [];
  // Ein Wechsel ist als Paar gespeichert: der „subbed_off“-Eintrag verknüpft
  // über substituted_by_player_id den „subbed_in“-Eintrag. Damit jeder Wechsel
  // nur einmal angezeigt wird, zählen die „subbed_in“-Einträge nur, wenn sie
  // kein Gegenstück haben (allein stehender Eintrag).
  const linkedInPlayerIds = new Set(
    ratings
      .filter(
        (rating) =>
          rating.status === 'subbed_off' &&
          rating.substituted_by_player_id !== null,
      )
      .map((rating) => rating.substituted_by_player_id as number),
  );
  for (const rating of ratings) {
    const player = byId.get(rating.player_id);
    if (!player) continue;
    const lineupPlayer = toLineupPlayer(player);
    if (rating.status === 'played' || rating.status === 'subbed_off')
      starters.push(lineupPlayer);
    else if (rating.status === 'benched' || rating.status === 'subbed_in')
      bench.push(lineupPlayer);
    if (
      (rating.status === 'subbed_off' || rating.status === 'subbed_in') &&
      rating.sub_minute !== null &&
      !(rating.status === 'subbed_in' && linkedInPlayerIds.has(rating.player_id))
    ) {
      const replacement = rating.substituted_by_player_id
        ? byId.get(rating.substituted_by_player_id)
        : undefined;
      substitutions.push({
        minute: rating.sub_minute,
        out: rating.status === 'subbed_off' ? lineupPlayer : null,
        in:
          rating.status === 'subbed_in'
            ? lineupPlayer
            : replacement
              ? toLineupPlayer(replacement)
              : null,
      });
    }
  }
  starters.sort(byShirtThenName);
  bench.sort(byShirtThenName);
  substitutions.sort((a, b) => a.minute - b.minute);
  return { starters, bench, substitutions };
}

export type MatchStatKind = 'percent' | 'xg' | 'count';

/** Eine Statistik-Zeile im Vergleich Heim : Gast der Detailseite. */
export interface MatchStatRow {
  key: string;
  label: string;
  home: number | null;
  away: number | null;
  kind: MatchStatKind;
}

/**
 * Baut die Basis-Statistikzeilen eines Spiels in Anzeige-Reihenfolge
 * (Heim : Gast). Die Datenbank speichert „for“/„against“ aus Sicht des
 * FC Example; bei Auswärtsspielen dreht sich die Anzeige entsprechend.
 * Zeilen ohne gepflegte Werte bleiben null und werden ausgeblendet.
 */
export function buildMatchStats(match: Match): MatchStatRow[] {
  const fc = (forValue: number | null, againstValue: number | null) =>
    match.is_home
      ? { home: forValue, away: againstValue }
      : { home: againstValue, away: forValue };
  return [
    {
      key: 'possession',
      label: 'Ballbesitz',
      ...(match.possession_pct === null
        ? { home: null, away: null }
        : match.is_home
          ? {
              home: match.possession_pct,
              away: 100 - match.possession_pct,
            }
          : {
              home: 100 - match.possession_pct,
              away: match.possession_pct,
            }),
      kind: 'percent',
    },
    {
      key: 'xg',
      label: 'Expected Goals (xG)',
      ...fc(match.xg_for, match.xg_against),
      kind: 'xg',
    },
    {
      key: 'shots',
      label: 'Schüsse',
      ...fc(match.shots_for, match.shots_against),
      kind: 'count',
    },
    {
      key: 'shots_on_target',
      label: 'Schüsse aufs Tor',
      ...fc(match.shots_on_target_for, match.shots_on_target_against),
      kind: 'count',
    },
    {
      key: 'corners',
      label: 'Ecken',
      ...fc(match.corners_for, match.corners_against),
      kind: 'count',
    },
    {
      key: 'fouls',
      label: 'Fouls',
      ...fc(match.fouls_for, match.fouls_against),
      kind: 'count',
    },
    {
      key: 'yellow_cards',
      label: 'Gelbe Karten',
      ...fc(match.yellow_cards_for, match.yellow_cards_against),
      kind: 'count',
    },
    {
      key: 'red_cards',
      label: 'Rote Karten',
      ...fc(match.red_cards_for, match.red_cards_against),
      kind: 'count',
    },
  ];
}

/** Zeigt eine Statistikzeile nur an, wenn mindestens ein Wert gepflegt ist. */
export function visibleMatchStats(rows: MatchStatRow[]): MatchStatRow[] {
  return rows.filter((row) => row.home !== null || row.away !== null);
}

/** Formatiert einen Statistikwert je nach Art (Prozent, xG mit 2 Stellen, Zähler). */
export function formatMatchStatValue(
  value: number | null,
  kind: MatchStatKind,
): string {
  if (value === null) return '–';
  if (kind === 'percent') return `${value} %`;
  if (kind === 'xg')
    return new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  return String(value);
}

export interface MatchDetail {
  match: Match;
  lineup: MatchLineup;
  stats: MatchStatRow[];
}

/**
 * Lädt die Spieldetailseite: das Spiel (abgesagte Spiele bleiben verborgen),
 * die Verlaufseinträge aller nominierten Spieler und die Kaderdaten dazu.
 * Gibt null zurück, wenn das Spiel nicht existiert oder ausgeblendet ist.
 */
export async function getMatchDetail(
  matchId: number,
): Promise<MatchDetail | null> {
  const supabase = createServerClient();
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();
  if (matchError) throw matchError;
  if (!match || match.cancelled) return null;
  const { data: ratings, error: ratingError } = await supabase
    .from('player_match_ratings')
    .select('*')
    .eq('match_id', matchId);
  if (ratingError) throw ratingError;
  const playerIds = [
    ...new Set(
      (ratings ?? []).flatMap((rating) => [
        rating.player_id,
        ...(rating.substituted_by_player_id !== null
          ? [rating.substituted_by_player_id]
          : []),
      ]),
    ),
  ];
  const players: PlayerRow[] = [];
  if (playerIds.length > 0) {
    const { data, error: playerError } = await supabase
      .from('players')
      .select('id, name, shirt_number, position')
      .in('id', playerIds);
    if (playerError) throw playerError;
    players.push(...(data ?? []));
  }
  return {
    match,
    lineup: buildMatchLineup(ratings ?? [], players),
    stats: visibleMatchStats(buildMatchStats(match)),
  };
}
