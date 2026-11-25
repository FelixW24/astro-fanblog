import type { Player } from './content';
import type { Database } from './database.types';
import { loanDirection } from './player-availability';
import {
  isPlayerChartType,
  preferredFeet,
  playerPositions,
  squadStatuses,
} from './player';

type LoanRecord = Database['public']['Tables']['loans']['Row'];

export interface PlayerFormValues {
  slug: string;
  name: string;
  shirt_number: string;
  position: string;
  nationality: string;
  date_of_birth: string;
  joined_on: string;
  contract_until: string;
  squad_status: string;
  height_cm: string;
  preferred_foot: string;
  market_value_eur: string;
  profile_image_url: string;
  profile_image_alt: string;
  bio: string;
  profile_slogan: string;
  is_injured: boolean;
  injury_since: string;
  injury_until: string;
  loan_partner_club: string;
  loan_starts_on: string;
  loan_ends_on: string;
  loan_note: string;
  loan_source_url: string;
}

export interface ChartFormValues {
  chart_type: string;
  sort_order: string;
  title: string;
  description: string;
  metrics: string;
}

export const emptyPlayer: PlayerFormValues = {
  is_injured: false,
  injury_since: '',
  injury_until: '',
  loan_partner_club: '',
  loan_starts_on: '',
  loan_ends_on: '',
  loan_note: '',
  loan_source_url: '',
  slug: '',
  name: '',
  shirt_number: '',
  position: 'mittelfeld',
  nationality: '',
  date_of_birth: '',
  joined_on: '',
  contract_until: '',
  squad_status: 'first-team',
  height_cm: '',
  preferred_foot: '',
  market_value_eur: '',
  profile_image_url: '',
  profile_image_alt: '',
  bio: '',
  profile_slogan: 'Immer\nfür Kölle.',
};

export const emptyChart: ChartFormValues = {
  chart_type: 'radar',
  sort_order: '1',
  title: '',
  description: '',
  metrics: 'Tempo: 50\nTechnik: 50\nPassspiel: 50\nDefensive: 50\nPhysis: 50',
};

export function playerToFormValues(
  player: Player,
  loans: LoanRecord[] = [],
): PlayerFormValues {
  const direction = loanDirection(player.squad_status);
  const activeLoan = direction
    ? [...loans]
        .filter(
          (loan) =>
            loan.status === 'active' && loan.direction === direction,
        )
        .sort(
          (a, b) => b.starts_on.localeCompare(a.starts_on) || b.id - a.id,
        )[0]
    : undefined;
  return {
    is_injured: player.is_injured,
    injury_since: player.injury_since ?? '',
    injury_until: player.injury_until ?? '',
    loan_partner_club: activeLoan?.partner_club ?? '',
    loan_starts_on: activeLoan?.starts_on ?? '',
    loan_ends_on: activeLoan?.ends_on ?? '',
    loan_note: activeLoan?.note ?? '',
    loan_source_url: activeLoan?.source_url ?? '',
    slug: player.slug,
    name: player.name,
    shirt_number: player.shirt_number?.toString() ?? '',
    position: player.position,
    nationality: player.nationality ?? '',
    date_of_birth: player.date_of_birth ?? '',
    joined_on: player.joined_on ?? '',
    contract_until: player.contract_until ?? '',
    squad_status: player.squad_status,
    height_cm: player.height_cm?.toString() ?? '',
    preferred_foot: player.preferred_foot ?? '',
    market_value_eur: player.market_value_eur?.toString() ?? '',
    profile_image_url: player.profile_image_url ?? '',
    profile_image_alt: player.profile_image_alt ?? '',
    bio: player.bio ?? '',
    profile_slogan: player.profile_slogan,
  };
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').trim();
}

