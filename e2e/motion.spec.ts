import { expect, test } from '@playwright/test';

for (const width of [320, 600, 601, 1280]) {
  test(`Toast gleitet beim Öffnen und Schließen (${width}px)`, async ({
    page,
  }) => {
    // Mobil (<= 600px) gilt die 6s-Frist, auf dem Desktop 4s.
    const lifetime = width <= 600 ? 6000 : 4000;
    await page.clock.install();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/beitraege');
    await page.locator('.article-card-link').first().click();
    // Erst nach load sind die verzögerten Modul-Skripte (u. a. der
    // Abfang-Handler für data-auth-required) garantiert aktiv. Ohne den
    // Wart folgt der Klick unter Volllast dem Link zur Anmeldeseite.
    await page.waitForURL(/\/beitraege\/[^/?#]+/, { waitUntil: 'load' });
    const trigger = page.getByRole('link', {
      name: 'Kommentar schreiben',
      exact: true,
    });
    const notice = page.getByRole('complementary', {
      name: 'Anmeldung erforderlich',
      includeHidden: true,
    });
    // Flush the hidden state before starting the real click handler.
    await notice.evaluate((element) => getComputedStyle(element).display);
    await trigger.evaluate((element) => (element as HTMLElement).click());

    // Klick und Messung müssen im selben JS-Task laufen: getAnimations()
    // erzeugt die Transition dann synchron und pausiert sie bei 90 ms. Bei
    // getrennten evaluate-Aufrufen ist die 180-ms-Transition unter Volllast
    // gelegentlich schon durch und aus getAnimations() entfernt.
    const triggerHandle = await trigger.elementHandle();
    for (const closing of [false, true]) {
      const closeButton = closing
        ? await notice
            .getByRole('button', { name: 'Hinweis schließen' })
            .elementHandle()
        : null;
      const motion = await notice.evaluate(
        (element, { closing, trigger, closeButton }) => {
          if (closing) (closeButton as HTMLElement).click();
          else (trigger as HTMLElement).click();
          const animation = element
            .getAnimations()
            .find(
              (item) =>
                item instanceof CSSTransition &&
                item.transitionProperty === 'transform',
            );
          if (!animation) return null;
          animation.pause();
          animation.currentTime = 90;
          const style = getComputedStyle(element);
          const transform = new DOMMatrixReadOnly(style.transform);
          const duration = animation.effect?.getTiming().duration;
          const easing = animation.effect?.getTiming().easing;
          const display = style.display;
          for (const item of element.getAnimations()) item.finish();
          return {
            x: transform.m41,
            y: transform.m42,
            duration,
            easing,
            display,
          };
        },
        { closing, trigger: triggerHandle, closeButton },
      );
      expect(motion).not.toBeNull();
      if (width <= 600) {
        expect(motion!.x).toBe(0);
        expect(motion!.y).toBeGreaterThan(0);
      } else {
        expect(motion!.x).toBeGreaterThan(0);
        expect(motion!.y).toBe(0);
      }
      expect(motion!.duration).toBe(180);
      expect(motion!.easing).toBe('cubic-bezier(0.2, 0, 0, 1)');
      expect(motion!.display).not.toBe('none');
      if (closing) await expect(notice).toBeHidden();
      else
        await expect(notice).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    }
    await page.clock.fastForward(lifetime);
    await trigger.evaluate((element) => (element as HTMLElement).click());
    await expect(notice).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

test('reduzierte Bewegung deaktiviert Drawer- und Toastanimationen', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menü öffnen', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Seitennavigation' }),
  ).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('Escape');
  await page.goto('/beitraege');
  await page.locator('.article-card-link').first().click();
  // Erst nach load sind die verzögerten Modul-Skripte (u. a. der
  // Abfang-Handler für data-auth-required) garantiert aktiv.
  await page.waitForURL(/\/beitraege\/[^/?#]+/, { waitUntil: 'load' });
  await page
    .getByRole('link', { name: 'Kommentar schreiben', exact: true })
    .click();
  const notice = page.getByRole('complementary', {
    name: 'Anmeldung erforderlich',
  });
  await expect(notice).toHaveCSS('transition-duration', '0s');
  expect(
    await notice.evaluate((element) => element.getAnimations().length),
  ).toBe(0);
  await notice.getByRole('button', { name: 'Hinweis schließen' }).click();
  await expect(notice).toBeHidden();
});
