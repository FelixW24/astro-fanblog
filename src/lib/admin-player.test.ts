import { describe, expect, it } from 'vitest';
import type { Player } from './content';
import type { Database } from './database.types';
import {
  loanPayload,
  parseChartForm,
  parseOptionalChartForm,
  parseChartPlacement,
  parsePlayerForm,
  playerFormValuesEqual,
  playerPayload,
  playerToFormValues,
} from './admin-player';

type LoanRecord = Database['public']['Tables']['loans']['Row'];

function validPlayerForm() {
  const form = new FormData();
  Object.entries({
    slug: 'max-mustermann',
    name: 'Max Mustermann',
    shirt_number: '8',
    position: 'mittelfeld',
    squad_status: 'first-team',
    nationality: 'Deutschland',
    date_of_birth: '2000-01-02',
    joined_on: '2025-07-01',
    contract_until: '2028-06-30',
    height_cm: '184',
    preferred_foot: 'rechts',
    market_value_eur: '3000000',
    profile_image_url: 'https://example.com/max.jpg',
    profile_image_alt: 'Max Mustermann im Trikot',
    bio: 'Ein vielseitiger Mittelfeldspieler mit gutem Passspiel.',
    profile_slogan: 'Immer\nfür Kölle.',
  }).forEach(([key, value]) => form.set(key, value));
  return form;
}

describe('player admin forms', () => {
  it.each(['first-team', 'loan-in', 'on-loan', 'academy', 'departed'])(
    'akzeptiert den Kaderstatus %s',
    (status) => {
      const form = validPlayerForm();
      form.set('squad_status', status);
      if (status === 'loan-in' || status === 'on-loan') {
        form.set('loan_partner_club', 'FC St. Pauli');
        form.set('loan_starts_on', '2026-08-27');
      }
      const parsed = parsePlayerForm(form);
      expect(parsed.error).toBeNull();
      expect(playerPayload(parsed.values).squad_status).toBe(status);
    },
  );
  it('validiert und normalisiert ein Spielerprofil', () => {
    const parsed = parsePlayerForm(validPlayerForm());
    expect(parsed.error).toBeNull();
    expect(playerPayload(parsed.values)).toMatchObject({
      shirt_number: 8,
      height_cm: 184,
      market_value_eur: 3_000_000,
      profile_slogan: 'Immer\nfür Kölle.',
    });
  });

  it('akzeptiert einen mehrzeiligen Profil-Slogan', () => {
    const form = validPlayerForm();
    form.set('profile_slogan', 'Kämpfen\nfür Kölle.');

    expect(parsePlayerForm(form)).toMatchObject({
      error: null,
      values: { profile_slogan: 'Kämpfen\nfür Kölle.' },
    });
  });

  it('weist einen leeren Profil-Slogan zurück', () => {
    const form = validPlayerForm();
    form.set('profile_slogan', '');

    expect(parsePlayerForm(form).error).toContain('Profil-Slogan');
  });

  it('verlangt einen Alternativtext zum Bild', () => {
    const form = validPlayerForm();
    form.set('profile_image_alt', '');
    expect(parsePlayerForm(form).error).toContain('Alternativtext');
  });

  it('wandelt redaktionelle Radarwerte in strukturierte Daten um', () => {
    const form = new FormData();
    form.set('chart_title', 'Leistungsprofil');
    form.set('chart_metrics', 'Tempo: 82\nTechnik: 74\nPhysis: 91');
    expect(parseChartForm(form)).toMatchObject({
      error: null,
      chartType: 'radar',
      sortOrder: 1,
      metrics: [
        { label: 'Tempo', value: 82 },
        { label: 'Technik', value: 74 },
        { label: 'Physis', value: 91 },
      ],
    });
  });

  it('übernimmt Grafiktyp und Anzeigeposition', () => {
    const form = new FormData();
    form.set('chart_type', 'bar');
    form.set('chart_sort_order', '3');

    expect(parseChartPlacement(form)).toEqual({
      chartType: 'bar',
      sortOrder: 3,
      error: null,
    });
  });

  it('weist unbekannte Grafiktypen und ungültige Positionen zurück', () => {
    const form = new FormData();
    form.set('chart_type', 'line');
    expect(parseChartPlacement(form).error).toContain('Grafiktyp');

    form.set('chart_type', 'radar');
    form.set('chart_sort_order', '0');
    expect(parseChartPlacement(form).error).toContain('Anzeigeposition');
  });

  it('weist Radarwerte außerhalb des Bereichs zurück', () => {
    const form = new FormData();
    form.set('chart_title', 'Leistungsprofil');
    form.set('chart_metrics', 'Tempo: 120\nTechnik: 74\nPhysis: 91');
    expect(parseChartForm(form).error).toContain('0 bis 100');
  });

});

