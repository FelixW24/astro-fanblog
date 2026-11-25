import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
  verifyAdminMfa,
} from './admin-credentials';

test('speichert, veröffentlicht und löscht einen Artikel mit Zugriffsschutz', async ({
  page,
  browser,
  baseURL,
}) => {
  // Several complete server round trips, including three saves and cleanup.
  test.setTimeout(90_000);
  const env = loadEnv('development', process.cwd(), '');
  // This test writes a temporary article and must never target production.
  expect(env.PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:55321');
  const supabase = createClient(
    env.PUBLIC_SUPABASE_URL,
    env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  expect(authError).toBeNull();
  await verifyAdminMfa(supabase);
  const slug = `e2e-lifecycle-${crypto.randomUUID()}`;
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  publicPage.on('pageerror', (error) => errors.push(error.message));

  const finishWizard = async () => {
    await expect(page.locator('#article-form')).toHaveAttribute(
      'data-editor-ready',
      'true',
    );
    await page.getByRole('button', { name: 'Weiter zu Inhalt' }).click();
    await page.getByRole('button', { name: 'Weiter zu Details' }).click();
    await page.getByRole('button', { name: 'Weiter zum Abschluss' }).click();
  };
  try {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
    await page.getByLabel('Passwort').fill(adminPassword);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await completeAdminMfa(page);
    await expect(page).toHaveURL(/\/admin$/);

    for (const path of ['/admin/logout', '/admin/beitraege/neu']) {
      const response = await page.request.post(path, {
        headers: { Origin: 'https://foreign.example' },
        form: {},
        maxRedirects: 0,
      });
      expect([403, 405]).toContain(response.status());
    }

    await page.goto('/admin/beitraege/neu');
    await page
      .getByRole('textbox', { name: /^Titel/ })
      .fill('Temporärer E2E Testartikel');
    await page.locator('[name=slug]').fill(slug);
    await page
      .getByLabel(/Teaser/)
      .fill(
        'Dieser temporäre Testartikel prüft den vollständigen Redaktionsablauf.',
      );
    await page.getByRole('button', { name: 'Weiter zu Inhalt' }).click();
    await page
      .getByLabel('Beitragstext')
      .fill(
        'Dieser Text prüft sicheres Rendering. <script>window.auditXss=true</script>',
      );
    await page.getByRole('button', { name: 'Weiter zu Details' }).click();
    await page.getByRole('button', { name: 'Weiter zum Abschluss' }).click();
    await page
      .getByRole('button', { name: 'Beitrag anlegen', exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
    const { data: article, error } = await supabase
      .from('articles')
      .select('id')
      .eq('slug', slug)
      .single();
    expect(error).toBeNull();
    const id = article!.id;
    await publicPage.goto(`${baseURL}/beitraege/${slug}`);
    await expect(publicPage).toHaveURL(/\/404$/);

    await page.goto(`/admin/beitraege/${id}`);
    await page
      .getByRole('textbox', { name: /^Titel/ })
      .fill('Geänderter E2E Testartikel');
    await finishWizard();
    await page.locator('#article-status').selectOption('published');
    await page.getByLabel(/^Zeitpunkt/).fill('2099-01-01T12:00');
    await page
      .getByRole('button', { name: 'Änderungen speichern', exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
    await publicPage.goto(`${baseURL}/beitraege/${slug}`);
    await expect(publicPage).toHaveURL(/\/404$/);

    await page.goto(`/admin/beitraege/${id}`);
    await finishWizard();
    await page.getByLabel(/^Zeitpunkt/).fill('');
    await page
      .getByRole('button', { name: 'Änderungen speichern', exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
    await publicPage.goto(`${baseURL}/beitraege/${slug}`);
    await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(
      'Geänderter E2E Testartikel.',
    );
    expect(
      await publicPage.evaluate(() => Reflect.get(window, 'auditXss')),
    ).toBeUndefined();
    await expect(publicPage.locator('.prose')).toContainText(
      'window.auditXss=true',
    );
    await expect(publicPage.locator('.prose script')).toHaveCount(0);

    await page.goto(`/admin/beitraege/${id}`);
    await finishWizard();
    await page
      .getByRole('button', { name: 'Beitrag löschen', exact: true })
      .click();
    const deleteDialog = page.getByRole('dialog', {
      name: 'Beitrag endgültig löschen?',
    });
    await expect(deleteDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(deleteDialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/admin/beitraege/${id}$`));
    await page
      .getByRole('button', { name: 'Beitrag löschen', exact: true })
      .click();
    await deleteDialog.getByRole('button', { name: 'Beitrag löschen' }).click();
    await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
    const { data: remaining } = await supabase
      .from('articles')
      .select('id')
      .eq('slug', slug);
    expect(remaining).toEqual([]);
    await page.locator('.sidebar-account .account-menu__trigger').click();
    await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
    await expect(page).toHaveURL(/\/beitraege$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
    expect(errors).toEqual([]);
  } finally {
    const { error } = await supabase.from('articles').delete().eq('slug', slug);
    await publicContext.close();
    expect(error).toBeNull();
  }
});
