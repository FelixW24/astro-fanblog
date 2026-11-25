import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  for (const width of [320, 360, 390, 620]) {
    test(`Mobile Texte nutzen die Containerbreite: ${theme}, ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (value) => localStorage.setItem('fanblog:theme', value),
        theme,
      );
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const cards = page.locator('.rubric-card');
      await expect(cards).toHaveCount(5);
      for (const card of await cards.all()) {
        const contentWidth = await card.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            element.clientWidth -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight)
          );
        });
        for (const text of await card.locator('h3, p').all()) {
          const bounds = await text.boundingBox();
          expect(bounds!.width).toBeCloseTo(contentWidth, 0);
        }
      }

      const section = page.locator('.section-heading').first();
      const heading = section.getByRole('heading', { level: 2 });
      const sectionBounds = (await section.boundingBox())!;
      const headingBounds = (await heading.boundingBox())!;
      expect(headingBounds.width).toBeGreaterThan(sectionBounds.width * 0.6);

      const actions = page.locator('.board-actions');
      const actionBounds = (await actions.boundingBox())!;
      for (const action of await actions.getByRole('link').all()) {
        const bounds = (await action.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(actionBounds.x);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(
          actionBounds.x + actionBounds.width + 1,
        );
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);

      if (width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: testInfo.outputPath(`startseite-${theme}-mobile.png`),
          fullPage: true,
        });
      }

      // Auch ein einzelnes sehr langes Wort darf die Karte nicht verbreitern.
      await cards
        .first()
        .locator('h3')
        .evaluate((element) => {
          element.textContent = 'Sommertransferberichterstattung'.repeat(6);
        });
      expect(
        await cards.first().evaluate((element) => element.scrollWidth),
      ).toBeLessThanOrEqual(
        await cards.first().evaluate((element) => element.clientWidth),
      );
    });
  }
}

test('Rubriken behalten auf Desktop ihre Textspalten', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  for (const card of await page.locator('.rubric-card').all()) {
    await expect(card.locator('h3')).toHaveCSS('max-width', '70%');
    await expect(card.locator('p')).toHaveCSS('max-width', '72%');
  }
});
