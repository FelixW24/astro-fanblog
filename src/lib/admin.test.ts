import type { User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRequestClient } = vi.hoisted(() => ({
  createRequestClient: vi.fn(),
}));

vi.mock('./supabase', () => ({ createRequestClient }));

import {
  articlePayload,
  articleToFormValues,
  editorAuthBypassEnabled,
  emptyArticle,
  getAdmin,
  getSiteAdmin,
  isAdmin,
  isSiteAdmin,
  isSameOrigin,
  parseArticleForm,
} from './admin';
import type { Article } from './content';
import { issueTrustedDeviceCookie } from './auth-security';

function validForm(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string> = {
    slug: 'mein-beitrag',
    title: 'Ein gültiger Titel',
    excerpt: 'Ein ausreichend langer Teaser für diesen Beitrag.',
    content: 'Ein ausreichend langer Inhalt für diesen Beitrag.',
    category: 'news',
    status: 'draft',
    author: 'Astro Fanblog Redaktion',
    read_minutes: '5',
    published_at: '',
    tags: 'FC, Example, fc',
    seo_title: '',
    seo_description: '',
    cover_image_url: '',
    cover_image_alt: '',
    source_urls: '',
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
  };
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.set(key, value));
  if (overrides.is_featured === 'on') form.set('is_featured', 'on');
  return form;
}

describe('Admin-Berechtigung', () => {
  const config = {
    email: 'admin@fanblog.local',
    password: 'Nur-für-den-Test',
  };
  const admin = {
    id: 'admin-user-id',
    email: config.email,
    app_metadata: { is_editor: true },
  } as unknown as User;

  it('erkennt ausschließlich das vertrauenswürdige Profilflag', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(
      isAdmin({
        email: config.email,
        app_metadata: { role: 'editor' },
      } as unknown as User),
    ).toBe(false);
    expect(
      isAdmin({
        email: 'andere@fanblog.local',
        app_metadata: { role: 'admin' },
      } as unknown as User),
    ).toBe(false);
    expect(
      isAdmin({
        app_metadata: {},
        user_metadata: { is_editor: true },
      } as unknown as User),
    ).toBe(false);
    expect(
      isAdmin({
        email: 'weitere@example.org',
        app_metadata: { is_editor: true },
      } as unknown as User),
    ).toBe(true);
    expect(isAdmin(null)).toBe(false);
  });

  it('prüft den Origin-Header', () => {
    const testOrigin =
      process.env.SITE_ORIGIN ||
      import.meta.env.SITE_ORIGIN ||
      'https://blog.example';
    expect(
      isSameOrigin(
        new Request(`${testOrigin}/admin`, {
          headers: { origin: testOrigin },
        }),
      ),
    ).toBe(true);
    expect(isSameOrigin(new Request(`${testOrigin}/admin`))).toBe(false);
  });

  it('akzeptiert hinter dem Proxy nur die konfigurierte öffentliche Origin', () => {
    const previousOrigin = process.env.SITE_ORIGIN;
    process.env.SITE_ORIGIN = 'https://blog.example';
    try {
      const request = (origin: string) =>
        new Request('http://localhost:4321/anmelden', {
          method: 'POST',
          headers: { origin },
        });
      expect(isSameOrigin(request('https://blog.example'))).toBe(true);
      expect(isSameOrigin(request('https://foreign.example'))).toBe(false);
      expect(isSameOrigin(request('http://localhost:4321'))).toBe(false);
    } finally {
      if (previousOrigin === undefined) delete process.env.SITE_ORIGIN;
      else process.env.SITE_ORIGIN = previousOrigin;
    }
  });

  it('gibt nur Admins aus getAdmin zurück', async () => {
    const noCookies = { get: () => undefined };
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: admin } }),
        mfa: {
          getAuthenticatorAssuranceLevel: vi
            .fn()
            .mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null }),
        },
      },
    };
    createRequestClient.mockReturnValue(client);
    await expect(getAdmin({ cookies: noCookies } as never)).resolves.toEqual({
      supabase: client,
      user: admin,
    });

    client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1' },
      error: null,
    });
    await expect(getAdmin({ cookies: noCookies } as never)).resolves.toEqual({
      supabase: client,
      user: null,
    });

    // Gueltiges Vertrauens-Cookie (24h) ersetzt die AAL2-Pruefung.
    vi.stubEnv('EDITOR_TRUST_SECRET', 'test-secret-' + 'x'.repeat(32));
    const trustedCookie = issueTrustedDeviceCookie(admin.id);
    const trustedCookies = { get: () => ({ value: trustedCookie }) };
    await expect(
      getAdmin({ cookies: trustedCookies } as never),
    ).resolves.toEqual({ supabase: client, user: admin });
    vi.unstubAllEnvs();

    client.auth.getUser.mockResolvedValue({
      data: { user: { app_metadata: { role: 'editor' } } },
    });
    await expect(getAdmin({ cookies: noCookies } as never)).resolves.toEqual({
      supabase: client,
      user: null,
    });
  });
});

