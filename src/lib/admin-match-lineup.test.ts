import { describe, expect, it } from 'vitest';
import {
  findLineupConflict,
  parseBenchIds,
  parseStarterIds,
  parseSubstitutions,
  planLineupSync,
  validateLineupSelection,
  type LineupSelection,
} from './admin-match-lineup';
import type { PlayerMatchRating } from './admin-player-history';

function form(entries: Record<string, string[]>) {
  const data = new FormData();
  for (const [name, values] of Object.entries(entries)) {
    for (const value of values) data.append(name, value);
  }
  return data;
}

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

function selection(overrides: Partial<LineupSelection> = {}): LineupSelection {
  return { starterIds: [], benchIds: [], substitutions: [], ...overrides };
}

describe('parseStarterIds', () => {
  it('liest gültige, eindeutige Spieler-IDs aus dem Mehrfachfeld', () => {
    expect(
      parseStarterIds(
        form({ starters: ['3', '1', '3', 'x', '0', '-2', '1.5'] }),
      ),
    ).toEqual([3, 1]);
    expect(parseStarterIds(form({}))).toEqual([]);
  });
});

describe('parseBenchIds', () => {
  it('liest gültige, eindeutige Bank-IDs aus dem Mehrfachfeld „bench“', () => {
    expect(parseBenchIds(form({ bench: ['8', '4', '8', 'x'] }))).toEqual([
      8, 4,
    ]);
    expect(parseBenchIds(form({}))).toEqual([]);
  });
});

describe('parseSubstitutions', () => {
  it('liest Wechsel-Zeilen aus den parallelen Feldern', () => {
    const { subs, error } = parseSubstitutions(
      form({
        sub_minute: ['67', '82'],
        sub_out: ['1', '2'],
        sub_in: ['9', '10'],
      }),
    );
    expect(error).toBeNull();
    expect(subs).toEqual([
      { minute: 67, out: 1, in: 9 },
      { minute: 82, out: 2, in: 10 },
    ]);
  });

  it('überspringt komplett leere Zeilen', () => {
    const { subs, error } = parseSubstitutions(
      form({
        sub_minute: ['', '46'],
        sub_out: ['', '3'],
        sub_in: ['', '7'],
      }),
    );
    expect(error).toBeNull();
    expect(subs).toEqual([{ minute: 46, out: 3, in: 7 }]);
  });

  it('meldet ungültige Minuten, fehlende Spieler und Selbstwechsel', () => {
    expect(
      parseSubstitutions(
        form({ sub_minute: ['0'], sub_out: ['1'], sub_in: ['9'] }),
      ).error,
    ).toMatch(/Wechselminute/);
    expect(
      parseSubstitutions(
        form({ sub_minute: ['abc'], sub_out: ['1'], sub_in: ['9'] }),
      ).error,
    ).toMatch(/Wechselminute/);
    expect(
      parseSubstitutions(
        form({ sub_minute: ['60'], sub_out: ['1'], sub_in: [''] }),
      ).error,
    ).toMatch(/ausgewechselten als auch/);
    expect(
      parseSubstitutions(
        form({ sub_minute: ['60'], sub_out: ['1'], sub_in: ['1'] }),
      ).error,
    ).toMatch(/sich selbst/);
  });

  it('begrenzt die Zahl der Wechsel', () => {
    const { error } = parseSubstitutions(
      form({
        sub_minute: ['10', '20', '30', '40', '50', '60'],
        sub_out: ['1', '2', '3', '4', '5', '6'],
        sub_in: ['11', '12', '13', '14', '15', '16'],
      }),
    );
    expect(error).toMatch(/höchstens 5/);
  });
});

