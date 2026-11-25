import { expect, test } from '@playwright/test';
import { adminEmail, adminPassword } from './admin-credentials';

test.beforeEach(async ({ page }) => {
  // A reused development server may have Astro's toolbar enabled.
  await page.goto('/anmelden');
  await page.addStyleTag({
    content: 'astro-dev-toolbar { display: none !important; }',
  });
});

test('Gastzugang liegt im Header und im Navigations-Drawer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 850 });

  const header = page.locator('.site-header');
  await expect(header.getByRole('search')).toBeVisible();

  const desktopAccount = header
    .locator('.sidebar-account')
    .getByRole('navigation', { name: 'Leserkonto' });
  await expect(desktopAccount).toBeVisible();
  await expect(
    desktopAccount.getByRole('link', { name: 'Login', exact: true }),
  ).toBeVisible();
  await expect(desktopAccount.getByRole('link')).toHaveCount(1);

  for (const width of [820, 620, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });

    await expect(
      page
        .locator('.mobile-header-actions')
        .getByRole('link', { name: 'Login', exact: true }),
    ).toHaveCount(0);

    await page.locator('[data-mobile-menu-toggle]').click();
    const drawer = page.locator('#public-navigation');
    const account = drawer
      .locator('.sidebar-account')
      .getByRole('navigation', { name: 'Leserkonto' });

    await expect(drawer).toBeVisible();
    await expect(
      account.getByRole('link', { name: 'Login', exact: true }),
    ).toBeVisible();
    await expect(account.getByRole('link')).toHaveCount(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);

    await drawer.locator('[data-mobile-menu-close]').click();
    await expect(drawer).toBeHidden();
  }

  await page.setViewportSize({ width: 320, height: 850 });
  await page.locator('[data-mobile-menu-toggle]').click();
  await page.screenshot({ path: 'test-results/header-guest-mobile.png' });
});