describe('Site-Admin-Berechtigung (Benutzerverwaltung)', () => {
  const noCookies = { get: () => undefined };
  const editorOnly = {
    id: 'editor-id',
    email: 'redaktion@example.org',
    app_metadata: { is_editor: true },
  } as unknown as User;
  const siteAdmin = {
    id: 'site-admin-id',
    email: 'admin@example.org',
    app_metadata: { is_editor: true, is_admin: true },
  } as unknown as User;

  it('erkennt ausschließlich das serverseitige app_metadata.is_admin', () => {
    expect(isSiteAdmin(siteAdmin)).toBe(true);
    // is_editor allein reicht nicht; user_metadata wird ignoriert.
    expect(isSiteAdmin(editorOnly)).toBe(false);
    expect(
      isSiteAdmin({
        app_metadata: {},
        user_metadata: { is_admin: true },
      } as unknown as User),
    ).toBe(false);
    expect(isSiteAdmin(null)).toBe(false);
  });

  it('getSiteAdmin verlangt Redaktionszugang plus is_admin', async () => {
    const client = {
      auth: {
        getUser: vi.fn(),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
            data: { currentLevel: 'aal2' },
            error: null,
          }),
        },
      },
    };
    createRequestClient.mockReturnValue(client);

    client.auth.getUser.mockResolvedValue({ data: { user: editorOnly } });
    await expect(
      getSiteAdmin({ cookies: noCookies } as never),
    ).resolves.toEqual({ supabase: client, user: null });

    client.auth.getUser.mockResolvedValue({ data: { user: siteAdmin } });
    await expect(
      getSiteAdmin({ cookies: noCookies } as never),
    ).resolves.toEqual({ supabase: client, user: siteAdmin });

    // is_admin ohne is_editor (bzw. ohne AAL2) reicht ebenfalls nicht.
    client.auth.getUser.mockResolvedValue({
      data: { user: { app_metadata: { is_admin: true } } },
    });
    await expect(
      getSiteAdmin({ cookies: noCookies } as never),
    ).resolves.toEqual({ supabase: client, user: null });

    client.auth.getUser.mockResolvedValue({ data: { user: siteAdmin } });
    client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1' },
      error: null,
    });
    await expect(
      getSiteAdmin({ cookies: noCookies } as never),
    ).resolves.toEqual({ supabase: client, user: null });
  });
});

describe('Dev-Bypass für die Redaktion', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('ist ohne EDITOR_AUTH_BYPASS deaktiviert', () => {
    expect(editorAuthBypassEnabled()).toBe(false);
  });

  it('ist nur mit exakt „development" aktiv', () => {
    vi.stubEnv('EDITOR_AUTH_BYPASS', 'development');
    expect(editorAuthBypassEnabled()).toBe(true);
    vi.stubEnv('EDITOR_AUTH_BYPASS', 'production');
    expect(editorAuthBypassEnabled()).toBe(false);
  });
});

