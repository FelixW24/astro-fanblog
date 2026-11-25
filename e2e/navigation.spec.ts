import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // A reused development server may have Astro's toolbar enabled.
  await page.addStyleTag({
    content: 'astro-dev-toolbar { display: none !important; }',
  });
});

test('zeigt Startseite und Hauptnavigation', async ({ page }) => {
  await expect(page).toHaveTitle(/Astro Fanblog/);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    '/logo/favicon.svg',
  );
  const brand = page.getByRole('link', { name: 'Astro Fanblog Startseite' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const logo = brand.locator(`.brand-icon-${theme}`);
    const otherLogo = brand.locator(
      `.brand-icon-${theme === 'dark' ? 'light' : 'dark'}`,
    );
    await expect(logo).toBeVisible();
    await expect(otherLogo).toBeHidden();
    await expect
      .poll(() =>
        logo.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
  }
  const homeNextMatch = page
    .locator('.site-content')
    .getByRole('complementary', { name: 'Nächstes Spiel' });
  await expect(homeNextMatch).toBeVisible();
  await expect(
    page.getByText('Für die, die nach dem Abpfiff weiterdenken.'),
  ).toHaveCount(0);

  const navigation = page.getByRole('navigation', {
    name: 'Hauptnavigation',
  });
  await expect(
    navigation.getByRole('link', { name: 'Beiträge' }),
  ).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Kader' })).toBeVisible();
  await expect(
    navigation.getByRole('link', { name: 'Leihspieler' }),
  ).toBeVisible();
  await expect(
    navigation.getByRole('link', { name: 'Spielplan' }),
  ).toBeVisible();
});

test('öffnet mobil das Header-Menü als Drawer und schließt es barrierearm', async ({
  page,
}) => {
  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 844 });
    const toggle = page
      .getByRole('button', {
        name: /Menü (öffnen|schließen)/,
        includeHidden: true,
      })
      .and(page.locator('[aria-controls="public-navigation"]'));
    const navigation = page.getByRole('navigation', {
      name: 'Hauptnavigation',
    });
    await expect(navigation).toBeHidden();
    await toggle.click();
    const drawer = page.getByRole('dialog', { name: 'Seitennavigation' });
    await expect(drawer).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const bounds = await drawer.boundingBox();
    expect(bounds!.width / width).toBeGreaterThanOrEqual(0.7);
    expect(bounds!.width / width).toBeLessThanOrEqual(0.8);
    await expect(navigation.getByRole('link')).toHaveCount(9);
    // Der Farbmodus liegt in den Profileinstellungen, nicht im Drawer.
    await expect(drawer.locator('[data-theme-toggle]')).toHaveCount(0);
    const close = drawer.getByRole('button', { name: 'Menü schließen' });
    const brand = drawer.getByRole('link', { name: 'Astro Fanblog Startseite' });
    await expect(brand).toBeVisible();
    await expect(brand).not.toHaveAttribute('inert');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const logo = brand.locator(`.brand-icon-${theme}`);
      await expect(logo).toBeVisible();
      await expect
        .poll(() =>
          logo.evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
    }
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(brand).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    // Das Konto liegt im Drawer ganz unten; der Login-Link ist der letzte
    // Fokussierbare Eintrag, die Falle springt dann zurück zur Marke.
    await expect(
      drawer.getByRole('link', { name: 'Login', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(brand).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(toggle).toBeFocused();
    await toggle.click();
    await page
      .locator('.mobile-navigation-backdrop')
      .click({ position: { x: width - 5, y: 300 } });
    await expect(drawer).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page.getByRole('button', { name: 'Menü öffnen', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(
    page.getByRole('navigation', { name: 'Hauptnavigation' }),
  ).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/mobile-navigation-open/);
});

test('zeigt den Spielbereich ohne Social-Media-Navigation', async ({
  page,
}) => {
  const nextMatch = page
    .getByRole('complementary', { name: 'Nächstes Spiel' })
    .first();
  await expect(nextMatch).toBeVisible();

  await expect(
    page.getByRole('navigation', { name: 'Social Media' }),
  ).toHaveCount(0);
});

test('zeigt Rubriknamen mobil und am Desktop einzeilig erwartungskonform an', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 820) {
      await page
        .getByRole('button', { name: 'Menü öffnen', exact: true })
        .click();
    }
    const categories = page.getByRole('navigation', {
      name: 'Hauptnavigation',
    });
    for (const name of ['Spielberichte', 'Pressekonferenzen']) {
      const link = categories.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      const lines = await link.locator('.nav-label').evaluate((element) =>
        Array.from(element.childNodes)
          .filter(
            (node) =>
              node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          )
          .map((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            const { top, bottom, left, right } = range.getBoundingClientRect();
            return { top, bottom, left, right };
          }),
      );
      expect(lines).toHaveLength(1);
      expect(lines[0].bottom - lines[0].top).toBeLessThan(30);
      const bounds = await link.boundingBox();
      for (const line of lines) {
        expect(line.left).toBeGreaterThan(bounds!.x);
        expect(line.right).toBeLessThan(bounds!.x + bounds!.width);
      }
    }
    if (width <= 820) await page.keyboard.press('Escape');
  }
});

test('zeigt die Suche im Header ohne doppelten Theme-Schalter', async ({
  page,
}) => {
  const header = page.locator('.site-header');
  await expect(header.getByRole('search')).toBeVisible();
  await expect(
    header.getByRole('button', { name: /Farbmodus aktivieren/ }),
  ).toHaveCount(0);

  await header
    .getByRole('searchbox', { name: 'Beiträge durchsuchen' })
    .fill('Example');
  await header.getByRole('button', { name: 'Suche starten' }).click();

  await expect(page).toHaveURL(/\/beitraege\?suche=K%C3%B6ln$/);
  await expect(
    page.getByRole('searchbox', { name: 'Beiträge durchsuchen' }),
  ).toHaveValue('Example');
});

test('navigiert zu den Beiträgen und markiert den aktiven Menüpunkt', async ({
  page,
}) => {
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('link', { name: 'Beiträge' })
    .click();

  await expect(page).toHaveURL(/\/beitraege$/);
  await expect(
    page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('link', { name: 'Beiträge' }),
  ).toHaveAttribute('aria-current', 'page');
});

test('verlinkt alle Rechtstexte im Footer', async ({ page }) => {
  const legalNavigation = page.getByRole('navigation', {
    name: 'Rechtliche Hinweise',
  });

  await expect(
    legalNavigation.getByRole('link', { name: 'Impressum' }),
  ).toHaveAttribute('href', '/impressum');
  await expect(
    legalNavigation.getByRole('link', { name: 'AGB' }),
  ).toHaveAttribute('href', '/agb');
  await legalNavigation.getByRole('link', { name: 'Datenschutz' }).click();

  await expect(page).toHaveURL(/\/datenschutz$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Datenschutzerklärung' }),
  ).toBeVisible();
});

