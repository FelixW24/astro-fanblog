import type { APIRoute } from 'astro';
import { publicOrigin } from '../lib/publication-feeds';

export const GET: APIRoute = ({ url }) => {
  try {
    const origin = publicOrigin(url);
    return new Response(
      `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /profil\nDisallow: /auth/\nDisallow: /anmelden\nDisallow: /registrieren\nDisallow: /passwort-\nDisallow: /abmelden\nDisallow: /api\nDisallow: /kommentare\nDisallow: /*?\nContent-Signal: search=allow, ai=allow, ai-input=disallow\nSitemap: ${origin}/sitemap.xml\n`,
      { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  } catch {
    return new Response('Die Robots-Datei ist gerade nicht verfügbar.', {
      status: 503,
    });
  }
};
