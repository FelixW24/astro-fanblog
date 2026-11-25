import { expect, test } from '@playwright/test';

test('Artikelraster nutzt freie Containerbreite für alleinstehende Karten', async ({
  page,
}) => {
  await page.goto('/');
  await page.setViewportSize({ width: 1280, height: 844 });

  await page.evaluate(() => {
    const grid = document.createElement('div');
    grid.className = 'article-grid';
    grid.setAttribute('data-test-fluid-grid', '');
    grid.style.width = '900px';

    for (let index = 0; index < 3; index += 1) {
      const card = document.createElement('a');
      card.className = 'article-card-link';
      card.href = '#';
      card.textContent = `Testbeitrag ${index + 1}`;
      grid.append(card);
    }

    document.body.append(grid);
  });

  const grid = page.locator('[data-test-fluid-grid]');
  const cards = grid.locator('.article-card-link');

  await expect(cards).toHaveCount(3);

  const gridBox = await grid.boundingBox();
  const firstBox = await cards.first().boundingBox();
  const lastBox = await cards.last().boundingBox();

  if (!gridBox || !firstBox || !lastBox) {
    throw new Error('Artikelraster konnte nicht vermessen werden.');
  }

  expect(firstBox.width).toBeLessThan(gridBox.width);
  expect(Math.abs(lastBox.width - gridBox.width)).toBeLessThanOrEqual(1);
});
