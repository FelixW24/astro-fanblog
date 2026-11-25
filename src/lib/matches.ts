import type { Database } from './database.types';
import { berlinDateTimeToIso, formatBerlinDateTimeLocal } from './date-time';

export type Match = Database['public']['Tables']['matches']['Row'];
export type MatchFormValues = Omit<Match, 'id'>;
export const emptyMatch: MatchFormValues = {
  opponent: '',
  opponent_short: '',
  is_home: true,
  kickoff_at: '',
  venue: 'Example Arena',
  matchcenter_url: '',
  cancelled: false,
  home_goals: null,
  away_goals: null,
  possession_pct: null,
  xg_for: null,
  xg_against: null,
  shots_for: null,
  shots_against: null,
  shots_on_target_for: null,
  shots_on_target_against: null,
  corners_for: null,
  corners_against: null,
  fouls_for: null,
  fouls_against: null,
  yellow_cards_for: null,
  yellow_cards_against: null,
  red_cards_for: null,
  red_cards_against: null,
};

/** Optionale ganze Zahl (Zähler-Statistik) zwischen 0 und 99; leer = null. */
function optionalCount(raw: string, label: string) {
  const value = raw.trim();
  if (!value) return { ok: true as const, number: null as number | null };
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99)
    return {
      ok: false as const,
      number: null,
      error: `${label} muss eine ganze Zahl zwischen 0 und 99 sein.`,
    };
  return { ok: true as const, number };
}

/** Optionaler Prozentwert (Ballbesitz) zwischen 0 und 100; leer = null. */
function optionalPercent(raw: string) {
  const value = raw.trim();
  if (!value) return { ok: true as const, number: null as number | null };
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100)
    return {
      ok: false as const,
      number: null,
      error: 'Der Ballbesitz muss eine ganze Zahl zwischen 0 und 100 sein.',
    };
  return { ok: true as const, number };
}

/** Optionaler xG-Wert zwischen 0 und 99,99; Komma und Punkt erlaubt. */
function optionalXg(raw: string, label: string) {
  const value = raw.trim();
  if (!value) return { ok: true as const, number: null as number | null };
  const number = Number(value.replace(',', '.'));
  if (!Number.isFinite(number) || number < 0 || number > 99.99)
    return {
      ok: false as const,
      number: null,
      error: `${label} muss eine Zahl zwischen 0 und 99,99 sein.`,
    };
  return { ok: true as const, number: Math.round(number * 100) / 100 };
}

export function matchToForm(match: Match): MatchFormValues {
  return {
    ...match,
    // null = "Noch nicht terminiert"; bleibt null, damit die Checkbox greift.
    kickoff_at: match.kickoff_at
      ? formatBerlinDateTimeLocal(match.kickoff_at)
      : null,
  };
}

