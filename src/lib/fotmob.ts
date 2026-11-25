import type { MatchFormValues } from './matches';

/**
 * Import von Basisdaten (Ergebnis und Statistiken) aus einem FotMob-Link.
 * FotMob bietet eine undokumentierte, aber stabile JSON-API unter
 * https://www.fotmob.com/api/matches?id=<matchId>. Die Match-ID steckt in
 * FotMob-URLs als Fragment („…/team-a-vs-team-b#4393680“), als numerischer
 * Pfad oder als „id“-Parameter; eine reine ID wird ebenfalls akzeptiert.
 */

/** Ergebnis eines FotMob-Imports: „for“/„against“ aus Sicht des FC Example. */
export interface FotMobImport {
  homeGoals: number | null;
  awayGoals: number | null;
  stats: Partial<
    Pick<
      MatchFormValues,
      | 'possession_pct'
      | 'xg_for'
      | 'xg_against'
      | 'shots_for'
      | 'shots_against'
      | 'shots_on_target_for'
      | 'shots_on_target_against'
      | 'corners_for'
      | 'corners_against'
      | 'fouls_for'
      | 'fouls_against'
      | 'yellow_cards_for'
      | 'yellow_cards_against'
      | 'red_cards_for'
      | 'red_cards_against'
    >
  >;
}

// Aktuelle öffentliche JSON-API von FotMob (Stand 2026): Basis /api/data/,
// Match-Details unter matchDetails?matchId=<id>. Die alte Route
// /api/matches?id= liefert inzwischen 404 und dient nur noch als Fallback.
const FOTMOB_API_ROUTES = [
  (id: string) => `https://www.fotmob.com/api/data/matchDetails?matchId=${id}`,
  (id: string) => `https://www.fotmob.com/api/matches?id=${id}`,
];

/**
 * Extrahiert die numerische Match-ID aus einer FotMob-URL oder einer reinen
 * ID. Akzeptiert z. B. „https://www.fotmob.com/matches/example-vs-hamburg/ab12cd#4393680",
 * „…/matches/4393680/…“, „…?id=4393680“ und „4393680“. Sonst null.
 */
export function parseFotMobMatchId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^\d{3,12}$/.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'fotmob.com') return null;
  if (url.hash) {
    const hashId = url.hash.replace(/^#/, '');
    if (/^\d{3,12}$/.test(hashId)) return hashId;
  }
  const queryId = url.searchParams.get('id');
  if (queryId && /^\d{3,12}$/.test(queryId)) return queryId;
  const pathMatch = /\/matches\/(\d{3,12})(?:[/?#]|$)/.exec(url.pathname);
  if (pathMatch) return pathMatch[1];
  return null;
}

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return typeof value === 'object' && value !== null ? (value as Json) : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Normalisiert Stat-Schlüssel: „Total Shots on Target“ → „totalshotsontarget“. */
function normalizeStatKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const STAT_KEY_ALIASES: Record<string, keyof FotMobImport['stats']> = {
  possession: 'possession_pct',
  ballpossession: 'possession_pct',
  ballpossesion: 'possession_pct', // FotMob-Tippfehler in „BallPossesion“
  possessed: 'possession_pct',
  expectedgoals: 'xg_for',
  expectedgoalsxg: 'xg_for',
  xg: 'xg_for',
  totalshots: 'shots_for',
  shots: 'shots_for',
  totalshotsontarget: 'shots_on_target_for',
  shotsontarget: 'shots_on_target_for',
  shotsonarget: 'shots_on_target_for',
  cornerkicks: 'corners_for',
  corners: 'corners_for',
  fouls: 'fouls_for',
  yellowcards: 'yellow_cards_for',
  redcards: 'red_cards_for',
};

interface SideValue {
  home: number | null;
  away: number | null;
}

/**
 * Sammelt die Statistikwerte pro Schlüssel aus den verschiedenen von FotMob
 * genutzten Antwortformen:
 * - matchDetails-API: content.stats.Periods.All.stats ist ein Array von
 *   Gruppen, jede Gruppe enthält stats: [{ key, title, stats: [home, away] }]
 * - alte /api/matches-Route: Objekt-Map oder Array von Zeilen
 *   ({ key, homeValue/awayValue, stats: { home, away } }).
 */
function collectStatValues(statsNode: unknown): Map<string, SideValue> {
  const collected = new Map<string, SideValue>();
  const merge = (key: string, home: unknown, away: unknown) => {
    const homeNumber = asNumber(home);
    const awayNumber = asNumber(away);
    if (homeNumber === null && awayNumber === null) return;
    collected.set(normalizeStatKey(key), {
      home: homeNumber,
      away: awayNumber,
    });
  };
  const sideOf = (record: Json): { home: unknown; away: unknown } | null => {
    if ('home' in record || 'away' in record)
      return { home: record.home, away: record.away };
    if ('homeValue' in record || 'awayValue' in record)
      return { home: record.homeValue, away: record.awayValue };
    return null;
  };
  /** stats: [home, away] oder rawStats: [{ value }, { value }] → Seitenpaar. */
  const arraySides = (arr: unknown[]): { home: unknown; away: unknown } | null => {
    if (arr.length !== 2) return null;
    const [first, second] = arr;
    if (asRecord(first) && asRecord(second) && 'value' in (first as Json) && 'value' in (second as Json))
      return { home: (first as Json).value, away: (second as Json).value };
    if (typeof first === 'number' || typeof first === 'string' || first === null)
      return { home: first, away: second };
    return null;
  };
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const row of node) walk(row);
      return;
    }
    const record = asRecord(node);
    if (!record) return;
    const rowKey = ['key', 'statKey', 'name', 'title']
      .map((field) => record[field])
      .find((value): value is string => typeof value === 'string');
    if (rowKey) {
      const direct = sideOf(record);
      if (direct) {
        merge(rowKey, direct.home, direct.away);
        return;
      }
      for (const field of ['stats', 'values', 'data', 'rawStats']) {
        const sub = record[field];
        if (Array.isArray(sub)) {
          const sides = arraySides(sub);
          if (sides) {
            merge(rowKey, sides.home, sides.away);
            return;
          }
          // Gruppe der matchDetails-API: stats ist ein Array von Zeilen.
          walk(sub);
          return;
        }
        const subRecord = asRecord(sub);
        if (subRecord) {
          const side = sideOf(subRecord);
          if (side) {
            merge(rowKey, side.home, side.away);
            return;
          }
        }
      }
      return;
    }
    // Map-Form: { possession: { home: 58, away: 42 }, … }
    for (const [key, value] of Object.entries(record)) {
      const sub = asRecord(value);
      if (!sub) continue;
      const side = sideOf(sub);
      if (side) merge(key, side.home, side.away);
      else walk(sub);
    }
  };
  walk(statsNode);
  return collected;
}