function validHttpUrl(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function validOptionalInteger(value: string, min: number, max: number) {
  if (!value) return true;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max;
}

function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function parsePlayerForm(formData: FormData): {
  values: PlayerFormValues;
  error: string | null;
} {
  const values: PlayerFormValues = {
    is_injured: formData.get('is_injured') === 'on',
    injury_since: text(formData, 'injury_since'),
    injury_until: text(formData, 'injury_until'),
    slug: text(formData, 'slug').toLowerCase(),
    name: text(formData, 'name'),
    shirt_number: text(formData, 'shirt_number'),
    position: text(formData, 'position'),
    nationality: text(formData, 'nationality'),
    date_of_birth: text(formData, 'date_of_birth'),
    joined_on: text(formData, 'joined_on'),
    contract_until: text(formData, 'contract_until'),
    squad_status: text(formData, 'squad_status'),
    height_cm: text(formData, 'height_cm'),
    preferred_foot: text(formData, 'preferred_foot'),
    market_value_eur: text(formData, 'market_value_eur'),
    profile_image_url: text(formData, 'profile_image_url'),
    profile_image_alt: text(formData, 'profile_image_alt'),
    bio: text(formData, 'bio'),
    profile_slogan: text(formData, 'profile_slogan'),
    loan_partner_club: text(formData, 'loan_partner_club'),
    loan_starts_on: text(formData, 'loan_starts_on'),
    loan_ends_on: text(formData, 'loan_ends_on'),
    loan_note: text(formData, 'loan_note'),
    loan_source_url: text(formData, 'loan_source_url'),
  };

  if (values.is_injured) {
    if (!validDate(values.injury_since))
      return {
        values,
        error: 'Bitte gib ein gültiges Datum für „Verletzt seit“ an.',
      };
    if (
      values.injury_until &&
      (!validDate(values.injury_until) ||
        values.injury_until < values.injury_since)
    )
      return {
        values,
        error:
          'Das voraussichtliche Ende muss ein gültiges Datum am oder nach dem Verletzungsbeginn sein.',
      };
  }

  const loanActive = loanDirection(values.squad_status) !== null;
  if (loanActive) {
    if (
      values.loan_partner_club.length < 2 ||
      values.loan_partner_club.length > 120
    )
      return {
        values,
        error: 'Bitte gib den Leihverein an (2 bis 120 Zeichen).',
      };
    if (!validDate(values.loan_starts_on))
      return {
        values,
        error: 'Bitte gib ein gültiges Datum für den Leihbeginn an.',
      };
    if (
      values.loan_ends_on &&
      (!validDate(values.loan_ends_on) ||
        values.loan_ends_on < values.loan_starts_on)
    )
      return {
        values,
        error:
          'Das Leihende muss ein gültiges Datum am oder nach dem Leihbeginn sein.',
      };
  }
  if (values.loan_note.length > 500)
    return {
      values,
      error: 'Die Notiz zur Leihe darf höchstens 500 Zeichen lang sein.',
    };
  if (values.loan_source_url && !validHttpUrl(values.loan_source_url))
    return {
      values,
      error: 'Die Quellen-URL muss mit http:// oder https:// beginnen.',
    };

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug))
    return { values, error: 'Der Slug ist ungültig.' };
  if (values.name.length < 2 || values.name.length > 120)
    return {
      values,
      error: 'Der Name muss zwischen 2 und 120 Zeichen lang sein.',
    };
  if (!validOptionalInteger(values.shirt_number, 1, 99))
    return { values, error: 'Die Rückennummer muss zwischen 1 und 99 liegen.' };
  if (!playerPositions.some(({ value }) => value === values.position))
    return { values, error: 'Bitte wähle eine gültige Position.' };
  if (!squadStatuses.some(({ value }) => value === values.squad_status))
    return { values, error: 'Bitte wähle einen gültigen Kaderstatus.' };
  if (!validOptionalInteger(values.height_cm, 140, 220))
    return { values, error: 'Die Größe muss zwischen 140 und 220 cm liegen.' };
  if (
    values.preferred_foot &&
    !preferredFeet.includes(values.preferred_foot as never)
  )
    return { values, error: 'Bitte wähle einen gültigen starken Fuß.' };
  if (!validOptionalInteger(values.market_value_eur, 0, 1_000_000_000))
    return {
      values,
      error: 'Der Marktwert muss eine positive ganze Zahl sein.',
    };
  if (values.profile_image_url && !validHttpUrl(values.profile_image_url))
    return {
      values,
      error: 'Die Bild-URL muss mit http:// oder https:// beginnen.',
    };
  if (Boolean(values.profile_image_url) !== Boolean(values.profile_image_alt))
    return {
      values,
      error: 'Zum Profilbild werden URL und Alternativtext benötigt.',
    };
  if (values.bio && (values.bio.length < 10 || values.bio.length > 2000))
    return {
      values,
      error: 'Der Redaktionstext muss zwischen 10 und 2.000 Zeichen lang sein.',
    };
  if (values.profile_slogan.length < 3 || values.profile_slogan.length > 120)
    return {
      values,
      error: 'Der Profil-Slogan muss zwischen 3 und 120 Zeichen lang sein.',
    };
  if (
    values.joined_on &&
    values.contract_until &&
    values.contract_until < values.joined_on
  )
    return {
      values,
      error: 'Das Vertragsende darf nicht vor dem Beitritt liegen.',
    };

  return { values, error: null };
}

/**
 * Vergleicht zwei Profil-Formwerte Feld für Feld. Wird für den unsichtbaren
 * Autosave genutzt, damit nur tatsächlich geänderte Profile geschrieben
 * werden (kein unnötiges updated_at).
 */
export function playerFormValuesEqual(
  a: PlayerFormValues,
  b: PlayerFormValues,
): boolean {
  return (Object.keys(a) as (keyof PlayerFormValues)[]).every(
    (key) => a[key] === b[key],
  );
}

