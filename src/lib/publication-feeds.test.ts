import { expect, it } from 'vitest';
import { publicOrigin, rss, sitemap, xml } from './publication-feeds';
it('verwendet in Produktion nur eine konfigurierte HTTPS-Adresse', () => {
  const request = new URL('https://untrusted.example/path?private=1');
  expect(publicOrigin(request, 'https://blog.example', true)).toBe(
    'https://blog.example',
  );
  expect(() => publicOrigin(request, '', true)).toThrow();
  expect(() => publicOrigin(request, 'http://blog.example', true)).toThrow();
  expect(() =>
    publicOrigin(request, 'https://user:secret@blog.example', true),
  ).toThrow();
});
it('maskiert redaktionelle Inhalte für gültiges XML und RSS', () => {
  const article = {
    slug: 'example',
    title: 'Example & <Bonn>',
    excerpt: 'Text mit "Zitat"\u0001',
    published_at: '2026-09-01T12:00:00Z',
    updated_at: '2026-09-01T12:00:00Z',
  };
  expect(xml(article.excerpt)).toBe('Text mit &quot;Zitat&quot;');
  expect(rss('https://blog.example', [article])).toContain(
    'Example &amp; &lt;Bonn&gt;',
  );
  expect(sitemap('https://blog.example', [article])).toContain(
    '<loc>https://blog.example/beitraege/example</loc>',
  );
  expect(sitemap('https://blog.example', [article])).not.toContain('/admin');
});

it('führt beide getrennten Leihübersichten in der Sitemap auf', () => {
  const result = sitemap('https://blog.example', []);
  expect(result).toContain(
    '<loc>https://blog.example/leihspieler/geliehen</loc>',
  );
  expect(result).toContain(
    '<loc>https://blog.example/leihspieler/verliehen</loc>',
  );
  expect(result).not.toContain('<loc>https://blog.example/leihspieler</loc>');
});
