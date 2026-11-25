import { expect, test } from '@playwright/test';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
} from './admin-credentials';

test('meldet das konfigurierte Redaktionskonto an', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Beiträge' })).toBeVisible();
  await page.locator('.sidebar-account .account-menu__trigger').click();
  await page
    .locator('.sidebar-account .account-menu__panel')
    .getByRole('button', { name: 'Mein Profil', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: /Mein Profil/ })).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
});

test('lehnt ein anderes Redaktionskonto trotz richtigem Passwort ab', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill('andere@fanblog.local');
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();

  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('alert')).toHaveText(
    'E-Mail-Adresse oder Passwort sind nicht korrekt.',
  );
});


test('vertrautes Gerät umgeht 24h lang die erneute Zweitfaktor-Abfrage', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const trustSecret = process.env.EDITOR_TRUST_SECRET;
  test.skip(
    !trustSecret || trustSecret.length < 32,
    'EDITOR_TRUST_SECRET ist nicht gesetzt.',
  );

  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page, { trustDevice: true });

  const trusted = (await context.cookies()).find(
    (cookie) => cookie.name === 'b48_editor_trusted',
  );
  expect(trusted).toBeTruthy();

  // Neue Browsersitzung: nur das vertraute Cookie, frische AAL1-Session.
  const secondContext = await browser.newContext();
  await secondContext.addCookies([
    { name: 'b48_editor_trusted', value: trusted!.value, url: baseURL! },
  ]);
  const secondPage = await secondContext.newPage();
  await secondPage.goto('/admin/login');
  await secondPage.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await secondPage.getByLabel('Passwort').fill(adminPassword);
  await secondPage.getByRole('checkbox').check();
  await secondPage.getByRole('button', { name: 'Anmelden' }).click();
  // Trotz neuer Sitzung ohne MFA direkt im Redaktionsbereich.
  await expect(secondPage).toHaveURL(/\/admin$/);
  await expect(secondPage.getByLabel('Authenticator-Code')).toHaveCount(0);
  await secondContext.close();
});
