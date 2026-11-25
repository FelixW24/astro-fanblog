import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
} from './admin-credentials';

// Der Datenbank-Wächter lehnt Spielernamen ohne Geburtsdatum ab, wenn schon
// ein gleichnamiges Profil existiert. Testprofile bekommen deshalb eindeutige
// Namen und werden nach dem Lauf über den Service-Role-Client wieder entfernt.
test.afterAll(async () => {
  const status = JSON.parse(
    execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  );
  if (status.API_URL !== 'http://127.0.0.1:55321') return;
  const admin = createClient(status.API_URL, status.SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin
    .from('players')
    .delete()
    .like('slug', 'diagramm-test-%');
  if (error) throw error;
});

test('wählt Leistungsdaten passend zur Spielerposition', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);

  await page.goto('/admin/spieler/neu');
  await expect(
    page.getByRole('heading', { name: 'Spielerprofil anlegen' }),
  ).toBeVisible();
  await expect(page.getByLabel('Grafiktyp')).toHaveValue('radar');
  await expect(page.getByLabel('Anzeigereihenfolge im Profil')).toHaveValue(
    '1',
  );
  await expect(page.getByLabel('Grafiktyp').getByRole('option')).toHaveText([
    'Radar-Chart',
    'Balkendiagramm',
  ]);

  const picker = page.getByLabel('Diagrammvorlage');
  const metrics = page.getByRole('textbox', { name: /^Werte\b/ });
  const position = page.getByRole('combobox', { name: /^Position\b/ });
  await position.selectOption('torwart');
  await expect(picker).toHaveValue('builtin:torwart');
  await page.getByRole('button', { name: 'Vorlage übernehmen' }).click();
  await expect(metrics).toHaveValue(/Paradenquote:/);
  await expect(metrics).not.toHaveValue(/Schussgenauigkeit:/);

  await position.selectOption('sturm');
  await expect(picker).toHaveValue('builtin:sturm');
  await page.getByRole('button', { name: 'Vorlage übernehmen' }).click();
  await expect(metrics).toHaveValue(/Schussgenauigkeit:/);
  await expect(metrics).not.toHaveValue(/Paradenquote:/);
});

test('zeigt einen gespeicherten Radar-Chart nicht zusätzlich als Balkendiagramm', async ({
  page,
}) => {
  await page.goto('/kader/lukas-luecke');

  // Auf die Karte des Seed-Charts scopen: Zusätzliche Charts in der lokalen
  // Datenbank (manuelle Testeinträge) dürfen das Ergebnis nicht verfälschen.
  const card = page.locator('.player-chart-card').filter({
    hasText: 'Torwartprofil 2026/27',
  });
  await expect(card).toHaveCount(1);
  await expect(card.locator('.player-radar')).toHaveCount(1);
  await expect(card.locator('.player-bars')).toHaveCount(0);
});

