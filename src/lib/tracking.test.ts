import { describe, expect, it } from 'vitest';
import {
  bucketByDay,
  bucketByWeek,
  countViewsByArticle,
  isTrackedPath,
  parseTrackingFilters,
  parseTrackingPeriod,
  periodStartIso,
  visitorKey,
} from './tracking';

describe('parseTrackingPeriod', () => {
  it('liefert die Tage der gewählten Periode, Default 30', () => {
    expect(parseTrackingPeriod('7')).toBe(7);
    expect(parseTrackingPeriod('90')).toBe(90);
    expect(parseTrackingPeriod('all')).toBe(0);
    expect(parseTrackingPeriod(null)).toBe(30);
    expect(parseTrackingPeriod('unsinn')).toBe(30);
  });
});

describe('periodStartIso', () => {
  it('beginnt um Mitternacht vor `days` Tagen, null für Gesamt', () => {
    const now = new Date('2026-11-09T15:30:00.000Z');
    expect(periodStartIso(0, now)).toBeNull();
    const start = new Date(periodStartIso(7, now)!);
    expect(start.toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });
});

describe('parseTrackingFilters', () => {
  it('liest Kategorie, Status, Suche und Zeitraum aus den Parametern', () => {
    const params = new URLSearchParams(
      'kategorie=news&status=published&suche=Derby&zeitraum=90',
    );
    expect(parseTrackingFilters(params)).toEqual({
      category: 'news',
      status: 'published',
      search: 'derby',
      days: 90,
    });
    expect(parseTrackingFilters(new URLSearchParams())).toEqual({
      category: '',
      status: '',
      search: '',
      days: 30,
    });
  });
});

describe('bucketByDay', () => {
  it('gruppiert Views tagesweise inklusive Leertagen', () => {
    const now = new Date('2026-11-09T12:00:00.000Z');
    const rows = [
      { viewed_at: '2026-11-09T08:00:00.000Z', visitor_key: 'a' },
      { viewed_at: '2026-11-09T09:00:00.000Z', visitor_key: 'a' },
      { viewed_at: '2026-11-09T10:00:00.000Z', visitor_key: 'b' },
      { viewed_at: '2026-11-07T10:00:00.000Z', visitor_key: 'c' },
      // Außerhalb des Fensters: wird ignoriert.
      { viewed_at: '2026-10-01T10:00:00.000Z', visitor_key: 'd' },
    ];
    const buckets = bucketByDay(rows, 3, now);
    expect(buckets.map((b) => b.date)).toEqual([
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
    ]);
    expect(buckets[2]).toMatchObject({ views: 3, visitors: 2, label: '09.11.' });
    expect(buckets[1]).toMatchObject({ views: 0, visitors: 0 });
    expect(buckets[0]).toMatchObject({ views: 1, visitors: 1 });
  });
});

describe('bucketByWeek', () => {
  it('gruppiert Views in 7-Tage-Blöcken inklusive Leerwochen', () => {
    const now = new Date('2026-11-09T12:00:00.000Z');
    const rows = [
      { viewed_at: '2026-11-09T08:00:00.000Z', visitor_key: 'a' },
      { viewed_at: '2026-11-08T09:00:00.000Z', visitor_key: 'a' },
      { viewed_at: '2026-11-03T10:00:00.000Z', visitor_key: 'b' },
      // Außerhalb des Fensters (älter als 2 Wochen): wird ignoriert.
      { viewed_at: '2026-10-20T10:00:00.000Z', visitor_key: 'c' },
    ];
    const buckets = bucketByWeek(rows, 2, now);
    expect(buckets.map((b) => b.weekStart)).toEqual([
      '2026-10-27',
      '2026-11-03',
    ]);
    // Neuester Bucket = die letzten 7 Tage (03.11.–09.11.).
    expect(buckets[1]).toMatchObject({
      views: 3,
      visitors: 2,
      label: '03.11.–09.11.',
    });
    expect(buckets[0]).toMatchObject({
      views: 0,
      visitors: 0,
      label: '27.10.–02.11.',
    });
  });

  it('ignoriert Tage in der Zukunft und begrenzt auf die Wochen-Anzahl', () => {
    const now = new Date('2026-11-09T12:00:00.000Z');
    const rows = [
      { viewed_at: '2026-11-10T08:00:00.000Z', visitor_key: 'a' },
      { viewed_at: '2026-11-09T08:00:00.000Z', visitor_key: 'a' },
    ];
    const buckets = bucketByWeek(rows, 1, now);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ views: 1, visitors: 1 });
  });
});

describe('countViewsByArticle', () => {
  it('zählt die Views pro Beitrag', () => {
    const counts = countViewsByArticle([
      { article_id: 1 },
      { article_id: 2 },
      { article_id: 1 },
    ]);
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(counts.get(3)).toBeUndefined();
  });
});

describe('isTrackedPath', () => {
  it('schließt Redaktion, Auth und APIs aus', () => {
    expect(isTrackedPath('/')).toBe(true);
    expect(isTrackedPath('/beitraege/derby')).toBe(true);
    expect(isTrackedPath('/admin')).toBe(false);
    expect(isTrackedPath('/admin/tracking')).toBe(false);
    expect(isTrackedPath('/api/tracking/page-view')).toBe(false);
    expect(isTrackedPath('/anmelden')).toBe(false);
    expect(isTrackedPath('/profil')).toBe(false);
    expect(isTrackedPath('https://evil.example/')).toBe(false);
  });
});

describe('visitorKey', () => {
  it('erzeugt einmalig einen Schlüssel und speichert ihn', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    const first = visitorKey(storage);
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(visitorKey(storage)).toBe(first);
    expect(store.get('astro-fanblog:visitor')).toBe(first);
  });
});
