import { expect, test } from '@playwright/test';

test('Positionsnavigation bleibt sichtbar und folgt dem aktiven Bereich', async ({
  page,
}) => {
  await page.goto('/kader');
  const navigation = page.getByRole('navigation', { name: 'Kader-Bereiche' });
  const defence = navigation.getByRole('link', { name: /Abwehr/ });
  const midfield = navigation.getByRole('link', { name: /Mittelfeld/ });
  const indicator = page.locator('[data-squad-indicator]');

  const rightEdgeDifference = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-squad-nav]')!;
    const nav = root.querySelector('nav')!;
    const panel = root.closest<HTMLElement>('.page-hero--squad')!;
    const panelStyle = getComputedStyle(panel);
    const railSpace = parseFloat(
      getComputedStyle(root).getPropertyValue('--squad-rail-space'),
    );
    const contentRight =
      panel.getBoundingClientRect().right -
      parseFloat(panelStyle.paddingRight) -
      parseFloat(panelStyle.borderRightWidth);
    return nav.getBoundingClientRect().right - (contentRight - railSpace);
  });
  expect(Math.abs(rightEdgeDifference)).toBeLessThanOrEqual(1);

  await expect(indicator).toBeHidden();
  await page.mouse.wheel(0, 350);
  await expect(indicator).toBeVisible();
  await expect(
    indicator.locator('[data-indicator-target="torwart"]'),
  ).toHaveClass(/is-active/);
  expect(
    await indicator.evaluate((element) =>
      Math.abs(
        element.getBoundingClientRect().top +
          element.getBoundingClientRect().height / 2 -
          innerHeight / 2,
      ),
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(
      () =>
        (document
          .querySelector('[data-squad-indicator]')
          ?.getBoundingClientRect().left ?? 0) -
        (document.querySelector('#torwart')?.getBoundingClientRect().right ??
          0),
    ),
  ).toBeGreaterThanOrEqual(0);

  const defenceStop = indicator.locator('[data-indicator-target="abwehr"]');
  await defenceStop.focus();
  await expect(defenceStop).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#abwehr$/);
  await expect(defence).toHaveAttribute('aria-current', 'true');
  await expect(
    indicator.locator('[data-indicator-target="abwehr"]'),
  ).toHaveClass(/is-active/);
  await expect(defenceStop).toHaveAttribute('aria-current', 'true');
  await expect(
    indicator.locator('[data-indicator-target="torwart"]'),
  ).toHaveClass(/is-visited/);
  expect(
    await indicator.evaluate((element) => {
      const progress = element.querySelector(
        '.squad-scroll-indicator__progress',
      );
      const visitedDot = element.querySelector(
        '[data-indicator-target="torwart"] .squad-scroll-indicator__dot',
      );
      return progress && visitedDot
        ? getComputedStyle(progress).backgroundColor ===
            getComputedStyle(visitedDot).backgroundColor
        : false;
    }),
  ).toBe(true);
  await expect(
    indicator.locator('[data-indicator-target="mittelfeld"]'),
  ).not.toHaveClass(/is-visited/);
  await expect
    .poll(() =>
      indicator.evaluate((element) =>
        Number(element.style.getPropertyValue('--squad-progress')),
      ),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const section = document.querySelector('#abwehr');
        const nav = document.querySelector('[data-squad-nav]');
        return Math.round(
          (section?.getBoundingClientRect().top ?? 0) -
            (nav?.getBoundingClientRect().bottom ?? 0),
        );
      }),
    )
    .toBeGreaterThanOrEqual(0);

  await page.locator('#mittelfeld').scrollIntoViewIfNeeded();
  await expect(midfield).toHaveAttribute('aria-current', 'true');
  await expect(defence).not.toHaveAttribute('aria-current', 'true');
  await expect(
    indicator.locator('[data-indicator-target="mittelfeld"]'),
  ).toHaveClass(/is-active/);
  await expect(navigation).toBeInViewport();
});

