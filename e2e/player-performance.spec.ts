import { expect, test } from '@playwright/test';

test('serves performance data and profile metadata without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/kader/lukas-luecke');
  const card = page.locator('.player-chart-card').first();
  await expect(card.getByRole('table')).toHaveCount(0);
  await expect(card.locator('figcaption')).toHaveCount(0);
  await expect(card.getByText(/Vergleichsgruppe und Zeitraum/)).toHaveCount(0);
  await expect(card.getByRole('img')).toHaveAccessibleName(
    'Torwartprofil 2026/27: Reflexe 86, Strafraum 78, Aufbau 81, Eins gegen Eins 84, Lange Bälle 76',
  );
  await expect(
    card.getByRole('group', { name: 'Torwartprofil 2026/27', exact: true }),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/kader\/lukas-luecke$/,
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /Lukas Lücke/,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  const data = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  expect(
    data
      .map((value) => JSON.parse(value))
      .some(
        (value) =>
          value['@type'] === 'Person' && value.name === 'Lukas Lücke',
      ),
  ).toBe(true);
  const robots = await page.request.get('/robots.txt');
  expect(await robots.text()).not.toContain('Disallow: /kader');
  await context.close();
});
