import { describe, expect, it } from 'vitest';
import {
  buildMatchLineup,
  buildMatchStats,
  formatMatchStatValue,
  visibleMatchStats,
} from './match-detail';
import type { Match } from './matches';
import type { PlayerMatchRating } from './admin-player-history';

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 7,
    opponent: 'Hamburger SV',
    opponent_short: 'HSV',
    is_home: true,
    kickoff_at: '2026-09-20T13:30:00.000Z',
    venue: 'Example Arena',
    matchcenter_url: null,
    cancelled: false,
    home_goals: 2,
    away_goals: 1,
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
    ...overrides,
  };
}

const players = [
  { id: 1, name: 'Torwart A', shirt_number: 1, position: 'torwart' },
  { id: 2, name: 'Stamm B', shirt_number: 4, position: 'abwehr' },
  { id: 3, name: 'Stamm C', shirt_number: 8, position: 'mittelfeld' },
  { id: 4, name: 'Bank D', shirt_number: 12, position: 'mittelfeld' },
  { id: 5, name: 'Bank E', shirt_number: 20, position: 'sturm' },
];

function rating(overrides: Partial<PlayerMatchRating>): PlayerMatchRating {
  return {
    id: 1,
    match_id: 7,
    player_id: 1,
    rating: null,
    status: 'played',
    minutes_played: 90,
    sub_minute: null,
    substituted_by_player_id: null,
    goals: 0,
    assists: 0,
    note: null,
    created_at: '2026-09-20T18:00:00.000Z',
    updated_at: '2026-09-20T18:00:00.000Z',
    ...overrides,
  };
}

describe('buildMatchLineup', () => {
  it('teilt Startelf, Bank und Wechsel aus den Verlaufseinträgen auf', () => {
    const ratings = [
      rating({ id: 1, player_id: 2, status: 'played', minutes_played: 90 }),
      rating({
        id: 2,
        player_id: 3,
        status: 'subbed_off',
        minutes_played: 67,
        sub_minute: 67,
        substituted_by_player_id: 4,
      }),
      rating({
        id: 3,
        player_id: 4,
        status: 'subbed_in',
        minutes_played: 23,
        sub_minute: 67,
      }),
      rating({ id: 4, player_id: 5, status: 'benched', minutes_played: 0 }),
      rating({
        id: 5,
        player_id: 1,
        status: 'not_nominated',
        minutes_played: null,
      }),
    ];
    const lineup = buildMatchLineup(ratings, players);
    expect(lineup.starters.map((p) => p.name)).toEqual(['Stamm B', 'Stamm C']);
    expect(lineup.bench.map((p) => p.name)).toEqual(['Bank D', 'Bank E']);
    // Ein Wechselpaar (subbed_off + verknüpfter subbed_in) erscheint nur einmal.
    expect(lineup.substitutions).toHaveLength(1);
    expect(lineup.substitutions[0]).toMatchObject({
      minute: 67,
      out: expect.objectContaining({ name: 'Stamm C' }),
      in: expect.objectContaining({ name: 'Bank D' }),
    });
  });

  it('sortiert Wechsel chronologisch und ignoriert unbekannte Spieler', () => {
    const ratings = [
      rating({
        id: 1,
        player_id: 3,
        status: 'subbed_off',
        sub_minute: 80,
        substituted_by_player_id: 4,
      }),
      rating({
        id: 2,
        player_id: 2,
        status: 'subbed_off',
        sub_minute: 46,
        substituted_by_player_id: 99,
      }),
      rating({ id: 3, player_id: 77, status: 'played' }),
      // Alleinstehender subbed_in-Eintrag ohne subbed_off-Gegenstück bleibt sichtbar.
      rating({
        id: 4,
        player_id: 5,
        status: 'subbed_in',
        sub_minute: 71,
        minutes_played: 19,
      }),
    ];
    const lineup = buildMatchLineup(ratings, players);
    expect(lineup.substitutions.map((sub) => sub.minute)).toEqual([46, 71, 80]);
    expect(lineup.substitutions[0].in).toBeNull();
    expect(lineup.substitutions[1]).toMatchObject({
      minute: 71,
      out: null,
      in: expect.objectContaining({ name: 'Bank E' }),
    });
    expect(lineup.starters.map((p) => p.name)).toEqual(['Stamm B', 'Stamm C']);
  });
});

describe('buildMatchStats', () => {
  it('dreht for/against bei Auswärtsspielen auf die Anzeige-Seiten um', () => {
    const stats = buildMatchStats(
      match({
        is_home: false,
        possession_pct: 40,
        xg_for: 1.5,
        xg_against: 2.25,
        shots_for: 8,
        shots_against: 11,
      }),
    );
    const byKey = Object.fromEntries(stats.map((row) => [row.key, row]));
    expect(byKey.possession).toMatchObject({ home: 60, away: 40 });
    expect(byKey.xg).toMatchObject({ home: 2.25, away: 1.5 });
    expect(byKey.shots).toMatchObject({ home: 11, away: 8 });
  });

  it('ordnet Heimspiele direkt zu und lässt ungepflegte Werte null', () => {
    const stats = buildMatchStats(match({ possession_pct: 58, xg_for: 1.85 }));
    const byKey = Object.fromEntries(stats.map((row) => [row.key, row]));
    expect(byKey.possession).toMatchObject({
      home: 58,
      away: 42,
      kind: 'percent',
    });
    expect(byKey.xg).toMatchObject({ home: 1.85, away: null, kind: 'xg' });
    expect(byKey.red_cards).toMatchObject({ home: null, away: null });
    expect(visibleMatchStats(stats).map((row) => row.key)).toEqual([
      'possession',
      'xg',
    ]);
  });
});

describe('formatMatchStatValue', () => {
  it('formatiert Prozent, xG und Zähler deutsch', () => {
    expect(formatMatchStatValue(null, 'count')).toBe('–');
    expect(formatMatchStatValue(58, 'percent')).toBe('58 %');
    expect(formatMatchStatValue(1.5, 'xg')).toBe('1,50');
    expect(formatMatchStatValue(12, 'count')).toBe('12');
  });
});
