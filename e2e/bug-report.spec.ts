import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test as base } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Account = {
  id: string;
  email: string;
  password: string;
  admin: SupabaseClient;
  client: SupabaseClient;
  url: string;
};
const test = base.extend<{ account: Account }>({
  account: async ({ baseURL }, use) => {
    expect(new URL(baseURL!).hostname).toBe('127.0.0.1');
    const status = JSON.parse(
      execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
    expect(status.API_URL).toBe('http://127.0.0.1:55321');
    const options = {
      auth: { persistSession: false, autoRefreshToken: false },
    };
    const admin = createClient(status.API_URL, status.SECRET_KEY, options);
    const client = createClient(
      status.API_URL,
      status.PUBLISHABLE_KEY,
      options,
    );
    const email = `bug-report-${randomUUID()}@example.org`;
    const password = `Secure-${randomUUID()}!`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();
    try {
      // Profil vervollständigen, damit die Anmeldung nicht ins Onboarding
      // weiterleitet.
      expect(
        (await client.auth.signInWithPassword({ email, password })).error,
      ).toBeNull();
      expect(
        (
          await client.rpc('complete_reader_profile', {
            p_username: `r_${data.user!.id.replaceAll('-', '').slice(0, 20)}`,
            p_avatar: 'male',
            p_full_name: 'Bug Report Test',
            p_birth_date: '1990-01-01',
          })
        ).error,
      ).toBeNull();
      await use({
        id: data.user!.id,
        email,
        password,
        admin,
        client,
        url: status.API_URL,
      });
    } finally {
      expect(
        (await admin.auth.admin.deleteUser(data.user!.id)).error,
      ).toBeNull();
    }
  },
});

// Gast: Weder Button noch Modal existieren; ein direkter Aufruf der Route
// wird ohne Session abgewiesen (Origin-Header wie ein echter Browser).
test('Bug-Report ist für Gäste unsichtbar und die Route weist ihn ab', async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto('/');
  await expect(
    page
      .locator('.site-footer')
      .getByRole('button', { name: 'Fehler melden' }),
  ).toHaveCount(0);
  await expect(page.locator('[data-bug-report-dialog]')).toHaveCount(0);

  const response = await request.post('/api/bug-report', {
    headers: { Origin: new URL(baseURL!).origin },
    multipart: {
      category: 'Funktion',
      page: 'https://example.com/',
      description: 'Direkter Aufruf ohne Anmeldung.',
    },
  });
  expect(response.status()).toBe(401);
  expect((await response.json()).error).toBe(
    'Für Fehlermeldungen musst du angemeldet sein.',
  );
});

test('Angemeldete Leser melden Fehler im Footer-Modal', async ({
  page,
  account,
}) => {
  await page.goto('/anmelden?weiter=/');
  await page.getByLabel('E-Mail-Adresse').fill(account.email);
  await page.getByLabel('Passwort', { exact: true }).fill(account.password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Anmelden/ }).click();
  await expect(page).toHaveURL('/');

  const trigger = page
    .locator('.footer-meta')
    .getByRole('button', { name: 'Fehler melden' });
  await expect(trigger).toBeVisible();

  // Modal öffnen: Der Seitentreff wird vorbelegt, die Beschreibung ist
  // Pflicht und blockiert das Absenden ohne SMTP-Kontakt.
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Fehler melden' })).toBeVisible();
  await expect(dialog.getByLabel('Seite', { exact: true })).toHaveValue(
    page.url(),
  );

  await dialog
    .getByLabel('Was ist passiert?', { exact: true })
    .fill('zu kurz');
  let attempted = 0;
  await page.route('**/api/bug-report', async (route) => {
    attempted += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sent: true }),
    });
  });
  await dialog.getByRole('button', { name: 'Fehlerbericht senden' }).click();
  // Native Validierung blockt zu kurze Beschreibungen ohne Serverkontakt.
  await expect(
    dialog.locator('[data-bug-report-description]:invalid'),
  ).toBeVisible();
  expect(attempted).toBe(0);

  await dialog
    .getByLabel('Was ist passiert?', { exact: true })
    .fill('Der Like-Button reagiert auf Artikelseiten nicht.');
  await dialog
    .getByRole('combobox', { name: 'Kategorie' })
    .selectOption({ label: 'Funktion' });

  let calls = 0;
  await page.route('**/api/bug-report', async (route) => {
    calls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sent: true }),
    });
  });

  await dialog.getByRole('button', { name: 'Fehlerbericht senden' }).click();
  await expect(dialog.getByRole('status')).toContainText(
    'Danke! Dein Fehlerbericht wurde an die Redaktion gesendet.',
  );
  expect(calls).toBe(1);

  // Nach dem Erfolg ist die Beschreibung geleert, die Seite bleibt gesetzt.
  await expect(dialog.getByLabel('Was ist passiert?', { exact: true })).toHaveValue(
    '',
  );

  // Esc schließt das Modal und gibt den Fokus an den Footer-Button zurück.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Fehler und Cooldown des Servers erscheinen im Modal', async ({
  page,
  account,
}) => {
  await page.goto('/anmelden?weiter=/');
  await page.getByLabel('E-Mail-Adresse').fill(account.email);
  await page.getByLabel('Passwort', { exact: true }).fill(account.password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Anmelden/ }).click();
  await expect(page).toHaveURL('/');

  await page
    .locator('.footer-meta')
    .getByRole('button', { name: 'Fehler melden' })
    .click();
  const dialog = page.getByRole('dialog');

  await page.route('**/api/bug-report', async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        error:
          'Du hast gerade erst einen Fehler gemeldet. Bitte warte noch 4 Minuten und versuche es erneut.',
      }),
    });
  });

  await dialog
    .getByLabel('Was ist passiert?', { exact: true })
    .fill('Der Like-Button reagiert auf Artikelseiten nicht.');
  await dialog.getByRole('button', { name: 'Fehlerbericht senden' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Bitte warte noch 4 Minuten',
  );
  // Der Button bleibt bedienbar, das Formular bleibt gefüllt.
  await expect(dialog.getByRole('button', { name: 'Fehlerbericht senden' })).toBeEnabled();
  await expect(dialog.getByLabel('Was ist passiert?', { exact: true })).toHaveValue(
    'Der Like-Button reagiert auf Artikelseiten nicht.',
  );
});
