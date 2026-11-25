import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { PlayerMatchRating } from './admin-player-history';

type Client = SupabaseClient<Database>;

/** Ein Wechsel im Spielformular: Minute, ausgewechselter und eingewechselter Spieler. */
export interface MatchSubstitutionInput {
  minute: number;
  out: number;
  in: number;
}

/** Komplette Aufstellungs-Auswahl aus dem Spielformular. */
export interface LineupSelection {
  starterIds: number[];
  benchIds: number[];
  substitutions: MatchSubstitutionInput[];
}

/** Maximale Wechsel pro Spiel im Formular (Regelwerk üblich: 5). */
export const MAX_SUBSTITUTIONS = 5;

/** Reguläre Spieldauer — Basis für die automatisch berechneten Spielminuten. */
const MATCH_DURATION_MINUTES = 90;

function parseIdList(form: FormData, field: string): number[] {
  return [
    ...new Set(
      form
        .getAll(field)
        .map((value) => Number(String(value)))
        .filter((id) => Number.isSafeInteger(id) && id >= 1),
    ),
  ];
}

/**
 * Liest die im Spielformular angehakten Startelf-Spieler-IDs
 * (Mehrfachfeld „starters“) als gültige IDs aus.
 */
export function parseStarterIds(form: FormData): number[] {
  return parseIdList(form, 'starters');
}

/**
 * Liest die im Spielformular angehakten Bank-Spieler-IDs
 * (Mehrfachfeld „bench“) als gültige IDs aus.
 */
export function parseBenchIds(form: FormData): number[] {
  return parseIdList(form, 'bench');
}

/**
 * Liest die Wechsel-Zeilen des Spielformulars (parallele Felder
 * „sub_minute“, „sub_out“, „sub_in“). Komplett leere Zeilen werden
 * übersprungen; unvollständige oder ungültige Zeilen melden einen Fehler.
 */
export function parseSubstitutions(form: FormData): {
  subs: MatchSubstitutionInput[];
  error: string | null;
} {
  const minutes = form.getAll('sub_minute');
  const outs = form.getAll('sub_out');
  const ins = form.getAll('sub_in');
  const rowCount = Math.max(minutes.length, outs.length, ins.length);
  const subs: MatchSubstitutionInput[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const rawMinute = String(minutes[i] ?? '').trim();
    const rawOut = String(outs[i] ?? '').trim();
    const rawIn = String(ins[i] ?? '').trim();
    if (!rawMinute && !rawOut && !rawIn) continue;
    const minute = Number(rawMinute);
    const out = Number(rawOut);
    const inPlayer = Number(rawIn);
    if (!Number.isInteger(minute) || minute < 1 || minute > 120)
      return {
        subs: [],
        error:
          'Die Wechselminute muss eine ganze Zahl zwischen 1 und 120 sein.',
      };
    if (
      !Number.isSafeInteger(out) ||
      out < 1 ||
      !Number.isSafeInteger(inPlayer) ||
      inPlayer < 1
    )
      return {
        subs: [],
        error:
          'Bitte wähle für jeden Wechsel sowohl den ausgewechselten als auch den eingewechselten Spieler aus.',
      };
    if (out === inPlayer)
      return {
        subs: [],
        error: 'Ein Spieler kann nicht für sich selbst ausgewechselt werden.',
      };
    subs.push({ minute, out, in: inPlayer });
  }
  if (subs.length > MAX_SUBSTITUTIONS)
    return {
      subs: [],
      error: `Pro Spiel sind höchstens ${MAX_SUBSTITUTIONS} Wechsel möglich.`,
    };
  return { subs, error: null };
}

/**
 * Prüft die Aufstellungs-Auswahl gegen den Kader: Startelf und Bank dürfen
 * sich nicht überschneiden, verletzte Spieler dürfen nicht aufgestellt werden,
 * ein Wechsel braucht einen Stammspieler („raus“) und einen Bank-Spieler
 * („rein“), und kein Spieler wird mehrfach ausgewechselt. Gibt eine
 * Fehlermeldung zurück oder null bei Gültigkeit.
 */
