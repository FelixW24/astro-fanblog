import { expect, test } from '@playwright/test';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
} from './admin-credentials';

test('Redaktion bleibt in der gemeinsamen Blog-Oberfläche', async ({
  page,
}) => {
  await page.goto('/anmelden');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort', { exact: true }).fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Anmelden/ }).click();
  // Der Redaktions-Zugang liegt im Konto-Popup der gemeinsamen Oberfläche.
  await page.locator('.sidebar-account .account-menu__trigger').click();
  await page
    .locator('.sidebar-account .account-menu__panel')
    .getByRole('link', { name: 'Redaktion', exact: true })
    .click();
  await completeAdminMfa(page);
  await expect(page.locator('.admin-shell')).toHaveCount(0);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(
    page.locator('.sidebar-account .account-menu__trigger'),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Astro Fanblog Startseite' }),
  ).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'Redaktionsnavigation' });
  for (const name of ['Spielerprofile', 'Spielplan', 'Beiträge']) {
    await tabs.getByRole('link', { name, exact: true }).click();
    await expect(tabs.getByRole('link', { name, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.locator('.site-header')).toBeVisible();
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    await page.screenshot({
      path: `test-results/editorial-integrated-${theme}.png`,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: 'test-results/editorial-integrated-mobile.png',
  });
  await page.getByRole('link', { name: 'Zum Blog', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
