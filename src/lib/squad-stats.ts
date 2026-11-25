import type { Database } from './database.types';
import { createServerClient } from './supabase';
import {
  matchGradeValue,
  type PlayerMatchRating,
} from './admin-player-history';
import type { Match } from './matches';
import { calculateAge, formatMarketValue, formatPlayerDate } from './player';

export type SquadPlayer = Database['public']['Tables']['players']['Row'];

export type SquadStatIcon =
  | 'star'
  | 'hourglass'
  | 'coins'
  | 'flag'
  | 'calendar'
  | 'height'
  | 'file'
  | 'medical';

export interface SquadStatPlayerRef {
  name: string;
  slug: string;
}

export type SquadStatSegment =
  | { type: 'text'; text: string }
  | { type: 'player'; player: SquadStatPlayerRef };

export interface SquadStat {
  key: string;
  icon: SquadStatIcon;
  label: string;
  value: string;
  detail: SquadStatSegment[];
}

/** Mindestens so viele benotete Spiele braucht ein Spieler für den Notenschnitt. */
const MIN_GRADED_MATCHES = 2;

const deNumber = new Intl.NumberFormat('de-DE');
const deNumber1 = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function text(value: string): SquadStatSegment {
  return { type: 'text', text: value };
}

function playerSegment(player: SquadPlayer): SquadStatSegment {
  return { type: 'player', player: { name: player.name, slug: player.slug } };
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

function byName(a: SquadPlayer, b: SquadPlayer) {
  return a.name.localeCompare(b.name, 'de-DE');
}

interface PlayerSeasonLine {
  player: SquadPlayer;
  grades: number[];
  minutes: number;
}

function seasonLines(
  players: SquadPlayer[],
  matches: Match[],
  ratings: PlayerMatchRating[],
  now: Date,
): PlayerSeasonLine[] {
  const pastMatchIds = new Set(
    matches
      .filter(
        (match) =>
          !match.cancelled &&
          match.kickoff_at !== null &&
          new Date(match.kickoff_at) <= now,
      )
      .map((match) => match.id),
  );
  const playerById = new Map(players.map((player) => [player.id, player]));
  const lines = new Map<number, PlayerSeasonLine>();
  for (const rating of ratings) {
    if (!pastMatchIds.has(rating.match_id)) continue;
    const player = playerById.get(rating.player_id);
    if (!player) continue;
    let line = lines.get(player.id);
    if (!line) {
      line = { player, grades: [], minutes: 0 };
      lines.set(player.id, line);
    }
    const grade = matchGradeValue(rating.rating);
    if (grade !== null) line.grades.push(grade);
    line.minutes += rating.minutes_played ?? 0;
  }
  return [...lines.values()];
}

function notenStat(lines: PlayerSeasonLine[]): SquadStat {
  const candidates = lines
    .filter((line) => line.grades.length >= MIN_GRADED_MATCHES)
    .map((line) => ({
      line,
      average:
        line.grades.reduce((sum, grade) => sum + grade, 0) / line.grades.length,
    }))
    .sort(
      (a, b) =>
        b.average - a.average ||
        b.line.grades.length - a.line.grades.length ||
        byName(a.line.player, b.line.player),
    );
  const best = candidates[0];
  return {
    key: 'noten',
    icon: 'star',
    label: 'Bester Notenschnitt',
    value: best ? `Ø ${deNumber1.format(best.average)}` : '–',
    detail: best
      ? [
          playerSegment(best.line.player),
          text(
            ` · ${best.line.grades.length} ${plural(best.line.grades.length, 'benotetes Spiel', 'benotete Spiele')}`,
          ),
        ]
      : [text('Noch keine Noten vergeben')],
  };
}

function minutenStat(lines: PlayerSeasonLine[]): SquadStat {
  const top = [...lines]
    .filter((line) => line.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || byName(a.player, b.player))[0];
  return {
    key: 'minuten',
    icon: 'hourglass',
    label: 'Meiste Spielminuten',
    value: top ? `${deNumber.format(top.minutes)} Min` : '–',
    detail: top
      ? [playerSegment(top.player)]
      : [text('Noch keine Minuten erfasst')],
  };
}

function marktwertStat(players: SquadPlayer[]): SquadStat {
  const valued = players.filter((player) => player.market_value_eur != null);
  const sum = valued.reduce(
    (total, player) => total + (player.market_value_eur ?? 0),
    0,
  );
  return {
    key: 'marktwert',
    icon: 'coins',
    label: 'Kaderwert gesamt',
    value: valued.length ? formatMarketValue(sum) : '–',
    detail: valued.length
      ? [
          text(
            `Ø ${formatMarketValue(Math.round(sum / valued.length))} pro Spieler`,
          ),
        ]
      : [],
  };
}

function nationenStat(players: SquadPlayer[]): SquadStat {
  const groups = new Map<string, number>();
  for (const player of players) {
    const nation = player.nationality?.trim();
    if (!nation) continue;
    groups.set(nation, (groups.get(nation) ?? 0) + 1);
  }
  const largest = [...groups.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de-DE'),
  )[0];
  return {
    key: 'nationen',
    icon: 'flag',
    label: 'Nationen im Kader',
    value: groups.size ? `${groups.size}` : '–',
    detail: largest
      ? [
          text(
            `${largest[0]} · ${largest[1]} ${plural(largest[1], 'Spieler', 'Spieler')}`,
          ),
        ]
      : [],
  };
}

function alterStat(players: SquadPlayer[], now: Date): SquadStat {
  const ages = players
    .filter((player) => player.date_of_birth)
    .map((player) => ({
      player,
      age: calculateAge(player.date_of_birth, now),
    }))
    .filter(
      (entry): entry is { player: SquadPlayer; age: number } =>
        entry.age !== null,
    )
    .sort((a, b) => a.age - b.age || byName(a.player, b.player));
  if (!ages.length) {
    return {
      key: 'alter',
      icon: 'calendar',
      label: 'Altersspanne',
      value: '–',
      detail: [],
    };
  }
  const youngest = ages[0];
  const oldest = ages[ages.length - 1];
  return {
    key: 'alter',
    icon: 'calendar',
    label: 'Altersspanne',
    value:
      youngest.age === oldest.age
        ? `${youngest.age} Jahre`
        : `${youngest.age}–${oldest.age} Jahre`,
    detail: [
      text('Jüngster: '),
      playerSegment(youngest.player),
      text(' · Ältester: '),
      playerSegment(oldest.player),
    ],
  };
}

function groesseStat(players: SquadPlayer[]): SquadStat {
  const heights = players.filter((player) => player.height_cm != null);
  if (!heights.length) {
    return {
      key: 'groesse',
      icon: 'height',
      label: 'Durchschnittsgröße',
      value: '–',
      detail: [],
    };
  }
  const average =
    heights.reduce((sum, player) => sum + (player.height_cm ?? 0), 0) /
    heights.length;
  const tallest = [...heights].sort(
    (a, b) => (b.height_cm ?? 0) - (a.height_cm ?? 0) || byName(a, b),
  )[0];
  return {
    key: 'groesse',
    icon: 'height',
    label: 'Durchschnittsgröße',
    value: `Ø ${(average / 100).toFixed(2).replace('.', ',')} m`,
    detail: [
      text('Größter: '),
      playerSegment(tallest),
      text(` (${tallest.height_cm} cm)`),
    ],
  };
}

function vertragStat(players: SquadPlayer[]): SquadStat {
  const withContract = players.filter((player) => player.contract_until);
  const latest = [...withContract].sort(
    (a, b) =>
      (b.contract_until ?? '').localeCompare(a.contract_until ?? '') ||
      byName(a, b),
  )[0];
  return {
    key: 'vertrag',
    icon: 'file',
    label: 'Längster Vertrag',
    value: latest ? formatPlayerDate(latest.contract_until) : '–',
    detail: latest ? [playerSegment(latest)] : [],
  };
}

function verletztStat(players: SquadPlayer[]): SquadStat {
  const injured = players.filter((player) => player.is_injured).sort(byName);
  const detail: SquadStatSegment[] = [];
  injured.forEach((player, index) => {
    if (index > 0) detail.push(text(', '));
    detail.push(playerSegment(player));
  });
  if (!injured.length) detail.push(text('Aktuell keine Ausfälle'));
  return {
    key: 'verletzt',
    icon: 'medical',
    label: 'Verletzte',
    value: `${injured.length}`,
    detail,
  };
}

/**
 * Reine Berechnung der Kader-Statistiken: eine Karte pro Fakt mit Icon,
 * Wert, Label und Detailzeile (ggf. mit Spieler-Links). Vergangene Spiele
 * sind alle nicht abgesagten Spiele mit Anstoß bis `now`.
 */
export function computeSquadStats(
  players: SquadPlayer[],
  matches: Match[],
  ratings: PlayerMatchRating[],
  now: Date = new Date(),
): SquadStat[] {
  const lines = seasonLines(players, matches, ratings, now);
  return [
    notenStat(lines),
    minutenStat(lines),
    marktwertStat(players),
    nationenStat(players),
    alterStat(players, now),
    groesseStat(players),
    vertragStat(players),
    verletztStat(players),
  ];
}

/**
 * Lädt Spiele und Verlaufseinträge für die Kader-Seite und berechnet daraus
 * die Statistik-Karten. Die Spieler kommen vom Aufrufer (ein einzelnes
 * Squad-Query).
 */
export async function getSquadStats(
  players: SquadPlayer[],
): Promise<SquadStat[]> {
  const supabase = createServerClient();
  const now = new Date();
  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .order('kickoff_at', { ascending: false })
    .order('id', { ascending: false });
  if (matchError) throw matchError;
  let ratings: PlayerMatchRating[] = [];
  const ids = players.map((player) => player.id);
  if (ids.length) {
    const { data, error } = await supabase
      .from('player_match_ratings')
      .select('*')
      .in('player_id', ids);
    if (error) throw error;
    ratings = data ?? [];
  }
  return computeSquadStats(players, matches ?? [], ratings, now);
}
