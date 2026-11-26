import { expect, test, type APIRequestContext } from '@playwright/test';

type MailpitMessage = { ID: string; To?: unknown };

async function mailLinkFor(
  request: APIRequestContext,
  email: string,
  linkFragment: string,
) {
  let mailLink = '';
  await expect
    .poll(async () => {
      const response = await request.get(
        'http://127.0.0.1:55324/api/v1/messages',
      );
      if (!response.ok()) return '';
      const body = (await response.json()) as { messages?: MailpitMessage[] };
      const messages =
        body.messages?.filter((message) =>
          JSON.stringify(message.To).includes(email),
        ) ?? [];
      for (const message of messages) {
        const detailResponse = await request.get(
          `http://127.0.0.1:55324/api/v1/message/${message.ID}`,
        );
        const detail = (await detailResponse.json()) as {
          HTML?: string;
          Text?: string;
        };
        const content = `${detail.HTML ?? ''}\n${detail.Text ?? ''}`.replaceAll(
          '&amp;',
          '&',
        );
        const links = content.match(/https?:\/\/[^"'<>\s]+/g) ?? [];
        mailLink = links.find((link) => link.includes(linkFragment)) ?? '';
        if (mailLink) return mailLink;
      }
      return '';
    })
    .not.toBe('');
  return mailLink;
}

test('Leserkonto: Registrierung, Sitzung, Kommentare, Antworten und Stimmen', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(90_000);
  // Base-36 timestamps can contain blocked words (e.g. Turkish "am").
  // Keep IDs numeric so comment and reply fixtures stay unmoderated.
  const suffix = Date.now().toString();
  const username = `fan_${suffix}`;
  const email = `${username}@example.org`;
  let password = 'LeserTest123!sicher';
  await page.goto('/');
  const articlePath = await page
    .locator('.article-card-link')
    .first()
    .getAttribute('href');
  expect(articlePath).toBeTruthy();
  await page.goto(`/registrieren?weiter=${encodeURIComponent(articlePath!)}`);
  await expect(
    page.getByRole('heading', { name: 'Leserkonto erstellen' }),
  ).toBeVisible();
  expect(
    (await context.cookies()).filter((c) => c.name.startsWith('sb-')),
  ).toHaveLength(0);
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Passwort anzeigen' }).click();
  await expect(page.getByLabel('Passwort', { exact: true })).toHaveAttribute(
    'type',
    'text',
  );
  await page.getByRole('button', { name: 'Passwort ausblenden' }).click();
  await page.getByLabel('Passwort wiederholen', { exact: true }).fill(password);
  await page.getByRole('checkbox', { name: /Datenschutzhinweise/ }).check();
  await page.getByRole('checkbox', { name: /Ich akzeptiere die AGB/ }).check();
  await page.getByRole('button', { name: /^Registrieren/ }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation.getByRole('status')).toContainText(
    'haben wir eine E-Mail an',
  );
  await expect(confirmation.getByRole('heading', { level: 1 })).toContainText(
    'Prüfe dein Postfach',
  );
  await expect(confirmation).toContainText(
    'Wenn deine Adresse für die Registrierung verfügbar ist',
  );
  await expect(confirmation).toContainText(email);
  await expect(confirmation).toContainText('oder fordere die E-Mail erneut');
  const resendButton = confirmation.getByRole('button', {
    name: /Neue E-Mail in \d+:\d\d/,
  });
  await expect(resendButton).toBeDisabled();
  await expect(confirmation).not.toContainText(
    'Du kannst einmal pro Minute eine neue E-Mail anfordern.',
  );
  await expect(confirmation.getByRole('listitem')).toHaveCount(2);
  await expect(
    confirmation.getByRole('link', { name: 'Zur Anmeldung' }),
  ).toHaveAttribute(
    'href',
    `/anmelden?weiter=${encodeURIComponent(articlePath!)}`,
  );
  await expect(
    page.locator('.notification-stack').getByRole('status'),
  ).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      const bounds = await confirmation.boundingBox();
      expect(bounds!.width).toBeLessThanOrEqual(600);
      expect(bounds!.x).toBeGreaterThanOrEqual(15);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
        viewport.width - 15,
      );
      await confirmation
        .getByRole('link', { name: 'Zur Anmeldung' })
        .scrollIntoViewIfNeeded();
      await expect(
        confirmation.getByRole('link', { name: 'Zur Anmeldung' }),
      ).toBeInViewport();
      expect(
        await page
          .locator('.reader-auth-stage')
          .evaluate((element) => element.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({
        path: `test-results/registration-confirmation-${theme}-${viewport.width}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(
    (await context.cookies()).filter(
      (c) => c.name.includes('auth-token') && !c.name.includes('code-verifier'),
    ),
  ).toHaveLength(0);

  await page.goto(`/anmelden?weiter=${encodeURIComponent(articlePath!)}`);
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Passwort anzeigen' }).click();
  await expect(page.getByLabel('Passwort', { exact: true })).toHaveAttribute(
    'type',
    'text',
  );
  await page.getByRole('button', { name: 'Passwort ausblenden' }).click();
  await expect(page.getByLabel('Passwort', { exact: true })).toHaveAttribute(
    'type',
    'password',
  );
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Anmelden/ }).click();
  await expect(page.getByRole('alert')).toContainText('Bestätigung');

  // Nahtlos: Die Bestätigung meldet an und führt direkt in die Einrichtung.
  await page.goto(await mailLinkFor(request, email, '/auth/bestaetigen'));
  await page.getByRole('button', { name: 'E-Mail bestätigen' }).click();
  await expect(page).toHaveURL(/\/profil\/einrichten\?weiter=/);
  // Gate: Bis das Profil steht, führt jede Navigation in die Einrichtung.
  await page.goto(articlePath!);
  await expect(page).toHaveURL(/\/profil\/einrichten\?weiter=/);
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Bitte gib einen Username',
  );
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Privater Lesername');
  await page.getByLabel('Geburtsdatum').fill('1993-05-17');
  await page.getByLabel('Geschlecht', { exact: true }).selectOption('W');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'E-Mail-Adresse bestätigt',
  );
  await page
    .getByRole('button', { name: 'Profil abschließen', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'Bitte klicken Sie das Kästchen an, um fortzufahren.',
  );
  await page.getByRole('checkbox').check();
  await page
    .getByRole('button', { name: 'Profil abschließen', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${articlePath}$`));
  const cookies = (await context.cookies()).filter(
    (c) => c.name.includes('auth-token') && !c.name.includes('code-verifier'),
  );
  expect(cookies.length).toBeGreaterThan(0);
  expect(
    cookies.every(
      (c) => c.httpOnly && c.sameSite === 'Lax' && c.expires === -1,
    ),
  ).toBe(true);
  const comments = page.getByRole('region', { name: /Kommentare/ });
  const text = `Mein Kommentar ${suffix} <script>alert(1)</script>`;
  await comments.getByLabel('Kommentar schreiben', { exact: true }).fill(text);
  await comments
    .getByRole('button', { name: 'Kommentar veröffentlichen' })
    .click();
  let comment = page.locator('.reader-comment').filter({ hasText: text });
  await expect(comment).toBeVisible();
  const commentUrl = page.url();
  await expect(comment).toContainText(username);
  await expect(comment).not.toContainText('Privater Lesername');
  await expect(comment).not.toContainText(email);
  await comment
    .getByRole('button', {
      name: `Kommentar von ${username} liken`,
      exact: true,
    })
    .click();
  comment = page.locator('.reader-comment').filter({ hasText: text });
  await expect(
    comment.getByRole('button', {
      name: `Kommentar von ${username} liken`,
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(comment).toContainText('Gefällt mir · 1');
  await expect(
    comment.getByRole('button', {
      name: `Kommentar von ${username} disliken`,
      exact: true,
    }),
  ).toHaveCount(0);
  // Erneutes Liken hebt die Stimme wieder auf, damit der Gast später
  // „Gefällt mir · 0“ sieht.
  await comment
    .getByRole('button', {
      name: `Kommentar von ${username} liken`,
      exact: true,
    })
    .click();
  comment = page.locator('.reader-comment').filter({ hasText: text });
  await expect(
    comment.getByRole('button', {
      name: `Kommentar von ${username} liken`,
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(comment).toContainText('Gefällt mir · 0');
  await comment.locator('summary').click();
  await comment.getByLabel('Antwort schreiben').fill(`Meine Antwort ${suffix}`);
  await comment
    .getByRole('button', { name: 'Antwort veröffentlichen' })
    .click();
  const replyComment = page
    .locator('.reader-comment')
    .filter({ hasText: `Meine Antwort ${suffix}` });
  // Deep-Link nach dem Absenden klappt den Thread automatisch auf.
  await expect(replyComment).toBeVisible();
  await expect(replyComment).toHaveClass(/reader-comment--reply/);
  await expect(replyComment).not.toContainText('Antwort auf');
  // Ohne Deep-Link sind Antworten eingeklappt und werden erst per Button sichtbar.
  await page.goto(`${articlePath!}#kommentare`);
  await expect(comment).toBeVisible();
  await expect(replyComment).toBeHidden();
  await comment.getByRole('button', { name: 'Antworten (1)' }).click();
  await expect(replyComment).toBeVisible();
  await page.reload();
  await page.locator('.sidebar-account .account-menu__trigger').click();
  await expect(
    page.getByRole('button', { name: 'Abmelden', exact: true }),
  ).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/\?redaktion=gesperrt/);
  await expect(page.getByRole('dialog', { name: /Mein Profil/ })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'nicht für die Redaktion freigeschaltet',
  );
  await expect(
    page.getByRole('link', { name: 'Redaktion öffnen' }),
  ).toHaveCount(0);
  // Profildaten im Modal bearbeiten: Ohne eingerichtetes Profil gäbe es den
  // Einrichtungs-Hinweis; mit Profil stehen die Angaben zum Bearbeiten.
  const profileModal = page.getByRole('dialog', { name: /Mein Profil/ });
  await expect(
    profileModal.getByRole('link', { name: 'Profil einrichten' }),
  ).toHaveCount(0);
  const editForm = profileModal.locator('[data-profile-edit-form]');
  await expect(editForm.getByLabel('Username', { exact: true })).toHaveValue(
    username,
  );
  await editForm.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(profileModal.locator('[data-notification-stack]')).toContainText(
    'Deine Änderungen sind gespeichert.',
  );
  await page
    .getByRole('dialog', { name: /Mein Profil/ })
    .getByRole('button', { name: 'Profil schließen' })
    .click();
  // Beim Schließen streicht das Modal den redaktion-Parameter aus der URL;
  // erst danach neu laden, sonst öffnet sich das Modal nach dem Reload erneut.
  await expect(page).toHaveURL((url) => !url.searchParams.has('redaktion'));
  // Nach dem Neuladen hält das Fragment die gespeicherten Angaben.
  await page.reload();
  await page.locator('.sidebar-account .account-menu__trigger').click();
  await page.getByRole('button', { name: 'Mein Profil' }).click();
  await expect(
    page
      .getByRole('dialog', { name: /Mein Profil/ })
      .locator('[data-profile-edit-form]')
      .getByLabel('Username', { exact: true }),
  ).toHaveValue(username);
  await page
    .getByRole('dialog', { name: /Mein Profil/ })
    .getByRole('button', { name: 'Profil schließen' })
    .click();
  await page.goto(articlePath!);
  await page.locator('.sidebar-account .account-menu__trigger').click();
  await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
  expect(
    (await context.cookies()).filter(
      (c) => c.name.includes('auth-token') && !c.name.includes('code-verifier'),
    ),
  ).toHaveLength(0);
  await page.goto(`/anmelden?weiter=${encodeURIComponent(articlePath!)}`);
  await page.getByRole('link', { name: 'Passwort vergessen?' }).click();
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Link anfordern' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Falls ein Konto zu dieser E-Mail-Adresse existiert',
  );
  await page.goto(
    await mailLinkFor(request, email, '/auth/passwort-zuruecksetzen'),
  );
  await expect(page).toHaveURL(/\/passwort-neu$/);
  password = 'GanzNeu123!Passwort';
  await page.getByLabel('Neues Passwort', { exact: true }).fill(password);
  await page
    .getByLabel('Neues Passwort wiederholen', { exact: true })
    .fill(password);
  await page.getByRole('button', { name: 'Passwort speichern' }).click();
  await expect(page).toHaveURL(/\/anmelden\?passwort=geaendert$/);
  await expect(page.getByRole('status')).toContainText(
    'Dein Passwort wurde geändert',
  );
  await page.goto(commentUrl);
  const guestComment = page
    .locator('.reader-comment')
    .filter({ hasText: text });
  await page.clock.install();
  await guestComment
    .getByRole('button', {
      name: `Kommentar von ${username} liken`,
      exact: true,
    })
    .click();
  const notice = page.getByRole('complementary', {
    name: 'Anmeldung erforderlich',
  });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('status')).toHaveText(
    'Melde dich an oder erstelle ein Konto, um Kommentare zu schreiben und zu bewerten.',
  );
  await expect(guestComment).toContainText('Gefällt mir · 0');
  await notice.getByRole('button', { name: 'Hinweis schließen' }).click();
  await expect(notice).toBeHidden();
  // Desktop-Viewport (1280px): das Wiederholungsfenster betraegt 4s.
  await page.clock.fastForward(4000);
  await guestComment
    .getByRole('link', { name: 'Auf Kommentar antworten' })
    .click();
  await expect(notice).toBeVisible();
  await page.screenshot({ path: 'test-results/auth-notice.png' });
  await notice.getByRole('link', { name: 'Melde dich an' }).click();
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Anmelden/ }).click();
  await expect(page).toHaveURL(new RegExp(`${articlePath}(#kommentare)?$`));
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    await page.screenshot({
      path: `test-results/readers-${theme}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: 'test-results/readers-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  // Passwortwechsel im Profil-Modal: erst Prüfung, dann freie Felder.
  await page.locator('.sidebar-account .account-menu__trigger').click();
  await page.getByRole('button', { name: 'Mein Profil' }).click();
  const profileDialog = page.getByRole('dialog', { name: /Mein Profil/ });
  await profileDialog
    .getByRole('button', { name: 'Passwort', exact: true })
    .click();
  const passwordSection = profileDialog.locator(
    '[data-profile-section="passwort"]',
  );
  const newPasswordField = passwordSection.getByLabel('Neues Passwort', {
    exact: true,
  });
  await expect(newPasswordField).toBeDisabled();
  await expect(
    passwordSection.getByText('Bestätige dein aktuelles Passwort'),
  ).toHaveCount(0);
  await passwordSection
    .getByLabel('Aktuelles Passwort', { exact: true })
    .fill('Falsch123!Passwort');
  await passwordSection
    .getByRole('button', { name: 'Passwort prüfen' })
    .click();
  await expect(
    profileDialog.locator('[data-notification-stack]'),
  ).toContainText('Das aktuelle Passwort ist nicht korrekt');
  await expect(newPasswordField).toBeDisabled();
  await passwordSection
    .getByLabel('Aktuelles Passwort', { exact: true })
    .fill(password);
  const verifyButton = passwordSection.getByRole('button', {
    name: 'Passwort prüfen',
  });
  await verifyButton.click();
  await expect(newPasswordField).toBeEnabled();
  // Der Fokus springt nach der Freigabe nicht in die neuen Felder.
  await expect(newPasswordField).not.toBeFocused();
  await expect(
    passwordSection.getByLabel('Neues Passwort wiederholen', { exact: true }),
  ).not.toBeFocused();
  await expect(passwordSection.getByText('gesperrt')).toHaveCount(0);
  // Das geprüfte Passwort ist readonly und wirkt optisch fertig.
  await expect(
    passwordSection.getByLabel('Aktuelles Passwort', { exact: true }),
  ).toHaveAttribute('readonly');
  // Das Anzeigen-Symbol wirkt auch im nachgeladenen Profil-Fragment.
  await passwordSection
    .getByRole('button', { name: 'Neues Passwort anzeigen', exact: true })
    .click();
  await expect(
    passwordSection.getByRole('button', {
      name: 'Neues Passwort ausblenden',
      exact: true,
    }),
  ).toBeVisible();
  password = 'ProfilWechsel123!Sicher';
  await passwordSection
    .getByLabel('Neues Passwort', { exact: true })
    .fill(password);
  await passwordSection
    .getByLabel('Neues Passwort wiederholen', { exact: true })
    .fill(password);
  await passwordSection
    .getByRole('button', { name: 'Passwort speichern' })
    .click();
  await expect(page).toHaveURL(/\/anmelden\?passwort=geaendert$/);
  await expect(page.getByRole('status')).toContainText(
    'Dein Passwort wurde geändert',
  );
  // Das neue Passwort meldet das Konto wieder an.
  await page.goto('/anmelden');
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Anmelden/ }).click();
  expect(
    (await context.cookies()).filter(
      (c) => c.name.includes('auth-token') && !c.name.includes('code-verifier'),
    ),
  ).not.toHaveLength(0);
});

test('Anmeldung verlangt Datenschutzhinweis und blockiert fremde Origins', async ({
  request,
}) => {
  const rejected = await request.post('/anmelden', {
    headers: { Origin: 'https://fremd.example' },
    form: { email: 'x@example.org', password: 'test' },
  });
  expect(rejected.status()).toBe(403);
  const noConsent = await request.post('/anmelden', {
    headers: { Origin: new URL((await request.get('/anmelden')).url()).origin },
    form: { email: 'x@example.org', password: 'test' },
  });
  expect(await noConsent.text()).toContain('Bitte bestätige');
  expect(noConsent.headers()['set-cookie']).toBeUndefined();
});
