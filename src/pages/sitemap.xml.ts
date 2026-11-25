import type { APIRoute } from 'astro';
import {
  getFeedArticles,
  publicOrigin,
  sitemap,
} from '../lib/publication-feeds';

export const GET: APIRoute = async ({ url }) => {
  try {
    const origin = publicOrigin(url);
    return new Response(sitemap(origin, await getFeedArticles(true)), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  } catch {
    return new Response('Die Sitemap ist gerade nicht verfügbar.', {
      status: 503,
    });
  }
};
