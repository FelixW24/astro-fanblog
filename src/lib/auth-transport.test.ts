import { describe, expect, it, vi } from 'vitest';
import { authTransport } from './auth-transport';

describe('Vertrauenswürdige Auth-IP-Weiterleitung', () => {
  it('sendet den Secret-Key nur an Auth, niemals an die Data API oder fremde Hosts', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response());
    const send = authTransport(
      'https://db.example',
      'public',
      '192.0.2.1',
      'sb_secret_test',
      true,
      fetcher,
    );
    await send('https://db.example/auth/v1/token', {
      headers: { Authorization: 'Bearer public' },
    });
    expect(fetcher.mock.calls[0][1].headers.get('apikey')).toBe(
      'sb_secret_test',
    );
    expect(fetcher.mock.calls[0][1].headers.get('Sb-Forwarded-For')).toBe(
      '192.0.2.1',
    );
    await send('https://db.example/auth/v1/user', {
      headers: { Authorization: 'Bearer user-token' },
    });
    expect(fetcher.mock.calls[1][1].headers.get('Authorization')).toBe(
      'Bearer user-token',
    );
    await send('https://db.example/rest/v1/articles');
    await send('https://other.example/auth/v1/token');
    expect(fetcher.mock.calls[2][1]).toBeUndefined();
    expect(fetcher.mock.calls[3][1]).toBeUndefined();
  });
  it('verweigert produktive Auth-Aufrufe bei fehlender sicherer Konfiguration', async () => {
    const fetcher = vi.fn();
    await expect(
      authTransport(
        'https://db.example',
        'public',
        '192.0.2.1',
        undefined,
        true,
        fetcher,
      )('https://db.example/auth/v1/token'),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
