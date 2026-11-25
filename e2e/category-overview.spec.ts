import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  for (const width of [320, 390, 1440]) {
    test(`Rubriknavigation und Layout: ${theme}, ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (value) => localStorage.setItem('fanblog:theme', value),
        theme,
      );
      await page.goto('/kategorie/spielbericht-analyse');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        'Spielberichte',
      );
      await expect(
        page.getByRole('navigation', { name: 'Weitere Rubriken' }),
      ).toHaveCount(0);
      if (width <= 820) {
        await page
          .getByRole('button', { name: 'Menü öffnen', exact: true })
          .click();
      }
      const nav = page.getByRole('navigation', {
        name: 'Hauptnavigation',
        exact: true,
      });
      await expect(
        nav.getByRole('link', { name: 'Spielberichte', exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      await nav.getByRole('link', { name: 'News', exact: true }).click();
      await expect(page).toHaveURL(/\/kategorie\/news$/);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        'News',
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: testInfo.outputPath(`rubrik-${theme}-${width}.png`),
        fullPage: true,
      });
    });
  }
}
