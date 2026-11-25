import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { emptyMatch, type Match } from './matches';
import {
  computeMinutesPlayed,
  formatHistoryKickoff,
  formatMinutes,
  MATCH_DURATION_MINUTES,
  matchEntryChanged,
  matchEntryField,
  matchGradeTone,
  mergePlayerMatchHistory,
  parseMatchRatingEntry,
  parseMatchRatingForm,
  participationLabel,
  saveChangedMatchRatings,
  saveMatchRating,
  substitutionLabel,
  type MatchHistoryEntry,
  type PlayerMatchRating,
} from './admin-player-history';

type Client = SupabaseClient<Database>;

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

function ratingForm(fields: Record<string, string>) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.set(key, value));
  return form;
}

describe('computeMinutesPlayed', () => {
  it.each([
    ['played', null, MATCH_DURATION_MINUTES],
    ['subbed_in', 67, 23],
    ['subbed_in', 1, 89],
    ['subbed_off', 75, 75],
    ['benched', null, 0],
    ['not_nominated', null, null],
  ] as const)(
    'berechnet für Status %s mit Wechselminute %s → %s Min',
    (status, subMinute, expected) => {
      expect(computeMinutesPlayed(status, subMinute)).toBe(expected);
    },
  );

  it('liefert ohne Wechselminute beim Einwechseln null', () => {
    expect(computeMinutesPlayed('subbed_in', null)).toBeNull();
  });
});