export function playerPayload(values: PlayerFormValues) {
  const nullable = (value: string) => value || null;
  const number = (value: string) => (value ? Number(value) : null);
  return {
    is_injured: values.is_injured,
    injury_since: values.is_injured ? nullable(values.injury_since) : null,
    injury_until: values.is_injured ? nullable(values.injury_until) : null,
    slug: values.slug,
    name: values.name,
    shirt_number: number(values.shirt_number),
    position: values.position,
    nationality: nullable(values.nationality),
    date_of_birth: nullable(values.date_of_birth),
    joined_on: nullable(values.joined_on),
    contract_until: nullable(values.contract_until),
    squad_status: values.squad_status,
    height_cm: number(values.height_cm),
    preferred_foot: nullable(values.preferred_foot),
    market_value_eur: number(values.market_value_eur),
    profile_image_url: nullable(values.profile_image_url),
    profile_image_alt: nullable(values.profile_image_alt),
    bio: nullable(values.bio),
    profile_slogan: values.profile_slogan,
    updated_at: new Date().toISOString(),
  };
}

export function loanPayload(values: PlayerFormValues) {
  const direction = loanDirection(values.squad_status);
  if (!direction) return null;
  const nullable = (value: string) => value || null;
  return {
    direction,
    partner_club: values.loan_partner_club,
    starts_on: values.loan_starts_on,
    ends_on: nullable(values.loan_ends_on),
    note: nullable(values.loan_note),
    source_url: nullable(values.loan_source_url),
    status: 'active',
    updated_at: new Date().toISOString(),
  };
}

export function parseChartForm(formData: FormData): {
  values: ChartFormValues;
  metrics: { label: string; value: number }[];
  chartType: 'radar' | 'bar' | null;
  sortOrder: number | null;
  error: string | null;
} {
  const values = {
    chart_type: text(formData, 'chart_type') || 'radar',
    sort_order: text(formData, 'chart_sort_order') || '1',
    title: text(formData, 'chart_title'),
    description: text(formData, 'chart_description'),
    metrics: text(formData, 'chart_metrics'),
  };
  const lines = values.metrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const metrics = lines.map((line) => {
    const match = /^(.*?):\s*(\d{1,3})$/.exec(line);
    return { label: match?.[1].trim() ?? '', value: Number(match?.[2] ?? NaN) };
  });
  const placement = parseChartPlacement(formData);

  if (placement.error)
    return {
      values,
      metrics,
      chartType: placement.chartType,
      sortOrder: placement.sortOrder,
      error: placement.error,
    };

  if (values.title.length < 3 || values.title.length > 120)
    return {
      values,
      metrics,
      chartType: placement.chartType,
      sortOrder: placement.sortOrder,
      error: 'Der Charttitel muss zwischen 3 und 120 Zeichen lang sein.',
    };
  if (values.description.length > 300)
    return {
      values,
      metrics,
      chartType: placement.chartType,
      sortOrder: placement.sortOrder,
      error: 'Die Chartbeschreibung darf höchstens 300 Zeichen lang sein.',
    };
  let metricsError: string | null = null;
  if (metrics.length < 3 || metrics.length > 10) {
    metricsError = `Das Diagramm benötigt 3 bis 10 Kennzahlen; aktuell sind es ${metrics.length}. Trage jede Kennzahl in eine eigene Zeile ein, zum Beispiel „Tempo: 82“. `;
  } else {
    const invalidIndex = metrics.findIndex(
      (metric) =>
        !metric.label ||
        metric.label.length > 30 ||
        !Number.isInteger(metric.value) ||
        metric.value < 0 ||
        metric.value > 100,
    );
    if (invalidIndex !== -1) {
      metricsError = `Zeile ${invalidIndex + 1} („${lines[invalidIndex]}“) ist ungültig. Verwende „Bezeichnung: Zahl“, zum Beispiel „Tempo: 82“. Die Bezeichnung muss 1 bis 30 Zeichen lang sein. Erlaubt sind nur ganze Zahlen von 0 bis 100 ohne Prozentzeichen (%), Dezimalstellen oder andere Zusätze.`;
    }
  }
  if (metricsError) {
    return {
      values,
      metrics,
      chartType: placement.chartType,
      sortOrder: placement.sortOrder,
      error: `Diagramm kann nicht hinzugefügt werden: ${metricsError.trim()}`,
    };
  }
  return {
    values,
    metrics,
    chartType: placement.chartType,
    sortOrder: placement.sortOrder,
    error: null,
  };
}

export function parseChartPlacement(formData: FormData): {
  chartType: 'radar' | 'bar' | null;
  sortOrder: number | null;
  error: string | null;
} {
  const chartTypeValue = text(formData, 'chart_type') || 'radar';
  const sortOrderValue = text(formData, 'chart_sort_order') || '1';
  const chartType = isPlayerChartType(chartTypeValue) ? chartTypeValue : null;
  const sortOrder = Number(sortOrderValue);

  if (!chartType)
    return {
      chartType,
      sortOrder: null,
      error: 'Bitte wähle einen gültigen Grafiktyp aus.',
    };
  if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 32_767)
    return {
      chartType,
      sortOrder: null,
      error: 'Die Anzeigeposition muss eine ganze Zahl ab 1 sein.',
    };

  return { chartType, sortOrder, error: null };
}

export function parseOptionalChartForm(formData: FormData) {
  const hasDraft = ['chart_title', 'chart_description', 'chart_metrics'].some(
    (name) => text(formData, name) !== '',
  );
  return hasDraft ? parseChartForm(formData) : null;
}
