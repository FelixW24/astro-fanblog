import { expect, test } from '@playwright/test';

// Datensparmodus serverseitig: Cookie bzw. Save-Data-Header liefern die
// kleinen Cover-Varianten aus (Karten 480w, Artikel-Hero 800w).

// Realistischer Ablauf: localStorage-Praefferenz vor dem Laden setzen; das
// ThemeInit-Skript setzt daraus das Cookie, das der Server auswertet.
const enableDataSaver = (page: import('@playwright/test').Page) =>
  page.addInitScript(() =>
    localStorage.setItem('fanblog:data-saver', 'on'),
  );

test('Cover als 480w-Variante, wenn der Datensparmodus aktiv ist', async ({
  page,
}) => {
  await enableDataSaver(page);
  // Erstes Laden setzt das Cookie clientseitig; ab dem zweiten Request
  // wertet der Server es serverseitig aus.
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-data-saver', 'on');
  await page.goto('/');
  await expect(page.locator('.article-card-cover').first()).toHaveAttribute(
    'src',
    '/images/article-default-480.webp',
  );
});

test('volle Cover-Variante ohne Datensparmodus', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.article-card-cover').first()).toHaveAttribute(
    'src',
    '/images/article-default.webp',
  );
});

test('Save-Data-Request-Header aktiviert die kleine Variante', async ({
  page,
}) => {
  await page.route('**/*', (route) =>
    route.continue({
      headers: { ...route.request().headers(), 'save-data': 'on' },
    }),
  );
  await page.goto('/');
  await expect(page.locator('.article-card-cover').first()).toHaveAttribute(
    'src',
    '/images/article-default-480.webp',
  );
});

test('Artikel-Hero nutzt im Datensparmodus die 800w-Variante', async ({
  page,
}) => {
  await enableDataSaver(page);
  await page.goto('/');
  await page.locator('.article-card-link').first().click();
  await expect(page.locator('.article-cover img').first()).toHaveAttribute(
    'src',
    '/images/article-default-800.webp',
  );
});