describe('Verletzungsstatus', () => {
  it('speichert Beginn und erwartetes Ende zusammen mit dem Profil', () => {
    const form = validPlayerForm();
    form.set('is_injured', 'on');
    form.set('injury_since', '2026-10-20');
    form.set('injury_until', '2026-11-02');
    const parsed = parsePlayerForm(form);
    expect(parsed.error).toBeNull();
    expect(playerPayload(parsed.values)).toMatchObject({
      is_injured: true,
      injury_since: '2026-10-20',
      injury_until: '2026-11-02',
    });
  });
  it('erlaubt ein offenes Ende', () => {
    const form = validPlayerForm();
    form.set('is_injured', 'on');
    form.set('injury_since', '2026-10-20');
    const parsed = parsePlayerForm(form);
    expect(parsed.error).toBeNull();
    expect(playerPayload(parsed.values).injury_until).toBeNull();
  });
  it.each(['', '2026-02-30', 'kein-datum'])(
    'verlangt einen gültigen Beginn: %s',
    (date) => {
      const form = validPlayerForm();
      form.set('is_injured', 'on');
      form.set('injury_since', date);
      expect(parsePlayerForm(form).error).toContain('Verletzt seit');
    },
  );
  it.each(['2026-10-19', '2026-11-31', 'unbekannt'])(
    'lehnt ein ungültiges Ende ab: %s',
    (date) => {
      const form = validPlayerForm();
      form.set('is_injured', 'on');
      form.set('injury_since', '2026-10-20');
      form.set('injury_until', date);
      expect(parsePlayerForm(form).error).toContain('voraussichtliche Ende');
    },
  );
  it('entfernt alte Verletzungsdaten beim Gesundmelden', () => {
    const form = validPlayerForm();
    form.set('injury_since', '2026-10-20');
    form.set('injury_until', '2026-11-02');
    expect(playerPayload(parsePlayerForm(form).values)).toMatchObject({
      is_injured: false,
      injury_since: null,
      injury_until: null,
    });
  });
});

describe('optional chart draft', () => {
  it('allows saving only the profile when the diagram is empty', () => {
    const form = validPlayerForm();
    form.set('chart_type', 'bar');
    form.set('chart_sort_order', '2');
    form.set('chart_title', '  ');
    expect(parseOptionalChartForm(form)).toBeNull();
  });

  it.each(['chart_title', 'chart_description', 'chart_metrics'])(
    'validates incomplete drafts started through %s',
    (field) => {
      const form = validPlayerForm();
      form.set(field, 'Entwurf');
      expect(parseOptionalChartForm(form)?.error).toBeTruthy();
    },
  );

  it.each(['82 %', '%', '82.5', '-1', '101', 'abc', ''])(
    'explains the invalid value %s and preserves the draft',
    (value) => {
      const form = validPlayerForm();
      const metrics = `Tempo: 80\nTechnik: ${value}\nPhysis: 90`;
      form.set('chart_title', 'Leistungsprofil');
      form.set('chart_metrics', metrics);
      const parsed = parseOptionalChartForm(form);
      expect(parsed?.error).toContain('Zeile 2');
      expect(parsed?.error).toContain('0 bis 100');
      expect(parsed?.error).toContain('ohne Prozentzeichen');
      expect(parsed?.values.metrics).toBe(metrics.trim());
    },
  );

  it('accepts a complete draft with boundary values', () => {
    const form = validPlayerForm();
    form.set('chart_title', 'Leistungsprofil');
    form.set('chart_metrics', 'Tempo: 0\nTechnik: 100\nPhysis: 82');
    expect(parseOptionalChartForm(form)?.error).toBeNull();
  });

  it('explains the required number of lines separately', () => {
    const form = new FormData();
    form.set('chart_title', 'Leistungsprofil');
    form.set('chart_metrics', 'Tempo: 82');
    expect(parseChartForm(form).error).toContain('aktuell sind es 1');
  });
});

