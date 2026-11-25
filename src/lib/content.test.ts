import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock('./supabase', () => ({ createServerClient }));

import {
  categoryMeta,
  formatDate,
  getArticle,
  getArticles,
  getFeaturedArticle,
  getLoanByPlayerSlug,
  getLoans,
  getSquad,
} from './content';

function queryBuilder(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'lte', 'order', 'limit']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    });
  }
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (resolve: (value: typeof result) => unknown) =>
    resolve(result);
  return { builder, calls };
}

describe('Content-Helfer', () => {
  it('liefert Kategorien oder den Fallback', () => {
    expect(categoryMeta('news').short).toBe('News');
    expect(categoryMeta('unbekannt').slug).toBe('weiteres');
  });

  it('formatiert Daten für Deutschland', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate('2026-09-01T22:30:00.000Z')).toBe('02. September 2026');
  });
});

describe('Content-Abfragen', () => {
  beforeEach(() => createServerClient.mockReset());

  function useQuery(result: { data: unknown; error: unknown }) {
    const query = queryBuilder(result);
    createServerClient.mockReturnValue({ from: vi.fn(() => query.builder) });
    return query;
  }

  it('lädt, filtert und begrenzt Artikel', async () => {
    const { calls } = useQuery({ data: [{ id: 1 }], error: null });
    await expect(getArticles({ category: 'news', limit: 3 })).resolves.toEqual([
      { id: 1 },
    ]);
    expect(calls).toContainEqual(['eq', 'category', 'news']);
    expect(calls).toContainEqual(['limit', 3]);
  });

  it('lässt optionale Artikelfilter aus', async () => {
    const { calls } = useQuery({ data: [], error: null });
    await getArticles();
    expect(
      calls.some(([method, field]) => method === 'eq' && field === 'category'),
    ).toBe(false);
    expect(calls.some(([method]) => method === 'limit')).toBe(false);
  });

  it.each([
    ['getArticles', () => getArticles()],
    ['getFeaturedArticle', () => getFeaturedArticle()],
    ['getArticle', () => getArticle('slug')],
    ['getSquad', () => getSquad()],
    ['getLoans', () => getLoans()],
  ])('%s reicht Daten durch', async (_name, call) => {
    useQuery({ data: [{ id: 1 }], error: null });
    await expect(call()).resolves.toEqual(expect.anything());
  });

  it.each([
    ['getArticles', () => getArticles()],
    ['getFeaturedArticle', () => getFeaturedArticle()],
    ['getArticle', () => getArticle('slug')],
    ['getSquad', () => getSquad()],
    ['getLoans', () => getLoans()],
    ['getLoanByPlayerSlug', () => getLoanByPlayerSlug('thijs-beispiel')],
  ])('%s wirft Supabase-Fehler', async (_name, call) => {
    const error = new Error('Datenbankfehler');
    useQuery({ data: null, error });
    await expect(call()).rejects.toBe(error);
  });

  it('nimmt geliehene Spieler in den öffentlichen Kader auf', async () => {
    const { calls } = useQuery({ data: [], error: null });
    await getSquad();
    expect(calls).toContainEqual([
      'in',
      'squad_status',
      ['first-team', 'loan-in'],
    ]);
  });

  it('verwendet für Leihen dieselbe Spieler-ID und den zentralen Kaderstatus', async () => {
    const player = {
      id: 42,
      slug: 'thijs-beispiel',
      squad_status: 'on-loan',
      loans: [],
    };
    const { calls } = useQuery({ data: player, error: null });
    await expect(getLoanByPlayerSlug('thijs-beispiel')).resolves.toMatchObject({
      players: player,
      direction: 'outgoing',
      partner_club: null,
    });
    expect(calls).toContainEqual(['select', '*, loans(*)']);
    expect(calls).toContainEqual(['eq', 'slug', 'thijs-beispiel']);
  });

  it('zeigt neue Leihen ohne separaten Leihdatensatz und jede Spieler-ID einmal', async () => {
    const player = { id: 42, squad_status: 'loan-in', loans: [] };
    const { calls } = useQuery({ data: [player], error: null });
    await expect(getLoans()).resolves.toMatchObject([
      { players: player, direction: 'incoming' },
    ]);
    expect(calls).toContainEqual([
      'in',
      'squad_status',
      ['loan-in', 'on-loan'],
    ]);
    expect(createServerClient().from).toHaveBeenCalledWith('players');
  });
});
