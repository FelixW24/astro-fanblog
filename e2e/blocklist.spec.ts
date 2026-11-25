import { expect, test } from '@playwright/test';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
} from './admin-credentials';

test('schützt die Wortverwaltung vor anonymem Zugriff', async ({ page }) => {
  await page.goto('/admin/blacklist');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(
    page.getByRole('heading', { name: 'Blacklist-Wörter' }),
  ).toHaveCount(0);
});

test('verwaltet und durchsucht die mehrsprachige Wortliste', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);
  await page
    .getByRole('navigation', { name: 'Redaktionsnavigation' })
    .getByRole('button', { name: /Einstellungen/ })
    .click();
  await page
    .getByRole('navigation', { name: 'Redaktionsnavigation' })
    .getByRole('link', { name: 'Blacklist-Wörter', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Blacklist-Wörter', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.blocked-words li')).toHaveCount(50);
  await page.getByRole('link', { name: 'Weitere Einträge' }).click();
  await expect(page).toHaveURL(/seite=2/);
  const term = `zz-e2e-${Date.now()}-%_*[x]`;
  await page.getByLabel('Wort oder Wortgruppe').fill(term);
  await page.getByRole('button', { name: 'Zur Wortliste hinzufügen' }).click();
  await expect(page.getByRole('status')).toContainText('Änderung gespeichert');
  try {
    await page.getByLabel('Wort oder Wortgruppe').fill(term.toUpperCase());
    await page
      .getByRole('button', { name: 'Zur Wortliste hinzufügen' })
      .click();
    await expect(page.getByRole('alert')).toContainText('bereits vorhanden');
    await page.getByLabel('Wörter suchen').fill(term);
    await page.getByRole('button', { name: 'Suchen', exact: true }).click();
    await expect(page.locator('.blocked-words li')).toHaveCount(1);
    await expect(page.locator('.blocked-words')).toContainText(term);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: 'test-results/blacklist-mobile.png',
      fullPage: true,
    });
  } finally {
    await page.goto(`/admin/blacklist?suche=${encodeURIComponent(term)}`);
    await page
      .getByRole('button', { name: `Eintrag „${term}“ entfernen`, exact: true })
      .click();
  }
  await expect(page.getByRole('status')).toContainText('Änderung gespeichert');
  await expect(page.locator('.blocked-words li')).toHaveCount(0);
});
