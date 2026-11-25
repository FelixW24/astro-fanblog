import { describe, expect, it } from 'vitest';
import {
  buildMatchTimeline,
  emptyMatch,
  formatMatchTime,
  hasKickoffDate,
  isUpcomingMatch,
  matchOutcome,
  matchOutcomeLabel,
  matchScore,
  matchTeams,
  matchToForm,
  parseMatchForm,
  type Match,
} from './matches';

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({
    opponent: 'Hamburger SV',
    opponent_short: 'HSV',
    location: 'home',
    kickoff_at: '2026-09-20T15:30',
    venue: 'Example Arena',
    ...overrides,
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe('Spielplan', () => {
  it('speichert Berliner Sommer- und Winterzeit korrekt', () => {
    expect(parseMatchForm(form()).payload.kickoff_at).toBe(
      '2026-09-20T13:30:00.000Z',
    );
    expect(
      parseMatchForm(form({ kickoff_at: '2026-12-20T15:30' })).payload
        .kickoff_at,
    ).toBe('2026-12-20T14:30:00.000Z');
    expect(parseMatchForm(form()).payload.matchcenter_url).toBeNull();
    expect(parseMatchForm(form()).error).toBeNull();
  });
  it.each<Record<string, string>>([
    { kickoff_at: '2026-03-29T02:30' },
    { kickoff_at: '2026-02-30T15:30' },
    { opponent: '' },
    { opponent_short: 'TOOLONG' },
    { location: 'invalid' },
    { venue: '' },
    { matchcenter_url: 'javascript:alert(1)' },
    { matchcenter_url: 'kein-link' },
  ])('weist ungültige Eingaben zurück: %s', (overrides) => {
    expect(parseMatchForm(form(overrides)).error).not.toBeNull();
  });
  it('übernimmt Absagen und stellt bei Auswärtsspielen den Gastgeber zuerst dar', () => {
    const parsed = parseMatchForm(
      form({
        location: 'away',
        cancelled: 'on',
        matchcenter_url: 'https://fc.de/',
      }),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.payload.cancelled).toBe(true);
    const match = { ...parsed.payload, id: 1 };
    expect(matchTeams(match).map((team) => team.name)).toEqual([
      'Hamburger SV',
      'FC Example',
    ]);
    expect(matchTeams({ ...match, is_home: true })[0].short).toBe('FC');
    expect(matchToForm(match).kickoff_at).toBe('2026-09-20T15:30');
    expect(formatMatchTime('2026-09-20T13:30:00.000Z')).toContain('15:30');
    expect(emptyMatch.cancelled).toBe(false);
  });
  it('akzeptiert „Noch nicht terminiert“ ohne Anstoßzeit und speichert null', () => {
    const parsed = parseMatchForm(form({ kickoff_at: '', unscheduled: 'on' }));
    expect(parsed.error).toBeNull();
    expect(parsed.values.kickoff_at).toBeNull();
    expect(parsed.payload.kickoff_at).toBeNull();
    // Eine eingetragene Zeit wird zugunsten des Flags ignoriert.
    const withDate = parseMatchForm(
      form({ kickoff_at: '2026-09-20T15:30', unscheduled: 'on' }),
    );
    expect(withDate.error).toBeNull();
    expect(withDate.payload.kickoff_at).toBeNull();
    // Umgekehrt bleibt die Anstoß-Pflicht ohne das Flag bestehen.
    expect(parseMatchForm(form({ kickoff_at: '' })).error).toMatch(
      /Anstoßzeit/,
    );
    expect(
      parseMatchForm(form({ kickoff_at: '2026-02-30T15:30' })).error,
    ).toMatch(/Anstoßzeit/);
  });
  it('bildet „Noch nicht terminiert“ im Formular als null-Kickoff ab', () => {
    const match = { ...parseMatchForm(form()).payload, id: 1 };
    expect(matchToForm({ ...match, kickoff_at: null }).kickoff_at).toBeNull();
    expect(matchToForm(match).kickoff_at).toBe('2026-09-20T15:30');
  });
  it('parst ein vollständiges Ergebnis oder lässt beide Tore leer', () => {
    const withResult = parseMatchForm(
      form({ home_goals: '2', away_goals: '1' }),
    );
    expect(withResult.error).toBeNull();
    expect(withResult.payload.home_goals).toBe(2);
    expect(withResult.payload.away_goals).toBe(1);
    const withoutResult = parseMatchForm(form());
    expect(withoutResult.error).toBeNull();
    expect(withoutResult.payload.home_goals).toBeNull();
    expect(withoutResult.payload.away_goals).toBeNull();
  });
  it.each<Record<string, string>>([
    { home_goals: '2' },
    { away_goals: '1' },
    { home_goals: '2', away_goals: '' },
    { home_goals: '-1', away_goals: '0' },
    { home_goals: '31', away_goals: '0' },
    { home_goals: '1,5', away_goals: '0' },
    { home_goals: 'x', away_goals: '0' },
  ])('weist ungültige Ergebnisse zurück: %s', (overrides) => {
    expect(parseMatchForm(form(overrides)).error).toMatch(/Ergebnis/);
  });
  it('parst optionale Basis-Statistiken, leer bleibt null', () => {
    const parsed = parseMatchForm(
      form({
        possession_pct: '58',
        xg_for: '1,85',
        xg_against: '0.9',
        shots_for: '12',
        shots_against: '7',
        shots_on_target_for: '5',
        shots_on_target_against: '3',
        corners_for: '6',
        corners_against: '2',
        fouls_for: '9',
        fouls_against: '14',
        yellow_cards_for: '1',
        yellow_cards_against: '3',
        red_cards_for: '0',
        red_cards_against: '',
      }),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.payload.possession_pct).toBe(58);
    expect(parsed.payload.xg_for).toBe(1.85);
    expect(parsed.payload.xg_against).toBe(0.9);
    expect(parsed.payload.shots_for).toBe(12);
    expect(parsed.payload.red_cards_for).toBe(0);
    expect(parsed.payload.red_cards_against).toBeNull();
    const empty = parseMatchForm(form());
    expect(empty.error).toBeNull();
    expect(empty.payload.possession_pct).toBeNull();
    expect(empty.payload.xg_for).toBeNull();
    expect(empty.payload.shots_against).toBeNull();
  });
  it.each<Record<string, string>>([
    { possession_pct: '101' },
    { possession_pct: '-1' },
    { possession_pct: '55,5' },
    { xg_for: '100' },
    { xg_for: '-0,5' },
    { xg_for: 'abc' },
    { shots_for: '100' },
    { shots_for: '1,5' },
    { corners_against: '-1' },
    { red_cards_against: 'x' },
  ])('weist ungültige Statistiken zurück: %s', (overrides) => {
    expect(parseMatchForm(form(overrides)).error).not.toBeNull();
  });
  it('formatiert Ergebnis und Ausgang aus Sicht des FC Example', () => {
    const homeWin = {
      id: 1,
      is_home: true,
      home_goals: 3,
      away_goals: 1,
    };
    expect(matchScore(homeWin)).toBe('3 : 1');
    expect(matchOutcome(homeWin)).toBe('sieg');
    expect(matchOutcomeLabel(matchOutcome(homeWin))).toBe('Sieg');
    const awayLoss = { ...homeWin, is_home: false };
    expect(matchOutcome(awayLoss)).toBe('niederlage');
    expect(
      matchOutcome({
        ...homeWin,
        is_home: false,
        home_goals: 1,
        away_goals: 3,
      }),
    ).toBe('sieg');
    expect(matchOutcome({ ...homeWin, home_goals: 2, away_goals: 2 })).toBe(
      'remis',
    );
    expect(matchScore({ home_goals: null, away_goals: null })).toBeNull();
    expect(
      matchOutcome({ is_home: true, home_goals: null, away_goals: null }),
    ).toBeNull();
  });
});

describe('Spielplan-Timeline', () => {
  const now = new Date('2026-11-25T12:00:00.000Z');

  function matchRow(id: number, overrides: Partial<Match> = {}): Match {
    return { ...emptyMatch, id, kickoff_at: null, ...overrides } as Match;
  }

  it('erkennt gültige Termine und kommende Spiele', () => {
    expect(hasKickoffDate(matchRow(1))).toBe(false);
    expect(hasKickoffDate(matchRow(1, { kickoff_at: 'kaputt' }))).toBe(false);
    expect(hasKickoffDate(matchRow(1, { kickoff_at: now.toISOString() }))).toBe(
      true,
    );
    expect(isUpcomingMatch(matchRow(1), now)).toBe(true);
    expect(
      isUpcomingMatch(matchRow(1, { kickoff_at: '2026-12-20T14:30:00.000Z' }), now),
    ).toBe(true);
    expect(
      isUpcomingMatch(matchRow(1, { kickoff_at: '2026-11-20T14:30:00.000Z' }), now),
    ).toBe(false);
  });

  it('sortiert terminierte kommende Spiele als FIFO-Stapel ganz ans Ende', () => {
    const matches = [
      // Terminiert in der Zukunft, aber später angelegt (höhere id).
      matchRow(10, { kickoff_at: '2027-01-10T14:30:00.000Z' }),
      // Ohne Termin.
      matchRow(7),
      // Vergangen, älter.
      matchRow(5, { kickoff_at: '2026-11-10T14:30:00.000Z' }),
      // Terminiert in der Zukunft, zuerst angelegt (niedrigste id).
      matchRow(2, { kickoff_at: '2026-12-20T14:30:00.000Z' }),
      // Vergangen, neuesten.
      matchRow(3, { kickoff_at: '2026-11-20T14:30:00.000Z' }),
      // Abgesagt, fliegt raus.
      matchRow(9, { kickoff_at: '2026-12-01T14:30:00.000Z', cancelled: true }),
    ];
    const timeline = buildMatchTimeline(matches, now);
    expect(timeline.map((match) => match.id)).toEqual([7, 3, 5, 2, 10]);
    // „Kommend“ richtet sich am Anstoß, nicht an der Position in der Liste.
    const byId = new Map(timeline.map((match) => [match.id, match]));
    expect(isUpcomingMatch(byId.get(7)!, now)).toBe(true);
    expect(isUpcomingMatch(byId.get(3)!, now)).toBe(false);
    expect(isUpcomingMatch(byId.get(2)!, now)).toBe(true);
  });

  it('sortiert die Historie neueste zuerst und behält gleiche Termine nach id', () => {
    const matches = [
      matchRow(4, { kickoff_at: '2026-11-20T14:30:00.000Z' }),
      matchRow(1, { kickoff_at: '2026-11-20T14:30:00.000Z' }),
      matchRow(3, { kickoff_at: '2026-11-22T14:30:00.000Z' }),
    ];
    expect(buildMatchTimeline(matches, now).map((match) => match.id)).toEqual([
      3, 4, 1,
    ]);
  });
});
