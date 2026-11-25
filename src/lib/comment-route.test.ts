import type { APIContext } from 'astro';
import { describe, expect, it } from 'vitest';
import { POST } from '../pages/kommentare';

const testOrigin =
  process.env.SITE_ORIGIN ||
  import.meta.env.SITE_ORIGIN ||
  'https://blog.example';

describe('Kommentarfehler im Formular', () => {
  it.each([
    ['comment_rate_limited', 'rate'],
    ['comment_banned', 'banned'],
    ['internal details must stay private', 'save'],
  ])('übersetzt %s ohne interne Details', async (message, expected) => {
    const query = {
      select: () => query,
      eq: () => query,
      lte: () => query,
      maybeSingle: async () => ({ data: { id: 1 } }),
    };
    const form = new FormData();
    form.set('article_slug', 'test-beitrag');
    form.set('action', 'comment');
    form.set('body', 'Ein Kommentar');
    const response = await POST({
      request: new Request(`${testOrigin}/kommentare`, {
        method: 'POST',
        headers: { Origin: testOrigin },
        body: form,
      }),
      locals: {
        supabase: {
          auth: {
            getUser: async () => ({
              data: {
                user: { id: 'reader', email_confirmed_at: '2026-01-01' },
              },
            }),
          },
          from: () => query,
          rpc: () => ({
            single: async () => ({ data: null, error: { message } }),
          }),
        },
      },
    } as unknown as APIContext);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(
      `/beitraege/test-beitrag?kommentarfehler=${expected}#kommentare`,
    );
  });
});