describe('Leihdaten', () => {
  function loanForm(status: string) {
    const form = validPlayerForm();
    form.set('squad_status', status);
    form.set('loan_partner_club', 'FC St. Pauli');
    form.set('loan_starts_on', '2026-08-27');
    form.set('loan_ends_on', '2027-06-30');
    form.set('loan_note', 'Saisonleihe in die 2. Bundesliga');
    form.set('loan_source_url', 'https://fc.de/news/verleih');
    return form;
  }

  it('speichert die Leihdaten für einen verliehenen Spieler als outgoing', () => {
    const parsed = parsePlayerForm(loanForm('on-loan'));
    expect(parsed.error).toBeNull();
    expect(loanPayload(parsed.values)).toMatchObject({
      direction: 'outgoing',
      partner_club: 'FC St. Pauli',
      starts_on: '2026-08-27',
      ends_on: '2027-06-30',
      note: 'Saisonleihe in die 2. Bundesliga',
      source_url: 'https://fc.de/news/verleih',
      status: 'active',
    });
  });

  it('speichert die Leihdaten für einen geliehenen Spieler als incoming', () => {
    const parsed = parsePlayerForm(loanForm('loan-in'));
    expect(parsed.error).toBeNull();
    expect(loanPayload(parsed.values)?.direction).toBe('incoming');
  });

  it('erlaubt ein offenes Leihende und leere optionale Felder', () => {
    const form = loanForm('on-loan');
    form.set('loan_ends_on', '');
    form.set('loan_note', '');
    form.set('loan_source_url', '');
    const parsed = parsePlayerForm(form);
    expect(parsed.error).toBeNull();
    expect(loanPayload(parsed.values)).toMatchObject({
      ends_on: null,
      note: null,
      source_url: null,
    });
  });

  it.each(['', 'x'])(
    'verlangt einen Leihverein mit mindestens 2 Zeichen: %s',
    (club) => {
      const form = loanForm('on-loan');
      form.set('loan_partner_club', club);
      expect(parsePlayerForm(form).error).toContain('Leihverein');
    },
  );

  it.each(['', '2026-02-30', 'unbekannt'])(
    'verlangt einen gültigen Leihbeginn: %s',
    (date) => {
      const form = loanForm('on-loan');
      form.set('loan_starts_on', date);
      expect(parsePlayerForm(form).error).toContain('Leihbeginn');
    },
  );

  it.each(['2026-08-26', '2027-02-30'])(
    'lehnt ein Leihende vor oder ungültig ab: %s',
    (date) => {
      const form = loanForm('on-loan');
      form.set('loan_ends_on', date);
      expect(parsePlayerForm(form).error).toContain('Leihende');
    },
  );

  it('lehnt eine ungültige Quellen-URL ab', () => {
    const form = loanForm('on-loan');
    form.set('loan_source_url', 'ftp://example.com');
    expect(parsePlayerForm(form).error).toContain('Quellen-URL');
  });

  it('lehnt eine zu lange Notiz ab', () => {
    const form = loanForm('on-loan');
    form.set('loan_note', 'x'.repeat(501));
    expect(parsePlayerForm(form).error).toContain('Notiz');
  });

  it('ignoriert Leihfelder ohne Leihstatus', () => {
    const form = validPlayerForm();
    const parsed = parsePlayerForm(form);
    expect(parsed.error).toBeNull();
    expect(loanPayload(parsed.values)).toBeNull();
  });

  it('übernimmt die aktive Leihe in die Formularwerte', () => {
    const player = {
      slug: 'jule-kraft',
      squad_status: 'on-loan',
    } as Player;
    const loans = [
      {
        id: 1,
        status: 'completed',
        direction: 'outgoing',
        partner_club: 'Alter Verein',
        starts_on: '2025-07-01',
        ends_on: '2026-06-30',
        note: null,
        source_url: null,
      },
      {
        id: 2,
        status: 'active',
        direction: 'outgoing',
        partner_club: 'FC St. Pauli',
        starts_on: '2026-08-27',
        ends_on: '2027-06-30',
        note: 'Saisonleihe',
        source_url: 'https://fc.de/news',
      },
    ] as LoanRecord[];
    expect(playerToFormValues(player, loans)).toMatchObject({
      squad_status: 'on-loan',
      loan_partner_club: 'FC St. Pauli',
      loan_starts_on: '2026-08-27',
      loan_ends_on: '2027-06-30',
      loan_note: 'Saisonleihe',
      loan_source_url: 'https://fc.de/news',
    });
  });

  it('wählt die zuletzt begonnene aktive Leihe aus', () => {
    const player = { slug: 'x', squad_status: 'on-loan' } as Player;
    const loans = [
      {
        id: 3,
        status: 'active',
        direction: 'outgoing',
        partner_club: 'Neuer Verein',
        starts_on: '2026-09-01',
        ends_on: null,
        note: null,
        source_url: null,
      },
      {
        id: 2,
        status: 'active',
        direction: 'outgoing',
        partner_club: 'FC St. Pauli',
        starts_on: '2026-08-27',
        ends_on: '2027-06-30',
        note: null,
        source_url: null,
      },
    ] as LoanRecord[];
    expect(playerToFormValues(player, loans).loan_partner_club).toBe(
      'Neuer Verein',
    );
  });

  it('befüllt die Leihfelder leer, wenn keine Leihe existiert', () => {
    const player = { slug: 'x', squad_status: 'first-team' } as Player;
    expect(playerToFormValues(player)).toMatchObject({
      loan_partner_club: '',
      loan_starts_on: '',
      loan_ends_on: '',
      loan_note: '',
      loan_source_url: '',
    });
  });

  it('ignoriert aktive Leihen mit abweichender Richtung', () => {
    const player = { slug: 'x', squad_status: 'on-loan' } as Player;
    const loans = [
      {
        id: 2,
        status: 'active',
        direction: 'incoming',
        partner_club: 'FC St. Pauli',
        starts_on: '2026-08-27',
        ends_on: null,
        note: null,
        source_url: null,
      },
    ] as LoanRecord[];
    expect(playerToFormValues(player, loans)).toMatchObject({
      loan_partner_club: '',
      loan_starts_on: '',
    });
  });

  it('befüllt die Leihfelder leer, wenn der Spieler keinen Leihstatus hat', () => {
    const player = { slug: 'x', squad_status: 'first-team' } as Player;
    const loans = [
      {
        id: 2,
        status: 'active',
        direction: 'outgoing',
        partner_club: 'FC St. Pauli',
        starts_on: '2026-08-27',
        ends_on: null,
        note: null,
        source_url: null,
      },
    ] as LoanRecord[];
    expect(playerToFormValues(player, loans)).toMatchObject({
      loan_partner_club: '',
      loan_starts_on: '',
    });
  });
});

describe('playerFormValuesEqual', () => {
  it('erkennt identische Werte als gleich', () => {
    const parsed = parsePlayerForm(validPlayerForm());
    expect(parsed.error).toBeNull();
    expect(playerFormValuesEqual(parsed.values, { ...parsed.values })).toBe(
      true,
    );
  });

  it.each([
    ['name', { name: 'Anderer Name' }],
    ['is_injured', { is_injured: true }],
    ['bio', { bio: 'Anderer Text, lang genug.' }],
  ])('erkennt eine Änderung an %s', (_field, patch) => {
    const parsed = parsePlayerForm(validPlayerForm());
    expect(
      playerFormValuesEqual(parsed.values, { ...parsed.values, ...patch }),
    ).toBe(false);
  });
});
