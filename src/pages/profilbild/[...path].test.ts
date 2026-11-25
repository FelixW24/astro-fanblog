import type { APIContext } from 'astro';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './[...path]';

const userId = '11111111-1111-1111-1111-111111111111';

function createContext(path: string | undefined): APIContext {
  return { params: { path } } as unknown as APIContext;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /profilbild/[...path]', () => {
  it('lehnt ungueltige Pfade ab', async () => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', 'http://supabase.test');
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    for (const path of [
      '../etc/passwd',
      'not-a-uuid/avatar.webp',
      `${userId}/avatar.gif`,
      `${userId}/other.webp`,
      undefined,
    ]) {
      const response = await GET(createContext(path));
      expect(response.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxied das Bild aus dem Storage mit Content-Type und Cache-Headern', async () => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', 'http://supabase.test');
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'key');
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'image/webp', etag: '"abc"' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(createContext(`${userId}/avatar.webp`));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://supabase.test/storage/v1/object/public/reader-avatars/${userId}/avatar.webp`,
      { headers: { apikey: 'key' } },
    );
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('etag')).toBe('"abc"');
    expect(response.headers.get('cache-control')).toContain('max-age=300');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it('liefert 404, wenn das Objekt im Storage fehlt', async () => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', 'http://supabase.test');
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'key');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('NoSuchKey', { status: 404 })),
    );

    const response = await GET(createContext(`${userId}/avatar.png`));
    expect(response.status).toBe(404);
  });

  it('liefert 502, wenn der Storage nicht erreichbar ist', async () => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', 'http://supabase.test');
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'key');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );

    const response = await GET(createContext(`${userId}/avatar.png`));
    expect(response.status).toBe(502);
  });
});
