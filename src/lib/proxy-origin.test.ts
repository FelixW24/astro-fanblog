import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { createRequest } from 'astro/app/node';
import { loadEnv } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Der Test prueft die Origin-Ableitung in astro.config.mjs; die Adapter- und
// SDK-Imports der Config sind hierfuer irrelevant und wuerden den Test durch
// ihren Kaltstart ueber das Standard-Timeout treiben.
vi.mock('astro/config', () => ({ defineConfig: (config: unknown) => config }));
vi.mock('@astrojs/node', () => ({ default: () => ({ name: '@astrojs/node' }) }));
vi.mock('@sentry/astro', () => ({ default: () => ({ name: '@sentry/astro' }) }));
vi.mock('vite', () => ({ loadEnv: vi.fn(() => ({})) }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('SITE_ORIGIN', '');
  vi.mocked(loadEnv).mockReturnValue({});
});

afterEach(() => vi.unstubAllEnvs());

async function proxyRequest(host = 'example.com', protocol = 'https') {
  const { default: config } = await import('../../astro.config.mjs');
  const incoming = new IncomingMessage(new Socket());
  incoming.method = 'POST';
  incoming.url = '/anmelden';
  incoming.headers = {
    host: '127.0.0.1:4321',
    origin: `${protocol}://${host}`,
    'content-type': 'application/x-www-form-urlencoded',
    'x-forwarded-host': host,
    'x-forwarded-proto': protocol,
  };
  return createRequest(incoming, {
    skipBody: true,
    allowedDomains: config.security?.allowedDomains,
  });
}

describe('Öffentlicher Origin hinter dem HTTPS-Proxy', () => {
  it('erkennt example.com ohne SITE_ORIGIN beim Build als Formular-Origin', async () => {
    const request = await proxyRequest();
    expect(new URL(request.url).origin).toBe('https://example.com');
    expect(request.headers.get('origin')).toBe(new URL(request.url).origin);
  });

  it('übernimmt eine abweichende Domain aus der Build-Umgebung', async () => {
    vi.stubEnv('SITE_ORIGIN', 'https://staging.example:8443');
    const request = await proxyRequest('staging.example:8443');
    expect(new URL(request.url).origin).toBe('https://staging.example:8443');
  });

  it('übernimmt SITE_ORIGIN auch aus einer env-Datei', async () => {
    vi.mocked(loadEnv).mockReturnValue({ SITE_ORIGIN: 'https://env.example' });
    const request = await proxyRequest('env.example');
    expect(new URL(request.url).origin).toBe('https://env.example');
  });

  it('vertraut einem fremden Proxy-Host nicht', async () => {
    const request = await proxyRequest('foreign.example');
    expect(new URL(request.url).origin).not.toBe('https://foreign.example');
  });
});
