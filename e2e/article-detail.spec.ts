import { expect, test } from '@playwright/test';

test('zeigt eine deckende Lesefläche in beiden Themes und auf Mobilgeräten', async ({
  page,
}) => {
  await page.goto('/');
  const href = await page
    .locator('.article-card-link')
    .first()
    .getAttribute('href');
  expect(href).toMatch(/^\/beitraege\//);
  await page.goto(href!);
  const article = page.locator('.article-detail');
  const comments = article.locator('.reader-comments');
  const readingProgress = page.locator('[data-reading-progress]');
  const commentsHeading = comments.locator('.reader-comments__heading');
  const jumpUp = commentsHeading.getByRole('link', {
    name: 'Zum Seitenanfang',
  });
  await expect(article.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(comments).toBeVisible();
  await expect(jumpUp).toBeVisible();
  const articleBounds = await article.boundingBox();
  const commentBounds = await comments.boundingBox();
  expect(commentBounds?.x).toBeCloseTo(articleBounds!.x, 0);
  expect(commentBounds?.width).toBeCloseTo(articleBounds!.width, 0);
  // Der Nach-oben-Button sitzt in derselben Zeile wie die „Kommentare“-Überschrift.
  const headingBounds = await commentsHeading.locator('h2').boundingBox();
  const jumpUpBounds = await jumpUp.boundingBox();
  expect(
    Math.abs(
      jumpUpBounds!.y +
        jumpUpBounds!.height / 2 -
        (headingBounds!.y + headingBounds!.height / 2),
    ),
  ).toBeLessThanOrEqual(2);
  const bodyFont = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).fontFamily);
  await expect(comments).toHaveCSS('font-family', bodyFont);
  await expect(readingProgress).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, window.innerHeight));
  await expect(readingProgress).toBeVisible();
  await expect(readingProgress.locator('span')).not.toHaveCSS(
    'transform',
    'matrix(0, 0, 0, 1, 0, 0)',
  );
  // Alle Kommentare sind sofort sichtbar; der Listen-Toggle existiert nicht mehr.
  await expect(comments.locator('.reader-comments__toggle')).toHaveCount(0);
  await expect(
    comments.locator('.reader-comment:not(.reader-comment--reply)').first(),
  ).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    await expect(jumpUp).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(14, 16, 18)' : 'rgb(247, 247, 245)',
    );
    await expect(article).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.screenshot({
      path: `test-results/article-detail-${theme}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(article.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: 'test-results/article-detail-mobile.png',
    fullPage: true,
  });
  await jumpUp.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.goto('/beitraege');
  await expect(page).toHaveURL(/\/beitraege$/);
});
