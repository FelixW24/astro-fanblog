import { expect, test } from '@playwright/test';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
} from './admin-credentials';

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);
});

// Regression: .primary-nav hat overflow-x: auto (base.css); ohne die
// spezifischere Override-Regel in integrated.css würde das aufgeklappte
// Einstellungs-Submenü unsichtbar abgeschnitten (Cascade-Reihenfolge der
// CSS-Chunks). Playwright klickt solche Links trotzdem (Auto-Scroll), daher
// wird hier explizit geprüft, dass der Link am Klickpunkt auch wirklich
// getroffen wird.
test('Einstellungs-Dropdown in der Redaktionsnavigation ist sichtbar und klickbar', async ({
  page,
}) => {
  await page.goto('/admin');
  const nav = page.getByRole('navigation', { name: 'Redaktionsnavigation' });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const element = document.querySelector('.primary-nav');
        return element ? getComputedStyle(element).overflowX : null;
      }),
    )
    .toBe('visible');

  await nav.getByRole('button', { name: /Einstellungen/ }).click();

  const newsletter = nav.getByRole('link', { name: 'Newsletter', exact: true });
  await expect(newsletter).toBeVisible();

  const box = await newsletter.boundingBox();
  expect(box).not.toBeNull();
  const hit = await page.evaluate(
    ([x, y]) => {
      const element = document.elementFromPoint(x, y);
      return element?.closest('a')?.textContent?.trim() ?? null;
    },
    [box!.x + box!.width / 2, box!.y + box!.height / 2],
  );
  expect(hit).toBe('Newsletter');

  await newsletter.click();
  await expect(page).toHaveURL(/\/admin\/newsletter$/);
});
