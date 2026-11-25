import { expect, test } from '@playwright/test';

async function expectCardsStackedWithoutOverlap(
  page: import('@playwright/test').Page,
  selector: string,
  carousel = false,
) {
  const cards = page.locator(selector);
  expect(await cards.count()).toBeGreaterThan(0);

  for (const card of await cards.all()) {
    const visual = card.locator('.card-visual');
    const copy = card.locator('.card-copy');

    const cardBounds = await card.boundingBox();
    const visualBounds = await visual.boundingBox();
    const copyBounds = await copy.boundingBox();

    expect(cardBounds).not.toBeNull();
    expect(visualBounds).not.toBeNull();
    expect(copyBounds).not.toBeNull();

    expect(visualBounds!.y + visualBounds!.height).toBeLessThanOrEqual(
      copyBounds!.y + 0.5,
    );
    expect(visualBounds!.x).toBeGreaterThanOrEqual(cardBounds!.x);
    expect(copyBounds!.x).toBeGreaterThanOrEqual(cardBounds!.x);
    expect(visualBounds!.x + visualBounds!.width).toBeLessThanOrEqual(
      cardBounds!.x + cardBounds!.width,
    );
    expect(copyBounds!.x + copyBounds!.width).toBeLessThanOrEqual(
      cardBounds!.x + cardBounds!.width,
    );

    await expect(card).toHaveCSS('overflow', 'hidden');
    if (carousel) {
      await expect(visual).toHaveCSS('height', '170px');
    } else {
      await expect(visual).toHaveCSS('aspect-ratio', '16 / 9');
    }
  }
}

test('Beitragskarten überlappen auf mobilen Viewports niemals Bild und Text', async ({
  page,
}) => {
  for (const width of [620, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });

    await page.goto('/beitraege');
    await expectCardsStackedWithoutOverlap(page, '.article-grid .article-card');

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);

    await page.goto('/');
    await expectCardsStackedWithoutOverlap(
      page,
      '.latest-carousel__slide .article-card',
      true,
    );

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }

  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/beitraege');
  await page.screenshot({
    path: 'test-results/article-cards-mobile.png',
    fullPage: true,
  });
});
