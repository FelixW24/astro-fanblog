import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { Match } from './matches';

type Client = SupabaseClient<Database>;

export type PlayerMatchRating =
  Database['public']['Tables']['player_match_ratings']['Row'];

export type MatchParticipationStatus =
  'played' | 'subbed_in' | 'subbed_off' | 'not_nominated' | 'benched';

export interface MatchRatingForm {
  matchId: number | null;
  /** Freitext-Note, zum Beispiel „2,5“. null bedeutet: keine Note vergeben. */
  rating: string | null;
  status: MatchParticipationStatus;
  /** Automatisch aus Status und Wechselminute berechnet, wird nicht eingegeben. */
  minutesPlayed: number | null;
  subMinute: number | null;
  substitutedBy: number | null;
  /** Tore des Spielers in diesem Spiel, Standardwert 0. */
  goals: number;
  /** Vorlagen des Spielers in diesem Spiel, Standardwert 0. */
  assists: number;
  note: string;
  error: string | null;
}

/** Reguläre Spieldauer in Minuten — Basis der automatischen Spielminuten. */
export const MATCH_DURATION_MINUTES = 90;

/**
 * Maximale Tore/Vorlagen pro Spiel und Spieler — gespiegelt an der
 * Datenbank-Constraint (maximales Spielergebnis 30) und im Eingabefeld.
 */
export const MAX_GOALS_PER_MATCH = 30;

/**
 * Berechnet die Spielminuten aus Nominierungsstatus und Wechselminute:
 * Stammspieler spielen die volle reguläre Zeit, wer eingewechselt wurde
 * entsprechend weniger (reguläre Spielzeit minus Einwechselminute), wer
 * ausgewechselt wurde so lange wie die Auswechselminute angibt, wer nur auf
 * der Bank war 0 Minuten. Bei „Nicht nominiert“ gibt es keine Spielminuten.
 */
export function computeMinutesPlayed(
  status: MatchParticipationStatus,
  subMinute: number | null,
): number | null {
  switch (status) {
    case 'played':
      return MATCH_DURATION_MINUTES;
    case 'subbed_in':
      return subMinute === null ? null : MATCH_DURATION_MINUTES - subMinute;
    case 'subbed_off':
      return subMinute;
    case 'benched':
      return 0;
    case 'not_nominated':
      return null;
  }
}

function optionalInteger(value: string, min: number, max: number) {
  if (!value) return { ok: true as const, number: null as number | null };
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max)
    return { ok: false as const, number: null as number | null };
  return { ok: true as const, number };
}

/**
 * Tore/Vorlagen pro Spiel: leeres Feld bedeutet Standardwert 0, sonst muss es
 * eine ganze Zahl zwischen 0 und MAX_GOALS_PER_MATCH sein.
 */
function statCount(value: string, label: string) {
  const raw = value.trim();
  if (!raw) return { ok: true as const, number: 0 };
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 0 || number > MAX_GOALS_PER_MATCH)
    return {
      ok: false as const,
      number: 0,
      error: `${label} muss eine ganze Zahl zwischen 0 und ${MAX_GOALS_PER_MATCH} sein.`,
    };
  return { ok: true as const, number };
}

/**
 * Kern-Parser für einen Verlaufseintrag. `get` liest ein Feld anhand seines
 * (ggf. namensraumierten) Namens — so kann derselbe Parser sowohl die
 * Einzel-Form (action=„match-rating“) als auch die Sammel-Form des
 * Spielerprofils (Felder „match_<id>_<feld>“) bedienen.
 */
