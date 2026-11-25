import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test as base } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { totp } from './totp.mjs';

type Account = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
  admin: SupabaseClient;
  url: string;
  key: string;
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
    const email = `security-${randomUUID()}@example.org`;
    const password = `Secure-${randomUUID()}!`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();
    try {
      await use({
        id: data.user!.id,
        email,
        password,
        client,
        admin,
        url: status.API_URL,
        key: status.PUBLISHABLE_KEY,
      });
    } finally {
      expect(
        (await admin.auth.admin.deleteUser(data.user!.id)).error,
      ).toBeNull();
    }
  },
});

test('Kommentarbudget gilt für direkte API-Aufrufe und zeigt im Browser eine verständliche Meldung', async ({
  page,
  account,
}) => {
  expect(
    (await account.client.auth.signInWithPassword(account)).error,
  ).toBeNull();
  expect(
    (
      await account.client.rpc('complete_reader_profile', {
        p_username: `r_${account.id.replaceAll('-', '').slice(0, 20)}`,
        p_avatar: 'male',
        p_full_name: 'Security Test',
        p_birth_date: '1990-01-01',
      })
    ).error,
  ).toBeNull();
  const slug = `rate-${account.id}`;
  const { data: article, error } = await account.admin
    .from('articles')
    .insert({
      slug,
      title: 'Kommentar Limit Test',
      excerpt: 'Ein ausreichend langer Teaser.',
      content: 'Ein Test für die Begrenzung von Kommentaren.',
      category: 'news',
      status: 'published',
      published_at: new Date(Date.now() - 60_000).toISOString(),
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  try {
    await page.goto(`/anmelden?weiter=/beitraege/${slug}`);
    await page.getByLabel('E-Mail-Adresse').fill(account.email);
    await page.getByLabel('Passwort', { exact: true }).fill(account.password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /^Anmelden/ }).click();
    await expect(page).toHaveURL(`/beitraege/${slug}`);
    expect(
      (
        await account.client.from('comments').insert(
          Array.from({ length: 10 }, (_, index) => ({
            article_id: article!.id,
            user_id: account.id,
            body: `API Kommentar ${index}`,
          })),
        )
      ).error,
    ).toBeNull();
    const limited = await account.client.rpc('submit_comment', {
      target_article: article!.id,
      comment_body: 'RPC über Limit',
    });
    expect(limited.error?.message).toBe('comment_rate_limited');
    await page
      .getByLabel('Kommentar schreiben', { exact: true })
      .fill('Browser über Limit');
    await page
      .getByRole('button', { name: 'Kommentar veröffentlichen', exact: true })
      .click();
    await expect(page).toHaveURL(/kommentarfehler=rate/);
    await expect(page.getByRole('alert')).toContainText(
      '10 Kommentare pro Minute und 60 pro Stunde',
    );
    const count = await account.admin
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', account.id);
    expect(count.error).toBeNull();
    expect(count.count).toBe(10);
  } finally {
    expect(
      (await account.admin.from('articles').delete().eq('id', article!.id))
        .error,
    ).toBeNull();
  }
});

test('normale Sitzung reicht weder für Passwortseite noch direkten API-Passwortwechsel', async ({
  page,
  account,
}) => {
  expect(
    (await account.client.auth.signInWithPassword(account)).error,
  ).toBeNull();
  const changed = await account.client.auth.updateUser({
    password: `Other-${randomUUID()}!`,
  });
  expect(changed.error?.code).toBe('current_password_required');
  await page.goto('/anmelden');
  await page.getByLabel('E-Mail-Adresse').fill(account.email);
  await page.getByLabel('Passwort', { exact: true }).fill(account.password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Anmelden/ }).click();
  await expect(page).toHaveURL(/\/profil\/einrichten/);
  await page.goto('/passwort-neu');
  await expect(page).toHaveURL(/\/passwort-vergessen\?link=ungueltig/);
});

test('Passwort-Reset meldet unbekannte Adresse statt stiller Erfolgsseite', async ({
  page,
}) => {
  const email = `unbekannt-${randomUUID()}@example.org`;
  await page.goto('/passwort-vergessen');
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Link anfordern' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Zu dieser E-Mail-Adresse ist kein Konto bekannt',
  );
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('alert')).not.toContainText(email);
});

