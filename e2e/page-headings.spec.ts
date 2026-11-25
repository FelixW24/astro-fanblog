import { expect, test } from '@playwright/test';

for (const width of [320, 390, 1440]) {
  test(`Öffentliche Seiten haben einheitliche Header bei ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let reference: unknown;
    for (const route of [
      '/kader',
      '/',
      '/beitraege',
      '/leihspieler/verliehen',
      '/leihspieler/geliehen',
      '/kategorie/news',
      '/impressum',
      '/datenschutz',
      '/agb',
    ]) {
      await page.goto(route);
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible();
      const period = heading.locator('.page-heading-period');
      await expect(period).toHaveText('.');
      expect(
        await period.evaluate((element) => getComputedStyle(element).color),
      ).toBe(
        await heading.evaluate((element) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--color-blueprint-blue)';
          element.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        }),
      );
      const typography = await heading.evaluate((element) => {
        const style = getComputedStyle(element);
        return [
          style.fontSize,
          style.lineHeight,
          style.letterSpacing,
          style.fontWeight,
        ];
      });
      reference ??= typography;
      expect(typography).toEqual(reference);
      const hero = page.locator('.page-hero');
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        const canvas = await page
          .locator('body')
          .evaluate((element) => getComputedStyle(element).backgroundColor);
        const glass = await page.evaluate(() => {
          const probe = document.createElement('span');
          probe.style.backgroundColor = 'var(--surface-glass)';
          document.body.append(probe);
          const color = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return color;
        });
        await expect(hero).toHaveCSS(
          'background-color',
          route === '/' ? glass : canvas,
        );
        await expect(hero).toHaveCSS('background-image', 'none');
        await expect(hero).toHaveCSS('border-top-width', '0px');
        await expect(hero).toHaveCSS('border-radius', '16px');
        const bounds = await hero.boundingBox();
        const content = await page.locator('.site-content').boundingBox();
        const title = await heading.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(content!.x + 12);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
          content!.x + content!.width - 12,
        );
        expect(bounds!.width).toBeLessThanOrEqual(1100);
        expect(title!.x).toBeGreaterThan(bounds!.x);
        expect(title!.x + title!.width).toBeLessThan(bounds!.x + bounds!.width);
        expect(title!.y).toBeGreaterThan(bounds!.y);
        expect(title!.y + title!.height).toBeLessThan(
          bounds!.y + bounds!.height,
        );
        if (route === '/kategorie/news') {
          await hero.screenshot({
            path: testInfo.outputPath(`header-${theme}-${width}.png`),
          });
        }
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
  });
}
