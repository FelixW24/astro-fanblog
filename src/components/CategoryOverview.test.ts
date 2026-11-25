import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import CategoryOverview from './CategoryOverview.astro';
import type { Article } from '../lib/content';

describe('CategoryOverview', () => {
  it('zeigt veröffentlichte Beiträge statt des Leerzustands', async () => {
    const article: Article = {
      id: 1,
      slug: 'spieltag',
      title: 'Ein Spieltag in Example',
      category: 'spielbericht-analyse',
      excerpt: 'Die Analyse der Partie.',
      author: 'Astro Fanblog',
      content: '',
      read_minutes: 3,
      published_at: '2026-10-07T12:00:00Z',
      created_at: '2026-10-07T12:00:00Z',
      updated_at: '2026-10-07T12:00:00Z',
      status: 'published',
      is_featured: false,
      cover_image_url: null,
      cover_disabled: false,
      cover_image_alt: null,
      seo_description: null,
      seo_title: null,
      source_urls: [],
      tags: [],
    };
    const container = await AstroContainer.create();
    const html = await container.renderToString(CategoryOverview, {
      props: {
        category: 'spielbericht-analyse',
        articles: [article],
        backendAvailable: true,
      },
    });
    expect(html).not.toContain('Aktuelle Beiträge');
    expect(html).not.toContain('1 Beitrag');
    expect(html).toContain('href="/beitraege/spieltag"');
    expect(html).toContain('Ein Spieltag in Example');
    expect(html).not.toContain('Noch keine Beiträge');
    expect(html).not.toContain('Erneut versuchen');
  });
  it('zeigt die Rubrik ohne zusätzliche Rubrikenleiste', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CategoryOverview, {
      props: {
        category: 'spielbericht-analyse',
        articles: [],
        backendAvailable: true,
      },
    });
    expect(html).toContain('<h1>Spielberichte<span');
    expect(html).not.toContain('Weitere Rubriken');
    expect(html).not.toContain('category-overview__nav');
    expect(html).not.toContain('Aktuelle Beiträge');
    expect(html).not.toContain('0 Beiträge');
    expect(html).toContain('class="empty-state"');
    expect(html).toContain('empty-state__icon');
    expect(html).toContain('Noch keine Beiträge');
    expect(html).not.toContain('Alle Beiträge ansehen');
    expect(html).not.toContain('Zur Startseite');
    expect(html).not.toContain('Entdecke inzwischen');
    expect(html).not.toContain('Erneut versuchen');
  });

  it('zeigt Ladefehler als technischen Leerzustand der zentralen Komponente', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CategoryOverview, {
      props: { category: 'news', articles: [], backendAvailable: false },
    });
    expect(html).toContain('class="empty-state"');
    expect(html).toContain('role="status"');
    expect(html).toContain('empty-state__icon');
    expect(html).toContain('Beiträge sind gerade nicht erreichbar.');
    expect(html).toContain('Bitte versuche es in ein paar Minuten noch einmal.');
    expect(html).not.toContain('0 Beiträge');
    expect(html).not.toContain('Noch keine Beiträge');
    expect(html).not.toContain('Erneut versuchen');
  });
});
