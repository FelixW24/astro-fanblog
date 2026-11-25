import { describe, expect, it } from 'vitest';
import {
  articleStructuredData,
  playerStructuredData,
  publicHttpUrl,
  serializeJsonLd,
  websiteStructuredData,
} from './structured-data';

const canonical = 'https://example.com/beitraege/pressing';
const article = {
  title: 'Warum das Pressing wirkt',
  excerpt: 'Unsere Analyse des Spiels.',
  author: 'Felix',
  published_at: '2026-10-19T08:00:00Z',
  tags: ['Taktik'],
};

describe('structured data', () => {
  it('links article, page, website and publisher identities', () => {
    const site = websiteStructuredData(
      canonical,
      article.title,
      article.excerpt,
    );
    const data = articleStructuredData(article, canonical, '/cover.webp', [
      'https://example.org/stats',
    ]);
    expect(data.headline).toBe(article.title);
    expect(data.description).toBe(article.excerpt);
    expect(data.mainEntityOfPage['@id']).toBe(site['@graph'][2]['@id']);
    expect(data.publisher['@id']).toBe(site['@graph'][0]['@id']);
    expect(data.image).toEqual(['https://example.com/cover.webp']);
    expect(data.citation).toEqual(['https://example.org/stats']);
    expect(data.datePublished).toBe(article.published_at);
    expect(data.keywords).toEqual(['Taktik']);
    expect(data.author).toEqual({ '@type': 'Person', name: 'Felix' });
  });

  it('does not invent optional metadata or an editorial person', () => {
    const data = articleStructuredData(
      { ...article, author: 'Redaktion', published_at: null, tags: [] },
      canonical,
      'data:image/png;base64,abc',
      [],
    );
    expect(data.author['@type']).toBe('Organization');
    expect(data).not.toHaveProperty('datePublished');
    expect(data).not.toHaveProperty('image');
    expect(data).not.toHaveProperty('keywords');
    expect(data).not.toHaveProperty('citation');
    expect(data).not.toHaveProperty('dateModified');
  });

  it('rejects unsafe URLs and preserves public source URLs', () => {
    for (const value of [
      null,
      'javascript:alert(1)',
      'https://user:pass@example.org',
      'http://[',
    ]) {
      expect(publicHttpUrl(value, canonical)).toBeUndefined();
    }
    expect(publicHttpUrl('http://example.org', canonical)).toBe(
      'http://example.org/',
    );
    const data = articleStructuredData(article, canonical, '/cover.webp', [
      'javascript:alert(1)',
      'https://example.org',
    ]);
    expect(data.citation).toEqual(['https://example.org/']);
  });

  it('keeps hostile editorial content inside one JSON-LD script', () => {
    const hostile = '</script><script>alert("x")</script> & Example';
    const encoded = serializeJsonLd({ headline: hostile });
    expect(encoded).not.toContain('<');
    expect(JSON.parse(encoded).headline).toBe(hostile);
  });
});

it('describes a player using supported Person properties and links the page', () => {
  const url = 'https://example.com/kader/lukas-luecke';
  expect(playerStructuredData({
    name: 'Lukas Lücke',
    date_of_birth: '1995-04-25',
    height_cm: 190,
    bio: 'Torwart beim FC.',
  }, url)).toEqual({
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': url + '#person',
    url,
    name: 'Lukas Lücke',
    mainEntityOfPage: { '@id': url + '#webpage' },
    birthDate: '1995-04-25',
    height: '190 cm',
    description: 'Torwart beim FC.',
  });
});

it('omits missing player metadata without inventing team membership or stats', () => {
  const data = playerStructuredData({
    name: 'Testspieler',
    date_of_birth: null,
    height_cm: null,
    bio: null,
  }, canonical);
  expect(Object.keys(data).sort()).toEqual([
    '@context', '@id', '@type', 'mainEntityOfPage', 'name', 'url',
  ]);
});