export function validateLineupSelection(
  selection: LineupSelection,
  squad: { id: number; name: string; is_injured?: boolean }[],
): string | null {
  const nameOf = (id: number) =>
    squad.find((player) => player.id === id)?.name ?? `Spieler ${id}`;
  const starterSet = new Set(selection.starterIds);
  const benchSet = new Set(selection.benchIds);
  for (const id of [...selection.starterIds, ...selection.benchIds]) {
    if (squad.find((player) => player.id === id)?.is_injured)
      return `${nameOf(id)} ist als verletzt markiert und kann nicht aufgestellt werden.`;
  }
  for (const id of selection.benchIds) {
    if (starterSet.has(id))
      return `${nameOf(id)} kann nicht gleichzeitig in der Startelf und auf der Bank stehen.`;
  }
  const outSeen = new Set<number>();
  const inSeen = new Set<number>();
  for (const sub of selection.substitutions) {
    if (!starterSet.has(sub.out))
      return `${nameOf(sub.out)} wurde ausgewechselt, steht aber nicht in der Startelf.`;
    if (!benchSet.has(sub.in))
      return `${nameOf(sub.in)} wurde eingewechselt, steht aber nicht auf der Bank.`;
    if (outSeen.has(sub.out))
      return `${nameOf(sub.out)} wurde mehrfach ausgewechselt.`;
    if (inSeen.has(sub.in))
      return `${nameOf(sub.in)} wurde mehrfach eingewechselt.`;
    outSeen.add(sub.out);
    inSeen.add(sub.in);
  }
  return null;
}

/**
 * Prüft die Aufstellungs-Auswahl gegen bestehende Verlaufseinträge: Ein
 * Spieler mit redaktionell gepflegten Toren/Vorlagen darf nicht auf die Bank
 * gesetzt werden (DB-Constraint player_match_ratings_benched_clean_check
 * verlangt goals = 0 und assists = 0). Eingewechselte Spieler sind ausgenommen
 * — für „subbed_in“ sind Tore/Vorlagen erlaubt. Gibt eine Fehlermeldung mit
 * Spielernamen zurück oder null.
 */
export function findLineupConflict(
  existing: PlayerMatchRating[],
  selection: LineupSelection,
  squad: { id: number; name: string }[] = [],
): string | null {
  const existingByPlayer = new Map(
    existing.map((rating) => [rating.player_id, rating]),
  );
  const subbedInIds = new Set(selection.substitutions.map((sub) => sub.in));
  for (const id of selection.benchIds) {
    if (subbedInIds.has(id)) continue;
    const current = existingByPlayer.get(id);
    if (current && (current.goals > 0 || current.assists > 0)) {
      const name =
        squad.find((player) => player.id === id)?.name ?? `Spieler ${id}`;
      return `${name} hat in diesem Spiel Tore oder Vorlagen eingetragen und kann nicht auf die Bank gesetzt werden. Bitte entferne die Tore/Vorlagen zuerst im Spielerprofil.`;
    }
  }
  return null;
}

/**
 * Ein automatisch angelegter Verlaufseintrag ohne redaktionelle Daten
 * (keine Note, keine Tore/Vorlagen, kein Freitext). Status, Spielminuten und
 * Wechselminute sind davon abgeleitet und zählen nicht als redaktionell —
 * solche Einträge darf das Spielformular frei anlegen, ändern und entfernen.
 */
function isAutoEntry(rating: PlayerMatchRating): boolean {
  return (
    rating.rating === null &&
    (rating.note === null || rating.note === '') &&
    rating.goals === 0 &&
    rating.assists === 0
  );
}

interface DesiredEntry {
  status: PlayerMatchRating['status'];
  subMinute: number | null;
  substitutedBy: number | null;
  minutesPlayed: number | null;
}

/** Gewünschter Zustand pro Spieler aus der Aufstellungs-Auswahl. */
function desiredEntries(selection: LineupSelection): Map<number, DesiredEntry> {
  const subByOut = new Map(
    selection.substitutions.map((sub) => [sub.out, sub]),
  );
  const subByIn = new Map(selection.substitutions.map((sub) => [sub.in, sub]));
  const desired = new Map<number, DesiredEntry>();
  for (const id of selection.starterIds) {
    const sub = subByOut.get(id);
    desired.set(
      id,
      sub
        ? {
            status: 'subbed_off',
            subMinute: sub.minute,
            substitutedBy: sub.in,
            minutesPlayed: sub.minute,
          }
        : {
            status: 'played',
            subMinute: null,
            substitutedBy: null,
            minutesPlayed: MATCH_DURATION_MINUTES,
          },
    );
  }
  for (const id of selection.benchIds) {
    const sub = subByIn.get(id);
    desired.set(
      id,
      sub
        ? {
            status: 'subbed_in',
            subMinute: sub.minute,
            substitutedBy: null,
            minutesPlayed: Math.max(1, MATCH_DURATION_MINUTES - sub.minute),
          }
        : {
            status: 'benched',
            subMinute: null,
            substitutedBy: null,
            minutesPlayed: 0,
          },
    );
  }
  return desired;
}

export interface LineupSyncPlan {
  /** anzulegen bzw. zu aktualisierende Einträge (nur strukturelle Felder). */
  toUpsert: (DesiredEntry & { player_id: number })[];
  /** unberührte Auto-Einträge abgewählter Spieler, die entfernt werden. */
  toRemove: number[];
}

