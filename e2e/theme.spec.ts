import { expect, test } from '@playwright/test';

test('wendet die gespeicherte Farbmodus-Auswahl an', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('fanblog:theme')) {
      localStorage.setItem('fanblog:theme', 'light');
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Menü öffnen', exact: true }).click();

  const root = page.locator('html');
  const firstRubric = page.locator('.rubric-card').first();
  const drawerBrand = page
    .getByRole('dialog', { name: 'Seitennavigation' })
    .getByRole('link', { name: 'Astro Fanblog Startseite' });

  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect
    .poll(() =>
      firstRubric.evaluate(
        (card) => getComputedStyle(card, '::before').backgroundImage,
      ),
    )
    .toContain('playReportCategoryWhite.webp');
  await expect(drawerBrand.locator('.brand-icon-light')).toBeVisible();
  await expect(drawerBrand.locator('.brand-icon-dark')).toBeHidden();

  await page.evaluate(() => localStorage.setItem('fanblog:theme', 'dark'));
  await page.reload();
  await page.getByRole('button', { name: 'Menü öffnen', exact: true }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() =>
      firstRubric.evaluate(
        (card) => getComputedStyle(card, '::before').backgroundImage,
      ),
    )
    .toContain('playReportCategoryDark.webp');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(14, 16, 18)',
  );
  await expect(drawerBrand.locator('.brand-icon-dark')).toBeVisible();
  await expect(drawerBrand.locator('.brand-icon-light')).toBeHidden();
});

test('mobil liegt der Farbmodus in den Einstellungen, nicht im Drawer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/kategorie/news');

  await page.getByRole('button', { name: 'Menü öffnen', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Seitennavigation' });
  await expect(drawer.locator('[data-theme-toggle]')).toHaveCount(0);
  // Ohne gespeicherte Auswahl bleibt der Dunkelmodus der Standard.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('behält das helle Theme bei dunkler Systempräferenz', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    localStorage.setItem('fanblog:theme', 'light');
  });
  await page.goto('/');

  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('link', { name: 'Beiträge' })
    .click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(247, 247, 245)',
  );
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`startet ohne gespeicherte Auswahl dunkel bei ${colorScheme}em System`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(14, 16, 18)',
    );
    await expect(page.locator('#theme-color-light')).toHaveAttribute(
      'content',
      '#0e1012',
    );
    expect(
      await page.evaluate(() => localStorage.getItem('fanblog:theme')),
    ).toBeNull();

    await page.emulateMedia({
      colorScheme: colorScheme === 'light' ? 'dark' : 'light',
    });
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(root).toHaveAttribute('data-theme', 'dark');
  });
}

test('startet auch bei gesperrtem Speicher im Dunkelmodus', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
