import { expect, test } from '@playwright/test';

for (const path of ['/anmelden', '/registrieren']) {
  test(`${path} zeigt das Stadionmotiv und passt die Karte an den Viewport an`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('fanblog:theme', 'light');
    });
    await page.goto(path);

    const stage = page.locator('.reader-auth-stage');
    const dialog = page.getByRole('dialog');
    await expect(stage).toHaveCSS('background-image', /stadion-light\.svg/);

    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeLessThanOrEqual(430);
      expect(bounds!.x).toBeGreaterThanOrEqual(15);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
        viewport.width - 15,
      );
      // Die Auth-Stage liest die Header-Höhe aus --site-header-height; der
      // Wert muss zur gemessenen Header-Höhe passen (ResizeObserver). Header
      // und Variable in einem Rutsch messen, damit transiente Layout-Zustände
      // nach dem Viewport-Wechsel nicht fehlschlagen.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const header = document.querySelector('.site-header');
            if (!header) return false;
            const varValue = getComputedStyle(document.documentElement)
              .getPropertyValue('--site-header-height')
              .trim();
            return varValue === `${header.getBoundingClientRect().height}px`;
          }),
        )
        .toBe(true);
      if (viewport.width <= 820) {
        // Mobile: Die Karte beginnt unterhalb der sticky Header-Leiste.
        const headerHeight = await page
          .locator('.site-header')
          .evaluate((element) => element.getBoundingClientRect().height);
        expect(bounds!.y).toBeGreaterThanOrEqual(headerHeight);
      }
      expect(
        await stage.evaluate((element) => element.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width);
      for (const label of await dialog.locator('.reader-checkbox').all()) {
        await expect(label).toHaveCSS('font-size', '13px');
        await expect(label).toHaveCSS('line-height', '19.5px');
        await expect(label).toHaveCSS(
          'color',
          await page
            .locator('body')
            .evaluate((element) => getComputedStyle(element).color),
        );
      }
    }

    await dialog.locator('a').last().scrollIntoViewIfNeeded();
    await expect(dialog.locator('a').last()).toBeInViewport();

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await expect(stage).toHaveCSS('background-image', /stadion-dark\.svg/);
    for (const label of await dialog.locator('.reader-checkbox').all()) {
      await expect(label).toHaveCSS(
        'color',
        await page
          .locator('body')
          .evaluate((element) => getComputedStyle(element).color),
      );
    }
  });
}

test('Registrierung verlangt Datenschutz und AGB getrennt', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const sounds: number[] = [];
    Object.assign(window, { notificationSoundStops: sounds });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: class {
        currentTime = 0;
        state = 'running';
        destination = {};
        createOscillator() {
          return {
            type: '',
            frequency: { value: 0 },
            connect: () => ({ connect: () => {} }),
            start: () => {},
            stop: (at: number) => sounds.push(at),
          };
        }
        createGain() {
          return {
            gain: {
              setValueAtTime: () => {},
              linearRampToValueAtTime: () => {},
              exponentialRampToValueAtTime: () => {},
            },
            connect: () => {},
          };
        }
      },
    });
  });
  await page.goto('/registrieren');
  const dialog = page.getByRole('dialog');

  await expect(
    dialog.getByRole('checkbox', { name: /Datenschutzhinweise/ }),
  ).toHaveAttribute('required', '');
  await expect(
    dialog.getByRole('checkbox', { name: /Ich akzeptiere die AGB/ }),
  ).toHaveAttribute('required', '');
  await expect(
    dialog.getByRole('link', { name: 'Datenschutzhinweise' }),
  ).toHaveAttribute('href', '/datenschutz');
  await expect(dialog.getByRole('link', { name: 'AGB' })).toHaveAttribute(
    'href',
    '/agb',
  );

  await dialog.getByLabel('E-Mail-Adresse').fill('hinweis@example.org');
  await dialog
    .getByLabel('Passwort', { exact: true })
    .fill('SicheresPasswort123!');
  await dialog
    .getByLabel('Passwort wiederholen', { exact: true })
    .fill('SicheresPasswort123!');
  await dialog.getByRole('button', { name: 'Registrieren' }).click();
  const checkboxNotice = page.getByRole('alert');
  await expect(checkboxNotice).toHaveText(
    'Bitte klicken Sie das Kästchen an, um fortzufahren.',
  );
  const noticeBounds = await checkboxNotice.boundingBox();
  expect(noticeBounds).not.toBeNull();
  expect(noticeBounds!.y).toBeGreaterThanOrEqual(0);
  expect(noticeBounds!.y).toBeLessThan(40);
  expect(noticeBounds!.x + noticeBounds!.width).toBeGreaterThan(350);
  const soundStops = await page.evaluate(
    () =>
      (window as unknown as { notificationSoundStops: number[] })
        .notificationSoundStops,
  );
  expect(soundStops).toHaveLength(0);
  await dialog.getByRole('checkbox', { name: /Datenschutzhinweise/ }).check();
  await expect(checkboxNotice).toBeVisible();
  await dialog
    .getByRole('checkbox', { name: /Ich akzeptiere die AGB/ })
    .check();
  await expect(checkboxNotice).toBeHidden();
});
