import { categories } from './content';
import { createServerClient } from './supabase';

export function publicOrigin(
  requestUrl: URL,
  configured = process.env.SITE_ORIGIN || import.meta.env.SITE_ORIGIN,
  production = import.meta.env.PROD,
) {
  if (!configured && production) throw new Error('SITE_ORIGIN fehlt.');
  const url = new URL(configured || requestUrl.origin);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (production && url.protocol !== 'https:')
  )
    throw new Error('SITE_ORIGIN ist ungültig.');
  return url.origin;
}

export function xml(value: string) {
  // XML 1.0 forbids these control characters even inside escaped text.
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu, '')
      .replace(
        /[<>&"']/g,
        (char) =>
          ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&apos;',
          })[char]!,
      )
  );
}

type FeedArticle = {
  slug: string;
  title: string;
  excerpt: string;
  published_at: string | null;
  updated_at: string;
};
export async function getFeedArticles(all = false): Promise<FeedArticle[]> {
  const client = createServerClient();
  const articles: FeedArticle[] = [];
  const now = new Date().toISOString();
  const batchSize = all ? 500 : 50;
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await client
      .from('articles')
      .select('slug, title, excerpt, published_at, updated_at')
      .eq('status', 'published')
      .lte('published_at', now)
      .order('published_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + batchSize - 1);
    if (error) throw error;
    articles.push(...data);
    if (!all || data.length < batchSize) return articles;
  }
}

export function sitemap(origin: string, articles: FeedArticle[]) {
  const paths = [
    '/',
    '/beitraege',
    '/kader',
    '/spielplan',
    '/leihspieler/verliehen',
    '/leihspieler/geliehen',
    ...categories.map((c) => `/kategorie/${c.slug}`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${xml(new URL(path, origin).href)}</loc></url>`).join('')}${articles.map((article) => `<url><loc>${xml(new URL(`/beitraege/${article.slug}`, origin).href)}</loc><lastmod>${xml(article.updated_at)}</lastmod></url>`).join('')}</urlset>`;
}

export function rss(origin: string, articles: FeedArticle[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Astro Fanblog</title><link>${xml(origin)}/</link><description>Analysen, News und Geschichten rund um den FC Example.</description><language>de-DE</language><atom:link href="${xml(origin)}/rss.xml" rel="self" type="application/rss+xml"/>${articles
    .map((article) => {
      const url = xml(new URL(`/beitraege/${article.slug}`, origin).href);
      return `<item><title>${xml(article.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><description>${xml(article.excerpt)}</description><pubDate>${new Date(article.published_at!).toUTCString()}</pubDate></item>`;
    })
    .join('')}</channel></rss>`;
}
