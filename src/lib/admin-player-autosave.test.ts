import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { Player } from './content';
import { emptyMatch, type Match } from './matches';
import type { PlayerFormValues } from './admin-player';
import { playerToFormValues } from './admin-player';
import { applyPlayerAutosave } from './admin-player-autosave';
import type { PlayerMatchRating } from './admin-player-history';

const mocks = vi.hoisted(() => ({
  savePlayerLoan: vi.fn(),
  saveChangedMatchRatings: vi.fn(),
  from: vi.fn(),
  playerMaybeSingle: vi.fn(),
  playerUpdate: vi.fn(),
  playerUpdateEq: vi.fn(),
  matchesLimit: vi.fn(),
  ratingsEq: vi.fn(),
}));

vi.mock('./admin-loan', () => ({
  savePlayerLoan: mocks.savePlayerLoan,
}));
vi.mock('./admin-player-history', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./admin-player-history')>();
  return {
    ...actual,
    saveChangedMatchRatings: mocks.saveChangedMatchRatings,
  };
});

type Client = SupabaseClient<Database>;
const client = { from: mocks.from } as unknown as Client;

function playerRow(partial: Partial<Player> = {}): Player {
  return {
    id: 7,
    slug: 'lukas-luecke',
    name: 'Lukas Lücke',
    shirt_number: 1,
    position: 'torwart',
    nationality: 'Deutschland',
    date_of_birth: '1995-03-04',
    joined_on: '2021-07-01',
    contract_until: '2028-06-30',
    squad_status: 'first-team',
    height_cm: 193,
    preferred_foot: null,
    market_value_eur: 4000000,
    profile_image_url: null,
    profile_image_alt: null,
    bio: 'Torwart des FC Example.',
    profile_slogan: 'Immer für Kölle.',
    is_injured: false,
    injury_since: null,
    injury_until: null,
    loans: [],
    ...partial,
  } as Player;
}

function matchRow(partial: Partial<Match>): Match {
  return {
    ...emptyMatch,
    id: 5,
    opponent: 'FC Augsburg',
    opponent_short: 'FCA',
    is_home: true,
    kickoff_at: '2026-10-24T15:30:00+00:00',
    ...partial,
  };
}

function ratingRow(partial: Partial<PlayerMatchRating>): PlayerMatchRating {
  return {
    id: 1,
    match_id: 5,
    player_id: 7,
    rating: null,
    status: 'played',
    minutes_played: null,
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

function formFromValues(values: PlayerFormValues): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'boolean') {
      if (value) data.set(key, 'on');
    } else {
      data.set(key, value);
    }
  }
  return data;
}

