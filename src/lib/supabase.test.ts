import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AstroCookies } from 'astro';
const { createSsr } = vi.hoisted(() => ({ createSsr: vi.fn() }));
vi.mock('@supabase/ssr', async (original) => ({
  ...(await original<object>()),
  createServerClient: createSsr,
}));
import { createRequestClient } from './supabase';

describe('Request-Sitzungen', () => {
  beforeEach(() => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', 'http://localhost:55321');
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test');
    createSsr.mockReset().mockImplementation(() => ({ auth: {} }));
  });
  it('teilt einen Client innerhalb eines Requests, isoliert andere Benutzer und liest erneuerte Cookies', () => {
    const request = new Request('https://blog.example', {
      headers: { cookie: 'sb-test-auth-token=old' },
    });
    const context = {
      request,
      cookies: { set: vi.fn() } as unknown as AstroCookies,
    };
    const client = createRequestClient(context);
    const adapter = createSsr.mock.calls[0][2].cookies;
    adapter.setAll([
      { name: 'sb-test-auth-token', value: 'new', options: { maxAge: 100 } },
    ]);
    expect(createRequestClient(context)).toBe(client);
    expect(adapter.getAll()).toEqual([
      { name: 'sb-test-auth-token', value: 'new' },
    ]);
    const other = new Request('https://blog.example');
    expect(
      createRequestClient({
        request: other,
        cookies: { set: vi.fn() } as unknown as AstroCookies,
      }),
    ).not.toBe(client);
    adapter.setAll([
      { name: 'sb-test-auth-token', value: '', options: { maxAge: 0 } },
    ]);
    expect(adapter.getAll()).toEqual([]);
    expect(createSsr).toHaveBeenCalledTimes(2);
  });
});