test('Profilmenü: Tastatur, Außenklick, Profil, Redaktion und Abmeldung', async ({
  page,
}) => {
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort', { exact: true }).fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Anmelden/ }).click();
  await expect(page).toHaveURL(/\/$/);
  // Die Anmeldung lädt die Startseite neu; die Toolbar-Ausblendung gilt
  // pro Dokument.
  await page.addStyleTag({
    content: 'astro-dev-toolbar { display: none !important; }',
  });

  const modal = page.getByRole('dialog', { name: /Mein Profil/ });
  const sidebarEntry = page.locator('.sidebar-account .account-menu__trigger');
  const sidebarPanel = page.locator('.sidebar-account .account-menu__panel');
  await expect(sidebarEntry).toBeVisible();
  await sidebarEntry.click();
  await expect(sidebarPanel).toBeVisible();
  await expect(
    sidebarPanel.getByRole('button', { name: 'Mein Profil', exact: true }),
  ).toBeVisible();
  await sidebarPanel
    .getByRole('button', { name: 'Mein Profil', exact: true })
    .click();
  await expect(modal).toBeVisible();
  await expect(modal.locator('.profile-dialog__header .overline')).toHaveText(
    'Mein Profil.',
  );
  await expect(
    modal.getByRole('heading', { name: /Persönliche Informationen/ }),
  ).toBeVisible();
  await modal.getByRole('button', { name: 'Profil schließen' }).click();
  await expect(modal).toBeHidden();
  await expect(sidebarPanel).toBeHidden();
  await expect(sidebarEntry).toBeFocused();

  await sidebarEntry.focus();
  await page.keyboard.press('Enter');
  await expect(sidebarPanel).toBeVisible();
  await expect(
    sidebarPanel.getByRole('button', { name: 'Mein Profil', exact: true }),
  ).toBeVisible();
  await expect(
    sidebarPanel.getByRole('link', { name: 'Redaktion', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sidebarPanel).toBeHidden();
  await expect(sidebarEntry).toBeFocused();

  await sidebarEntry.click();
  await sidebarPanel
    .getByRole('button', { name: 'Mein Profil', exact: true })
    .click();
  await expect(modal).toBeVisible();
  await expect(sidebarPanel).toBeHidden();
  await modal.getByRole('button', { name: 'Profil schließen' }).click();
  await expect(sidebarEntry).toBeFocused();

  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    await sidebarEntry.click();
    await page.screenshot({ path: `test-results/header-profile-${theme}.png` });
    await page.keyboard.press('Escape');
  }

  for (const width of [320, 390, 620, 820]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(async () => {
      const brand = await page.locator('.header-main > .brand').boundingBox();
      const actions = await page
        .locator('.mobile-header-actions')
        .boundingBox();

      expect(brand!.x + brand!.width).toBeLessThanOrEqual(actions!.x);
      expect(
        Math.abs(
          brand!.y + brand!.height / 2 - (actions!.y + actions!.height / 2),
        ),
      ).toBeLessThan(1);
    }).toPass();

    await page.locator('[data-mobile-menu-toggle]').click();
    const drawer = page.locator('#public-navigation');
    const mobileTrigger = drawer.locator(
      '.sidebar-account .account-menu__trigger',
    );
    const mobilePanel = drawer.locator('.sidebar-account .account-menu__panel');

    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => (document.documentElement.dataset.theme = value),
        theme,
      );
      await mobileTrigger.click();
      await expect(mobilePanel).toBeVisible();

      const panelBounds = await mobilePanel.boundingBox();
      const drawerBounds = await drawer.boundingBox();
      const triggerBounds = await mobileTrigger.boundingBox();
      expect(panelBounds!.x).toBeGreaterThanOrEqual(drawerBounds!.x);
      expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(
        drawerBounds!.x + drawerBounds!.width,
      );
      // Das Menü springt nach oben auf und streckt den Drawer nicht nach
      // unten.
      expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(
        triggerBounds!.y,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);

      await mobileTrigger.click();
      await expect(mobilePanel).toBeHidden();
    }

    await drawer.locator('[data-mobile-menu-close]').click();
    await expect(drawer).toBeHidden();
  }

  await page.setViewportSize({ width: 320, height: 850 });
  await page.locator('[data-mobile-menu-toggle]').click();
  const mobileDrawer = page.locator('#public-navigation');
  const mobileTrigger = mobileDrawer.locator(
    '.sidebar-account .account-menu__trigger',
  );
  const mobilePanel = mobileDrawer.locator(
    '.sidebar-account .account-menu__panel',
  );

  await mobileTrigger.click();
  await page.screenshot({ path: 'test-results/header-profile-mobile.png' });
  await expect(
    mobilePanel.getByRole('button', { name: 'Mein Profil', exact: true }),
  ).toBeVisible();
  await mobilePanel
    .getByRole('button', { name: 'Mein Profil', exact: true })
    .click();
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Profil schließen' }).click();
  await expect(modal).toBeHidden();

  // Der Drawer ist nach dem Modal weiterhin geöffnet.
  await mobileTrigger.click();
  await mobilePanel
    .getByRole('button', { name: 'Abmelden', exact: true })
    .click();

  // Nach der Abmeldung lädt die Seite neu; der Drawer ist dann geschlossen.
  await expect(page.getByRole('button', { name: 'Menü öffnen' })).toBeVisible();
  // Auf kalten Dev-Server-Routen kann der Toggle-Klick der
  // Script-Initialisierung zuvorkommen; der Öffnungsschritt wird daher
  // wiederholt, bis der Drawer sichtbar ist.
  await expect(async () => {
    await page.locator('[data-mobile-menu-toggle]').click();
    await expect(page.locator('#public-navigation')).toBeVisible();
  }).toPass();
  await expect(
    page
      .locator('#public-navigation .sidebar-account')
      .getByRole('link', { name: 'Login', exact: true }),
  ).toBeVisible();
});
