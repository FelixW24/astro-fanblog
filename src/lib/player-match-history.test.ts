import { describe, expect, it } from 'vitest';
import { emptyMatch, type Match } from './matches';
import type { PlayerMatchRating } from './admin-player-history';
import {
  hasMatchAppearances,
  toPublicMatchHistory,
} from './player-match-history';

function match(partial: Partial<Match>): Match {
  return {
    ...emptyMatch,
    id: 1,
    opponent: 'FC Augsburg',
    opponent_short: 'FCA',
    is_home: true,
    kickoff_at: '2026-10-24T15:30:00+00:00',
    ...partial,
  };
}

function rating(partial: Partial<PlayerMatchRating>): PlayerMatchRating {
  return {
    id: 1,
    match_id: 1,
    player_id: 7,
    rating: '2,5',
    status: 'played',
    minutes_played: 90,
    sub_minute: null,
    substituted_by_player_id: null,
    goals: 0,
    assists: 0,
    note: null,
    created_at: '2026-10-24T18:00:00+00:00',
    updated_at: '2026-10-24T18:00:00+00:00',
    ...partial,
  };
}

describe('toPublicMatchHistory', () => {
  it('markiert nur Spiele mit redaktionellem Eintrag als recorded', () => {
    const entries = toPublicMatchHistory(
      [
        match({ id: 1, kickoff_at: '2026-10-24T15:30:00+00:00' }),
        match({ id: 2, kickoff_at: '2026-10-18T15:30:00+00:00' }),
      ],
      [rating({ match_id: 2 })],
      new Map(),
    );
    expect(entries.map((entry) => [entry.match.id, entry.recorded])).toEqual([
      [2, true],
      [1, false],
    ]);
  });

  it('sortiert chronologisch aufsteigend, ignoriert abgesagte Spiele und hängt das nächste Spiel hinten an', () => {
    const entries = toPublicMatchHistory(
      [
        match({ id: 1, kickoff_at: '2026-10-24T15:30:00+00:00' }),
        match({ id: 2, kickoff_at: '2026-10-30T15:30:00+00:00' }),
        match({
          id: 3,
          kickoff_at: '2026-10-18T15:30:00+00:00',
          cancelled: true,
        }),
        match({ id: 4, kickoff_at: '2026-11-10T15:30:00+00:00' }),
      ],
      [],
      new Map(),
    );
    expect(entries.map((entry) => entry.match.id)).toEqual([1, 2, 4]);
  });

  it('löst den Namen des Einwechselspielers auf und überspringt unbekannte IDs', () => {
    const entries = toPublicMatchHistory(
      [
        match({ id: 1 }),
        match({ id: 2, kickoff_at: '2026-10-18T15:30:00+00:00' }),
      ],
      [
        rating({
          match_id: 1,
          status: 'subbed_off',
          sub_minute: 75,
          substituted_by_player_id: 42,
        }),
        rating({
          match_id: 2,
          status: 'subbed_off',
          sub_minute: 60,
          substituted_by_player_id: 99,
        }),
      ],
      new Map([[42, 'Max Mustermann']]),
    );
    expect(entries[0].substitutedByName).toBeNull();
    expect(entries[1].substitutedByName).toBe('Max Mustermann');
    expect(entries[1].status).toBe('subbed_off');
  });

  it('liefert ohne Einträge eine leere Historie', () => {
    expect(toPublicMatchHistory([], [], new Map())).toEqual([]);
  });

  it('übernimmt Tore und Vorlagen aus dem Verlaufseintrag, Standard 0', () => {
    const entries = toPublicMatchHistory(
      [
        match({ id: 1 }),
        match({ id: 2, kickoff_at: '2026-10-18T15:30:00+00:00' }),
      ],
      [rating({ match_id: 1, goals: 2, assists: 1 })],
      new Map(),
    );
    expect(entries[0].goals).toBe(0);
    expect(entries[0].assists).toBe(0);
    expect(entries[1].goals).toBe(2);
    expect(entries[1].assists).toBe(1);
  });
});

describe('hasMatchAppearances', () => {
  const matches = [
    match({ id: 1, kickoff_at: '2026-10-24T15:30:00+00:00' }),
    match({ id: 2, kickoff_at: '2026-10-18T15:30:00+00:00' }),
  ];

  it('ist false ohne jegliche Historie', () => {
    expect(hasMatchAppearances([])).toBe(false);
  });

  it('ist false, wenn keine Spiele redaktionell erfasst wurden', () => {
    const entries = toPublicMatchHistory(matches, [], new Map());
    expect(hasMatchAppearances(entries)).toBe(false);
  });

  it('ist false, wenn alle erfassten Spiele „Nicht nominiert" sind', () => {
    const entries = toPublicMatchHistory(
      matches,
      [
        rating({
          match_id: 1,
          status: 'not_nominated',
          rating: null,
          minutes_played: null,
        }),
        rating({
          match_id: 2,
          status: 'not_nominated',
          rating: null,
          minutes_played: null,
        }),
      ],
      new Map(),
    );
    expect(hasMatchAppearances(entries)).toBe(false);
  });

  it.each(['played', 'subbed_in', 'subbed_off'] as const)(
    'ist true bei Status „%s" (auch Eingewechselt zählt als anwesend)',
    (status) => {
      const entries = toPublicMatchHistory(
        matches,
        [rating({ match_id: 1, status })],
        new Map(),
      );
      expect(hasMatchAppearances(entries)).toBe(true);
    },
  );

  it('ist false bei reiner Bank ohne Minute', () => {
    const entries = toPublicMatchHistory(
      matches,
      [rating({ match_id: 1, status: 'benched', minutes_played: 0 })],
      new Map(),
    );
    expect(hasMatchAppearances(entries)).toBe(false);
  });
});
