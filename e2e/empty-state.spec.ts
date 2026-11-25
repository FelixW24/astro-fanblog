import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`Leere Suchergebnisse zeigen den zentralen Leerzustand bei ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/beitraege?suche=keintreffer-6e85f401');
    const empty = page.locator('.empty-state');
    await expect(empty).toBeVisible();
    await expect(empty.locator('.empty-state__icon')).toBeVisible();
    await expect(
      empty.getByRole('heading', { name: 'Keine passenden Beiträge' }),
    ).toBeVisible();
    await expect(
      empty.getByText('Versuche es mit einem anderen Suchbegriff.'),
    ).toBeVisible();
    await expect(empty.getByRole('link')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
