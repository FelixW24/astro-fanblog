import { expect, test } from '@playwright/test';

test('HTML, Weiterleitungen und abgewiesene POSTs tragen Sicherheitsheader', async ({
  request,
}) => {
  const responses = [
    await request.get('/anmelden'),
    await request.get('/auth/passwort-zuruecksetzen', { maxRedirects: 0 }),
    await request.post('/anmelden', {
      headers: { Origin: 'https://foreign.example' },
      data: {},
    }),
  ];
  expect(responses.map((response) => response.status())).toEqual([
    200, 303, 403,
  ]);
  for (const response of responses) {
    expect(response.headers()['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers()['x-frame-options']).toBe('DENY');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  }
});

test('Chromium blockiert das Einbetten der Anmeldeseite', async ({ page }) => {
  await page.route('**/__frame-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Frame test</title><iframe src="/anmelden" title="Anmeldung"></iframe>',
    }),
  );
  const blocked = page.waitForEvent('console', {
    predicate: (message) => message.text().includes('frame-ancestors'),
  });
  await page.goto('/__frame-test');
  expect((await blocked).text()).toContain("frame-ancestors 'none'");
  await expect(
    page.frameLocator('iframe').getByRole('button', { name: /^Anmelden/ }),
  ).toHaveCount(0);
});