describe('applyPlayerAutosave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.playerMaybeSingle.mockResolvedValue({
      data: playerRow(),
      error: null,
    });
    mocks.playerUpdate.mockReturnValue({ eq: mocks.playerUpdateEq });
    mocks.playerUpdateEq.mockResolvedValue({ error: null });
    mocks.matchesLimit.mockResolvedValue({
      data: [matchRow({ id: 5 }), matchRow({ id: 6, opponent: 'FC Union' })],
      error: null,
    });
    mocks.ratingsEq.mockResolvedValue({
      data: [ratingRow({ match_id: 5, rating: '2,5', minutes_played: 90 })],
      error: null,
    });
    mocks.savePlayerLoan.mockResolvedValue(null);
    mocks.saveChangedMatchRatings.mockResolvedValue({
      saved: 0,
      removed: 0,
      errors: [],
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'players')
        return {
          select: () => ({
            eq: () => ({ maybeSingle: mocks.playerMaybeSingle }),
          }),
          update: mocks.playerUpdate,
        };
      if (table === 'matches')
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                order: () => ({
                  order: () => ({ limit: mocks.matchesLimit }),
                }),
              }),
            }),
          }),
        };
      if (table === 'player_match_ratings')
        return { select: () => ({ eq: mocks.ratingsEq }) };
      throw new Error(`unexpected table ${table}`);
    });
  });

  it('meldet ein fehlendes Spielerprofil', async () => {
    mocks.playerMaybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await applyPlayerAutosave(client, 7, new FormData());
    expect(result.notFound).toBe(true);
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
    expect(mocks.saveChangedMatchRatings).not.toHaveBeenCalled();
  });

  it('schreibt nichts, wenn Profil und Verlauf unverändert sind', async () => {
    const values = playerToFormValues(playerRow(), []);
    const result = await applyPlayerAutosave(client, 7, formFromValues(values));
    expect(result).toMatchObject({
      profileSaved: false,
      ratingsSaved: 0,
      ratingsRemoved: 0,
      notFound: false,
    });
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
    expect(mocks.savePlayerLoan).not.toHaveBeenCalled();
    // Verlauf wird trotzdem geprüft (nur geänderte Einträge speichern).
    expect(mocks.saveChangedMatchRatings).toHaveBeenCalledTimes(1);
    const [, , , parsedEntries] = mocks.saveChangedMatchRatings.mock.calls[0];
    // neueste zuerst: gleiche Anstoßzeit, dann höhere ID zuerst
    expect(
      parsedEntries.map((entry: { matchId: number }) => entry.matchId),
    ).toEqual([6, 5]);
  });

  it('speichert das Profil und die Leihe nur bei geänderten Feldern', async () => {
    const values = {
      ...playerToFormValues(playerRow(), []),
      name: 'Lukas Lücke II',
    };
    const result = await applyPlayerAutosave(client, 7, formFromValues(values));
    expect(result.profileSaved).toBe(true);
    expect(mocks.playerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Lukas Lücke II',
        slug: 'lukas-luecke',
      }),
    );
    expect(mocks.playerUpdateEq).toHaveBeenCalledWith('id', 7);
    expect(mocks.savePlayerLoan).toHaveBeenCalledWith(client, 7, values);
  });

  it('überspringt das Profil bei Validierungsfehler, prüft aber den Verlauf weiter', async () => {
    const values = { ...playerToFormValues(playerRow(), []), name: 'x' };
    const data = formFromValues(values);
    data.set('match_5_rating', '3');
    const result = await applyPlayerAutosave(client, 7, data);
    expect(result.profileSaved).toBe(false);
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
    expect(mocks.saveChangedMatchRatings).toHaveBeenCalledTimes(1);
    const [, , , parsedEntries] = mocks.saveChangedMatchRatings.mock.calls[0];
    const entry5 = parsedEntries.find(
      (entry: { matchId: number }) => entry.matchId === 5,
    );
    expect(entry5).toMatchObject({ rating: '3', minutesPlayed: 90 });
  });

  it('reicht die namensraumierten Verlaufsfelder je Spiel durch', async () => {
    const values = playerToFormValues(playerRow(), []);
    const data = formFromValues(values);
    data.set('match_6_status_subbed_in', 'on');
    data.set('match_6_sub_minute', '67');
    data.set('match_6_rating', '2,5');
    data.set('match_6_note', 'Zwei Paraden');
    await applyPlayerAutosave(client, 7, data);
    const [, playerIdArg, , parsedEntries] =
      mocks.saveChangedMatchRatings.mock.calls[0];
    expect(playerIdArg).toBe(7);
    const entry6 = parsedEntries.find(
      (entry: { matchId: number }) => entry.matchId === 6,
    );
    expect(entry6).toMatchObject({
      matchId: 6,
      status: 'subbed_in',
      subMinute: 67,
      rating: '2,5',
      minutesPlayed: 23,
      note: 'Zwei Paraden',
      error: null,
    });
  });

  it('gibt Speicherergebnisse der Verlaufseinträge zurück', async () => {
    mocks.saveChangedMatchRatings.mockResolvedValue({
      saved: 2,
      removed: 1,
      errors: [{ matchId: 6, error: 'Bitte trage die Einwechselminute ein.' }],
    });
    const result = await applyPlayerAutosave(
      client,
      7,
      formFromValues(playerToFormValues(playerRow(), [])),
    );
    expect(result.ratingsSaved).toBe(2);
    expect(result.ratingsRemoved).toBe(1);
    expect(result.ratingErrors).toEqual([
      { matchId: 6, error: 'Bitte trage die Einwechselminute ein.' },
    ]);
  });

  it('lässt das Profil unverändert, wenn nur Verlaufsfelder geändert sind', async () => {
    const values = playerToFormValues(playerRow(), []);
    const data = formFromValues(values);
    data.set('match_5_rating', '1,5');
    const result = await applyPlayerAutosave(client, 7, data);
    expect(result.profileSaved).toBe(false);
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
    expect(mocks.savePlayerLoan).not.toHaveBeenCalled();
  });
});
