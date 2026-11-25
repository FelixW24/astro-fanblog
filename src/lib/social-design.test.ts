import { describe, expect, it } from 'vitest';
import { createDesign, parseDesign, wrapText } from './social-design';

describe('Social-Media-Entwürfe', () => {
  it('öffnet gespeicherte Entwürfe mit Texten und Bildausschnitt verlustfrei', () => {
    const draft = {
      ...createDesign('quote'),
      title: 'Example hält zusammen. ⚽',
      format: 'story',
      imageX: 23,
      zoom: 1.5,
    };
    expect(parseDesign(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });
  it.each([
    { version: 2 },
    { template: '__proto__' },
    { logo: 'https://example.com/image.svg' },
    { image: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { image: 'https://example.com/image.png' },
    { image: 'data:image/png;base64,<script>' },
    { title: 'x'.repeat(181) },
    { zoom: Infinity },
    { textY: 99 },
    { fontSize: 0 },
    { format: 'unknown' },
  ])('weist ungültige Importe zurück: %j', (change) => {
    expect(() => parseDesign({ ...createDesign(), ...change })).toThrow();
  });
  it('behält Text als Text und übernimmt keine unbekannten Eigenschaften', () => {
    const draft = parseDesign({
      ...createDesign(),
      title: '<script>alert(1)</script>',
      unknown: true,
    });
    expect(draft.title).toBe('<script>alert(1)</script>');
    expect(draft).not.toHaveProperty('unknown');
  });
  it('bricht lange Wörter um und bewahrt manuelle Zeilenumbrüche', () => {
    expect(wrapText('123456789\nFC Example', 5, (text) => text.length)).toEqual([
      '12345',
      '6789',
      'FC',
      'Example',
    ]);
    expect(wrapText('Hallo Welt', 10, (text) => text.length)).toEqual([
      'Hallo Welt',
    ]);
    expect(wrapText('⚽⚽⚽', 2, (text) => [...text].length)).toEqual([
      '⚽⚽',
      '⚽',
    ]);
  });
});