function parseRatingFields(
  get: (name: string) => FormDataEntryValue | null,
): MatchRatingForm {
  const rawId = String(get('match_id') ?? '').trim();
  const matchId = Number(rawId);
  const rating = String(get('rating') ?? '').trim();
  const rawSubMinute = String(get('sub_minute') ?? '').trim();
  const rawSubstitutedBy = String(get('substituted_by') ?? '').trim();
  const rawGoals = String(get('goals') ?? '');
  const rawAssists = String(get('assists') ?? '');
  const note = String(get('note') ?? '').trim();
  const subbedIn = get('status_subbed_in') === 'on';
  const benched = get('status_benched') === 'on';
  const subbedOff = get('status_subbed_off') === 'on';
  const notNominated = get('status_not_nominated') === 'on';

  const base = {
    matchId: null,
    rating: null,
    status: 'played' as MatchParticipationStatus,
    minutesPlayed: null,
    subMinute: null,
    substitutedBy: null,
    goals: 0,
    assists: 0,
    note,
  };

  if (!Number.isSafeInteger(matchId) || matchId < 1)
    return { ...base, error: 'Bitte wähle ein Spiel aus.' };

  const checked = [subbedIn, benched, subbedOff, notNominated].filter(
    Boolean,
  ).length;
  if (checked > 1)
    return {
      ...base,
      matchId,
      error:
        'Bitte wähle nur eine Option: „Eingewechselt“, „Bank“, „Ausgewechselt“ oder „Nicht nominiert“.',
    };

  const status: MatchParticipationStatus = notNominated
    ? 'not_nominated'
    : subbedOff
      ? 'subbed_off'
      : subbedIn
        ? 'subbed_in'
        : benched
          ? 'benched'
          : 'played';

  const subMinute = optionalInteger(rawSubMinute, 1, 120);
  if (!subMinute.ok)
    return {
      ...base,
      matchId,
      status,
      error: 'Die Wechselminute muss eine ganze Zahl zwischen 1 und 120 sein.',
    };

  const substituted = optionalInteger(
    rawSubstitutedBy,
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (!substituted.ok)
    return {
      ...base,
      matchId,
      status,
      subMinute: subMinute.number,
      error: 'Bitte wähle einen gültigen Einwechselspieler aus.',
    };

  // Tore und Vorlagen: leeres Feld ist der Standardwert 0.
  const goals = statCount(rawGoals, 'Die Tore');
  if (!goals.ok) return { ...base, matchId, status, error: goals.error };
  const assists = statCount(rawAssists, 'Die Vorlagen');
  if (!assists.ok)
    return {
      ...base,
      matchId,
      status,
      goals: goals.number,
      error: assists.error,
    };

  if (rating && rating.length > 20)
    return {
      ...base,
      matchId,
      status,
      goals: goals.number,
      assists: assists.number,
      error: 'Die Note darf höchstens 20 Zeichen lang sein.',
    };

  if (
    status === 'not_nominated' &&
    (rating ||
      rawSubMinute ||
      rawSubstitutedBy ||
      goals.number > 0 ||
      assists.number > 0)
  )
    return {
      ...base,
      matchId,
      status,
      goals: goals.number,
      assists: assists.number,
      error:
        'Bei „Nicht nominiert“ werden keine Note, Wechselminute, kein Einwechselspieler sowie keine Tore oder Vorlagen erfasst.',
    };

  if (status === 'played' && (rawSubMinute || rawSubstitutedBy))
    return {
      ...base,
      matchId,
      status,
      goals: goals.number,
      assists: assists.number,
      error:
        'Wechselminute und Einwechselspieler sind nur bei „Eingewechselt“ oder „Ausgewechselt“ möglich.',
    };

  if (status === 'subbed_in' && rawSubstitutedBy)
    return {
      ...base,
      matchId,
      status,
      subMinute: subMinute.number,
      goals: goals.number,
      assists: assists.number,
      error: 'Beim Einwechseln wird kein Einwechselspieler erfasst.',
    };

  if ((status === 'subbed_in' || status === 'subbed_off') && !rawSubMinute)
    return {
      ...base,
      matchId,
      status,
      goals: goals.number,
      assists: assists.number,
      error:
        status === 'subbed_in'
          ? 'Bitte trage die Einwechselminute ein, wenn „Eingewechselt“ ausgewählt ist.'
          : 'Bitte trage die Auswechselminute ein, wenn „Ausgewechselt“ ausgewählt ist.',
    };

  if (status === 'subbed_off' && !rawSubstitutedBy)
    return {
      ...base,
      matchId,
      status,
      subMinute: subMinute.number,
      goals: goals.number,
      assists: assists.number,
      error:
        'Bitte wähle aus dem Kader aus, für wen der Spieler ausgewechselt wurde.',
    };

  if (
    status === 'benched' &&
    (rawSubMinute || rawSubstitutedBy || goals.number > 0 || assists.number > 0)
  )
    return {
      ...base,
      matchId,
      status,
      goals: goals.number,
      assists: assists.number,
      error:
        'Bei „Bank“ werden keine Wechselminute, kein Einwechselspieler sowie keine Tore oder Vorlagen erfasst.',
    };

  // Spielminuten werden automatisch aus Status und Wechselminute berechnet:
  // Stammspieler 90 Min, eingewechselt 90 − Einwechselminute, ausgewechselt
  // so viele Minuten wie die Auswechselminute, Bank 0 Min.
  let minutesPlayed = computeMinutesPlayed(status, subMinute.number);
  if (status === 'subbed_in' && minutesPlayed !== null && minutesPlayed < 1)
    return {
      ...base,
      matchId,
      status,
      subMinute: subMinute.number,
      goals: goals.number,
      assists: assists.number,
      error: `Die Einwechselminute muss zwischen 1 und ${MATCH_DURATION_MINUTES - 1} liegen, damit Spielminuten übrig bleiben.`,
    };

  // Ganz leerer Eintrag ohne Status-Haken, Note, Notiz und ohne Tore oder
  // Vorlagen: keine Spielminuten mittragen, damit nicht gepflegte Spiele
  // keinen Verlaufseintrag erhalten.
  if (
    status === 'played' &&
    !rating &&
    !rawSubMinute &&
    !rawSubstitutedBy &&
    !note &&
    goals.number === 0 &&
    assists.number === 0
  )
    minutesPlayed = null;

  if (note.length > 500)
    return {
      ...base,
      matchId,
      status,
      rating: rating || null,
      minutesPlayed,
      subMinute: subMinute.number,
      substitutedBy: substituted.number,
      goals: goals.number,
      assists: assists.number,
      error: 'Die Notiz darf höchstens 500 Zeichen lang sein.',
    };

  return {
    matchId,
    rating: rating || null,
    status,
    minutesPlayed,
    subMinute: subMinute.number,
    substitutedBy: substituted.number,
    goals: goals.number,
    assists: assists.number,
    note,
    error: null,
  };
}

export function parseMatchRatingForm(formData: FormData): MatchRatingForm {
  return parseRatingFields((name) => formData.get(name));
}

/**
 * Feldname eines Verlaufseintrags innerhalb der zentralen Profilsammel-Form,
 * zum Beispiel „match_42_rating“.
 */
export function matchEntryField(matchId: number, field: string): string {
  return `match_${matchId}_${field}`;
}

/**
 * Parst den Verlaufseintrag eines einzelnen Spiels aus der zentralen
 * Profilsammel-Form. Die Spiel-ID steckt im Feldnamen-Präfix, nicht in einem
 * eigenen „match_id“-Feld.
 */
export function parseMatchRatingEntry(
  formData: FormData,
  matchId: number,
): MatchRatingForm {
  const prefix = `match_${matchId}_`;
  return parseRatingFields((name) =>
    name === 'match_id' ? String(matchId) : formData.get(prefix + name),
  );
}

/**
 * Prüft, ob sich ein eingereichter Verlaufseintrag gegenüber dem gespeicherten
 * Stand geändert hat. Nur geänderte Einträge werden gespeichert.
 */
export function matchEntryChanged(
  current: MatchHistoryEntry,
  parsed: MatchRatingForm,
): boolean {
  return (
    (current.rating ?? null) !== (parsed.rating ?? null) ||
    current.status !== parsed.status ||
    (current.minutesPlayed ?? null) !== (parsed.minutesPlayed ?? null) ||
    (current.subMinute ?? null) !== (parsed.subMinute ?? null) ||
    (current.substitutedBy ?? null) !== (parsed.substitutedBy ?? null) ||
    (current.goals ?? 0) !== parsed.goals ||
    (current.assists ?? 0) !== parsed.assists ||
    (current.note ?? '') !== parsed.note
  );
}

export interface MatchRatingBatchResult {
  /** Anzahl erfolgreich gespeicherter (Upsert) Einträge. */
  saved: number;
  /** Anzahl entfernter Einträge (leere Eingabe). */
  removed: number;
  /** Validierungs- oder Speicherfehler je Spiel-ID. */
  errors: { matchId: number; error: string }[];
}

function isEmptyRating(parsed: MatchRatingForm): boolean {
  return (
    parsed.rating === null &&
    parsed.status === 'played' &&
    parsed.minutesPlayed === null &&
    parsed.subMinute === null &&
    parsed.substitutedBy === null &&
    parsed.goals === 0 &&
    parsed.assists === 0 &&
    parsed.note === ''
  );
}

/**
 * Speichert alle Verlaufseinträge aus der Sammel-Form, die sich gegenüber dem
 * aktuellen Stand geändert haben. Unveränderte Einträge (auch solche mit
 * Validierungsfehler im Altbestand) werden übersprungen; geänderte Einträge
 * mit Fehler landen in `errors` und werden nicht gespeichert.
 */
export async function saveChangedMatchRatings(
  supabase: Client,
  playerId: number,
  currentEntries: MatchHistoryEntry[],
  parsedEntries: MatchRatingForm[],
): Promise<MatchRatingBatchResult> {
  const currentByMatch = new Map(
    currentEntries.map((entry) => [entry.match.id, entry]),
  );
  const result: MatchRatingBatchResult = { saved: 0, removed: 0, errors: [] };
  for (const parsed of parsedEntries) {
    const matchId = parsed.matchId;
    if (!matchId) continue;
    const current = currentByMatch.get(matchId);
    const empty = isEmptyRating(parsed);
    if (!current && empty) continue;
    if (current && !matchEntryChanged(current, parsed)) continue;
    if (parsed.error) {
      result.errors.push({ matchId, error: parsed.error });
      continue;
    }
    const error = await saveMatchRating(supabase, playerId, {
      matchId,
      rating: parsed.rating,
      status: parsed.status,
      minutesPlayed: parsed.minutesPlayed,
      subMinute: parsed.subMinute,
      substitutedBy: parsed.substitutedBy,
      goals: parsed.goals,
      assists: parsed.assists,
      note: parsed.note,
    });
    if (error) result.errors.push({ matchId, error });
    else if (empty) result.removed += 1;
    else result.saved += 1;
  }
  return result;
}

export interface MatchHistoryEntry {
  match: Match;
  rating: string | null;
  status: MatchParticipationStatus;
  minutesPlayed: number | null;
  subMinute: number | null;
  substitutedBy: number | null;
  /** Tore des Spielers in diesem Spiel (0, wenn nicht erfasst). */
  goals: number;
  /** Vorlagen des Spielers in diesem Spiel (0, wenn nicht erfasst). */
  assists: number;
  note: string | null;
}

/**
 * Baut den Spielverlauf eines Spielers: vergangene, nicht abgesagte Spiele
 * des Vereins (neueste zuerst), jeweils angereichert um Nominierungsstatus,
 * individuelle Leistungsnote, Spielminuten, Wechselminute, Einwechselspieler
 * sowie Tore und Vorlagen (Standardwert 0, wenn nicht erfasst).
 */
export function mergePlayerMatchHistory(
  matches: Match[],
  ratings: PlayerMatchRating[],
  now: Date = new Date(),
): MatchHistoryEntry[] {
  const ratingByMatch = new Map(
    ratings.map((rating) => [rating.match_id, rating]),
  );
  return matches
    .filter(
      (match) =>
        !match.cancelled &&
        match.kickoff_at !== null &&
        new Date(match.kickoff_at) <= now,
    )
    .sort(
      (a, b) =>
        (b.kickoff_at ?? '').localeCompare(a.kickoff_at ?? '') || b.id - a.id,
    )
    .map((match) => {
      const rating = ratingByMatch.get(match.id);
      return {
        match,
        rating: rating?.rating ?? null,
        status: (rating?.status ?? 'played') as MatchParticipationStatus,
        minutesPlayed: rating?.minutes_played ?? null,
        subMinute: rating?.sub_minute ?? null,
        substitutedBy: rating?.substituted_by_player_id ?? null,
        goals: rating?.goals ?? 0,
        assists: rating?.assists ?? 0,
        note: rating?.note ?? null,
      };
    });
}

export type MatchGradeTone =
  'excellent' | 'good' | 'neutral' | 'warn' | 'poor' | 'bad' | 'none';

/**
 * Liest die Note auf der 0-bis-10-Skala aus einer Freitext-Note, zum Beispiel
 * „7,5“ oder „9+“. Ohne erkennbare Zahl zwischen 0 und 10 bleibt es null.
 */
export function matchGradeValue(rating: string | null): number | null {
  if (!rating) return null;
  const match = /(?:10|[0-9])(?:[.,]\d+)?/.exec(rating);
  if (!match) return null;
  return Math.min(10, Number(match[0].replace(',', '.')));
}

/**
 * Leitet den Farbton aus einer Freitext-Note auf der 0-bis-10-Skala ab
 * (höher ist besser): 8-10 dunkelgrün, 7-7,9 hellgrün, 6,5-6,9 neutral grau,
 * 6-6,4 orange, 5-5,9 hellrot, unter 5 dunkelrot. Ohne erkennbare Zahl
 * bleibt es neutral.
 */
export function matchGradeTone(rating: string): MatchGradeTone {
  const value = matchGradeValue(rating);
  if (value === null) return 'none';
  if (value >= 8) return 'excellent';
  if (value >= 7) return 'good';
  if (value >= 6.5) return 'neutral';
  if (value >= 6) return 'warn';
  if (value >= 5) return 'poor';
  return 'bad';
}

export function participationLabel(status: MatchParticipationStatus): string {
  if (status === 'subbed_in') return 'Eingewechselt';
  if (status === 'benched') return 'Bank';
  if (status === 'subbed_off') return 'Ausgewechselt';
  if (status === 'not_nominated') return 'Nicht nominiert';
  return 'Im Einsatz';
}

export function substitutionLabel(
  status: MatchParticipationStatus,
  minute: number,
): string {
  return status === 'subbed_off'
    ? `ausgewechselt ${minute}.`
    : `eingewechselt ${minute}.`;
}

export function formatMinutes(minutes: number): string {
  return `${minutes} Min`;
}

export function formatHistoryKickoff(kickoffAt: string): string {
  return (
    new Intl.DateTimeFormat('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    }).format(new Date(kickoffAt)) + ' Uhr'
  );
}

export interface MatchRatingInput {
  matchId: number;
  rating: string | null;
  status: MatchParticipationStatus;
  minutesPlayed: number | null;
  subMinute: number | null;
  substitutedBy: number | null;
  goals: number;
  assists: number;
  note: string;
}

/**
 * Speichert den Verlaufseintrag eines Spielers für ein Spiel (Upsert) oder
 * entfernt ihn, wenn weder Note noch Status noch Notiz hinterlegt sind.
 * Gibt eine Fehlermeldung zurück oder null bei Erfolg.
 */
export async function saveMatchRating(
  supabase: Client,
  playerId: number,
  input: MatchRatingInput,
): Promise<string | null> {
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('id, cancelled')
    .eq('id', input.matchId)
    .maybeSingle();
  if (matchError)
    return 'Das Spiel konnte nicht geladen werden. Bitte versuche es erneut.';
  if (!match) return 'Das Spiel wurde nicht gefunden.';
  if (match.cancelled)
    return 'Für abgesagte Spiele kann kein Eintrag gepflegt werden.';

  if (input.substitutedBy !== null) {
    if (input.substitutedBy === playerId)
      return 'Der Einwechselspieler darf nicht der Spieler selbst sein.';
    const { data: replacement, error: replacementError } = await supabase
      .from('players')
      .select('id')
      .eq('id', input.substitutedBy)
      .maybeSingle();
    if (replacementError)
      return 'Der Einwechselspieler konnte nicht geprüft werden. Bitte versuche es erneut.';
    if (!replacement)
      return 'Der ausgewählte Einwechselspieler wurde nicht gefunden.';
  }

  const isEmpty =
    input.rating === null &&
    input.status === 'played' &&
    input.minutesPlayed === null &&
    input.subMinute === null &&
    input.substitutedBy === null &&
    input.goals === 0 &&
    input.assists === 0 &&
    input.note === '';

  if (isEmpty) {
    const { error } = await supabase
      .from('player_match_ratings')
      .delete()
      .eq('match_id', input.matchId)
      .eq('player_id', playerId);
    if (error)
      return 'Der Eintrag konnte nicht entfernt werden. Bitte versuche es erneut.';
    return null;
  }

  const { error } = await supabase.from('player_match_ratings').upsert(
    {
      match_id: input.matchId,
      player_id: playerId,
      rating: input.rating,
      status: input.status,
      minutes_played: input.minutesPlayed,
      sub_minute: input.subMinute,
      substituted_by_player_id: input.substitutedBy,
      goals: input.goals,
      assists: input.assists,
      note: input.note || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'match_id,player_id' },
  );
  if (error)
    return 'Der Eintrag konnte nicht gespeichert werden. Bitte versuche es erneut.';
  return null;
}
