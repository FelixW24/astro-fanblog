import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test(`mobiler Anmeldehinweis bleibt lesbar und bedienbar (${theme})`, async ({
    page,
  }, testInfo) => {
    const now = new Date('2026-10-16T12:00:00Z');
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now);
    await page.addInitScript((value) => {
      localStorage.setItem('fanblog:theme', value);
    }, theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/beitraege');
    await page.locator('.article-card-link').first().click();
    // Erst nach load sind die verzögerten Modul-Skripte (u. a. der
    // Abfang-Handler für data-auth-required) garantiert aktiv.
    await page.waitForURL(/\/beitraege\/[^/?#]+/, { waitUntil: 'load' });
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);

    const trigger = page.getByRole('link', {
      name: 'Kommentar schreiben',
      exact: true,
    });
    const notice = page.getByRole('complementary', {
      name: 'Anmeldung erforderlich',
    });
    const close = notice.getByRole('button', { name: 'Hinweis schließen' });

    for (const width of [320, 390, 600]) {
      await page.setViewportSize({ width, height: 568 });
      await trigger.click();
      await expect(notice).toBeVisible();
      await expect(notice).toHaveCSS('border-top-width', '3px');
      await expect(notice).toHaveCSS('border-left-width', '1px');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(notice.getByRole('status')).toHaveText(
        'Melde dich an oder erstelle ein Konto, um mitzumachen.',
      );
      const bounds = await notice.boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(12);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 12);
      expect(bounds!.y).toBeGreaterThan(header!.y + header!.height);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568 - 12);
      expect(bounds!.y + bounds!.height).toBeGreaterThanOrEqual(568 - 13);
      const canvas = await page
        .locator('body')
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      await expect(notice).toHaveCSS('background-color', canvas);
      expect(
        await notice.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      const button = await close.boundingBox();
      expect(button!.width).toBeGreaterThanOrEqual(44);
      expect(button!.height).toBeGreaterThanOrEqual(44);
      await close.focus();
      await page.keyboard.press('Enter');
      await expect(notice).toBeHidden();
      // Mobil gilt die 6s-Frist bzw. das 6s-Wiederholungsfenster.
      await page.clock.fastForward(6000);
    }

    await trigger.click();
    await notice.screenshot({
      path: testInfo.outputPath(`toast-mobile-${theme}.png`),
    });
    await page.keyboard.press('Escape');
    await expect(notice).toBeHidden();
    await page.clock.fastForward(6000);
    await trigger.click();
    await notice.getByRole('link', { name: 'Melde dich an' }).click();
    await expect(page).toHaveURL(/\/anmelden\?weiter=/);
  });
}

test('mobile Formularmeldungen erscheinen unten und Desktopmeldungen oben', async ({
  page,
}) => {
  await page.goto('/registrieren');
  const form = page.getByRole('dialog');
  await form.getByLabel('E-Mail-Adresse').fill('hinweis@example.org');
  await form
    .getByLabel('Passwort', { exact: true })
    .fill('SicheresPasswort123!');
  await form
    .getByLabel('Passwort wiederholen', { exact: true })
    .fill('SicheresPasswort123!');
  await form.getByRole('button', { name: 'Registrieren' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 568 });
    await expect(alert).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    const bounds = await alert.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(12);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 12);
    if (width <= 600) {
      await expect(alert).toHaveCSS('border-top-width', '3px');
      await expect(alert).toHaveCSS('border-left-width', '1px');
      expect(bounds!.y + bounds!.height).toBeCloseTo(556, 0);
    } else {
      await expect(alert).toHaveCSS('border-top-width', '1px');
      await expect(alert).toHaveCSS('border-left-width', '3px');
      expect(bounds!.y).toBe(20);
    }
  }
  await form.getByRole('checkbox', { name: /Datenschutzhinweise/ }).check();
  await form.getByRole('checkbox', { name: /Ich akzeptiere die AGB/ }).check();
  await expect(alert).toBeHidden();
});