export function parseMatchForm(form: FormData) {
  const text = (key: string) => String(form.get(key) ?? '').trim();
  // "Noch nicht terminiert": kein Anstoß gepflegt, kickoff_at wird null.
  const unscheduled = form.get('unscheduled') === 'on';
  const values: MatchFormValues = {
    opponent: text('opponent'),
    opponent_short: text('opponent_short'),
    is_home: text('location') === 'home',
    kickoff_at: unscheduled ? null : text('kickoff_at'),
    venue: text('venue'),
    matchcenter_url: text('matchcenter_url'),
    cancelled: form.get('cancelled') === 'on',
    home_goals: null,
    away_goals: null,
    possession_pct: null,
    xg_for: null,
    xg_against: null,
    shots_for: null,
    shots_against: null,
    shots_on_target_for: null,
    shots_on_target_against: null,
    corners_for: null,
    corners_against: null,
    fouls_for: null,
    fouls_against: null,
    yellow_cards_for: null,
    yellow_cards_against: null,
    red_cards_for: null,
    red_cards_against: null,
  };
  let error: string | null = null;
  const kickoff = unscheduled
    ? null
    : berlinDateTimeToIso(values.kickoff_at ?? '');
  const homeGoalsRaw = text('home_goals');
  const awayGoalsRaw = text('away_goals');
  if (homeGoalsRaw || awayGoalsRaw) {
    const homeGoals = Number(homeGoalsRaw);
    const awayGoals = Number(awayGoalsRaw);
    if (
      !homeGoalsRaw ||
      !awayGoalsRaw ||
      !Number.isInteger(homeGoals) ||
      !Number.isInteger(awayGoals) ||
      homeGoals < 0 ||
      awayGoals < 0 ||
      homeGoals > 30 ||
      awayGoals > 30
    )
      error =
        'Das Ergebnis braucht zwei ganze Zahlen zwischen 0 und 30 – einmal Tore Heim und einmal Tore Gast.';
    else {
      values.home_goals = homeGoals;
      values.away_goals = awayGoals;
    }
  }
  if (values.opponent.length < 2 || values.opponent.length > 120)
    error = 'Bitte trage einen Gegner mit 2 bis 120 Zeichen ein.';
  else if (!values.opponent_short || values.opponent_short.length > 5)
    error = 'Das Gegnerkürzel muss 1 bis 5 Zeichen lang sein.';
  else if (!['home', 'away'].includes(text('location')))
    error = 'Bitte wähle Heimspiel oder Auswärtsspiel.';
  else if (!unscheduled && !kickoff)
    error =
      'Bitte trage eine gültige Anstoßzeit ein. Beachte die Zeitumstellung.';
  else if (values.venue.length < 2 || values.venue.length > 160)
    error = 'Bitte trage ein Stadion mit 2 bis 160 Zeichen ein.';
  else if (values.matchcenter_url) {
    try {
      const url = new URL(values.matchcenter_url);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        values.matchcenter_url.length > 2000
      )
        throw new Error('Invalid URL');
    } catch {
      error =
        'Der Spielcenter-Link muss eine gültige http://- oder https://-Adresse sein.';
    }
  }
  // Basis-Statistiken: „for“ ist immer der FC Example, „against“ der Gegner.
  if (!error) {
    const stats = [
      ['possession_pct', optionalPercent(text('possession_pct'))],
      ['xg_for', optionalXg(text('xg_for'), 'xG FC Example')],
      ['xg_against', optionalXg(text('xg_against'), 'xG Gegner')],
      ['shots_for', optionalCount(text('shots_for'), 'Schüsse FC Example')],
      ['shots_against', optionalCount(text('shots_against'), 'Schüsse Gegner')],
      [
        'shots_on_target_for',
        optionalCount(
          text('shots_on_target_for'),
          'Schüsse aufs Tor FC Example',
        ),
      ],
      [
        'shots_on_target_against',
        optionalCount(
          text('shots_on_target_against'),
          'Schüsse aufs Tor Gegner',
        ),
      ],
      ['corners_for', optionalCount(text('corners_for'), 'Ecken FC Example')],
      [
        'corners_against',
        optionalCount(text('corners_against'), 'Ecken Gegner'),
      ],
      ['fouls_for', optionalCount(text('fouls_for'), 'Fouls FC Example')],
      ['fouls_against', optionalCount(text('fouls_against'), 'Fouls Gegner')],
      [
        'yellow_cards_for',
        optionalCount(text('yellow_cards_for'), 'Gelbe Karten FC Example'),
      ],
      [
        'yellow_cards_against',
        optionalCount(text('yellow_cards_against'), 'Gelbe Karten Gegner'),
      ],
      [
        'red_cards_for',
        optionalCount(text('red_cards_for'), 'Rote Karten FC Example'),
      ],
      [
        'red_cards_against',
        optionalCount(text('red_cards_against'), 'Rote Karten Gegner'),
      ],
    ] as const;
    for (const [key, parsed] of stats) {
      if (!parsed.ok) {
        error = parsed.error;
        break;
      }
      values[key] = parsed.number;
    }
  }
  return {
    values,
    error,
    payload: {
      ...values,
      kickoff_at: kickoff,
      matchcenter_url: values.matchcenter_url || null,
    },
  };
}

