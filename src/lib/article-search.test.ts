import { describe, expect, it } from 'vitest';
import { searchArticles } from './article-search';

const articles = [
  {
    title: 'FC Example',
    excerpt: 'Analyse',
    category: 'spielbericht-analyse',
    tags: ['Bundesliga'],
    content: 'Transfer im Sommer. Ein guter Plan.',
  },
  {
    title: 'Neues aus dem Fanblog',
    excerpt: 'Fans',
    category: 'news',
    tags: [],
    content: 'Stadion und Kultur.',
  },
];

describe('Beitragssuche', () => {
  it('lässt eine leere Suche unverändert', async () => {
    expect((await searchArticles(articles, '  ')).articles).toEqual(articles);
  });
  it('findet mehrere Wörter feldübergreifend und ohne Großschreibung', async () => {
    expect((await searchArticles(articles, 'EXAMPLE sommer')).articles).toEqual([
      articles[0],
    ]);
    expect((await searchArticles(articles, 'Example Stadion')).articles).toEqual(
      [],
    );
  });
  it('sucht in Tags, Kategorie und Inhalt', async () => {
    for (const query of ['bundesliga', 'spielbericht analyse', 'guter plan']) {
      expect((await searchArticles(articles, query)).articles).toEqual([
        articles[0],
      ]);
    }
  });
  it('behandelt Sonderzeichen in Textsuchen wörtlich', async () => {
    expect((await searchArticles(articles, '.*')).articles).toEqual([]);
  });
  it('unterstützt Alternativen, Anker und Platzhalter', async () => {
    expect((await searchArticles(articles, '/example|kultur/i')).articles).toEqual(
      articles,
    );
    expect((await searchArticles(articles, '/^FC/')).articles).toEqual([
      articles[0],
    ]);
    expect(
      (await searchArticles(articles, '/transfer.*sommer/i')).articles,
    ).toEqual([articles[0]]);
    expect((await searchArticles(articles, '/example/')).articles).toEqual([]);
  });
  it('meldet ungültige Muster, Optionen und überlange Suchen', async () => {
    for (const query of [
      '/[/',
      '/test/g',
      '/test/ii',
      '/missing',
      'a'.repeat(201),
    ]) {
      const result = await searchArticles(articles, query);
      expect(result.error).toBeTruthy();
      expect(result.articles).toEqual([]);
    }
  });
  it('bricht aufwendige Muster ab', async () => {
    const result = await searchArticles(
      [{ ...articles[0], content: 'a'.repeat(10000) + '!' }],
      '/^(a+)+$/',
    );
    expect(result.error).toMatch(/viel Zeit/);
  });
});