describe('parseMatchRatingForm', () => {
  it('akzeptiert eine Freitext-Note und berechnet die Spielminuten automatisch', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({
        match_id: '12',
        rating: '2,5',
        note: 'Starke zweite Hälfte',
      }),
    );
    expect(parsed).toEqual({
      matchId: 12,
      rating: '2,5',
      status: 'played',
      minutesPlayed: 90,
      subMinute: null,
      substitutedBy: null,
      goals: 0,
      assists: 0,
      note: 'Starke zweite Hälfte',
      error: null,
    });
  });

  it('akzeptiert beliebigen Freitext als Note', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({ match_id: '3', rating: 'Note 2+' }),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.rating).toBe('Note 2+');
    expect(parsed.minutesPlayed).toBe(90);
  });

  it('„Eingewechselt“ verlangt die Einwechselminute und berechnet daraus die Spielminuten', () => {
    const missing = parseMatchRatingForm(
      ratingForm({ match_id: '3', status_subbed_in: 'on' }),
    );
    expect(missing.error).toMatch(/Einwechselminute/);
    const parsed = parseMatchRatingForm(
      ratingForm({
        match_id: '3',
        status_subbed_in: 'on',
        sub_minute: '67',
        rating: '3',
      }),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.status).toBe('subbed_in');
    expect(parsed.subMinute).toBe(67);
    expect(parsed.minutesPlayed).toBe(23);
  });

  it('lehnt eine Einwechselminute ab, bei der keine Spielminuten übrig bleiben', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({
        match_id: '3',
        status_subbed_in: 'on',
        sub_minute: '90',
      }),
    );
    expect(parsed.error).toMatch(/zwischen 1 und 89/);
  });

  it('„Ausgewechselt“ verlangt Minute und Einwechselspieler, die Spielminuten folgen der Minute', () => {
    const missingSub = parseMatchRatingForm(
      ratingForm({ match_id: '3', status_subbed_off: 'on' }),
    );
    expect(missingSub.error).toMatch(/Auswechselminute/);
    const missingPlayer = parseMatchRatingForm(
      ratingForm({ match_id: '3', status_subbed_off: 'on', sub_minute: '75' }),
    );
    expect(missingPlayer.error).toMatch(/ausgewechselt wurde/);
    const parsed = parseMatchRatingForm(
      ratingForm({
        match_id: '3',
        status_subbed_off: 'on',
        sub_minute: '75',
        substituted_by: '42',
        rating: '4',
      }),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.status).toBe('subbed_off');
    expect(parsed.subMinute).toBe(75);
    expect(parsed.substitutedBy).toBe(42);
    expect(parsed.minutesPlayed).toBe(75);
  });

  it('„Nicht nominiert“ sperrt alle Leistungsdaten', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({ match_id: '3', status_not_nominated: 'on' }),
    );
    expect(parsed).toMatchObject({
      status: 'not_nominated',
      rating: null,
      minutesPlayed: null,
      error: null,
    });
    const withData = parseMatchRatingForm(
      ratingForm({
        match_id: '3',
        status_not_nominated: 'on',
        rating: '2',
      }),
    );
    expect(withData.error).toMatch(/Nicht nominiert/);
  });

  it('„Bank“ ergibt 0 Spielminuten und erlaubt Note und Notiz', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({
        match_id: '3',
        status_benched: 'on',
        rating: '5',
        note: 'gute Vorbereitung',
      }),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.status).toBe('benched');
    expect(parsed.minutesPlayed).toBe(0);
    expect(parsed.subMinute).toBeNull();
    expect(parsed.substitutedBy).toBeNull();
  });

  it('lehnt Wechselangaben bei „Bank“ ab', () => {
    const withSub = parseMatchRatingForm(
      ratingForm({ match_id: '3', status_benched: 'on', sub_minute: '67' }),
    );
    expect(withSub.error).toMatch(/Bei „Bank“/);
    const withReplacement = parseMatchRatingForm(
      ratingForm({
        match_id: '3',
        status_benched: 'on',
        substituted_by: '42',
      }),
    );
    expect(withReplacement.error).toMatch(/Bei „Bank“/);
  });

  it('lehnt mehrere Status-Haken gleichzeitig ab', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({
        match_id: '3',
        status_subbed_in: 'on',
        status_not_nominated: 'on',
      }),
    );
    expect(parsed.error).toMatch(/nur eine Option/);
  });

  it('lehnt Wechselangaben im reinen Einsatz ab', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({ match_id: '3', sub_minute: '67' }),
    );
    expect(parsed.error).toMatch(
      /nur bei „Eingewechselt“ oder „Ausgewechselt“/,
    );
  });

  it('lehnt einen Einwechselspieler beim Einwechseln ab', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({
        match_id: '3',
        status_subbed_in: 'on',
        sub_minute: '67',
        substituted_by: '42',
      }),
    );
    expect(parsed.error).toMatch(/kein Einwechselspieler/);
  });

  it('ignoriert ein manuell eingereichtes Spielminuten-Feld', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({ match_id: '3', minutes_played: '45' }),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.minutesPlayed).toBeNull();
  });

  it('leere Eingaben ohne Status entfernen den Eintrag', () => {
    const parsed = parseMatchRatingForm(ratingForm({ match_id: '3' }));
    expect(parsed.error).toBeNull();
    expect(parsed.rating).toBeNull();
    expect(parsed.status).toBe('played');
    expect(parsed.minutesPlayed).toBeNull();
    expect(parsed.subMinute).toBeNull();
    expect(parsed.substitutedBy).toBeNull();
  });

  it('Notiz allein genügt und berechnet die vollen Spielminuten', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({ match_id: '3', note: 'Kurzer Kommentar' }),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.minutesPlayed).toBe(90);
  });

  it('lehnt zu lange Noten ab', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({
        match_id: '3',
        rating: 'x'.repeat(21),
      }),
    );
    expect(parsed.error).toMatch(/20 Zeichen/);
  });

  it.each(['0', '121', '67,5'])(
    'weist ungültige Wechselminuten zurück: %s',
    (value) => {
      const parsed = parseMatchRatingForm(
        ratingForm({
          match_id: '3',
          status_subbed_in: 'on',
          sub_minute: value,
        }),
      );
      expect(parsed.error).toMatch(/Wechselminute/);
    },
  );

  it('weist eine ungültige Spiel-ID zurück', () => {
    expect(parseMatchRatingForm(ratingForm({ match_id: 'x' })).error).toMatch(
      /Spiel/,
    );
    expect(parseMatchRatingForm(ratingForm({ match_id: '0' })).error).toMatch(
      /Spiel/,
    );
  });

  it('weist zu lange Notizen zurück', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({ match_id: '3', note: 'x'.repeat(501) }),
    );
    expect(parsed.error).toMatch(/500 Zeichen/);
  });

  it('Tore und Vorlagen sind standardmäßig 0, auch wenn die Felder fehlen oder leer sind', () => {
    const variants: Record<string, string>[] = [
      { match_id: '3' },
      { match_id: '3', goals: '', assists: '' },
      { match_id: '3', goals: '0', assists: '0' },
    ];
    for (const fields of variants) {
      const parsed = parseMatchRatingForm(ratingForm(fields));
      expect(parsed.error).toBeNull();
      expect(parsed.goals).toBe(0);
      expect(parsed.assists).toBe(0);
    }
  });

  it('übernimmt eingetragene Tore und Vorlagen', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({ match_id: '3', goals: '2', assists: '1' }),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.goals).toBe(2);
    expect(parsed.assists).toBe(1);
  });

  it.each(['-1', '31', '2,5', 'abc'])(
    'weist ungültige Tore zurück: %s',
    (value) => {
      const parsed = parseMatchRatingForm(
        ratingForm({ match_id: '3', goals: value }),
      );
      expect(parsed.error).toMatch(/Tore/);
      expect(parsed.error).toMatch(/zwischen 0 und 30/);
    },
  );

  it.each(['-1', '31', '1,5', 'x'])(
    'weist ungültige Vorlagen zurück: %s',
    (value) => {
      const parsed = parseMatchRatingForm(
        ratingForm({ match_id: '3', assists: value }),
      );
      expect(parsed.error).toMatch(/Vorlagen/);
      expect(parsed.error).toMatch(/zwischen 0 und 30/);
    },
  );

  it('Tore allein genügen als Verlaufseintrag und ergeben die vollen Spielminuten', () => {
    const parsed = parseMatchRatingForm(
      ratingForm({ match_id: '3', goals: '3' }),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.goals).toBe(3);
    expect(parsed.minutesPlayed).toBe(90);
  });

  it('lehnt Tore oder Vorlagen bei „Nicht nominiert“ ab', () => {
    const withGoals = parseMatchRatingForm(
      ratingForm({ match_id: '3', status_not_nominated: 'on', goals: '1' }),
    );
    expect(withGoals.error).toMatch(/Nicht nominiert/);
    const withAssists = parseMatchRatingForm(
      ratingForm({ match_id: '3', status_not_nominated: 'on', assists: '2' }),
    );
    expect(withAssists.error).toMatch(/Nicht nominiert/);
  });

  it('lehnt Tore oder Vorlagen bei „Bank“ ab', () => {
    const withGoals = parseMatchRatingForm(
      ratingForm({ match_id: '3', status_benched: 'on', goals: '1' }),
    );
    expect(withGoals.error).toMatch(/Bei „Bank“/);
    const withAssists = parseMatchRatingForm(
      ratingForm({ match_id: '3', status_benched: 'on', assists: '1' }),
    );
    expect(withAssists.error).toMatch(/Bei „Bank“/);
  });
});

