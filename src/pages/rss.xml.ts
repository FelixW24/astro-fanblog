import type { APIRoute } from 'astro';
import { getFeedArticles, publicOrigin, rss } from '../lib/publication-feeds';

export const GET: APIRoute = async ({ url }) => {
  try {
    const origin = publicOrigin(url);
    return new Response(rss(origin, await getFeedArticles()), {
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
  } catch {
    return new Response('Der RSS-Feed ist gerade nicht verfügbar.', {
      status: 503,
    });
  }
};
