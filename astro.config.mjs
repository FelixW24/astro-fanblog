import node from '@astrojs/node';
import sentryAstro from '@sentry/astro';
import { defineConfig } from 'astro/config';
import process from 'node:process';
import { URL } from 'node:url';
import { loadEnv } from 'vite';

// Astro loads .env files after this config is evaluated.
const siteOrigin =
  process.env.SITE_ORIGIN ||
  loadEnv(process.env.NODE_ENV || 'production', process.cwd(), 'SITE_ORIGIN')
    .SITE_ORIGIN ||
  'https://example.com';
const trustedOrigin = new URL(siteOrigin);
const sentryDsn =
  process.env.PUBLIC_SENTRY_DSN ||
  loadEnv(
    process.env.NODE_ENV || 'production',
    process.cwd(),
    'PUBLIC_SENTRY_DSN',
  ).PUBLIC_SENTRY_DSN ||
  '';

export default defineConfig({
  output: 'server',
  // Basis-URL für geprerenderte Seiten (canonical, og:url, Astro.url.origin
  // beim Build). Im SSR-Betrieb bleibt Astro.url die Request-URL.
  site: siteOrigin,
  adapter: node({ mode: 'standalone' }),
  integrations: [
    // Fehlerberichte an GlitchTip (Sentry-API-kompatibel). Ohne DSN im
    // Sentry-SDK eine Initialisierung ohne Funktion. Die eigene Client-Init
    // in src/sentry.client.ts ersetzt das SDK-Snippet mit Replay- und
    // Tracing-Defaults.
    sentryAstro({
      clientInitPath: 'src/sentry.client.ts',
      dsn: sentryDsn,
      // Option heisst im Plugin "disable" (nicht "disabled") — mit dem
      // Tippfehler glaubt das Plugin, Sourcemaps seien aktiv, und warnt
      // bei jedem Build ueber das fehlende authToken.
      sourcemaps: { disable: true },
      // Der Self-Hosted-Stack soll nichts an sentry.io melden.
      telemetry: false,
    }),
  ],
  server: { host: true },
  vite: {
    build: {
      // Hoisted Scripts nicht inline in den HTML ausliefern, sondern als
      // externe Dateien (SEO: keine Inline-JavaScript-Bloecke im Dokument).
      assetsInlineLimit: 0,
    },
  },
  // Keep development UI from covering controls during browser tests.
  devToolbar: { enabled: process.env.PLAYWRIGHT_TEST !== '1' },
  security: {
    allowedDomains: [
      {
        hostname: trustedOrigin.hostname,
        protocol: trustedOrigin.protocol.slice(0, -1),
        ...(trustedOrigin.port ? { port: trustedOrigin.port } : {}),
      },
    ],
  },
  session: {
    ttl: 900,
    cookie: {
      name: 'vk-flow',
      httpOnly: true,
      sameSite: 'lax',
      secure: import.meta.env.PROD,
      path: '/',
    },
  },
});