describe('validateLineupSelection', () => {
  const squad = [
    { id: 1, name: 'Anna' },
    { id: 2, name: 'Ben' },
    { id: 9, name: ' Ida' },
  ];

  it('akzeptiert eine gültige Aufstellung mit Wechsel', () => {
    expect(
      validateLineupSelection(
        selection({
          starterIds: [1, 2],
          benchIds: [9],
          substitutions: [{ minute: 60, out: 1, in: 9 }],
        }),
        squad,
      ),
    ).toBeNull();
  });

  it('verbietet Überschneidung von Startelf und Bank', () => {
    expect(
      validateLineupSelection(
        selection({ starterIds: [1], benchIds: [1] }),
        squad,
      ),
    ).toMatch(/gleichzeitig/);
  });

  it('verbietet verletzte Spieler in Startelf und Bank', () => {
    const squadWithInjured = [
      ...squad,
      { id: 5, name: 'Verletzt', is_injured: true },
    ];
    expect(
      validateLineupSelection(
        selection({ starterIds: [1, 5], benchIds: [] }),
        squadWithInjured,
      ),
    ).toMatch(/Verletzt ist als verletzt markiert/);
    expect(
      validateLineupSelection(
        selection({ starterIds: [1], benchIds: [5] }),
        squadWithInjured,
      ),
    ).toMatch(/Verletzt ist als verletzt markiert/);
    // Gesunde Spieler bleiben erlaubt.
    expect(
      validateLineupSelection(
        selection({ starterIds: [1], benchIds: [2] }),
        squadWithInjured,
      ),
    ).toBeNull();
  });

  it('verlangt Stammspieler „raus“ und Bank-Spieler „rein“', () => {
    expect(
      validateLineupSelection(
        selection({
          starterIds: [1],
          benchIds: [9],
          substitutions: [{ minute: 60, out: 9, in: 1 }],
        }),
        squad,
      ),
    ).toMatch(/nicht in der Startelf/);
    expect(
      validateLineupSelection(
        selection({
          starterIds: [1],
          benchIds: [],
          substitutions: [{ minute: 60, out: 1, in: 9 }],
        }),
        squad,
      ),
    ).toMatch(/nicht auf der Bank/);
  });

  it('verbietet mehrfache Auswechslung desselben Spielers', () => {
    expect(
      validateLineupSelection(
        selection({
          starterIds: [1],
          benchIds: [2, 9],
          substitutions: [
            { minute: 60, out: 1, in: 9 },
            { minute: 75, out: 1, in: 2 },
          ],
        }),
        squad,
      ),
    ).toMatch(/mehrfach/);
  });

  it('verbietet mehrfache Einwechslung desselben Spielers', () => {
    expect(
      validateLineupSelection(
        selection({
          starterIds: [1, 2],
          benchIds: [9],
          substitutions: [
            { minute: 60, out: 1, in: 9 },
            { minute: 75, out: 2, in: 9 },
          ],
        }),
        squad,
      ),
    ).toMatch(/mehrfach eingewechselt/);
  });
});

describe('findLineupConflict', () => {
  const squad = [
    { id: 1, name: 'Anna' },
    { id: 9, name: 'Ida' },
  ];

  it('meldet Bank-Spieler mit bestehenden Toren/Vorlagen namentlich', () => {
    const existing = [
      rating({ player_id: 9, status: 'subbed_in', sub_minute: 60, goals: 1 }),
    ];
    // Wird zur reinen Bank (nicht eingewechselt) → Konflikt
    expect(
      findLineupConflict(existing, selection({ benchIds: [9] }), squad),
    ).toMatch(/Ida hat in diesem Spiel Tore oder Vorlagen/);
    // Als Eingewechselter bleiben Tore erlaubt → kein Konflikt
    expect(
      findLineupConflict(
        existing,
        selection({
          starterIds: [1],
          benchIds: [9],
          substitutions: [{ minute: 60, out: 1, in: 9 }],
        }),
        squad,
      ),
    ).toBeNull();
  });

  it('gibt null zurück, wenn keine Konflikte bestehen', () => {
    const existing = [
      rating({ player_id: 9, status: 'benched', minutes_played: 0 }),
    ];
    expect(
      findLineupConflict(existing, selection({ benchIds: [9] }), squad),
    ).toBeNull();
    expect(
      findLineupConflict([], selection({ benchIds: [9] }), squad),
    ).toBeNull();
  });
});

