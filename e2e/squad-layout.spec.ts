import { expect, test } from '@playwright/test';

test('Kadernavigation und Spielerprofile', async ({ page }) => {
  await page.goto('/kader');
  await expect(
    page.getByRole('heading', { name: 'Unser Kader.' }),
  ).toBeVisible();
  const navigation = page.getByRole('navigation', { name: 'Kader-Bereiche' });
  await expect(
    page.locator('.page-hero--squad [data-squad-nav]'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Saison 2026/27 · Fehlende Spielerangaben sind mit „–“ gekennzeichnet.',
    ),
  ).toHaveCount(0);
  await expect(page.locator('.squad-facts dt').first()).toHaveText('Alter');
  await expect(page.locator('.squad-facts dd').first()).toHaveText(
    /^\d+ Jahre$/,
  );
  await navigation.getByRole('link', { name: /Abwehr/ }).click();
  await expect(page).toHaveURL(/#abwehr$/);
  const cards = page.locator('#torwart .player-card');
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(
    page.getByRole('combobox', { name: 'Spieler sortieren' }),
  ).toHaveCount(0);
  await cards.first().click();
  await expect(page).toHaveURL(/\/kader\/.+/);
});

for (const theme of ['light', 'dark']) {
  test(`Kader bleibt mobil im ${theme} Theme lesbar`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (value) => localStorage.setItem('theme', value),
      theme,
    );
    await page.goto('/kader');
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    await expect(
      page.getByRole('navigation', { name: 'Kader-Bereiche' }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await expect(page.locator('.squad-facts').first()).toBeVisible();
  });
}
