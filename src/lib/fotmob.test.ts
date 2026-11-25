import { describe, expect, it } from 'vitest';
import {
  extractFotMobImport,
  importFotMobData,
  mergeFotMobImport,
  parseFotMobMatchId,
  parseFotMobScore,
} from './fotmob';
import { emptyMatch } from './matches';

describe('parseFotMobMatchId', () => {
  it.each([
    ['4393680', '4393680'],
    [
      'https://www.fotmob.com/matches/example-vs-hamburg/ab12cd#4393680',
      '4393680',
    ],
    ['https://www.fotmob.com/matches/4393680/example-vs-hamburg', '4393680'],
    ['https://www.fotmob.com/matches/x-y?tab=stats&id=4393680', '4393680'],
    ['https://fotmob.com/de/matches/a-vs-b#1234567', '1234567'],
  ])('liest die Match-ID aus %s', (input, expected) => {
    expect(parseFotMobMatchId(input)).toBe(expected);
  });
  it.each([
    '',
    'kein link',
    'https://example.com/matches/123#4393680',
    'https://www.fotmob.com/matches/example-vs-hamburg',
    'https://www.fotmob.com/matches/x#12',
    'abc',
  ])('weist ungültige Eingaben zurück: %s', (input) => {
    expect(parseFotMobMatchId(input)).toBeNull();
  });
});

describe('parseFotMobScore', () => {
  it('parst Heim/Gast-Tore aus verschiedenen Formaten', () => {
    expect(parseFotMobScore('2 - 1')).toEqual({ homeGoals: 2, awayGoals: 1 });
    expect(parseFotMobScore('0:0')).toEqual({ homeGoals: 0, awayGoals: 0 });
    expect(parseFotMobScore('abgelaufen')).toBeNull();
  });
});

// Realistische Struktur der FotMob-API (api/matches?id=…): Objekt-Map unter
// content.stats.periods.all.stats plus Ergebnis im Header.
const fotmobPayload = {
  general: { matchId: 4393680 },
  header: {
    teams: [{ name: 'FC Example' }, { name: 'Hamburger SV' }],
    status: { scoreStr: '2 - 1' },
  },
  content: {
    stats: {
      periods: {
        all: {
          stats: {
            possession: { home: 58.4, away: 41.6 },
            expected_goals: { home: 1.85, away: 0.9 },
            total_shots: { home: 14, away: 9 },
            total_shots_on_target: { home: 6, away: 3 },
            corner_kicks: { home: 7, away: 3 },
            fouls: { home: 11, away: 15 },
            yellow_cards: { home: 2, away: 1 },
            red_cards: { home: 0, away: 0 },
          },
        },
      },
    },
  },
};