/** Parst einen Ergebnis-String wie „2 - 1“ oder „2:1“ in Heim/Gast-Tore. */
export function parseFotMobScore(
  scoreText: string,
): { homeGoals: number; awayGoals: number } | null {
  const match = /(\d+)\s*[-:]\s*(\d+)/.exec(scoreText);
  if (!match) return null;
  return { homeGoals: Number(match[1]), awayGoals: Number(match[2]) };
}

function findScore(payload: Json): string | null {
  const header = asRecord(payload.header);
  if (typeof header?.scoreStr === 'string') return header.scoreStr;
  const status = asRecord(header?.status);
  if (typeof status?.scoreStr === 'string') return status.scoreStr;
  const content = asRecord(payload.content);
  const matchFacts = asRecord(content?.matchFacts);
  const result = asRecord(matchFacts?.result);
  if (typeof result?.scoreStr === 'string') return result.scoreStr;
  const general = asRecord(payload.general);
  if (typeof general?.scoreStr === 'string') return general.scoreStr;
  return null;
}

/**
 * Wandelt die FotMob-Antwort eines beendeten Spiels in unser Importformat um.
 * „home“/„away“ der API werden anhand von `isHome` auf „for“/„against“ aus
 * Sicht des FC Example gedreht. Reine Funktion, damit sie sich ohne Netzwerk
 * testen lässt.
 */
export function extractFotMobImport(
  payload: unknown,
  isHome: boolean,
): FotMobImport | null {
  const root = asRecord(payload);
  if (!root) return null;
  const content = asRecord(root.content);
  const stats = asRecord(content?.stats);
  // matchDetails-API nutzt „Periods.All“, die alte Route „periods.all“.
  const periods =
    asRecord(stats?.Periods) ?? asRecord(stats?.periods);
  const all = asRecord(periods?.All) ?? asRecord(periods?.all) ?? stats;
  const statValues = collectStatValues(all?.stats ?? all);
  if (statValues.size === 0) return null;

  const statsOut: FotMobImport['stats'] = {};
  for (const [key, side] of statValues) {
    const target = STAT_KEY_ALIASES[key];
    if (!target) continue;
    const forValue = isHome ? side.home : side.away;
    const againstValue = isHome ? side.away : side.home;
    const suffix = target.endsWith('_for') ? '_for' : null;
    if (suffix) {
      const againstKey = (target.slice(0, -4) +
        '_against') as keyof FotMobImport['stats'];
      if (forValue !== null) statsOut[target] = forValue;
      if (againstValue !== null) statsOut[againstKey] = againstValue;
    } else if (forValue !== null) {
      // Ballbesitz: gespeichert wird nur der FC-Anteil, der Gegner ergibt
      // sich als Rest von 100 %.
      statsOut.possession_pct = Math.min(
        100,
        Math.max(0, Math.round(forValue)),
      );
    }
  }

  const scoreText = findScore(root);
  const score = scoreText ? parseFotMobScore(scoreText) : null;
  return {
    homeGoals: score ? (isHome ? score.homeGoals : score.awayGoals) : null,
    awayGoals: score ? (isHome ? score.awayGoals : score.homeGoals) : null,
    stats: statsOut,
  };
}

