import { expect, test } from '@playwright/test';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
} from './admin-credentials';

test('blendet den Leihbereich passend zum Kaderstatus ein und speichert die Leihdaten', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);
  await page.goto('/admin/spieler?bereich=leihen');
  await page.getByRole('link', { name: 'Jule Kraft bearbeiten' }).click();
  const editorUrl = page.url();

  const loanSection = page.locator('[data-player-loan-fields]');
  const status = page.getByLabel('Kaderstatus');
  const partner = page.getByLabel(/^(Verliehen an|Ausgeliehen von)/);
  const starts = page.getByLabel('Leihbeginn');
  const ends = page.getByLabel('Leihende');
  const save = page.getByRole('button', {
    name: 'Speichern und weiter bearbeiten',
    exact: true,
  });

  // Der Leihbereich ist für verliehene Spieler sichtbar und mit den
  // vorhandenen Leihdaten vorausgefüllt.
  await expect(loanSection).toBeVisible();
  await expect(partner).toHaveValue('FC St. Pauli');
  await expect(starts).toHaveValue('2026-08-27');
  await expect(ends).toHaveValue('2027-06-30');

  try {
    // Beim Wechsel auf einen Nicht-Leihstatus verschwindet der Bereich.
    await status.selectOption('first-team');
    await expect(loanSection).toBeHidden();
    await expect(partner).toBeDisabled();
    await status.selectOption('on-loan');
    await expect(loanSection).toBeVisible();
    await expect(partner).toBeEnabled();

    // Ein zu kurzer Leihverein passiert die Browser-Prüfung, wird aber
    // serverseitig abgelehnt.
    await partner.fill('x');
    await save.click();
    await expect(page.locator('.admin-alert--error')).toContainText(
      'Leihverein',
    );

    // Neue Leihdaten werden gespeichert und bleiben nach dem Neuladen erhalten.
    await partner.fill('Energie Cottbus');
    await starts.fill('2026-09-15');
    await ends.fill('2027-06-30');
    await save.click();
    await expect(page.locator('.admin-alert--success')).toContainText(
      'gespeichert',
    );
    await page.goto(editorUrl);
    await expect(partner).toHaveValue('Energie Cottbus');
    await expect(starts).toHaveValue('2026-09-15');

    // Die öffentliche Leihseite zeigt den aktualisierten Verein.
    await page.goto('/leihspieler/verliehen');
    await expect(
      page.getByRole('link', { name: 'Jule Kraft', exact: true }),
    ).toContainText('Energie Cottbus');
  } finally {
    await page.goto(editorUrl);
    await status.selectOption('on-loan');
    await partner.fill('FC St. Pauli');
    await starts.fill('2026-08-27');
    await ends.fill('2027-06-30');
    await save.click();
    await expect(page.locator('.admin-alert--success')).toContainText(
      'gespeichert',
    );
  }
});

test('beendet die Leihe, wenn der Kaderstatus kein Leihstatus mehr ist', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);
  await page.goto('/admin/spieler?bereich=leihen');
  await page.getByRole('link', { name: 'Jule Kraft bearbeiten' }).click();
  const editorUrl = page.url();

  const loanSection = page.locator('[data-player-loan-fields]');
  const status = page.getByLabel('Kaderstatus');
  const partner = page.getByLabel(/^(Verliehen an|Ausgeliehen von)/);
  const starts = page.getByLabel('Leihbeginn');
  const ends = page.getByLabel('Leihende');
  const save = page.getByRole('button', {
    name: 'Speichern und weiter bearbeiten',
    exact: true,
  });

  try {
    // Wechsel auf einen Nicht-Leihstatus und Speichern beendet die Leihe.
    await status.selectOption('first-team');
    await save.click();
    await expect(page.locator('.admin-alert--success')).toContainText(
      'gespeichert',
    );

    // Beim Neuladen ist der Leihbereich verborgen und nicht mit alten
    // Leihdaten vorbefüllt.
    await page.goto(editorUrl);
    await expect(loanSection).toBeHidden();
    await expect(partner).toHaveValue('');

    // Die öffentliche Leihseite listet den Spieler nicht mehr als verliehen.
    await page.goto('/leihspieler/verliehen');
    await expect(
      page.getByRole('link', { name: 'Jule Kraft', exact: true }),
    ).toHaveCount(0);
  } finally {
    await page.goto(editorUrl);
    await status.selectOption('on-loan');
    await partner.fill('FC St. Pauli');
    await starts.fill('2026-08-27');
    await ends.fill('2027-06-30');
    await save.click();
    await expect(page.locator('.admin-alert--success')).toContainText(
      'gespeichert',
    );
  }
});
