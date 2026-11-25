import { expect, test } from '@playwright/test';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
} from './admin-credentials';

test('speichert die Verletzung am gemeinsamen Spielerprofil und meldet ihn wieder gesund', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);
  await page.goto('/admin/spieler?bereich=leihen');
  await page.getByRole('link', { name: 'Alex Beispiel bearbeiten' }).click();
  const editorUrl = page.url();
  const checkbox = page.getByLabel('Spieler ist verletzt');
  const oldInjured = await checkbox.isChecked();
  const oldSince = await page.getByLabel('Verletzt seit').inputValue();
  const oldUntil = await page.getByLabel('Voraussichtlich bis').inputValue();
  try {
    await checkbox.check();
    await expect(page.getByLabel('Verletzt seit')).toHaveAttribute(
      'required',
      '',
    );
    await page.getByLabel('Verletzt seit').fill('2026-10-20');
    await page.getByLabel('Voraussichtlich bis').fill('2026-11-02');
    await expect(page.locator('[data-injury-duration]')).toContainText(
      '14 Tage',
    );
    await page
      .getByRole('button', {
        name: 'Speichern und weiter bearbeiten',
        exact: true,
      })
      .click();
    await expect(page.locator('.admin-alert--success')).toContainText(
      'gespeichert',
    );
    await page.goto('/kader/thijs-beispiel');
    await expect(page.getByLabel('Spielerstatus')).toContainText('14 Tage');
    await page.goto('/leihspieler/geliehen');
    await expect(
      page.getByRole('link', { name: 'Alex Beispiel', exact: true }),
    ).toContainText('14 Tage');
    await page.goto(editorUrl);
    await checkbox.uncheck();
    await expect(page.getByLabel('Verletzt seit')).toBeDisabled();
    await page
      .getByRole('button', {
        name: 'Speichern und weiter bearbeiten',
        exact: true,
      })
      .click();
    await expect(page.locator('.admin-alert--success')).toContainText(
      'gespeichert',
    );
    await page.goto('/kader/thijs-beispiel');
    await expect(page.locator('.player-status-badge--injury')).toHaveCount(0);
  } finally {
    await page.goto(editorUrl);
    await checkbox.setChecked(oldInjured);
    if (oldInjured) {
      await page.getByLabel('Verletzt seit').fill(oldSince);
      await page.getByLabel('Voraussichtlich bis').fill(oldUntil);
    }
    await page
      .getByRole('button', {
        name: 'Speichern und weiter bearbeiten',
        exact: true,
      })
      .click();
  }
});
