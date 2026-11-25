import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const now = new Date('2026-10-16T12:00:00Z');
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const width of [390, 1280]) {
  // Mobil (<= 600px) bleibt der Toast 6s sichtbar, auf dem Desktop 4s.
  const lifetime = width <= 600 ? 6000 : 4000;
  test(`Toast verschwindet nach ${lifetime / 1000} Sekunden und begrenzt Wiederholungen (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/beitraege');
    await page.locator('.article-card-link').first().click();
    // Erst nach load sind die verzögerten Modul-Skripte (u. a. der
    // Abfang-Handler für data-auth-required) garantiert aktiv.
    await page.waitForURL(/\/beitraege\/[^/?#]+/, { waitUntil: 'load' });
    const trigger = page.getByRole('link', {
      name: 'Kommentar schreiben',
      exact: true,
    });
    const notice = page.getByRole('complementary', {
      name: 'Anmeldung erforderlich',
      includeHidden: true,
    });
    const stack = page.locator('.notification-stack');
    await trigger.click();
    await expect(notice).toBeVisible();
    await page.clock.fastForward(2500);
    await trigger.evaluate((element) => {
      for (let index = 0; index < 20; index += 1)
        (element as HTMLElement).click();
    });
    await expect(
      stack.locator(':scope > [data-notification]:not([hidden])'),
    ).toHaveCount(1);
    await page.clock.fastForward(lifetime - 2500 - 1);
    await expect(notice).toBeVisible();
    await page.clock.fastForward(1);
    await expect(notice).toBeHidden();

    // A closed toast cannot be reopened repeatedly within its lifetime window.
    await trigger.click();
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: 'Hinweis schließen' }).click();
    await trigger.click();
    await expect(notice).toBeHidden();
    await page.clock.fastForward(lifetime - 1);
    await trigger.click();
    await expect(notice).toBeHidden();
    await page.clock.fastForward(1);
    await trigger.click();
    await expect(notice).toBeVisible();
    await page.clock.fastForward(lifetime);
    await expect(
      stack.locator(':scope > [data-notification]:not([hidden])'),
    ).toHaveCount(0);
  });
}

// Desktop-Viewport (1280px): jede Meldung bekommt eine 4s-Frist.
test('mehrere Meldungen bleiben gleichzeitig sichtbar und verschwinden einzeln nach 4s', async ({
  page,
}) => {
  await page.goto('/anmelden?bestaetigt=1&passwort=1');
  const stack = page.locator('.notification-stack');
  const visible = stack.locator(':scope > [data-notification]:not([hidden])');
  // Beide Startmeldungen sind gleichzeitig sichtbar.
  await page.clock.fastForward(1000);
  await expect(visible).toHaveCount(2);
  await expect(visible.last()).toContainText('Dein Passwort wurde geändert');
  const form = page.getByRole('dialog');
  await form.getByLabel('E-Mail-Adresse').fill('hinweis@example.org');
  await form
    .getByLabel('Passwort', { exact: true })
    .fill('SicheresPasswort123!');
  await form.getByRole('button', { name: /^Anmelden/ }).click();
  const alert = stack.getByRole('alert');
  await expect(alert).toHaveText(
    'Bitte klicken Sie das Kästchen an, um fortzufahren.',
  );
  // Die neue Meldung ist sofort sichtbar, alle drei gleichzeitig.
  await expect(alert).toBeVisible();
  await expect(visible).toHaveCount(3);
  // Die beiden Startmeldungen verschwinden nach ihren eigenen 4s ...
  await page.clock.fastForward(3000);
  await expect(visible).toHaveCount(1);
  await expect(visible).toContainText('Bitte klicken Sie das Kästchen');
  // ... und die neue Meldung nach ihrer eigenen 4s-Frist, nichts wird nachgereicht.
  await page.clock.fastForward(1000);
  await expect(visible).toHaveCount(0);
  await page.clock.fastForward(10_000);
  await expect(visible).toHaveCount(0);
});

test('maximal vier Meldungen gleichzeitig: die aeltesten werden abgestuft', async ({
  page,
}) => {
  await page.goto('/beitraege');
  await page.evaluate(() => {
    const stack = document.querySelector('.notification-stack');
    if (!stack) throw new Error('notification-stack fehlt');
    for (let index = 1; index <= 6; index += 1) {
      const element = document.createElement('p');
      element.setAttribute('data-notification', '');
      element.setAttribute('role', 'alert');
      element.textContent = `Meldung ${index}`;
      stack.append(element);
    }
  });
  const stack = page.locator('.notification-stack');
  const visible = stack.locator(':scope > [data-notification]:not([hidden])');
  // Die beiden aeltesten werden abgestuft und nach 1s entfernt.
  await page.clock.fastForward(1000);
  await expect(visible).toHaveCount(4);
  await expect(visible.first()).toHaveText('Meldung 3');
  await expect(visible.last()).toHaveText('Meldung 6');
  // Nach 4s (Desktop-Frist) sind alle Meldungen wieder weg.
  await page.clock.fastForward(3000);
  await expect(visible).toHaveCount(0);
});