describe('parseMatchRatingEntry (Sammel-Form)', () => {
  it('baut namensraumierte Feldnamen pro Spiel', () => {
    expect(matchEntryField(42, 'rating')).toBe('match_42_rating');
    expect(matchEntryField(7, 'status_subbed_in')).toBe(
      'match_7_status_subbed_in',
    );
  });

  it('liest nur die Felder des jeweiligen Spiels aus der Sammel-Form', () => {
    const form = new FormData();
    form.set('match_12_rating', '2,5');
    form.set('match_12_note', 'Starke zweite Hälfte');
    form.set('match_13_rating', '1');
    const parsed = parseMatchRatingEntry(form, 12);
    expect(parsed).toEqual({
      matchId: 12,
      rating: '2,5',
      status: 'played',
      minutesPlayed: 90,
      subMinute: null,
      substitutedBy: null,
      goals: 0,
      assists: 0,
      note: 'Starke zweite Hälfte',
      error: null,
    });
  });

  it('übernimmt die Spiel-ID aus dem Feldnamen-Präfix', () => {
    const parsed = parseMatchRatingEntry(new FormData(), 7);
    expect(parsed.matchId).toBe(7);
    expect(parsed.error).toBeNull();
    expect(parsed.rating).toBeNull();
    expect(parsed.minutesPlayed).toBeNull();
  });

  it('liefert Validierungsfehler des namensraumierten Eintrags', () => {
    const form = new FormData();
    form.set('match_12_status_subbed_in', 'on');
    const parsed = parseMatchRatingEntry(form, 12);
    expect(parsed.matchId).toBe(12);
    expect(parsed.error).toMatch(/Einwechselminute/);
  });

  it('wertet die Status-Haken des jeweiligen Spiels aus und berechnet die Minuten', () => {
    const form = new FormData();
    form.set('match_12_status_subbed_in', 'on');
    form.set('match_12_sub_minute', '67');
    form.set('match_12_rating', '3');
    const parsed = parseMatchRatingEntry(form, 12);
    expect(parsed.error).toBeNull();
    expect(parsed.status).toBe('subbed_in');
    expect(parsed.subMinute).toBe(67);
    expect(parsed.minutesPlayed).toBe(23);
  });

  it('liest Tore und Vorlagen aus den namensraumierten Feldern des Spiels', () => {
    const form = new FormData();
    form.set('match_12_goals', '2');
    form.set('match_12_assists', '1');
    form.set('match_13_goals', '5');
    const parsed = parseMatchRatingEntry(form, 12);
    expect(parsed.error).toBeNull();
    expect(parsed.goals).toBe(2);
    expect(parsed.assists).toBe(1);
    expect(parsed.minutesPlayed).toBe(90);
  });
});