export function formatMatchTime(value: string) {
  return (
    new Intl.DateTimeFormat('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    }).format(new Date(value)) + ' Uhr'
  );
}

export function formatMatchDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  }).format(new Date(value));
}

export function formatMatchClock(value: string) {
  return (
    new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    }).format(new Date(value)) + ' Uhr'
  );
}

export function matchTeams(match: Match) {
  const fc = { name: 'FC Example', short: 'FC', fc: true };
  const opponent = {
    name: match.opponent,
    short: match.opponent_short,
    fc: false,
  };
  return match.is_home ? [fc, opponent] : [opponent, fc];
}

/** Ergebnis in Anzeige-Reihenfolge (Heim : Gast), oder null ohne Ergebnis. */
export function matchScore(
  match: Pick<Match, 'home_goals' | 'away_goals'>,
): string | null {
  if (match.home_goals == null || match.away_goals == null) return null;
  return `${match.home_goals} : ${match.away_goals}`;
}

export type MatchOutcome = 'sieg' | 'remis' | 'niederlage';

/** Ausgang aus Sicht des FC Example, oder null ohne Ergebnis. */
export function matchOutcome(
  match: Pick<Match, 'is_home' | 'home_goals' | 'away_goals'>,
): MatchOutcome | null {
  if (match.home_goals == null || match.away_goals == null) return null;
  const fcGoals = match.is_home ? match.home_goals : match.away_goals;
  const opponentGoals = match.is_home ? match.away_goals : match.home_goals;
  if (fcGoals > opponentGoals) return 'sieg';
  if (fcGoals < opponentGoals) return 'niederlage';
  return 'remis';
}

export function matchOutcomeLabel(outcome: MatchOutcome | null): string {
  return outcome === 'sieg'
    ? 'Sieg'
    : outcome === 'niederlage'
      ? 'Niederlage'
      : outcome === 'remis'
        ? 'Remis'
        : '';
}

export type DatedMatch = Match & { kickoff_at: string };

/** True, wenn ein gültiger Anstoßtermin hinterlegt ist (null = „noch nicht terminiert“). */
export function hasKickoffDate(match: Match): match is DatedMatch {
  if (!match.kickoff_at) return false;
  return !Number.isNaN(new Date(match.kickoff_at).getTime());
}

/** Noch nicht ausgetragen: ohne Termin oder mit Anstoß in der Zukunft. */
export function isUpcomingMatch(match: Match, now = new Date()): boolean {
  return !hasKickoffDate(match) || new Date(match.kickoff_at) > now;
}

/**
 * Sortiert die öffentliche Spielplan-Timeline (abgesagte Spiele entfernt):
 * oben die Spiele ohne festen Termin, dann die Historie (neuestes zuerst).
 * Terminierte kommende Spiele stehen ganz am Ende als Stapel in der
 * Reihenfolge, in der sie angelegt wurden (id aufsteigend = das zuerst
 * eingetragene Spiel wird zuerst angezeigt).
 */
export function buildMatchTimeline(
  matches: Match[],
  now = new Date(),
): Match[] {
  const visible = matches.filter((match) => !match.cancelled);
  const unscheduled = visible.filter((match) => !hasKickoffDate(match));
  const past = visible
    .filter(
      (match): match is DatedMatch =>
        hasKickoffDate(match) && new Date(match.kickoff_at) <= now,
    )
    .sort(
      (a, b) =>
        new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime() ||
        b.id - a.id,
    );
  const scheduledUpcoming = visible
    .filter(
      (match): match is DatedMatch =>
        hasKickoffDate(match) && new Date(match.kickoff_at) > now,
    )
    .sort((a, b) => a.id - b.id);
  return [...unscheduled, ...past, ...scheduledUpcoming];
}
