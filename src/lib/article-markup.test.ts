import { describe, expect, it } from 'vitest';
import {
  parseArticleContent,
  parseInline,
  safeArticleHref,
} from './article-markup';

describe('safeArticleHref', () => {
  it.each([
    ['/intern', '/intern'],
    ['#abschnitt', '#abschnitt'],
    ['https://example.com', 'https://example.com'],
    ['http://example.com', 'http://example.com'],
    ['mailto:redaktion@example.com', 'mailto:redaktion@example.com'],
    ['javascript:alert(1)', null],
    ['kein link', null],
  ])('prüft %s', (value, expected) => {
    expect(safeArticleHref(value)).toBe(expected);
  });
});

describe('parseInline', () => {
  it('zerlegt Text, Hervorhebungen und sichere Links', () => {
    expect(
      parseInline('Text **fett**, *kursiv* und [Link](https://example.com).'),
    ).toEqual([
      { type: 'text', text: 'Text ' },
      { type: 'strong', text: 'fett' },
      { type: 'text', text: ', ' },
      { type: 'emphasis', text: 'kursiv' },
      { type: 'text', text: ' und ' },
      { type: 'link', text: 'Link', href: 'https://example.com' },
      { type: 'text', text: '.' },
    ]);
  });

  it('wandelt unsichere Links in Text um', () => {
    expect(parseInline('[nicht öffnen](javascript:alert)')).toEqual([
      { type: 'text', text: 'nicht öffnen' },
    ]);
  });

  it('liefert einfachen und leeren Text unverändert', () => {
    expect(parseInline('Nur Text')).toEqual([
      { type: 'text', text: 'Nur Text' },
    ]);
    expect(parseInline('')).toEqual([]);
  });
});

describe('parseArticleContent', () => {
  it('erkennt alle unterstützten Blocktypen', () => {
    const result = parseArticleContent(`
## Überschrift **fett**
### Unterüberschrift

Erste Zeile
zweite Zeile

> Ein Zitat
> über zwei Zeilen

- Alpha
* Beta

1. Eins
2. Zwei

---
`);

    expect(result.map((block) => block.type)).toEqual([
      'heading-2',
      'heading-3',
      'paragraph',
      'quote',
      'unordered-list',
      'ordered-list',
      'divider',
    ]);
    expect(result[2]).toEqual({
      type: 'paragraph',
      parts: [{ type: 'text', text: 'Erste Zeile zweite Zeile' }],
    });
    expect(result[3]).toEqual({
      type: 'quote',
      parts: [{ type: 'text', text: 'Ein Zitat über zwei Zeilen' }],
    });
  });

  it('normalisiert Windows-Zeilenumbrüche und trennt Absätze vor Listen', () => {
    expect(parseArticleContent('Absatz\r\n- Eintrag')).toEqual([
      { type: 'paragraph', parts: [{ type: 'text', text: 'Absatz' }] },
      {
        type: 'unordered-list',
        items: [[{ type: 'text', text: 'Eintrag' }]],
      },
    ]);
  });

  it('ignoriert Leerzeilen', () => {
    expect(parseArticleContent('\n \n')).toEqual([]);
  });
});