describe('matchEntryChanged', () => {
  const entry: MatchHistoryEntry = {
    match: match({ id: 5 }),
    rating: '2,5',
    status: 'played',
    minutesPlayed: 90,
    subMinute: null,
    substitutedBy: null,
    goals: 1,
    assists: 0,
    note: null,
  };
  const same = {
    matchId: 5,
    rating: '2,5',
    status: 'played' as const,
    minutesPlayed: 90,
    subMinute: null,
    substitutedBy: null,
    goals: 1,
    assists: 0,
    note: '',
    error: null,
  };

  it('erkennt unveränderte Einträge', () => {
    expect(matchEntryChanged(entry, same)).toBe(false);
  });

  it.each([
    ['Note', { ...same, rating: '3' }],
    ['Status', { ...same, status: 'not_nominated' as const }],
    ['Spielminuten', { ...same, minutesPlayed: 45 }],
    ['Wechselminute', { ...same, status: 'subbed_in' as const, subMinute: 67 }],
    [
      'Einwechselspieler',
      {
        ...same,
        status: 'subbed_off' as const,
        subMinute: 75,
        substitutedBy: 42,
      },
    ],
    ['Tore', { ...same, goals: 2 }],
    ['Vorlagen', { ...same, assists: 1 }],
    ['Notiz', { ...same, note: 'Kommentar' }],
  ])('erkennt eine Änderung an %s', (_label, changed) => {
    expect(matchEntryChanged(entry, changed)).toBe(true);
  });
});

