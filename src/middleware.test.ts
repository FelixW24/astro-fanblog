import type { APIContext, MiddlewareNext } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './lib/database.types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from './middleware';
import { authRateLimit } from './lib/auth-rate-limit';
import { createRequestClient } from './lib/supabase';

vi.mock('./lib/auth-rate-limit', () => ({
  authPostPaths: new Set(['/anmelden']),
  authRateLimit: vi.fn(() => 0),
}));
vi.mock('./lib/supabase', () => ({ createRequestClient: vi.fn() }));

const testOrigin =
  process.env.SITE_ORIGIN ||
  import.meta.env.SITE_ORIGIN ||
  'https://blog.example';

function context(path: string, method = 'GET', origin = testOrigin) {
  const url = new URL(path, testOrigin);
  return {
    url,
    request: new Request(url, { method, headers: { origin } }),
    locals: {},
    clientAddress: '127.0.0.1',
  } as APIContext;
}

describe('Sicherheitsheader der Middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['page', 'redirect', 'forbidden', 'limited', 'unavailable'])(
    'schützt auch Antworten vom Typ %s',
    async (kind) => {
      vi.mocked(authRateLimit).mockImplementation(() => {
        if (kind === 'unavailable') throw new Error('offline');
        return kind === 'limited' ? 60 : 0;
      });
      const status = {
        page: 200,
        redirect: 303,
        forbidden: 403,
        limited: 429,
        unavailable: 503,
      }[kind];
      const ctx = context(
        '/anmelden',
        kind === 'page' || kind === 'redirect' ? 'GET' : 'POST',
        kind === 'forbidden' ? 'https://foreign.example' : testOrigin,
      );
      const next = vi.fn(
        async () =>
          new Response(null, {
            status: kind === 'redirect' ? 303 : 200,
            headers: kind === 'redirect' ? { Location: '/profil' } : {},
          }),
      ) as MiddlewareNext;
      const response = (await onRequest(ctx, next)) as Response;
      expect(response.status).toBe(status);
      expect(response.headers.get('Content-Security-Policy')).toContain(
        "frame-ancestors 'none'",
      );
      expect(response.headers.get('Content-Security-Policy')).toContain(
        "object-src 'none'",
      );
      expect(response.headers.get('Content-Security-Policy')).toContain(
        "base-uri 'self'",
      );
      expect(response.headers.get('Content-Security-Policy')).toContain(
        "form-action 'self'",
      );
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('Referrer-Policy')).toBe('same-origin');
      if (kind === 'limited') {
        expect(response.headers.get('Retry-After')).toBe('60');
        expect(await response.text()).toContain('60 Sekunden');
      }
      if (kind === 'redirect')
        expect(response.headers.get('Location')).toBe('/profil');
    },
  );

  it('reicht die E-Mail aus dem Formular an den Rate-Limiter weiter', async () => {
    const url = new URL('/anmelden', testOrigin);
    const request = new Request(url, {
      method: 'POST',
      headers: { origin: testOrigin },
      body: new URLSearchParams({
        email: 'Fan@Example.ORG ',
        password: 'unwichtig',
        session_acknowledged: 'on',
      }),
    });
    const ctx = {
      url,
      request,
      locals: {},
      clientAddress: '127.0.0.1',
    } as APIContext;
    await onRequest(ctx, (async () => new Response(null)) as MiddlewareNext);
    expect(authRateLimit).toHaveBeenCalledWith(
      '127.0.0.1',
      '/anmelden',
      'fan@example.org',
    );
  });

  it('erhält den Referrer-Schutz für E-Mail-Tokens', async () => {
    const response = (await onRequest(
      context('/auth/bestaetigen?token_hash=secret'),
      async () => new Response(null, { status: 303 }),
    )) as Response;
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('schwächt eine strengere nachgelagerte CSP nicht ab', async () => {
    const response = (await onRequest(
      context('/anmelden'),
      async () =>
        new Response(null, {
          headers: { 'Content-Security-Policy': "script-src 'self'" },
        }),
    )) as Response;
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "script-src 'self'",
    );
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "frame-ancestors 'none'",
    );
  });
});

describe('Setup-Gate für Leserkonten', () => {
  beforeEach(() => vi.clearAllMocks());

  const gatedContext = (path: string) => {
    const url = new URL(path, testOrigin);
    const ctx = {
      url,
      request: new Request(url, {
        headers: { origin: testOrigin, cookie: 'sb-token=1' },
      }),
      locals: {},
      clientAddress: '127.0.0.1',
      redirect: (target: string, status = 302) =>
        new Response(null, { status, headers: { Location: target } }),
    } as APIContext;
    return ctx;
  };

  const clientWith = (profile: { id: string } | null, user?: object) =>
    ({
      auth: {
        getUser: async () => ({
          data: {
            user:
              user === undefined
                ? {
                    id: 'user-1',
                    email: 'fan@example.org',
                    email_confirmed_at: '2026-10-01T00:00:00Z',
                    app_metadata: {},
                  }
                : user,
          },
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: profile }) }),
        }),
      }),
    }) as unknown as SupabaseClient<Database>;

  it('leitet bestätigte Nutzer ohne Profil in die Einrichtung', async () => {
    vi.mocked(createRequestClient).mockReturnValue(clientWith(null) as never);
    const next = vi.fn(async () => new Response(null)) as MiddlewareNext;
    const response = (await onRequest(
      gatedContext('/beitraege/derby'),
      next,
    )) as Response;
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(
      `/profil/einrichten?weiter=${encodeURIComponent('/beitraege/derby')}`,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('lässt bestätigte Nutzer mit Profil durch', async () => {
    vi.mocked(createRequestClient).mockReturnValue(
      clientWith({ id: 'user-1' }) as never,
    );
    const next = vi.fn(async () => new Response(null)) as MiddlewareNext;
    const response = (await onRequest(gatedContext('/'), next)) as Response;
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalled();
  });

  it.each([
    ['unbestätigt', '/anmelden', { email_confirmed_at: null }],
    ['redaktion', '/admin/login', { app_metadata: { is_editor: true } }],
  ])('überspringt das Gate für %s', async (_kind, path, overrides) => {
    vi.mocked(createRequestClient).mockReturnValue(
      clientWith(
        { id: 'user-1' },
        {
          id: 'user-1',
          email: 'fan@example.org',
          email_confirmed_at: '2026-10-01T00:00:00Z',
          app_metadata: {},
          ...overrides,
        },
      ) as never,
    );
    const next = vi.fn(async () => new Response(null)) as MiddlewareNext;
    const response = (await onRequest(gatedContext(path), next)) as Response;
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalled();
  });

  it('prüft die Datenbank erst nach den freien Pfaden', async () => {
    vi.mocked(createRequestClient).mockReturnValue(clientWith(null) as never);
    const next = vi.fn(async () => new Response(null)) as MiddlewareNext;
    const response = (await onRequest(
      gatedContext('/profil/einrichten'),
      next,
    )) as Response;
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalled();
    expect(clientWith(null).from).toBeTruthy();
  });
});
