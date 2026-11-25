import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './render-markdown';

describe('renderMarkdown', () => {
  it('renders nested emphasis and links', () => {
    const html = renderMarkdown(
      '**Stark und *kursiv*** mit [**Link**](https://example.com/a_(b)).',
    );
    expect(html).toContain('<strong>Stark und <em>kursiv</em></strong>');
    expect(html).toContain(
      '<a href="https://example.com/a_(b)"><strong>Link</strong></a>',
    );
  });

  it('preserves nested lists, paragraphs and list starts', () => {
    const html = renderMarkdown(
      '3. Erster Punkt\n4. Zweiter Punkt\n\n   Zweiter Absatz\n\n   - Unterpunkt',
    );
    expect(html).toContain('<ol start="3">');
    expect(html).toContain('<p>Zweiter Absatz</p>');
    expect(html).toContain('<ul>\n<li>Unterpunkt</li>\n</ul>');
  });

  it('renders tables, code, headings and explicit line breaks', () => {
    const html = renderMarkdown(
      '# Titel\n\n#### Detail\n\n| Spieler | Tore |\n| --- | --- |\n| Max | 2 |\n\n```html\n<script>test</script>\n```\n\n`**Code**`  \nNeue Zeile',
    );
    expect(html).toContain('<h1>Titel</h1>');
    expect(html).toContain('<h4>Detail</h4>');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>Max</td>');
    expect(html).toContain('&#x3C;script>test&#x3C;/script>');
    expect(html).toContain('<code>**Code**</code><br>');
  });

  it('removes executable HTML and unsafe links', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[Link](javascript:alert%281%29)\n\n[Gut](https://example.com)',
    );
    expect(html).not.toMatch(/<script|<img|onerror|javascript:/);
    expect(html).toContain('<a href="https://example.com">Gut</a>');
  });

  it('handles empty content', () => {
    expect(renderMarkdown('')).toBe('');
  });
});