/**
 * Mergt einen FotMob-Import in die Formularwerte: nur leere Felder werden
 * gefüllt, manuell eingetragene Werte haben Vorrang. Reine Funktion.
 */
export function mergeFotMobImport(
  values: MatchFormValues,
  imported: FotMobImport,
): MatchFormValues {
  const merged = { ...values };
  for (const [key, value] of Object.entries(imported.stats)) {
    if (value === undefined) continue;
    const typedKey = key as keyof FotMobImport['stats'];
    if (merged[typedKey] === null) {
      (merged as Record<string, unknown>)[typedKey] = value;
    }
  }
  if (merged.home_goals === null && imported.homeGoals !== null)
    merged.home_goals = imported.homeGoals;
  if (merged.away_goals === null && imported.awayGoals !== null)
    merged.away_goals = imported.awayGoals;
  return merged;
}

export interface FotMobFetchResult {
  payload: unknown;
  /** HTTP-Status der API-Antwort, null bei Netzwerkfehler. */
  status: number | null;
}

/**
 * Lädt die Match-Daten von der FotMob-API. Nur der feste FotMob-Host wird
 * angesteuert (kein SSRF), mit Timeout und Browser-Headern. Fällt bei 404 auf
 * die ältere Route zurück.
 */
export async function fetchFotMobMatch(
  matchId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FotMobFetchResult> {
  const headers = {
    Accept: 'application/json',
    'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
    Referer: 'https://www.fotmob.com/',
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  };
  for (const buildUrl of FOTMOB_API_ROUTES) {
    let response: Response;
    try {
      response = await fetchImpl(buildUrl(matchId), {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { payload: null, status: null };
    }
    if (response.ok) {
      try {
        return { payload: await response.json(), status: response.status };
      } catch {
        return { payload: null, status: response.status };
      }
    }
    if (response.status !== 404) return { payload: null, status: response.status };
  }
  return { payload: null, status: 404 };
}

/**
 * Kompletter Import aus einem FotMob-Link: ID parsen, API laden, auf „for“/
 * „against“ drehen. Gibt eine Fehlermeldung zurück oder null bei Erfolg —
 * `result` ist dann gesetzt.
 */
export async function importFotMobData(
  input: string,
  isHome: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<{ result: FotMobImport | null; error: string | null }> {
  const matchId = parseFotMobMatchId(input);
  if (!matchId)
    return {
      result: null,
      error:
        'Das ist kein gültiger FotMob-Link. Bitte eine Adresse wie https://www.fotmob.com/matches/…#4393680 einfügen.',
    };
  const fetched = await fetchFotMobMatch(matchId, fetchImpl);
  if (fetched.payload === null) {
    if (fetched.status === 403 || fetched.status === 401)
      return {
        result: null,
        error:
          'FotMob blockiert den Abruf von diesem Server (HTTP ' +
          fetched.status +
          '). Bitte später erneut versuchen oder die Daten manuell eintragen.',
      };
    if (fetched.status === null)
      return {
        result: null,
        error:
          'Die FotMob-Daten konnten nicht geladen werden (Netzwerkfehler). Bitte versuche es erneut.',
      };
    return {
      result: null,
      error: `Bei FotMob wurde kein Spiel mit der ID ${matchId} gefunden (HTTP ${fetched.status}). Bitte Link und ID prüfen.`,
    };
  }
  const payload = fetched.payload;
  const result = extractFotMobImport(payload, isHome);
  if (!result)
    return {
      result: null,
      error:
        'Für dieses Spiel sind bei FotMob noch keine Statistiken verfügbar (z. B. weil es noch nicht beendet ist).',
    };
  return { result, error: null };
}
