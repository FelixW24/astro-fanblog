import { expect, test } from '@playwright/test';
import process from 'node:process';
import { loadEnv } from 'vite';

const publicOrigin = new URL(
  process.env.SITE_ORIGIN ||
    loadEnv(process.env.NODE_ENV || 'production', process.cwd(), 'SITE_ORIGIN')
      .SITE_ORIGIN ||
    'https://example.com',
);
const proxyHeaders = {
  'X-Forwarded-Host': publicOrigin.host,
  'X-Forwarded-Proto': publicOrigin.protocol.slice(0, -1),
  'X-Forwarded-For': '192.0.2.48',
};

test('Anmeldung hinter dem Proxy erreicht die Formularprüfung', async ({
  request,
}) => {
  const response = await request.post('/anmelden', {
    headers: { ...proxyHeaders, Origin: publicOrigin.origin },
    form: { session_acknowledged: 'off' },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
  expect(await response.text()).toContain(
    'Bitte bestätige, dass du die Datenschutzhinweise zur Kenntnis genommen hast.',
  );
});

test('Fremder Formular-Origin bleibt hinter dem Proxy gesperrt', async ({
  request,
}) => {
  const response = await request.post('/anmelden', {
    headers: { ...proxyHeaders, Origin: 'https://foreign.example' },
    form: { session_acknowledged: 'off' },
  });
  expect(response.status()).toBe(403);
});

test('Ein fremder Proxy-Host kann keine Formularfreigabe erzeugen', async ({
  request,
}) => {
  const response = await request.post('/anmelden', {
    headers: {
      ...proxyHeaders,
      'X-Forwarded-Host': 'foreign.example',
      Origin: 'https://foreign.example',
    },
    form: { session_acknowledged: 'off' },
  });
  expect(response.status()).toBe(403);
});