describe('extractFotMobImport', () => {
  it('mappt Heimspiel-Statistiken auf for/against und übernimmt das Ergebnis', () => {
    const result = extractFotMobImport(fotmobPayload, true);
    expect(result).not.toBeNull();
    expect(result?.homeGoals).toBe(2);
    expect(result?.awayGoals).toBe(1);
    expect(result?.stats).toEqual({
      possession_pct: 58,
      xg_for: 1.85,
      xg_against: 0.9,
      shots_for: 14,
      shots_against: 9,
      shots_on_target_for: 6,
      shots_on_target_against: 3,
      corners_for: 7,
      corners_against: 3,
      fouls_for: 11,
      fouls_against: 15,
      yellow_cards_for: 2,
      yellow_cards_against: 1,
      red_cards_for: 0,
      red_cards_against: 0,
    });
  });

  it('dreht bei Auswärtsspielen home/away der API auf FC/Gegner um', () => {
    const result = extractFotMobImport(fotmobPayload, false);
    expect(result?.homeGoals).toBe(1);
    expect(result?.awayGoals).toBe(2);
    expect(result?.stats.possession_pct).toBe(42);
    expect(result?.stats.xg_for).toBe(0.9);
    expect(result?.stats.xg_against).toBe(1.85);
    expect(result?.stats.shots_for).toBe(9);
  });

  it('versteht auch die Zeilenform der Statistik-Antwort', () => {
    const payload = {
      header: { status: { scoreStr: '1 - 0' } },
      content: {
        stats: {
          periods: {
            all: {
              stats: [
                { key: 'Ball Possession', homeValue: 61, awayValue: 39 },
                { key: 'Expected goals (xG)', stats: { home: 2.1, away: 0.4 } },
                { key: 'Total shots', home: 10, away: 5 },
              ],
            },
          },
        },
      },
    };
    const result = extractFotMobImport(payload, true);
    expect(result?.homeGoals).toBe(1);
    expect(result?.stats.possession_pct).toBe(61);
    expect(result?.stats.xg_for).toBe(2.1);
    expect(result?.stats.xg_against).toBe(0.4);
    expect(result?.stats.shots_for).toBe(10);
    expect(result?.stats.shots_against).toBe(5);
    expect(result?.stats.corners_for).toBeUndefined();
  });

  it('gibt null zurück, wenn keine Statistiken vorliegen', () => {
    expect(extractFotMobImport({ content: { stats: {} } }, true)).toBeNull();
    expect(extractFotMobImport(null, true)).toBeNull();
  });

  // Realistische Struktur der matchDetails-API (/api/data/matchDetails):
  // content.stats.Periods.All.stats = Array von Gruppen, jede Gruppe mit
  // stats: [{ key, title, stats: [home, away], rawStats: [{value}, …] }].
  it('versteht die matchDetails-Struktur mit Periods.All und stats als Array', () => {
    const matchDetailsPayload = {
      header: { status: { scoreStr: '1 - 3' } },
      content: {
        stats: {
          Periods: {
            All: {
              stats: [
                {
                  title: 'Top stats',
                  key: 'top_stats',
                  stats: [
                    {
                      title: 'Ball possession',
                      key: 'BallPossesion',
                      stats: [46, 54],
                      rawStats: [{ value: 46 }, { value: 54 }],
                      type: 'graph',
                    },
                    {
                      title: 'Expected goals (xG)',
                      key: 'expected_goals',
                      stats: ['0.66', '1.57'],
                      rawStats: [{ value: 0.66 }, { value: 1.57 }],
                      type: 'text',
                    },
                    {
                      title: 'Total shots',
                      key: 'total_shots',
                      stats: [17, 11],
                      type: 'text',
                    },
                    {
                      title: 'Shots on target',
                      key: 'ShotsOnTarget',
                      stats: [4, 6],
                      type: 'text',
                    },
                    {
                      title: 'Corners',
                      key: 'corners',
                      stats: [5, 5],
                      type: 'text',
                    },
                    {
                      title: 'Yellow cards',
                      key: 'yellow_cards',
                      stats: [2, 5],
                      type: 'text',
                    },
                  ],
                },
                {
                  title: 'Discipline',
                  key: 'discipline',
                  stats: [
                    {
                      title: 'Fouls committed',
                      key: 'fouls',
                      stats: [16, 17],
                      type: 'text',
                    },
                    {
                      title: 'Red cards',
                      key: 'red_cards',
                      stats: [0, 0],
                      type: 'text',
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    };
    const result = extractFotMobImport(matchDetailsPayload, true);
    expect(result).not.toBeNull();
    expect(result?.homeGoals).toBe(1);
    expect(result?.awayGoals).toBe(3);
    expect(result?.stats).toEqual({
      possession_pct: 46,
      xg_for: 0.66,
      xg_against: 1.57,
      shots_for: 17,
      shots_against: 11,
      shots_on_target_for: 4,
      shots_on_target_against: 6,
      corners_for: 5,
      corners_against: 5,
      fouls_for: 16,
      fouls_against: 17,
      yellow_cards_for: 2,
      yellow_cards_against: 5,
      red_cards_for: 0,
      red_cards_against: 0,
    });
  });

  it('dreht bei Auswärtsspiel die matchDetails-Array-Werte um', () => {
    const payload = {
      header: { status: { scoreStr: '1 - 3' } },
      content: {
        stats: {
          Periods: {
            All: {
              stats: [
                {
                  title: 'Top stats',
                  key: 'top_stats',
                  stats: [
                    {
                      key: 'BallPossesion',
                      stats: [46, 54],
                      type: 'graph',
                    },
                    { key: 'expected_goals', stats: ['0.66', '1.57'] },
                    { key: 'total_shots', stats: [17, 11] },
                  ],
                },
              ],
            },
          },
        },
      },
    };
    const result = extractFotMobImport(payload, false);
    expect(result?.homeGoals).toBe(3);
    expect(result?.awayGoals).toBe(1);
    expect(result?.stats.possession_pct).toBe(54);
    expect(result?.stats.xg_for).toBe(1.57);
    expect(result?.stats.shots_for).toBe(11);
    expect(result?.stats.shots_against).toBe(17);
  });
});

describe('mergeFotMobImport', () => {
  it('füllt nur leere Felder, manuelle Eingaben behalten Vorrang', () => {
    const imported = extractFotMobImport(fotmobPayload, true)!;
    const values = {
      ...emptyMatch,
      shots_for: 99,
      home_goals: 3,
      away_goals: 3,
    };
    const merged = mergeFotMobImport(values, imported);
    expect(merged.shots_for).toBe(99);
    expect(merged.shots_against).toBe(9);
    expect(merged.xg_for).toBe(1.85);
    expect(merged.home_goals).toBe(3);
    expect(merged.away_goals).toBe(3);
    expect(merged.possession_pct).toBe(58);
  });
});

describe('importFotMobData', () => {
  const fetchOk = (async () =>
    new Response(JSON.stringify(fotmobPayload), {
      status: 200,
    })) as typeof fetch;
  const fetch404 = (async () =>
    new Response('not found', { status: 404 })) as typeof fetch;
  const fetchThrows = (async () => {
    throw new Error('network down');
  }) as typeof fetch;

  it('liefert bei gültigem Link die gemappten Daten', async () => {
    const { result, error } = await importFotMobData(
      'https://www.fotmob.com/matches/x#4393680',
      true,
      fetchOk,
    );
    expect(error).toBeNull();
    expect(result?.stats.xg_for).toBe(1.85);
    expect(result?.homeGoals).toBe(2);
  });

  it('meldet ungültige Links, HTTP-Fehler und Netzwerkprobleme', async () => {
    expect(
      (await importFotMobData('https://example.com/#1', true, fetchOk)).error,
    ).toMatch(/kein gültiger FotMob-Link/);
    expect(
      (
        await importFotMobData(
          'https://www.fotmob.com/matches/x#4393680',
          true,
          fetch404,
        )
      ).error,
    ).toMatch(/kein Spiel/);
    expect(
      (
        await importFotMobData(
          'https://www.fotmob.com/matches/x#4393680',
          true,
          fetchThrows,
        )
      ).error,
    ).toMatch(/nicht geladen/);
  });

  it('unterscheidet Blockade (403) von fehlendem Spiel (404)', async () => {
    const fetch403 = (async () =>
      new Response('blocked', { status: 403 })) as typeof fetch;
    expect(
      (
        await importFotMobData(
          'https://www.fotmob.com/matches/x#4393680',
          true,
          fetch403,
        )
      ).error,
    ).toMatch(/blockiert/);
  });

  it('fragt die aktuelle /api/data/-Route zuerst ab und fällt bei 404 zurück', async () => {
    const calls: string[] = [];
    const fetchFallback = (async (url: string) => {
      calls.push(String(url));
      return String(url).includes('/api/data/')
        ? new Response('gone', { status: 404 })
        : new Response(JSON.stringify(fotmobPayload), { status: 200 });
    }) as typeof fetch;
    const { result, error } = await importFotMobData(
      '4393680',
      true,
      fetchFallback,
    );
    expect(error).toBeNull();
    expect(result?.stats.xg_for).toBe(1.85);
    expect(calls[0]).toContain('/api/data/matchDetails?matchId=4393680');
    expect(calls[1]).toContain('/api/matches?id=4393680');
  });
});