test('gliedert Kader und Leihen nach Positionen und befüllt neue Profile vor', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);

  await page.goto('/admin/spieler');
  const navigation = page.getByRole('navigation', { name: 'Kaderbereiche' });
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(4);
  await navigation.getByRole('link', { name: /^Leihen/ }).click();
  await expect(page.getByRole('heading', { name: /^Geliehen/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Verliehen/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(8);

  for (const status of ['loan-in', 'on-loan']) {
    await page.goto(
      `/admin/spieler/neu?squad_status=${status}&position=torwart`,
    );
    await expect(
      page.getByRole('combobox', { name: /^Position\b/ }),
    ).toHaveValue('torwart');
    await expect(page.getByLabel('Kaderstatus')).toHaveValue(status);
    await expect(page.getByLabel('Diagrammvorlage')).toHaveValue(
      'builtin:torwart',
    );
  }
});

test('erklärt Perzentile am Spielerdiagramm per Tastatur und auf Mobilgeräten', async ({
  page,
}) => {
  await page.goto('/kader/lukas-luecke');
  const help = page.locator('.player-chart-help').first();
  const trigger = help.locator('summary');
  const content = help.locator('.player-chart-help__content');

  await expect(content).toBeHidden();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(content).toBeVisible();
  await expect(content).toContainText('oberen 20 %');
  await expect(content).toContainText('keine Erfolgsquote');
  await expect(content).toContainText('Vergleichsgruppe');
  await page.keyboard.press('Enter');
  await expect(content).toBeHidden();

  await page.setViewportSize({ width: 360, height: 640 });
  await trigger.click();
  await expect(content).toBeVisible();
  const bounds = await content.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  await trigger.click();
  await expect(content).toBeHidden();
});

test('speichert Profildaten und Diagramm gemeinsam und erklärt Eingabefehler', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);

  const runId = Date.now();
  const playerName = `Diagramm Testspieler ${runId}`;
  const slug = `diagramm-test-${runId}`;
  await page.goto('/admin/spieler/neu');
  await page.getByLabel('Name', { exact: true }).fill(playerName);
  await page.getByLabel('URL-Slug').fill(slug);
  await page
    .getByRole('combobox', { name: /^Position\b/ })
    .selectOption('sturm');
  await page.getByLabel('Charttitel').fill('Leistungsdaten Test');
  await page
    .getByRole('textbox', { name: /^Werte\b/ })
    .fill('Tempo: 82\nTechnik: 74\nPhysis: 91');
  await page.getByRole('button', { name: 'Spielerprofil anlegen' }).click();
  await expect(page).toHaveURL(/\/admin\/spieler\/\d+\?created=1$/);

  await page.getByLabel('Spieler ist verletzt').check();
  await page.getByLabel('Verletzt seit').fill('2026-10-20');
  await page.getByLabel('Voraussichtlich bis').fill('2026-11-02');
  const bio = 'Neue redaktionelle Einschätzung zum Testspieler.';
  await page.getByLabel('Redaktionstext').fill(bio);
  await page.getByRole('tab', { name: 'Charts' }).click();
  await page.getByLabel('Charttitel').fill('Gemeinsam gespeichert');
  const metrics = page.getByRole('textbox', { name: /^Werte\b/ });
  await metrics.fill('Tempo: 82 %\nTechnik: 74\nPhysis: 91');
  const save = page.getByRole('button', {
    name: 'Speichern und weiter bearbeiten',
  });
  await save.click();
  // Validation details stay beside the field after toast notifications expire.
  const chartError = page.locator('.player-chart-admin #chart-input-error');
  await expect(chartError).toHaveRole('alert');
  await expect(chartError).toContainText(/Zeile 1[\s\S]*ohne Prozentzeichen/);
  await expect(chartError).not.toHaveAttribute('data-notification');
  await expect(page.getByLabel('Redaktionstext')).toHaveValue(bio);
  await expect(metrics).toHaveValue('Tempo: 82 %\nTechnik: 74\nPhysis: 91');
  // Der Hintergrund-Autosave schreibt geänderte Profilfelder wie den
  // Redaktionstext still mit. Diagramme bleiben dem zentralen Speichern
  // vorbehalten: Nach abgelehntem Diagramm darf deshalb nur der neue
  // Charttitel nicht veröffentlicht sein, nicht der Redaktionstext.
  const publicProfile = await (await page.request.get(`/kader/${slug}`)).text();
  expect(publicProfile).not.toContain('Gemeinsam gespeichert');

  await metrics.fill('Tempo: 82\nTechnik: 74\nPhysis: 91');
  await save.click();
  await expect(
    page.locator('[data-notification][role="status"]'),
  ).toContainText('Spielerprofil und Diagramm wurden gespeichert');
  await page.getByRole('tab', { name: 'Charts' }).click();
  await expect(page.getByLabel('Redaktionstext')).toHaveValue(bio);
  await expect(page.locator('.player-chart-card')).toHaveCount(2);
  await expect(page.getByLabel('Charttitel')).toBeEmpty();
  await expect(metrics).toBeEmpty();
  await expect(page.getByLabel('Spieler ist verletzt')).toBeChecked();
  await expect(page.getByLabel('Verletzt seit')).toHaveValue('2026-10-20');
  await expect(page.getByLabel('Voraussichtlich bis')).toHaveValue(
    '2026-11-02',
  );

  await page.getByRole('tab', { name: 'Profil' }).click();
  await page
    .getByLabel('Redaktionstext')
    .fill('Eine weitere Einschätzung ohne zusätzliches Diagramm.');
  await save.click();
  await expect(
    page.locator('[data-notification][role="status"]'),
  ).toContainText('Spielerprofil wurde gespeichert');
  await expect(page.locator('.player-chart-card')).toHaveCount(2);

  const templateName = `Sturmvorlage ${Date.now()}`;
  await page.getByRole('tab', { name: 'Charts' }).click();
  await metrics.fill('Abschluss: 82\nKopfball: 60\nAntritt: 90');
  const draftChartType = page
    .locator('.player-chart-form')
    .getByRole('combobox', { name: /^Grafiktyp\b/ });
  await draftChartType.selectOption('bar');
  await page
    .getByText('Eigene Vorlage speichern, umbenennen oder löschen', {
      exact: true,
    })
    .click();
  await page.getByLabel('Vorlagenname').fill(templateName);
  await page.getByRole('button', { name: 'Als Vorlage speichern' }).click();
  await expect(page.locator('[data-template-status]')).toContainText(
    'gespeichert',
  );
  await expect(page.locator('.player-chart-card')).toHaveCount(2);
  await expect(metrics).toHaveValue('Abschluss: 82\nKopfball: 60\nAntritt: 90');

  await page.reload();
  await page.getByRole('tab', { name: 'Charts' }).click();
  const picker = page.getByLabel('Diagrammvorlage');
  await picker.selectOption({ label: templateName });
  await page.getByRole('button', { name: 'Vorlage übernehmen' }).click();
  await expect(metrics).toHaveValue('Abschluss: \nKopfball: \nAntritt: ');
  await expect(draftChartType).toHaveValue('bar');
  await page.getByRole('tab', { name: 'Profil' }).click();
  await page.getByRole('combobox', { name: /^Position\b/ }).selectOption('torwart');
  await page.getByRole('tab', { name: 'Charts' }).click();
  await expect(picker).toHaveValue('builtin:torwart');
  await page.getByRole('button', { name: 'Vorlage übernehmen' }).click();
  await expect(metrics).toHaveValue(/Paradenquote:/);
  await expect(metrics).not.toHaveValue(/Abschluss:/);

  await page.getByRole('tab', { name: 'Profil' }).click();
  await page.getByRole('combobox', { name: /^Position\b/ }).selectOption('sturm');
  await page.getByRole('tab', { name: 'Charts' }).click();
  await picker.selectOption({ label: templateName });
  await page
    .getByText('Eigene Vorlage speichern, umbenennen oder löschen', {
      exact: true,
    })
    .click();
  // Die Benennung einer gewählten Vorlage wird vorgetragen und ist editierbar.
  await expect(page.getByLabel('Vorlagenname')).toHaveValue(templateName);
  const renamedTemplate = `${templateName} korrigiert`;
  await page.getByLabel('Vorlagenname').fill(renamedTemplate);
  await page
    .getByRole('button', { name: 'Gewählte Vorlage umbenennen' })
    .click();
  await expect(page.locator('[data-template-status]')).toContainText(
    'umbenannt',
  );
  await expect(
    picker.getByRole('option', { name: renamedTemplate }),
  ).toHaveCount(1);

  await page.getByRole('button', { name: 'Gewählte Vorlage löschen' }).click();
  await expect(page.locator('[data-template-status]')).toContainText(
    'Vorlage gelöscht',
  );
  await expect(
    picker.getByRole('option', { name: renamedTemplate }),
  ).toHaveCount(0);
  await expect(page.locator('.player-chart-card')).toHaveCount(2);
});

test('legt ein Spielerprofil ohne Leistungsdaten an', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);

  const runId = Date.now();
  await page.goto('/admin/spieler/neu');
  await page.getByLabel('Name', { exact: true }).fill(`Ohne Diagramm ${runId}`);
  await page.getByLabel('URL-Slug').fill(`diagramm-test-${runId}`);
  // Der Leistungsdaten-Bereich bleibt leer und ist kein Pflichtfeld.
  await page.getByRole('button', { name: 'Spielerprofil anlegen' }).click();
  await expect(page).toHaveURL(/\/admin\/spieler\/\d+\?created=1&chart=none/);
  await expect(
    page.locator('[data-notification][role="status"]'),
  ).toContainText('Spielerprofil wurde angelegt');
  await expect(page.locator('.player-chart-card')).toHaveCount(0);
});
