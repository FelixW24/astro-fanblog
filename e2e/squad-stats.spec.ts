import { expect, test } from '@playwright/test';

test('Statistiken-Tab schaltet die Fakten-Cards ein und aus', async ({
  page,
}) => {
  await page.goto('/kader');
  const navigation = page.getByRole('navigation', { name: 'Kader-Bereiche' });
  const statsTab = navigation.getByRole('link', { name: 'Statistiken' });
  const statsSection = page.locator('[data-squad-section="statistiken"]');
  const keeperSection = page.locator('[data-squad-section="torwart"]');

  // Ohne aktiven Tab sind die Fakten nicht sichtbar.
  await expect(statsSection).toBeHidden();
  await expect(keeperSection).toBeVisible();

  // In der Timeline-Rail rechts ist Statistiken keine Station.
  const indicator = page.locator('[data-squad-indicator]');
  await expect(
    indicator.locator('[data-indicator-target="statistiken"]'),
  ).toHaveCount(0);
  await expect(indicator.locator('[data-indicator-target]')).toHaveCount(4);

  await statsTab.click();
  await expect(page).toHaveURL(/#statistiken$/);
  await expect(statsSection).toBeVisible();
  await expect(statsTab).toHaveAttribute('aria-current', 'true');
  await expect(keeperSection).toBeHidden();
  await expect(
    statsSection.getByRole('heading', { name: 'Kader in Zahlen' }),
  ).toBeVisible();

  const cards = statsSection.locator('[data-squad-stat]');
  await expect(cards).toHaveCount(8);
  for (const key of [
    'noten',
    'minuten',
    'marktwert',
    'nationen',
    'alter',
    'groesse',
    'vertrag',
    'verletzt',
  ]) {
    const card = statsSection.locator(`[data-squad-stat="${key}"]`);
    await expect(card.locator('.squad-stat__icon svg')).toBeVisible();
    await expect(card.locator('.squad-stat__value')).not.toBeEmpty();
    await expect(card.locator('.squad-stat__label')).not.toBeEmpty();
  }

  // Mindestens eine Karte verlinkt auf ein Spielerprofil.
  const playerLink = statsSection.locator(
    '.squad-stat__detail a[href^="/kader/"]',
  );
  expect(await playerLink.count()).toBeGreaterThan(0);

  // Zurueck zu einem Mannschaftsteil blendet die Fakten wieder aus.
  await navigation.getByRole('link', { name: /Torhüter/ }).click();
  await expect(page).toHaveURL(/#torwart$/);
  await expect(statsSection).toBeHidden();
  await expect(keeperSection).toBeVisible();
});

test('Direktlink #statistiken oeffnet den Statistik-Tab', async ({ page }) => {
  await page.goto('/kader#statistiken');
  await expect(
    page.locator('[data-squad-section="statistiken"]'),
  ).toBeVisible();
  await expect(page.locator('[data-squad-section="torwart"]')).toBeHidden();
});

test('Statistiken-Tab bleibt mobil ohne horizontales Scrollen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/kader');
  await page
    .getByRole('navigation', { name: 'Kader-Bereiche' })
    .getByRole('link', { name: 'Statistiken' })
    .click();
  await expect(
    page.locator('[data-squad-section="statistiken"]'),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