for (const withMfa of [false, true]) {
  test(`Recovery in neuem Browser, Scanner-sicher, MFA=${withMfa}`, async ({
    browser,
    account,
    baseURL,
  }) => {
    let secret = '';
    if (withMfa) {
      expect(
        (await account.client.auth.signInWithPassword(account)).error,
      ).toBeNull();
      const enrolled = await account.client.auth.mfa.enroll({
        factorType: 'totp',
      });
      expect(enrolled.error).toBeNull();
      secret = enrolled.data!.totp.secret;
      expect(
        (
          await account.client.auth.mfa.challengeAndVerify({
            factorId: enrolled.data!.id,
            code: totp(secret),
          })
        ).error,
      ).toBeNull();
      await account.client.auth.signOut({ scope: 'local' });
    }
    const { data, error } = await account.admin.auth.admin.generateLink({
      type: 'recovery',
      email: account.email,
    });
    expect(error).toBeNull();
    const link = `${baseURL}/auth/passwort-zuruecksetzen?token_hash=${data.properties!.hashed_token}`;
    const scanner = await browser.newContext();
    const fresh = await browser.newContext();
    try {
      const preview = await scanner.newPage();
      await preview.goto(link);
      await expect(preview).toHaveURL(/\/passwort-neu$/);
      expect(
        (await scanner.cookies()).filter((cookie) =>
          cookie.name.includes('auth-token'),
        ),
      ).toHaveLength(0);
      const page = await fresh.newPage();
      await page.goto(link);
      const password = `Recovered-${randomUUID()}!`;
      await page.getByLabel('Neues Passwort', { exact: true }).fill(password);
      await page
        .getByLabel('Neues Passwort wiederholen', { exact: true })
        .fill(password);
      await page.getByRole('button', { name: 'Passwort speichern' }).click();
      if (withMfa) {
        await expect(page.getByRole('alert')).toContainText(
          'Authenticator-Code',
        );
        await page.getByLabel('Neues Passwort', { exact: true }).fill(password);
        await page
          .getByLabel('Neues Passwort wiederholen', { exact: true })
          .fill(password);
        await page
          .getByLabel('Authenticator-Code', { exact: true })
          .fill(totp(secret));
        await page.getByRole('button', { name: 'Passwort speichern' }).click();
      }
      await expect(page).toHaveURL(/\/anmelden\?passwort=geaendert/);
      expect(
        (await fresh.cookies()).filter(
          (cookie) =>
            cookie.name.includes('auth-token') &&
            !cookie.name.includes('code-verifier'),
        ),
      ).toHaveLength(0);
      expect(
        (
          await account.client.auth.signInWithPassword({
            email: account.email,
            password,
          })
        ).error,
      ).toBeNull();
      expect(
        (await account.client.auth.signInWithPassword(account)).error,
      ).not.toBeNull();
      expect(
        (
          await account.client.auth.verifyOtp({
            token_hash: data.properties!.hashed_token,
            type: 'recovery',
          })
        ).error,
      ).not.toBeNull();
    } finally {
      await scanner.close();
      await fresh.close();
    }
  });
}

test('Redaktion erzwingt MFA im Browser und in der Datenbank; Einrichtung funktioniert', async ({
  page,
  account,
}) => {
  expect(
    (
      await account.admin.auth.admin.updateUserById(account.id, {
        app_metadata: { is_editor: true },
      })
    ).error,
  ).toBeNull();
  expect(
    (await account.client.auth.signInWithPassword(account)).error,
  ).toBeNull();
  const insert = await account.client.from('articles').insert({
    slug: `denied-${randomUUID()}`,
    title: 'MFA muss greifen',
    excerpt: 'Ein ausreichend langer Testteaser.',
    content: 'Ein ausreichend langer Testinhalt.',
    category: 'news',
  });
  expect(insert.error?.code).toBe('42501');
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(account.email);
  await page.getByLabel('Passwort').fill(account.password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/\/admin\/sicherheit$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/sicherheit$/);
  await page.getByRole('button', { name: 'Authenticator einrichten' }).click();
  const secret = await page.locator('code').textContent();
  expect(secret).toBeTruthy();
  await page.getByLabel('Authenticator-Code').fill(totp(secret!));
  await page.getByRole('button', { name: 'Code bestätigen' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole('heading', { name: 'Beiträge', exact: true }),
  ).toBeVisible();
});

test('Logout beendet nur die aktuelle Sitzung; fremde Origins werden blockiert', async ({
  page,
  account,
  baseURL,
}) => {
  expect(
    (await account.client.auth.signInWithPassword(account)).error,
  ).toBeNull();
  await page.goto('/anmelden');
  await page.getByLabel('E-Mail-Adresse').fill(account.email);
  await page.getByLabel('Passwort', { exact: true }).fill(account.password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Anmelden/ }).click();
  await expect(page).toHaveURL(/\/profil\/einrichten/);
  const denied = await page.request.post('/abmelden', {
    headers: { Origin: 'https://foreign.example' },
    maxRedirects: 0,
  });
  expect(denied.status()).toBe(403);
  const response = await page.request.post('/admin/logout', {
    headers: { Origin: new URL(baseURL!).origin },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect((await account.client.auth.getUser()).data.user?.id).toBe(account.id);
  await page.goto('/profil');
  await expect(page).toHaveURL(/\/anmelden/);
});