test('Positionsleiste endet auch auf schmalem Desktop innerhalb des Header-Panels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/kader');
  const rightEdgeDifference = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-squad-nav]')!;
    const nav = root.querySelector('nav')!;
    const panel = root.closest<HTMLElement>('.page-hero--squad')!;
    const panelStyle = getComputedStyle(panel);
    const railSpace = parseFloat(
      getComputedStyle(root).getPropertyValue('--squad-rail-space'),
    );
    const contentRight =
      panel.getBoundingClientRect().right -
      parseFloat(panelStyle.paddingRight) -
      parseFloat(panelStyle.borderRightWidth);
    return nav.getBoundingClientRect().right - (contentRight - railSpace);
  });
  expect(Math.abs(rightEdgeDifference)).toBeLessThanOrEqual(1);
});

test('mobile Navigation scrollt horizontal und respektiert reduzierte Bewegung', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/kader');
  const navigation = page.getByRole('navigation', { name: 'Kader-Bereiche' });
  const attack = navigation.getByRole('link', { name: /Angriff/ });

  await expect(page.locator('[data-squad-indicator]')).toBeHidden();

  await attack.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#sturm$/);
  await expect(attack).toBeFocused();
  await expect(attack).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#sturm')).toBeInViewport();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nav = document.querySelector('[data-squad-nav]');
        const header = document.querySelector('.site-header');
        const section = document.querySelector('#sturm');
        return {
          navUnderHeader:
            (nav?.getBoundingClientRect().top ?? 0) >=
            (header?.getBoundingClientRect().bottom ?? 0),
          sectionBelowNav:
            (section?.getBoundingClientRect().top ?? 0) >=
            (nav?.getBoundingClientRect().bottom ?? 0),
        };
      }),
    )
    .toEqual({ navUnderHeader: true, sectionBelowNav: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect
    .poll(() =>
      page
        .locator('#sturm')
        .evaluate((section) => getComputedStyle(section).opacity),
    )
    .toBe('1');
});

test('Tablet-Navigation bleibt unter dem Header', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/kader');
  await page
    .getByRole('navigation', { name: 'Kader-Bereiche' })
    .getByRole('link', { name: /Mittelfeld/ })
    .click();
  await expect(page).toHaveURL(/#mittelfeld$/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nav = document.querySelector('[data-squad-nav]');
        const header = document.querySelector('.site-header');
        const section = document.querySelector('#mittelfeld');
        return {
          navUnderHeader:
            (nav?.getBoundingClientRect().top ?? 0) >=
            (header?.getBoundingClientRect().bottom ?? 0),
          sectionBelowNav:
            (section?.getBoundingClientRect().top ?? 0) >=
            (nav?.getBoundingClientRect().bottom ?? 0),
        };
      }),
    )
    .toEqual({ navUnderHeader: true, sectionBelowNav: true });
});

test('mobiler Direktlink zeigt die Bereichsüberschrift unter der Navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/kader#mittelfeld');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nav = document.querySelector('[data-squad-nav]');
        const heading = document.querySelector('#mittelfeld-heading');
        return Math.round(
          (heading?.getBoundingClientRect().top ?? 0) -
            (nav?.getBoundingClientRect().bottom ?? 0),
        );
      }),
    )
    .toBeGreaterThanOrEqual(0);
});

test.describe('ohne JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('alle Mannschaftsteile und Ankerlinks bleiben nutzbar', async ({
    page,
  }) => {
    await page.goto('/kader');
    const navigation = page.getByRole('navigation', {
      name: 'Kader-Bereiche',
    });
    await expect(page.locator('[data-squad-section]')).toHaveCount(5);
    // Ohne JavaScript gibt es keinen Tab-Wechsel: Die Fakten bleiben verborgen.
    await expect(
      page.locator('[data-squad-section="statistiken"]'),
    ).toBeHidden();
    await navigation.getByRole('link', { name: /Mittelfeld/ }).click();
    await expect(page).toHaveURL(/#mittelfeld$/);
    await expect(page.locator('#mittelfeld')).toBeVisible();
  });
});
