import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test as base, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
} from './admin-credentials';
import { accountDeletionLinkFor } from './deletion-link';
import { totp } from './totp.mjs';

type Account = {
  id: string;
  email: string;
  password: string;
  username: string;
  client: SupabaseClient;
  admin: SupabaseClient;
  articleId: number;
  slug: string;
  secretKey: string;
};
const test = base.extend<{ account: Account }>({
  account: async ({ baseURL }, use) => {
    expect(new URL(baseURL!).hostname).toBe('127.0.0.1');
    const status = JSON.parse(
      execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], {
        encoding: 'utf8',
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
    const username = `release_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const email = `${username}@example.org`;
    const password = `Release-${randomUUID()}!`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    let articleId: number | undefined;
    try {
      expect(
        (await client.auth.signInWithPassword({ email, password })).error,
      ).toBeNull();
      expect(
        (
          await client.rpc('complete_reader_profile', {
            p_username: username,
            p_avatar: 'male',
            p_full_name: 'Release Test',
            p_birth_date: '1990-01-01',
          })
        ).error,
      ).toBeNull();
      const article = await admin
        .from('articles')
        .insert({
          slug: username.replaceAll('_', '-'),
          title: `${username} Example & <Bonn>`,
          excerpt: 'Ein ausreichend langer Teaser für den Release-Test.',
          content: 'Testinhalt.',
          category: 'news',
          status: 'published',
          published_at: new Date(Date.now() - 60000).toISOString(),
        })
        .select('id, slug')
        .single();
      expect(article.error).toBeNull();
      articleId = article.data!.id;
      await use({
        id: created.data.user!.id,
        email,
        password,
        username,
        client,
        admin,
        articleId: articleId!,
        slug: article.data!.slug,
        secretKey: status.SECRET_KEY,
      });
    } finally {
      if (articleId)
        expect(
          (await admin.from('articles').delete().eq('id', articleId)).error,
        ).toBeNull();
      const existing = await admin.auth.admin.getUserById(
        created.data.user!.id,
      );
      if (existing.data.user)
        expect(
          (await admin.auth.admin.deleteUser(created.data.user!.id)).error,
        ).toBeNull();
    }
  },
});

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/anmelden');
  await page.getByLabel('E-Mail-Adresse', { exact: true }).fill(account.email);
  await page.getByLabel('Passwort', { exact: true }).fill(account.password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Anmelden/ }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function openDeletionSection(page: Page) {
  await page.locator('.sidebar-account .account-menu__trigger').click();
  await page
    .locator('.sidebar-account .account-menu__panel')
    .getByRole('button', { name: 'Mein Profil', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: /Mein Profil/ })).toBeVisible();
  await page
    .locator('.profile-dialog__nav')
    .getByRole('button', { name: 'Konto löschen' })
    .click();
  const section = page.locator('[data-account-deletion]');
  await section.locator('summary').click();
  return section;
}

test('Wortliste, Freigabe, Ablehnung und Schreibsperre greifen im Browser', async ({
  page,
  browser,
  account,
}) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort', { exact: true }).fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Anmelden/ }).click();
  await completeAdminMfa(page);
  await page
    .getByRole('navigation', { name: 'Redaktionsnavigation' })
    .getByRole('button', { name: /Einstellungen/ })
    .click();
  await page
    .getByRole('link', { name: 'Blacklist-Wörter', exact: true })
    .click();
  const word = `blocked${account.username}`;
  const context = await browser.newContext();
  const reader = await context.newPage();
  try {
    await page.getByLabel('Wort oder Wortgruppe').fill(word);
    await page
      .getByRole('button', { name: 'Zur Wortliste hinzufügen' })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Änderung gespeichert',
    );
    // Nach dem Speichern ist das Einstellungen-Menü offen; Moderation direkt klicken.
    await page.getByRole('link', { name: 'Moderation', exact: true }).click();
    await login(reader, account);
    await reader.goto(`/beitraege/${account.slug}`);
    const body = `Zur Prüfung: ${word.toUpperCase()}`;
    await reader.getByLabel('Kommentar schreiben', { exact: true }).fill(body);
    await reader
      .getByRole('button', { name: 'Kommentar veröffentlichen' })
      .click();
    await expect(reader.getByRole('status')).toContainText('zur Prüfung');
    await expect(reader.locator('.reader-comment-body')).toHaveCount(0);
    await page.reload();
    const pending = page
      .getByRole('region', { name: /^Zur Prüfung/ })
      .getByRole('article')
      .filter({ hasText: body });
    await pending.getByRole('button', { name: 'Freigeben' }).click();
    await reader.goto(`/beitraege/${account.slug}`);
    await expect(reader.locator('.reader-comment-body')).toContainText(body);
    await reader
      .getByLabel('Kommentar schreiben', { exact: true })
      .fill(`Ablehnen: ${word}`);
    await reader
      .getByRole('button', { name: 'Kommentar veröffentlichen' })
      .click();
    await page.reload();
    const rejected = page
      .getByRole('region', { name: /^Zur Prüfung/ })
      .getByRole('article')
      .filter({ hasText: `Ablehnen: ${word}` });
    await rejected.getByRole('checkbox').check();
    await rejected.getByLabel('Dauer', { exact: true }).fill('2');
    await rejected
      .getByRole('button', { name: 'Ablehnen', exact: true })
      .click();
    await reader.goto(`/beitraege/${account.slug}`);
    await expect(reader.getByRole('status')).toContainText('gesperrt');
    await expect(
      reader.getByLabel('Kommentar schreiben', { exact: true }),
    ).toHaveCount(0);
    const bypass = await account.client.rpc('submit_comment', {
      target_article: account.articleId,
      comment_body: 'Umgehungsversuch',
    });
    expect(bypass.error?.message).toContain('comment_banned');
    await expect(
      page.getByRole('region', { name: 'Entscheidungsprotokoll' }),
    ).toContainText('Schreibsperre bis');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: 'test-results/moderation-mobile.png',
      fullPage: true,
    });
  } finally {
    await context.close();
    expect(
      (await account.admin.from('comment_blocklist').delete().eq('term', word))
        .error,
    ).toBeNull();
  }
});

test('Konto wird erst nach der Bestätigungsmail gelöscht, Kommentare bleiben anonymisiert', async ({
  page,
  account,
  baseURL,
}) => {
  const commentBody = 'Bleibt nach der Kontolöschung anonymisiert bestehen';
  const comment = await account.client.rpc('submit_comment', {
    target_article: account.articleId,
    comment_body: commentBody,
  });
  expect(comment.error).toBeNull();
  const commentId = comment.data?.[0]?.id;
  expect(commentId).toBeTruthy();
  await login(page, account);
  const section = await openDeletionSection(page);
  await section
    .getByLabel('E-Mail-Adresse zur Bestätigung')
    .fill(account.email);
  await section
    .getByLabel('Aktuelles Passwort', { exact: true })
    .fill('FalschesPasswort123!');
  await section.getByRole('checkbox').check();
  await section
    .getByRole('button', { name: 'Löschung per E-Mail bestätigen' })
    .click();
  await expect(
    page.locator('dialog[open] [data-notification-stack]'),
  ).toContainText('nicht korrekt');
  const forged = await page.request.post('/api/profil/konto-loeschen', {
    headers: { Origin: 'https://foreign.invalid' },
    form: {
      action: 'delete-account',
      email: account.email,
      password: account.password,
      confirm_delete: 'on',
    },
  });
  expect(forged.status()).toBe(403);
  // Schritt 1 prüft nur und verschickt die Bestätigungsmail. Ob der Versand
  // lokal möglich ist, hängt von der SMTP-Konfiguration ab; gelöscht wird in
  // keinem Fall, und die Sitzung bleibt bestehen.
  await section
    .getByLabel('E-Mail-Adresse zur Bestätigung')
    .fill(account.email);
  await section
    .getByLabel('Aktuelles Passwort', { exact: true })
    .fill(account.password);
  await section.getByRole('checkbox').check();
  await section
    .getByRole('button', { name: 'Löschung per E-Mail bestätigen' })
    .click();
  await expect(
    page.locator('dialog[open] [data-notification-stack]'),
  ).toContainText('Bestätigungsmail');
  await expect(page).not.toHaveURL(/konto=geloescht/);
  expect(
    (await account.admin.auth.admin.getUserById(account.id)).data.user,
  ).toBeTruthy();
  // Der Link aus der Bestätigungsmail führt auf die Bestätigungsseite; erst
  // das Formular dort löscht das Konto endgültig.
  await page.goto(
    accountDeletionLinkFor(account.id, account.secretKey, baseURL!),
  );
  await expect(
    page.getByRole('heading', { name: 'Kontolöschung bestätigen' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Konto endgültig löschen' }).click();
  await expect(page).toHaveURL(`${baseURL}/anmelden?konto=geloescht`);
  await expect(page.getByRole('status')).toContainText('endgültig gelöscht');
  expect(
    (await account.admin.auth.admin.getUserById(account.id)).data.user,
  ).toBeNull();
  const remaining = await account.admin
    .from('comments')
    .select('id, user_id, body')
    .eq('id', Number(commentId))
    .single();
  expect(remaining.error).toBeNull();
  expect(remaining.data).toMatchObject({
    id: commentId,
    user_id: null,
    body: commentBody,
  });
  expect(
    (
      await account.admin
        .from('reader_profiles')
        .select('id')
        .eq('id', account.id)
    ).data,
  ).toEqual([]);
  await page.goto('/beitraege/' + account.slug);
  const anonymized = page.locator('#kommentar-' + commentId);
  await expect(anonymized).toContainText('Gelöschter Nutzer');
  await expect(anonymized).toContainText(commentBody);
  expect(
    (
      await account.client.rpc('submit_comment', {
        target_article: account.articleId,
        comment_body: 'Alter Token',
      })
    ).error,
  ).toBeTruthy();
  expect((await account.client.auth.refreshSession()).error).toBeTruthy();
  expect(
    (await page.context().cookies()).filter((c) =>
      /^sb-.*-auth-token/.test(c.name),
    ),
  ).toHaveLength(0);
});

test('Kontolöschung respektiert eingerichtete MFA', async ({
  page,
  account,
  baseURL,
}) => {
  const enrollment = await account.client.auth.mfa.enroll({
    factorType: 'totp',
  });
  expect(enrollment.error).toBeNull();
  const factor = enrollment.data!;
  expect(
    (
      await account.client.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: totp(factor.totp.secret),
      })
    ).error,
  ).toBeNull();
  await login(page, account);
  const withoutMfa = await page.request.post('/api/profil/konto-loeschen', {
    headers: { Origin: baseURL! },
    form: {
      action: 'delete-account',
      email: account.email,
      password: account.password,
      confirm_delete: 'on',
    },
  });
  expect(await withoutMfa.text()).toContain(
    'zusätzlich mit deinem Authenticator-Code',
  );
  expect(
    (await account.admin.auth.admin.getUserById(account.id)).data.user,
  ).toBeTruthy();
  const section = await openDeletionSection(page);
  await section
    .getByLabel('E-Mail-Adresse zur Bestätigung')
    .fill(account.email);
  await section
    .getByLabel('Aktuelles Passwort', { exact: true })
    .fill(account.password);
  await section.getByLabel('Authenticator-Code').fill(totp(factor.totp.secret));
  await section.getByRole('checkbox').check();
  await section
    .getByRole('button', { name: 'Löschung per E-Mail bestätigen' })
    .click();
  await expect(
    page.locator('dialog[open] [data-notification-stack]'),
  ).toContainText('Bestätigungsmail');
  expect(
    (await account.admin.auth.admin.getUserById(account.id)).data.user,
  ).toBeTruthy();
  await page.goto(
    accountDeletionLinkFor(account.id, account.secretKey, baseURL!),
  );
  await page.getByRole('button', { name: 'Konto endgültig löschen' }).click();
  await expect(page).toHaveURL(`${baseURL}/anmelden?konto=geloescht`);
});

test('Sitemap und RSS enthalten nur bereits veröffentlichte Beiträge und gültiges XML', async ({
  request,
  page,
  account,
}) => {
  const path = `/beitraege/${account.slug}`;
  for (const endpoint of ['/sitemap.xml', '/rss.xml']) {
    const response = await request.get(endpoint);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(path);
    const source = await response.text();
    expect(
      await page.evaluate(
        (xml) =>
          new DOMParser()
            .parseFromString(xml, 'text/xml')
            .querySelector('parsererror')?.textContent ?? null,
        source,
      ),
    ).toBeNull();
  }
  for (const changes of [
    { status: 'draft' },
    {
      status: 'published',
      published_at: new Date(Date.now() + 86400000).toISOString(),
    },
    { status: 'archived' },
  ]) {
    expect(
      (
        await account.admin
          .from('articles')
          .update(changes)
          .eq('id', account.articleId)
      ).error,
    ).toBeNull();
    for (const endpoint of ['/sitemap.xml', '/rss.xml'])
      expect(await (await request.get(endpoint)).text()).not.toContain(path);
  }
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('/sitemap.xml');
  expect(await robots.text()).toContain('Disallow: /admin');
});