describe('planLineupSync', () => {
  it('legt neue Stammspieler und Bank-Spieler an', () => {
    const plan = planLineupSync(
      [],
      selection({ starterIds: [1, 2], benchIds: [9] }),
    );
    expect(plan.toUpsert).toEqual([
      {
        player_id: 1,
        status: 'played',
        subMinute: null,
        substitutedBy: null,
        minutesPlayed: 90,
      },
      {
        player_id: 2,
        status: 'played',
        subMinute: null,
        substitutedBy: null,
        minutesPlayed: 90,
      },
      {
        player_id: 9,
        status: 'benched',
        subMinute: null,
        substitutedBy: null,
        minutesPlayed: 0,
      },
    ]);
    expect(plan.toRemove).toEqual([]);
  });

  it('bildet Wechsel auf subbed_off/subbed_in mit Minute und Verknüpfung ab', () => {
    const plan = planLineupSync(
      [],
      selection({
        starterIds: [1],
        benchIds: [9],
        substitutions: [{ minute: 67, out: 1, in: 9 }],
      }),
    );
    expect(plan.toUpsert).toEqual([
      {
        player_id: 1,
        status: 'subbed_off',
        subMinute: 67,
        substitutedBy: 9,
        minutesPlayed: 67,
      },
      {
        player_id: 9,
        status: 'subbed_in',
        subMinute: 67,
        substitutedBy: null,
        minutesPlayed: 23,
      },
    ]);
  });

  it('gleicht Status bestehender Einträge an, ohne redaktionelle Daten zu ändern', () => {
    const existing = [
      rating({ player_id: 1, rating: '7,5', note: 'stark' }),
      rating({ player_id: 9, status: 'benched', minutes_played: 0 }),
    ];
    const plan = planLineupSync(
      existing,
      selection({
        starterIds: [1],
        benchIds: [9],
        substitutions: [{ minute: 60, out: 1, in: 9 }],
      }),
    );
    // Spieler 1: nur Status/Wechselfelder, keine Note im Plan
    expect(plan.toUpsert).toEqual([
      {
        player_id: 1,
        status: 'subbed_off',
        subMinute: 60,
        substitutedBy: 9,
        minutesPlayed: 60,
      },
      {
        player_id: 9,
        status: 'subbed_in',
        subMinute: 60,
        substitutedBy: null,
        minutesPlayed: 30,
      },
    ]);
    expect(plan.toRemove).toEqual([]);
  });

  it('entfernt nur unberührte Auto-Einträge abgewählter Spieler', () => {
    const existing = [
      rating({ player_id: 1 }),
      rating({ player_id: 2, rating: '7,5' }),
      rating({
        player_id: 3,
        status: 'subbed_off',
        sub_minute: 60,
        minutes_played: 60,
        substituted_by_player_id: 4,
      }),
      rating({ player_id: 5, status: 'benched', minutes_played: 0 }),
      rating({ player_id: 6, status: 'played', goals: 1 }),
    ];
    const plan = planLineupSync(
      existing,
      selection({ starterIds: [2, 3], benchIds: [] }),
    );
    // 1 und 5 sind Auto-Einträge ohne Auswahl → entfernen; 6 hat Tore → bleibt
    expect(plan.toRemove).toEqual([1, 5]);
    // 3 wird von subbed_off auf played zurückgesetzt (kein Wechsel ausgewählt)
    expect(plan.toUpsert).toEqual([
      {
        player_id: 3,
        status: 'played',
        subMinute: null,
        substitutedBy: null,
        minutesPlayed: 90,
      },
    ]);
  });

  it('legt bei leerer Auswahl nichts an und entfernt alle Auto-Einträge', () => {
    const plan = planLineupSync([rating({ player_id: 9 })], selection());
    expect(plan.toUpsert).toEqual([]);
    expect(plan.toRemove).toEqual([9]);
  });
});