describe('mergePlayerMatchHistory', () => {
  const now = new Date('2026-11-02T12:00:00+00:00');

  it('filtert künftige und abgesagte Spiele und sortiert neueste zuerst', () => {
    const history = mergePlayerMatchHistory(
      [
        match({ id: 1, kickoff_at: '2026-10-24T15:30:00+00:00' }),
        match({ id: 2, kickoff_at: '2026-10-31T15:30:00+00:00' }),
        match({ id: 3, kickoff_at: '2026-11-08T15:30:00+00:00' }),
        match({
          id: 4,
          kickoff_at: '2026-10-17T15:30:00+00:00',
          cancelled: true,
        }),
      ],
      [],
      now,
    );
    expect(history.map((entry) => entry.match.id)).toEqual([2, 1]);
    expect(history[0].rating).toBeNull();
    expect(history[0].status).toBe('played');
  });

  it('reichert Spiele um Note, Status, Minuten, Wechselminute und Einwechselspieler an', () => {
    const history = mergePlayerMatchHistory(
      [
        match({ id: 1, kickoff_at: '2026-10-24T15:30:00+00:00' }),
        match({ id: 2, kickoff_at: '2026-10-31T15:30:00+00:00' }),
        match({ id: 3, kickoff_at: '2026-10-18T15:30:00+00:00' }),
        match({ id: 4, kickoff_at: '2026-10-20T15:30:00+00:00' }),
      ],
      [
        rating({
          match_id: 2,
          rating: '3,5',
          status: 'subbed_in',
          minutes_played: 23,
          sub_minute: 67,
          goals: 2,
          assists: 1,
          note: 'Solide, aber wenig Zugriff',
        }),
        rating({
          match_id: 3,
          rating: null,
          status: 'not_nominated',
          minutes_played: null,
        }),
        rating({
          match_id: 4,
          rating: '4',
          status: 'subbed_off',
          minutes_played: 75,
          sub_minute: 75,
          substituted_by_player_id: 42,
        }),
      ],
      now,
    );
    expect(history[0]).toMatchObject({
      rating: '3,5',
      status: 'subbed_in',
      minutesPlayed: 23,
      subMinute: 67,
      substitutedBy: null,
      goals: 2,
      assists: 1,
      note: 'Solide, aber wenig Zugriff',
    });
    expect(history[1]).toMatchObject({
      rating: null,
      status: 'played',
      goals: 0,
      assists: 0,
    });
    expect(history[2]).toMatchObject({
      rating: '4',
      status: 'subbed_off',
      subMinute: 75,
      substitutedBy: 42,
      goals: 0,
      assists: 0,
    });
    expect(history[3]).toMatchObject({ rating: null, status: 'not_nominated' });
  });
});

describe('Anzeige-Helfer', () => {
  it.each([
    ['10', 'excellent'],
    ['8,0', 'excellent'],
    ['7,9', 'good'],
    ['7,0', 'good'],
    ['6,9', 'neutral'],
    ['6,5', 'neutral'],
    ['6,4', 'warn'],
    ['6,0', 'warn'],
    ['5,9', 'poor'],
    ['5,0', 'poor'],
    ['4,9', 'bad'],
    ['2,5', 'bad'],
    ['Note 9+', 'excellent'],
    ['k. A.', 'none'],
  ] as const)(
    'leitet aus der Freitext-Note %s den Ton %s ab',
    (value, tone) => {
      expect(matchGradeTone(value)).toBe(tone);
    },
  );

  it('labelt den Nominierungsstatus deutsch', () => {
    expect(participationLabel('played')).toBe('Im Einsatz');
    expect(participationLabel('subbed_in')).toBe('Eingewechselt');
    expect(participationLabel('benched')).toBe('Bank');
    expect(participationLabel('subbed_off')).toBe('Ausgewechselt');
    expect(participationLabel('not_nominated')).toBe('Nicht nominiert');
  });

  it('labelt die Wechselminute je nach Status', () => {
    expect(substitutionLabel('subbed_in', 67)).toBe('eingewechselt 67.');
    expect(substitutionLabel('subbed_off', 75)).toBe('ausgewechselt 75.');
  });

  it('formatiert Minuten und Anstoßzeit', () => {
    expect(formatMinutes(90)).toBe('90 Min');
    expect(formatHistoryKickoff('2026-10-24T15:30:00+00:00')).toBe(
      'Sa., 24. Okt. 2026, 17:30 Uhr',
    );
  });
});

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  matchMaybeSingle: vi.fn(),
  playerMaybeSingle: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  deleteEq: vi.fn(),
}));
const client = { from: mocks.from } as unknown as Client;

