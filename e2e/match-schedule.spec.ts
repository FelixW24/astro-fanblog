import { expect, test } from '@playwright/test';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
} from './admin-credentials';

test('legt Spiele an, bearbeitet sie und löscht sie wieder', async ({
  page,
}) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(8_000);
  const opponent = `Testverein ${Date.now()}`;
  let editUrl: string | undefined;
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);
  await expect(page).toHaveURL(/\/admin$/);
  try {
    await page
      .getByRole('navigation', { name: 'Redaktionsnavigation' })
      .getByRole('link', { name: 'Spielplan', exact: true })
      .click();
    await page.getByRole('link', { name: 'Spiel hinzufügen' }).click();
    await expect(page).toHaveURL(/\/admin\/spielplan\/neu$/);
    await page.getByLabel('Gegner', { exact: true }).fill(opponent);
    await page.getByLabel('Gegnerkürzel').fill('TEST');
    await page.getByLabel('Anstoß (Berliner Zeit)').fill('2099-09-20T15:30');
    await page
      .getByRole('button', { name: 'Spiel speichern', exact: true })
      .click();
    await expect(page.getByRole('status')).toHaveText('Spiel angelegt.');
    await page.getByRole('link', { name: `${opponent} bearbeiten` }).click();
    editUrl = page.url();
    await expect(page.getByLabel('Anstoß (Berliner Zeit)')).toHaveValue(
      '2099-09-20T15:30',
    );
    await test.step('Auswärtsspiel und Absage speichern', async () => {
      // Warten, bis das Autofill-Skript des Formulars geladen ist.
      await expect(page.locator('[data-match-form]')).toHaveAttribute(
        'data-venue-autofill',
        'ready',
      );
      await page
        .getByRole('combobox', { name: 'Spielort', exact: true })
        .selectOption('away');
      // Beim Wechsel auf Auswärts wird das Heimstadion aus dem Feld entfernt.
      await expect(page.getByLabel('Stadion', { exact: true })).toHaveValue('');
      await page
        .getByLabel('Stadion', { exact: true })
        .fill('Teststadion Auswärts');
      await page.getByLabel('Abgesagt / vorerst nicht anzeigen').check();
      await page.getByRole('button', { name: 'Änderungen speichern' }).click();
      const row = page.getByRole('row').filter({ hasText: opponent });
      await expect(row).toContainText(`${opponent} – FC Example`);
      await expect(row).toContainText('Ausgeblendet');
    });
    await page.screenshot({
      path: 'test-results/spielplan-admin.png',
      fullPage: true,
    });
  } finally {
    if (!editUrl) {
      await page.goto('/admin/spielplan');
      const href = await page
        .getByRole('link', { name: `${opponent} bearbeiten` })
        .getAttribute('href')
        .catch(() => null);
      if (href) editUrl = href;
    }
    if (editUrl) {
      await page.goto(editUrl);
      await page.getByLabel('Dieses Spiel endgültig löschen').check();
      await page
        .getByRole('button', { name: 'Spiel löschen', exact: true })
        .click();
      await expect(page.getByRole('status')).toHaveText('Spiel gelöscht.');
    }
  }
});

test('aktualisiert die Anzeige auf geöffneten Seiten und zeigt einen leeren Spielplan', async ({
  page,
}) => {
  await page.clock.install();
  let match: Record<string, unknown> | null = {
    id: 1,
    opponent: 'Testverein',
    opponent_short: 'TEST',
    is_home: false,
    kickoff_at: '2099-09-20T13:30:00.000Z',
    venue: 'Teststadion',
    matchcenter_url: null,
    cancelled: false,
  };
  await page.route('**/api/naechstes-spiel', (route) =>
    route.fulfill({ json: { match } }),
  );
  await page.goto('/');
  const card = page
    .getByRole('complementary', { name: 'Nächstes Spiel' })
    .first();
  await expect(card.getByText('Testverein', { exact: true })).toBeVisible();
  await expect(card.locator('[data-team-name]').first()).toHaveText(
    'Testverein',
  );
  await expect(card.locator('time')).toContainText('15:30');
  await expect(
    card.getByRole('link', { name: 'Zum Spielcenter' }),
  ).toBeHidden();
  match = null;
  await page.clock.fastForward(60_000);
  await expect(
    card.getByText('Noch kein weiteres Spiel eingetragen.'),
  ).toBeVisible();
  await expect(card.getByText('Testverein', { exact: true })).toBeHidden();
});

test('schützt den Spielplan vor unangemeldeten Zugriffen', async ({ page }) => {
  await page.goto('/admin/spielplan');
  await expect(page).toHaveURL(/\/admin\/login$/);
});
