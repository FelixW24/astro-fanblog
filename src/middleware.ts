import { defineMiddleware, sequence } from 'astro:middleware';
import { onRequest as sentryMiddleware } from '@sentry/astro/middleware';
import { createRequestClient } from './lib/supabase';
import { authPostPaths, authRateLimit } from './lib/auth-rate-limit';
import { isSameOrigin } from './lib/admin';
import { profileGateExempt, profileGateTarget } from './lib/profile-gate';
import { DATA_SAVER_COOKIE, dataSaverRequested } from './lib/data-saver';
import { publicOrigin } from './lib/publication-feeds';

const securityHeaders = defineMiddleware(async (context, next) => {
  const response = await next();
  // Prerendered pages are public and cacheable; dynamic responses (auth,
  // profile, admin, API) stay private, no-store. Routes that set their own
  // Cache-Control (e.g. the public avatar proxy /profilbild/*) keep it.
  if (!response.headers.has('Cache-Control')) {
    response.headers.set(
      'Cache-Control',
      context.isPrerendered
        ? 'public, max-age=300, stale-while-revalidate=60'
        : 'private, no-store',
    );
  }
  response.headers.set('Referrer-Policy', 'same-origin');
  // Token redirects must not leak their original URL. Forms still need Origin.
  if (context.url.searchParams.has('token_hash'))
    response.headers.set('Referrer-Policy', 'no-referrer');
  // Append so a stricter downstream CSP remains effective. Resource directives
  // are deliberately separate: the editor, themes and MFA use inline assets.
  response.headers.append(
    'Content-Security-Policy',
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // Agenten-Discovery: Maschinenlesbare Katalog- und Richtliniendokumente
  // zusätzlich zum HTML-<link> auch als HTTP-Link-Header ankündigen.
  if ((response.headers.get('Content-Type') ?? '').includes('text/html')) {
    response.headers.append(
      'Link',
      '</.well-known/api-catalog>; rel="api-catalog", </llms.txt>; rel="service-doc"',
    );
  }
  return response;
});

// /.well-known/api-catalog als JSON ausliefern (statt octet-stream über die
// statische Datei aus public/, die als Fallback für statisches Hosting bleibt).
const apiCatalog = defineMiddleware(async (context, next) => {
  if (context.url.pathname !== '/.well-known/api-catalog') return next();
  try {
    const origin = publicOrigin(context.url);
    return new Response(
      JSON.stringify({
        name: 'Astro Fanblog – öffentlicher API-Katalog',
        description:
          'Öffentliche maschinenlesbare Schnittstellen des unabhängigen Fanblogs zum FC Example.',
        href: `${origin}/.well-known/api-catalog`,
        publisher: 'Astro Fanblog',
        resources: [
          {
            href: `${origin}/api/naechstes-spiel`,
            type: 'application/json',
            description: 'Das nächste Spiel des FC Example als JSON.',
          },
          {
            href: `${origin}/rss.xml`,
            type: 'application/rss+xml',
            description: 'RSS-Feed der neuesten Beiträge.',
          },
          {
            href: `${origin}/sitemap.xml`,
            type: 'application/xml',
            description: 'Sitemap aller öffentlichen Seiten.',
          },
          {
            href: `${origin}/llms.txt`,
            type: 'text/markdown',
            description:
              'LLM-orientierte Übersicht des Angebots und der Crawler-Richtlinien.',
          },
        ],
      }),
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        },
      },
    );
  } catch {
    return next();
  }
});

const handleRequest = defineMiddleware(async (context, next) => {
  if (
    context.request.method === 'POST' &&
    authPostPaths.has(context.url.pathname.replace(/\/$/, ''))
  ) {
    const headers = {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    };
    if (!isSameOrigin(context.request))
      return new Response('Ungültige Anfrage.', { status: 403, headers });
    try {
      // Login-Versuche zählen pro IP und zusätzlich pro E-Mail-Adresse. Der
      // Body wird an einem Klon gelesen, damit die Seite ihn erneut parsen kann.
      let email: string | undefined;
      try {
        const form = await context.request.clone().formData();
        const candidate = String(form.get('email') ?? '').trim().toLowerCase();
        if (candidate) email = candidate;
      } catch {
        // Kein lesbares Formular: nur das IP-Budget greift.
      }
      const retry = authRateLimit(
        context.clientAddress,
        context.url.pathname.replace(/\/$/, ''),
        email,
      );
      if (retry) {
        // Keine Formularinhalte loggen; die IP macht Meldungen nachvollziehbar.
        console.warn('auth.rate_limited', {
          path: context.url.pathname,
          retryAfter: retry,
          address: context.clientAddress,
        });
        return new Response(
          `Zu viele Versuche. Bitte warte ${retry} Sekunden und versuche es erneut.`,
          {
            status: 429,
            headers: { ...headers, 'Retry-After': String(retry) },
          },
        );
      }
    } catch {
      console.error('auth.rate_limit_unavailable');
      return new Response(
        'Die Anmeldung ist gerade nicht verfügbar. Bitte versuche es später erneut.',
        { status: 503, headers },
      );
    }
  }
  // Datensparmodus serverseitig erkennen (Cookie der eigenen Einstellung oder
  // Save-Data-Request-Header), damit z. B. kleine Cover direkt ausgeliefert
  // werden. Beim Prerender fehlen Cookie/Header, der Client tauscht dann.
  context.locals.dataSaver = dataSaverRequested(
    context.cookies?.get(DATA_SAVER_COOKIE)?.value,
    context.request.headers.get('save-data'),
  );
  // Beim Prerender (Build) gibt es keine Request-IP; clientAddress würde
  // werfen. Geprerenderte Seiten brauchen keinen Supabase-Client.
  if (
    !context.isPrerendered &&
    import.meta.env.PUBLIC_SUPABASE_URL &&
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    context.locals.supabase = createRequestClient(context);
    if ((context.request.headers.get('cookie') ?? '').includes('sb-')) {
      const {
        data: { user },
      } = await context.locals.supabase.auth.getUser();
      context.locals.readerUser = user;
    }
  }
  return next();
});

// Setup-Gate: Bestätigte Leserkonten ohne eingerichtetes Profil landen
// überall in der Profileinrichtung; erst danach ist der Rest erreichbar.
// Redaktion und Admins richten kein Leserkonto ein und bleiben unbehindert.
const requireProfileSetup = defineMiddleware(async (context, next) => {
  const user = context.locals.readerUser;
  if (!user?.email_confirmed_at || user.app_metadata?.is_editor === true)
    return next();
  const path = context.url.pathname;
  if (profileGateExempt(path)) return next();
  const client = context.locals.supabase;
  if (!client) return next();
  const { data: profile } = await client
    .from('reader_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (profile) return next();
  return context.redirect(profileGateTarget(path), 303);
});

// Sentry zuerst und außen, damit Serverfehler gemeldet und das Client-SDK
// in HTML-Antworten injiziert werden.
export const onRequest = sequence(
  sentryMiddleware,
  securityHeaders,
  apiCatalog,
  handleRequest,
  requireProfileSetup,
);