describe('parseArticleForm', () => {
  it('normalisiert gültige Eingaben', () => {
    const result = parseArticleForm(
      validForm({
        slug: '  Mein-Beitrag  ',
        tags: 'FC, Example, fc',
        source_urls:
          'https://example.com/a\nhttps://example.com/a\nhttp://example.com/b',
        cover_image_url: 'https://example.com/bild.jpg',
        cover_image_alt: 'Spielszene in Example',
        is_featured: 'on',
      }),
    );
    expect(result.error).toBeNull();
    expect(result.values).toMatchObject({
      slug: 'mein-beitrag',
      tags: ['FC', 'Example'],
      is_featured: true,
      source_urls: ['https://example.com/a', 'http://example.com/b'],
    });
  });

  it.each([
    ['Slug', { slug: 'kein slug' }, 'Slug'],
    ['Titel kurz', { title: 'Vier' }, 'Titel'],
    ['Teaser', { excerpt: 'Zu kurz' }, 'Teaser'],
    ['Inhalt', { content: 'Zu kurz' }, 'Beitragstext'],
    ['Kategorie', { category: 'falsch' }, 'Kategorie'],
    ['Status', { status: 'falsch' }, 'Status'],
    ['Autor', { author: '' }, 'Autorennamen'],
    ['Lesezeit', { read_minutes: '0' }, 'Lesezeit'],
    ['Datum', { published_at: 'ungueltig' }, 'Veröffentlichungsdatum'],
    ['Zeitumstellung', { published_at: '2026-03-29T02:30' }, 'Zeitumstellung'],
    [
      'Tags',
      { tags: Array.from({ length: 11 }, (_, i) => `Tag${i}`).join(',') },
      'Schlagwörter',
    ],
    ['SEO-Titel', { seo_title: 'SEO' }, 'SEO-Titel'],
    ['SEO-Beschreibung', { seo_description: 'Zu kurz' }, 'SEO-Beschreibung'],
    [
      'Bild-URL',
      {
        cover_image_url: 'ftp://example.com/bild.jpg',
        cover_image_alt: 'Ein Bild',
      },
      'Bild-URL',
    ],
    [
      'Bildpaar',
      { cover_image_url: 'https://example.com/bild.jpg' },
      'Bild-URL und Alternativtext',
    ],
    [
      'Alternativtext',
      {
        cover_image_url: 'https://example.com/bild.jpg',
        cover_image_alt: 'kurz',
      },
      'Alternativtext',
    ],
    ['Quelle', { source_urls: 'ftp://example.com' }, 'Quellen-URLs'],
  ])('%s wird validiert', (_name, overrides, message) => {
    const result = parseArticleForm(validForm(overrides));
    if (message) expect(result.error).toContain(message);
    else expect(result.error).toBeNull();
  });
});

describe('Artikelwerte und Payload', () => {
  beforeEach(() => vi.useRealTimers());

  it('enthält sinnvolle Leerwerte', () => {
    expect(emptyArticle).toMatchObject({
      status: 'draft',
      category: 'news',
      read_minutes: 5,
    });
  });

  it('wandelt Datenbankwerte in Formularwerte um', () => {
    const article = {
      ...emptyArticle,
      id: 1,
      published_at: '2026-09-01T10:30:00.000Z',
      seo_title: null,
      seo_description: null,
      cover_image_url: null,
      cover_image_alt: null,
    } as unknown as Article;
    expect(articleToFormValues(article)).toMatchObject({
      published_at: '2026-09-01T12:30',
      seo_title: '',
      cover_image_url: '',
    });
  });

  it('erzeugt Payloads für Entwurf und Veröffentlichung', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'));
    const draft = articlePayload({
      ...emptyArticle,
      slug: 'test',
      title: 'Titel',
      published_at: '',
    });
    expect(draft.published_at).toBeNull();
    expect(draft.seo_title).toBeNull();
    expect(draft.updated_at).toBe('2026-09-01T12:00:00.000Z');

    const published = articlePayload({
      ...emptyArticle,
      slug: 'test',
      title: 'Titel',
      status: 'published',
      published_at: '2026-09-01T14:00',
      seo_title: 'SEO Titel',
    });
    expect(published.published_at).toBe('2026-09-01T12:00:00.000Z');
    expect(published.seo_title).toBe('SEO Titel');

    const immediate = articlePayload({ ...emptyArticle, status: 'published' });
    expect(immediate.published_at).toBe('2026-09-01T12:00:00.000Z');
  });
});
