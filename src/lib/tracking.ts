// Reine Helfer für das Redaktions-Tracking (Views & Besucher). Die
// datenbanknahe Persistierung liegt in den API-Routen unter
// src/pages/api/tracking/.

// Ein View zählt erst ab dieser Verweildauer auf der Beitragsseite.
export const VIEW_THRESHOLD_MS = 30_000;

export const TRACKING_PERIODS = [
  { value: '7', days: 7, label: '7 Tage' },
  { value: '30', days: 30, label: '30 Tage' },
  { value: '90', days: 90, label: '90 Tage' },
  { value: 'all', days: 0, label: 'Gesamt' },
] as const;

export type TrackingPeriodValue = (typeof TRACKING_PERIODS)[number]['value'];

/** days = 0 bedeutet „Gesamt" (kein Zeitraumfilter). */
export function parseTrackingPeriod(raw: string | null): number {
  const match = TRACKING_PERIODS.find((period) => period.value === raw);
  return match ? match.days : 30;
}

// Tagesgrenzen laufen in Europe/Berlin (Redaktionsstandort), damit
// „heute" in der Statistik dem lokalen Kalendertag entspricht.
const berlinDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Kalendertag (YYYY-MM-DD) in Europe/Berlin. */
export function berlinDayKey(date: Date): string {
  return berlinDayFormatter.format(date);
}

/** ISO-Zeitstempel des Periodenbeginns (UTC-Mitternacht des Berliner Tages) oder null für „Gesamt". */
export function periodStartIso(days: number, now = new Date()): string | null {
  if (!days) return null;
  const shifted = new Date(now.getTime() - (days - 1) * 86_400_000);
  return `${berlinDayKey(shifted)}T00:00:00.000Z`;
}

export interface TrackingFilters {
  category: string;
  status: string;
  search: string;
  days: number;
}

export function parseTrackingFilters(params: URLSearchParams): TrackingFilters {
  return {
    category: params.get('kategorie') ?? '',
    status: params.get('status') ?? '',
    search: (params.get('suche') ?? '').trim().toLowerCase(),
    days: parseTrackingPeriod(params.get('zeitraum')),
  };
}

export interface DayBucket {
  date: string;
  label: string;
  views: number;
  visitors: number;
}

function dayKey(iso: string): string {
  return berlinDayKey(new Date(iso));
}

function dayLabel(key: string): string {
  const [, month, day] = key.split('-').map(Number);
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.`;
}

/**
 * Gruppiert Tracking-Zeilen tagesweise (lokal, UTC-basiert auf dem Datum).
 * Liefert `days` Buckets inklusive Leertagen, aufsteigend sortiert.
 */
export function bucketByDay(
  rows: { viewed_at: string; visitor_key?: string | null }[],
  days: number,
  now = new Date(),
): DayBucket[] {
  const count = days > 0 ? days : 30;
  const buckets = new Map<string, { views: number; visitors: Set<string> }>();
  for (let index = 0; index < count; index += 1) {
    const date = new Date(now.getTime() - (count - 1 - index) * 86_400_000);
    const key = berlinDayKey(date);
    buckets.set(key, { views: 0, visitors: new Set() });
  }
  for (const row of rows) {
    const key = dayKey(row.viewed_at);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.views += 1;
    if (row.visitor_key) bucket.visitors.add(row.visitor_key);
  }
  return [...buckets.entries()]
    .map(([date, bucket]) => ({
      date,
      label: dayLabel(date),
      views: bucket.views,
      visitors: bucket.visitors.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface WeekBucket {
  weekStart: string;
  label: string;
  views: number;
  visitors: number;
}

function weekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return `${dayLabel(weekStart)}–${dayLabel(berlinDayKey(end))}`;
}

/**
 * Gruppiert Tracking-Zeilen in 7-Tage-Blöcken (der neueste Bucket umfasst
 * die letzten 7 Tage inklusive heute). Liefert `weeks` Buckets inklusive
 * Leerwochen, aufsteigend sortiert.
 */
export function bucketByWeek(
  rows: { viewed_at: string; visitor_key?: string | null }[],
  weeks: number,
  now = new Date(),
): WeekBucket[] {
  const count = weeks > 0 ? weeks : 1;
  const nowKey = berlinDayKey(now);
  const nowMidnight = new Date(`${nowKey}T00:00:00.000Z`).getTime();
  const buckets = new Map<string, { views: number; visitors: Set<string> }>();
  const startKeys: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = new Date(
      now.getTime() - ((count - 1 - index) * 7 + 6) * 86_400_000,
    );
    const key = berlinDayKey(start);
    startKeys.push(key);
    buckets.set(key, { views: 0, visitors: new Set() });
  }
  for (const row of rows) {
    const key = dayKey(row.viewed_at);
    const diff = Math.round(
      (nowMidnight - new Date(`${key}T00:00:00.000Z`).getTime()) / 86_400_000,
    );
    if (diff < 0 || diff >= count * 7) continue;
    const bucket = buckets.get(startKeys[count - 1 - Math.floor(diff / 7)]);
    if (!bucket) continue;
    bucket.views += 1;
    if (row.visitor_key) bucket.visitors.add(row.visitor_key);
  }
  return [...buckets.entries()]
    .map(([weekStart, bucket]) => ({
      weekStart,
      label: weekLabel(weekStart),
      views: bucket.views,
      visitors: bucket.visitors.size,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/** View-Anzahl pro Beitrag. */
export function countViewsByArticle(
  rows: { article_id: number }[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of rows)
    counts.set(row.article_id, (counts.get(row.article_id) ?? 0) + 1);
  return counts;
}

/** Pfade, die nicht getrackt werden (Redaktion, Auth, interne APIs). */
export function isTrackedPath(pathname: string): boolean {
  if (!pathname.startsWith('/')) return false;
  return !/^\/(admin|api|profil|auth|anmelden|registrieren|passwort-neu|passwort-vergessen|abmelden|benachrichtigungen-abmelden)(\/|$)/.test(
    pathname,
  );
}

/** Besucher-Schlüssel: ein anonymer, persistenter Wert pro Browser. */
export function visitorKey(storage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}): string {
  const key = 'astro-fanblog:visitor';
  const existing = storage.getItem(key);
  if (existing) return existing;
  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  storage.setItem(key, generated);
  return generated;
}
