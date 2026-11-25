import type { APIContext } from 'astro';
import { describe, expect, it } from 'vitest';
import { POST } from '../pages/api/kommentare/vote';

const testOrigin =
  process.env.SITE_ORIGIN ||
  import.meta.env.SITE_ORIGIN ||
  'https://blog.example';

type MockOptions = {
  user?: { id: string; email_confirmed_at?: string | null } | null;
  profile?: { id: string; is_ghost: boolean } | null;
  article?: { id: number } | null;
  comment?: { id: number } | null;
};

function makeContext({
  user = { id: 'reader-1', email_confirmed_at: '2026-01-01' },
  profile = { id: 'reader-1', is_ghost: false },
  article = { id: 5 },
  comment = { id: 7 },
}: MockOptions = {}) {
  const chain = (result: unknown) => {
    const query = {
      select: () => query,
      eq: () => query,
      lte: () => query,
      maybeSingle: async () => ({ data: result, error: null }),
      delete: () => query,
      upsert: () => query,
      then: (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(onFulfilled),
    };
    return query;
  };
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user } }),
    },
    from: (table: string) => {
      if (table === 'reader_profiles') return chain(profile);
      if (table === 'articles') return chain(article);
      return chain(comment);
    },
    rpc: async () => ({
      data: [{ comment_id: 7, likes: 4, dislikes: 0 }],
      error: null,
    }),
  };
  const form = new FormData();
  form.set('article_slug', 'test-beitrag');
  form.set('action', 'vote');
  form.set('comment_id', '7');
  form.set('value', '1');
  return {
    request: new Request(`${testOrigin}/api/kommentare/vote`, {
      method: 'POST',
      headers: { Origin: testOrigin },
      body: form,
    }),
    locals: { supabase },
  } as unknown as APIContext;
}

describe('POST /api/kommentare/vote', () => {
  it('speichert den Vote und liefert JSON mit neuem Score', async () => {
    const response = await POST(makeContext());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(await response.json()).toEqual({
      ok: true,
      commentId: 7,
      value: 1,
      likes: 4,
      dislikes: 0,
    });
  });

  it('antwortet 401 ohne Anmeldung', async () => {
    const response = await POST(makeContext({ user: null }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: 'login' });
  });

  it('antwortet 403 bei unbestätigter E-Mail', async () => {
    const response = await POST(
      makeContext({ user: { id: 'reader-1', email_confirmed_at: null } }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: 'email' });
  });

  it('antwortet 403 im Geistermodus', async () => {
    const response = await POST(
      makeContext({ profile: { id: 'reader-1', is_ghost: true } }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: 'ghost' });
  });

  it('antwortet 404, wenn der Beitrag nicht veröffentlicht ist', async () => {
    const response = await POST(makeContext({ article: null }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: 'invalid' });
  });

  it('antwortet 400 bei ungültigem Wert', async () => {
    const context = makeContext();
    const form = new FormData();
    form.set('article_slug', 'test-beitrag');
    form.set('action', 'vote');
    form.set('comment_id', '7');
    form.set('value', '5');
    const response = await POST({
      request: new Request(`${testOrigin}/api/kommentare/vote`, {
        method: 'POST',
        headers: { Origin: testOrigin },
        body: form,
      }),
      locals: context.locals,
    } as unknown as APIContext);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'invalid' });
  });

  it('lehnt Cross-Origin-Anfragen ab', async () => {
    const context = makeContext();
    const response = await POST({
      ...context,
      request: new Request(`${testOrigin}/api/kommentare/vote`, {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
        body: new FormData(),
      }),
    } as unknown as APIContext);
    expect(response.status).toBe(403);
  });
});