describe('saveMatchRating', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.select.mockImplementation(() => ({ eq: mocks.eq }));
    mocks.eq.mockImplementation((column: string) =>
      column === 'id' && mocks.select.mock.calls.length > 0
        ? { maybeSingle: mocks.playerMaybeSingle }
        : { maybeSingle: mocks.matchMaybeSingle },
    );
    // einfacher: zwei getrennte eq-Ketten über from() unterscheiden
    mocks.matchMaybeSingle.mockResolvedValue({
      data: { id: 5, cancelled: false },
      error: null,
    });
    mocks.playerMaybeSingle.mockResolvedValue({
      data: { id: 42 },
      error: null,
    });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.delete.mockReturnValue({ eq: mocks.deleteEq });
    mocks.deleteEq.mockImplementation(() =>
      Object.assign(Promise.resolve({ error: null }), { eq: mocks.deleteEq }),
    );
    mocks.from.mockImplementation((table: string) => {
      if (table === 'matches')
        return {
          select: () => ({
            eq: () => ({ maybeSingle: mocks.matchMaybeSingle }),
          }),
        };
      if (table === 'players')
        return {
          select: () => ({
            eq: () => ({ maybeSingle: mocks.playerMaybeSingle }),
          }),
        };
      return { upsert: mocks.upsert, delete: mocks.delete };
    });
  });

  it('speichert Note, Status, Minuten, Wechselminute, Einwechselspieler sowie Tore und Vorlagen per Upsert', async () => {
    const error = await saveMatchRating(client, 7, {
      matchId: 5,
      rating: '2,5',
      status: 'subbed_off',
      minutesPlayed: 75,
      subMinute: 75,
      substitutedBy: 42,
      goals: 2,
      assists: 1,
      note: 'Durchwachsen',
    });
    expect(error).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        match_id: 5,
        player_id: 7,
        rating: '2,5',
        status: 'subbed_off',
        minutes_played: 75,
        sub_minute: 75,
        substituted_by_player_id: 42,
        goals: 2,
        assists: 1,
        note: 'Durchwachsen',
      }),
      { onConflict: 'match_id,player_id' },
    );
  });

  it('speichert Tore und Vorlagen standardmäßig als 0', async () => {
    const error = await saveMatchRating(client, 7, {
      matchId: 5,
      rating: '6',
      status: 'played',
      minutesPlayed: 90,
      subMinute: null,
      substitutedBy: null,
      goals: 0,
      assists: 0,
      note: '',
    });
    expect(error).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ goals: 0, assists: 0 }),
      { onConflict: 'match_id,player_id' },
    );
  });

  it('speichert „Nicht nominiert“ ohne Leistungsdaten', async () => {
    const error = await saveMatchRating(client, 7, {
      matchId: 5,
      rating: null,
      status: 'not_nominated',
      minutesPlayed: null,
      subMinute: null,
      substitutedBy: null,
      goals: 0,
      assists: 0,
      note: '',
    });
    expect(error).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        rating: null,
        status: 'not_nominated',
        minutes_played: null,
        sub_minute: null,
        substituted_by_player_id: null,
        goals: 0,
        assists: 0,
        note: null,
      }),
      { onConflict: 'match_id,player_id' },
    );
  });

  it('lehnt den Spieler selbst als Einwechselspieler ab', async () => {
    const error = await saveMatchRating(client, 7, {
      matchId: 5,
      rating: null,
      status: 'subbed_off',
      minutesPlayed: null,
      subMinute: 75,
      substitutedBy: 7,
      goals: 0,
      assists: 0,
      note: '',
    });
    expect(error).toMatch(/nicht der Spieler selbst/);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('lehnt unbekannte Einwechselspieler ab', async () => {
    mocks.playerMaybeSingle.mockResolvedValue({ data: null, error: null });
    const error = await saveMatchRating(client, 7, {
      matchId: 5,
      rating: null,
      status: 'subbed_off',
      minutesPlayed: null,
      subMinute: 75,
      substitutedBy: 42,
      goals: 0,
      assists: 0,
      note: '',
    });
    expect(error).toMatch(/nicht gefunden/);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('entfernt den Eintrag, wenn alles leer ist (auch Tore und Vorlagen 0)', async () => {
    const error = await saveMatchRating(client, 7, {
      matchId: 5,
      rating: null,
      status: 'played',
      minutesPlayed: null,
      subMinute: null,
      substitutedBy: null,
      goals: 0,
      assists: 0,
      note: '',
    });
    expect(error).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deleteEq).toHaveBeenCalledWith('match_id', 5);
    expect(mocks.deleteEq).toHaveBeenCalledWith('player_id', 7);
  });

  it('bewahrt einen Eintrag mit nur Toren vor dem Löschen', async () => {
    const error = await saveMatchRating(client, 7, {
      matchId: 5,
      rating: null,
      status: 'played',
      minutesPlayed: 90,
      subMinute: null,
      substitutedBy: null,
      goals: 1,
      assists: 0,
      note: '',
    });
    expect(error).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ goals: 1, assists: 0, minutes_played: 90 }),
      { onConflict: 'match_id,player_id' },
    );
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('verweigert Einträge für abgesagte Spiele', async () => {
    mocks.matchMaybeSingle.mockResolvedValue({
      data: { id: 5, cancelled: true },
      error: null,
    });
    const error = await saveMatchRating(client, 7, {
      matchId: 5,
      rating: '2',
      status: 'played',
      minutesPlayed: 90,
      subMinute: null,
      substitutedBy: null,
      goals: 0,
      assists: 0,
      note: '',
    });
    expect(error).toMatch(/abgesagte/);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('meldet unbekannte Spiele', async () => {
    mocks.matchMaybeSingle.mockResolvedValue({ data: null, error: null });
    const error = await saveMatchRating(client, 7, {
      matchId: 5,
      rating: null,
      status: 'not_nominated',
      minutesPlayed: null,
      subMinute: null,
      substitutedBy: null,
      goals: 0,
      assists: 0,
      note: '',
    });
    expect(error).toMatch(/nicht gefunden/);
  });
});

describe('saveChangedMatchRatings', () => {
  const now = new Date('2026-11-02T12:00:00+00:00');

  function currentEntries(): MatchHistoryEntry[] {
    return mergePlayerMatchHistory(
      [match({ id: 5 }), match({ id: 6 })],
      [rating({ match_id: 5, rating: '2,5', minutes_played: 90 })],
      now,
    );
  }

  const unchanged = {
    matchId: 5,
    rating: '2,5',
    status: 'played' as const,
    minutesPlayed: 90,
    subMinute: null,
    substitutedBy: null,
    goals: 0,
    assists: 0,
    note: '',
    error: null,
  };
  const emptyEntry = (matchId: number) => ({
    matchId,
    rating: null,
    status: 'played' as const,
    minutesPlayed: null,
    subMinute: null,
    substitutedBy: null,
    goals: 0,
    assists: 0,
    note: '',
    error: null,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.matchMaybeSingle.mockResolvedValue({
      data: { id: 5, cancelled: false },
      error: null,
    });
    mocks.playerMaybeSingle.mockResolvedValue({
      data: { id: 42 },
      error: null,
    });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.delete.mockReturnValue({ eq: mocks.deleteEq });
    mocks.deleteEq.mockImplementation(() =>
      Object.assign(Promise.resolve({ error: null }), { eq: mocks.deleteEq }),
    );
    mocks.from.mockImplementation((table: string) => {
      if (table === 'matches')
        return {
          select: () => ({
            eq: () => ({ maybeSingle: mocks.matchMaybeSingle }),
          }),
        };
      if (table === 'players')
        return {
          select: () => ({
            eq: () => ({ maybeSingle: mocks.playerMaybeSingle }),
          }),
        };
      return { upsert: mocks.upsert, delete: mocks.delete };
    });
  });

  it('speichert nur geänderte Einträge und überspringt unveränderte', async () => {
    const result = await saveChangedMatchRatings(client, 7, currentEntries(), [
      unchanged,
      { ...emptyEntry(6), rating: '3', minutesPlayed: 90 },
    ]);
    expect(result).toEqual({ saved: 1, removed: 0, errors: [] });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ match_id: 6, player_id: 7, rating: '3' }),
      { onConflict: 'match_id,player_id' },
    );
  });

  it('speichert geänderte Tore und Vorlagen mit', async () => {
    const result = await saveChangedMatchRatings(client, 7, currentEntries(), [
      { ...unchanged, goals: 2, assists: 1 },
      emptyEntry(6),
    ]);
    expect(result).toEqual({ saved: 1, removed: 0, errors: [] });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ match_id: 5, goals: 2, assists: 1 }),
      { onConflict: 'match_id,player_id' },
    );
  });

  it('speichert gar nichts, wenn sich nichts geändert hat', async () => {
    const result = await saveChangedMatchRatings(client, 7, currentEntries(), [
      unchanged,
      emptyEntry(6),
    ]);
    expect(result).toEqual({ saved: 0, removed: 0, errors: [] });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('meldet Validierungsfehler geänderter Einträge ohne zu speichern', async () => {
    const result = await saveChangedMatchRatings(client, 7, currentEntries(), [
      {
        ...unchanged,
        rating: '3',
        error:
          'Bitte trage die Einwechselminute ein, wenn „Eingewechselt“ ausgewählt ist.',
      },
    ]);
    expect(result.saved).toBe(0);
    expect(result.errors).toEqual([
      {
        matchId: 5,
        error:
          'Bitte trage die Einwechselminute ein, wenn „Eingewechselt“ ausgewählt ist.',
      },
    ]);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('ignoriert Validierungsfehler unveränderter Einträge', async () => {
    const result = await saveChangedMatchRatings(client, 7, currentEntries(), [
      { ...unchanged, error: 'Altbestand-Fehler' },
    ]);
    expect(result).toEqual({ saved: 0, removed: 0, errors: [] });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('entfernt einen bestehenden Eintrag bei leerer Eingabe', async () => {
    const result = await saveChangedMatchRatings(client, 7, currentEntries(), [
      emptyEntry(5),
      emptyEntry(6),
    ]);
    expect(result).toEqual({ saved: 0, removed: 1, errors: [] });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deleteEq).toHaveBeenCalledWith('match_id', 5);
    expect(mocks.deleteEq).toHaveBeenCalledWith('player_id', 7);
  });

  it('legt keinen Lösch-Eintrag an, wenn zu einem unbekannten Spiel nur leere Werte kommen', async () => {
    const result = await saveChangedMatchRatings(client, 7, currentEntries(), [
      unchanged,
      emptyEntry(99),
    ]);
    expect(result).toEqual({ saved: 0, removed: 0, errors: [] });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('meldet Speicherfehler einzelner Einträge und fährt mit den übrigen fort', async () => {
    mocks.upsert
      .mockResolvedValueOnce({ error: { message: 'db down' } })
      .mockResolvedValueOnce({ error: null });
    const result = await saveChangedMatchRatings(client, 7, currentEntries(), [
      { ...emptyEntry(6), rating: '3', minutesPlayed: 90 },
      { ...emptyEntry(5), rating: '4', minutesPlayed: 90 },
    ]);
    expect(result.saved).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].matchId).toBe(6);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
  });
});
