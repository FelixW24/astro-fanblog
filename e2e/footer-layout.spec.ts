import { expect, test } from '@playwright/test';

test('Footer schließt kurze Kategorieseiten auf Desktop und Mobilgeräten ab', async ({
  page,
}) => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 900 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/kategorie/news');

    const pageFooter = await page.locator('.site-footer').boundingBox();
    expect(pageFooter).not.toBeNull();
    expect(pageFooter!.y + pageFooter!.height).toBeGreaterThanOrEqual(
      viewport.height - 1,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeCloseTo(pageFooter!.y + pageFooter!.height, 0);

    // Auch eine leere Rubrik soll den Footer am unteren Fensterrand halten.
    await page.locator('main').evaluate((main) => main.replaceChildren());

    const footer = await page.locator('.site-footer').boundingBox();
    expect(footer).not.toBeNull();
    expect(footer!.y + footer!.height).toBeGreaterThanOrEqual(
      viewport.height - 1,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeCloseTo(footer!.y + footer!.height, 0);
    if (viewport.width > 820) {
      const navbar = await page.locator('.site-header').boundingBox();
      const navbarEnd = navbar!.y + navbar!.height;
      expect(footer!.y).toBeGreaterThanOrEqual(navbarEnd - 1);
      expect(footer!.y + footer!.height).toBeCloseTo(viewport.height, 0);
    } else if (viewport.height >= 900) {
      expect(footer!.y + footer!.height).toBeCloseTo(viewport.height, 0);
    }
  }
});