/**
 * Plant die Synchronisation der Aufstellung: Der gewünschte Zustand pro
 * Spieler (Startelf, Bank, Wechsel) wird mit den vorhandenen Einträgen
 * abgeglichen. Neu angehakte Spieler bekommen einen Auto-Eintrag, Status- und
 * Wechselfelder bestehender Einträge werden angeglichen — redaktionelle Daten
 * (Note, Tore, Vorlagen, Freitext) bleiben unberührt. Abgewählte Spieler
 * verlieren ihren Eintrag nur, wenn er automatisch angelegt wurde.
 * Reine Funktion, damit sie sich ohne Datenbank testen lässt.
 */
export function planLineupSync(
  existing: PlayerMatchRating[],
  selection: LineupSelection,
): LineupSyncPlan {
  const existingByPlayer = new Map(
    existing.map((rating) => [rating.player_id, rating]),
  );
  const desired = desiredEntries(selection);
  const toUpsert: LineupSyncPlan['toUpsert'] = [];
  for (const [playerId, entry] of desired) {
    const current = existingByPlayer.get(playerId);
    if (
      !current ||
      current.status !== entry.status ||
      current.sub_minute !== entry.subMinute ||
      current.substituted_by_player_id !== entry.substitutedBy
    ) {
      toUpsert.push({ player_id: playerId, ...entry });
    }
  }
  return {
    toUpsert,
    toRemove: existing
      .filter((rating) => !desired.has(rating.player_id) && isAutoEntry(rating))
      .map((rating) => rating.player_id),
  };
}

/**
 * Synchronisiert die Aufstellung eines Spiels (Startelf, Bank, Wechsel) mit
 * den Verlaufseinträgen. Nur strukturelle Felder (Status, Spielminuten,
 * Wechselminute, Einwechselspieler) werden geschrieben; redaktionell gepflegte
 * Inhalte bleiben erhalten. Gibt eine Fehlermeldung zurück oder null bei Erfolg.
 */
export async function syncMatchLineup(
  supabase: Client,
  matchId: number,
  selection: LineupSelection,
  squad: { id: number; name: string }[] = [],
): Promise<string | null> {
  const { data: existing, error: loadError } = await supabase
    .from('player_match_ratings')
    .select('*')
    .eq('match_id', matchId);
  if (loadError)
    return 'Die vorhandenen Einträge konnten nicht geladen werden. Bitte versuche es erneut.';
  const conflict = findLineupConflict(existing ?? [], selection, squad);
  if (conflict) return conflict;
  const plan = planLineupSync(existing ?? [], selection);
  if (plan.toUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from('player_match_ratings')
      .upsert(
        plan.toUpsert.map((entry) => ({
          match_id: matchId,
          player_id: entry.player_id,
          status: entry.status,
          minutes_played: entry.minutesPlayed,
          sub_minute: entry.subMinute,
          substituted_by_player_id: entry.substitutedBy,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'match_id,player_id' },
      );
    if (upsertError)
      return 'Die Aufstellung konnte nicht gespeichert werden. Bitte versuche es erneut.';
  }
  if (plan.toRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from('player_match_ratings')
      .delete()
      .eq('match_id', matchId)
      .in('player_id', plan.toRemove);
    if (deleteError)
      return 'Die abgewählten Spieler konnten nicht entfernt werden. Bitte versuche es erneut.';
  }
  return null;
}

export interface StoredLineup {
  starterIds: number[];
  benchIds: number[];
  substitutions: MatchSubstitutionInput[];
}

/**
 * Lädt die aktuell gespeicherte Aufstellung eines Spiels, damit das Formular
 * Startelf und Bank vorab anhakt und die Wechsel mit Minute sowie raus/rein
 * vorbelegt. Wechsel werden aus den „Ausgewechselt“-Einträgen gelesen, die
 * den Einwechselspieler über substituted_by_player_id verknüpfen.
 */
export async function getMatchLineupSelection(
  supabase: Client,
  matchId: number,
): Promise<StoredLineup> {
  const { data, error } = await supabase
    .from('player_match_ratings')
    .select('player_id, status, sub_minute, substituted_by_player_id')
    .eq('match_id', matchId);
  if (error) throw error;
  const rows = data ?? [];
  const starterIds = rows
    .filter((row) => row.status === 'played' || row.status === 'subbed_off')
    .map((row) => row.player_id);
  const benchIds = rows
    .filter((row) => row.status === 'benched' || row.status === 'subbed_in')
    .map((row) => row.player_id);
  const substitutions = rows
    .filter(
      (row) =>
        row.status === 'subbed_off' &&
        row.sub_minute !== null &&
        row.substituted_by_player_id !== null,
    )
    .map((row) => ({
      minute: row.sub_minute as number,
      out: row.player_id,
      in: row.substituted_by_player_id as number,
    }))
    .sort((a, b) => a.minute - b.minute);
  return { starterIds, benchIds, substitutions };
}
