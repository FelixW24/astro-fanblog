import { describe, expect, it } from 'vitest';
import { parseMarkdownImport } from './markdown-import';

describe('parseMarkdownImport', () => {
  it('übernimmt Obsidian-Frontmatter und den Markdown-Inhalt', () => {
    const result = parseMarkdownImport(
      `---
title: "Ein taktischer Abend"
teaser: Was beim Exampleer Heimsieg den Unterschied gemacht hat.
category: Spielberichte & Analyse
author: Max Mustermann
tags: [FC Example, Taktik, Heimsieg]
seo_title: Taktische Analyse des Exampleer Heimsiegs
cover_image_url: https://example.com/stadion.jpg
cover_image_alt: Das Stadion vor dem Anpfiff
sources:
  - https://example.com/quelle
---

## Der Plan mit Ball

Der FC öffnete das Zentrum mit **klaren Laufwegen**.
`,
      'analyse.md',
    );

    expect(result).toMatchObject({
      title: 'Ein taktischer Abend',
      slug: 'ein-taktischer-abend',
      excerpt: 'Was beim Exampleer Heimsieg den Unterschied gemacht hat.',
      category: 'spielbericht-analyse',
      author: 'Max Mustermann',
      tags: ['FC Example', 'Taktik', 'Heimsieg'],
      seoTitle: 'Taktische Analyse des Exampleer Heimsiegs',
      coverImageUrl: 'https://example.com/stadion.jpg',
      coverImageAlt: 'Das Stadion vor dem Anpfiff',
      sourceUrls: ['https://example.com/quelle'],
      warnings: [],
    });
    expect(result.content).toContain('## Der Plan mit Ball');
  });

  it('nutzt H1, ersten Absatz und Dateinamen als Rückfallwerte', () => {
    const withHeading = parseMarkdownImport(`# Mein neuer Artikel

Das ist ein ausreichend langer **Einleitungsabsatz** für den Teaser.

## Abschnitt

Weiterer Inhalt.
`);
    expect(withHeading.title).toBe('Mein neuer Artikel');
    expect(withHeading.slug).toBe('mein-neuer-artikel');
    expect(withHeading.excerpt).toBe(
      'Das ist ein ausreichend langer Einleitungsabsatz für den Teaser.',
    );
    expect(withHeading.content).not.toContain('# Mein neuer Artikel');

    expect(parseMarkdownImport('Nur Inhalt', 'mein-entwurf.md').title).toBe(
      'mein entwurf',
    );
  });

  it('warnt vor unbekannten Kategorien und lokalen Obsidian-Verweisen', () => {
    const result = parseMarkdownImport(`---
kategorie: Unbekannt
cover: bilder/stadion.jpg
quellen: [https://example.com, keine-url]
---
# Titel des Beitrags

Ein Absatz mit [[Taktiknotiz]] und ![[stadion.jpg]].`);

    expect(result.category).toBeUndefined();
    expect(result.coverImageUrl).toBeUndefined();
    expect(result.sourceUrls).toEqual(['https://example.com']);
    expect(result.warnings).toHaveLength(5);
  });

  it('meldet nicht geschlossenes Frontmatter ohne Inhalt zu verlieren', () => {
    const result = parseMarkdownImport('---\ntitle: Offen\nText', 'offen.md');
    expect(result.content).toBe('---\ntitle: Offen\nText');
    expect(result.warnings[0]).toContain('keinen schließenden');
  });
});
