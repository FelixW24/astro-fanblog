import { expect, test } from '@playwright/test';

test.describe('Reader account UI', () => {
  const openModal = async (page: import('@playwright/test').Page) => {
    await page.getByRole('button', { name: 'Mein Profil öffnen' }).click();
    await expect(
      page.getByRole('dialog', { name: /Mein Profil/ }),
    ).toBeVisible();
  };

  const navItem = (page: import('@playwright/test').Page, label: string) =>
    page
      .locator('.profile-dialog__nav')
      .getByRole('button', { name: label, exact: true });

  test.skip(
    process.env.READER_UI_FIXTURE !== '1',
    'Run with e2e/reader-profile.config.ts for the isolated component fixture.',
  );

  test('Eigene Kommentare: Liste, Leerzustand und Ladefehler', async ({
    page,
  }) => {
    await page.goto('/reader-ui-fixture?view=profile&comments&more');
    await openModal(page);
    await navItem(page, 'Meine Kommentare').click();
    const section = page.getByRole('region', { name: 'Meine Kommentare' });
    await expect(
      section.getByRole('link', { name: /Ein spannendes Derby/ }),
    ).toHaveAttribute('href', '/beitraege/derby?kommentar=55#kommentar-55');
    await expect(
      section.getByRole('link', { name: 'Ältere Kommentare' }),
    ).toHaveAttribute('href', '/profil?ansicht=modal&kommentarseite=2');
    await page.goto('/reader-ui-fixture?view=profile');
    await openModal(page);
    await navItem(page, 'Meine Kommentare').click();
    await expect(section).toContainText('Noch keine Kommentare.');
    await page.goto('/reader-ui-fixture?view=profile&comment-error');
    await openModal(page);
    await navItem(page, 'Meine Kommentare').click();
    await expect(section.getByRole('alert')).toContainText('nicht geladen');
  });

  for (const width of [1440, 390]) {
    test(`Kommentarlink öffnet die Diskussion (${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route('**/beitraege/derby?kommentar=55', async (route) => {
        const response = await route.fetch({
          url: 'http://127.0.0.1:4341/reader-ui-fixture?view=comments&kommentar=55',
        });
        await route.fulfill({ response });
      });
      await page.goto('/reader-ui-fixture?view=profile&comments');
      await openModal(page);
      await navItem(page, 'Meine Kommentare').click();
      await page.screenshot({
        path: `test-results/reader-profile/own-comments-${width}.png`,
        fullPage: true,
      });
      await page.getByRole('link', { name: /Ein spannendes Derby/ }).click();
      const target = page.locator('#kommentar-55');
      await expect(target).toBeVisible();
      await expect(target).toBeFocused();
      await expect(page.locator('#kommentar-1')).toHaveCount(0);
      await expect(page.locator('[data-comment-item]')).toHaveCount(5);
      await expect
        .poll(() => target.evaluate((el) => el.getBoundingClientRect().top))
        .toBeGreaterThanOrEqual(0);
      await expect
        .poll(() => target.evaluate((el) => el.getBoundingClientRect().top))
        .toBeLessThan(900);
    });
  }

  for (const [width, direction] of [
    [1440, 'column'],
    [390, 'row'],
  ] as const) {
    test(`Modal-Navigation: Sektionen wechseln (${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/reader-ui-fixture?view=profile');
      await openModal(page);
      const nav = page.locator('.profile-dialog__nav');
      await expect(nav).toHaveCSS('flex-direction', direction);
      await expect(
        page.locator('[data-profile-section="persoenliche-informationen"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-profile-section="passwort"]'),
      ).toBeHidden();
      await navItem(page, 'Passwort').click();
      await expect(
        page.locator('[data-profile-section="passwort"]'),
      ).toBeVisible();
      // Intro-Text, Sperr-Hinweis und „gesperrt“-Pille sind entfernt.
      await expect(
        page
          .locator('[data-profile-section="passwort"]')
          .getByText('Bestätige dein aktuelles Passwort'),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-profile-section="passwort"]').getByText('gesperrt'),
      ).toHaveCount(0);
      await expect(page.locator('#profile-dialog-title')).toContainText(
        'Passwort',
      );
      await expect(
        page.locator('[data-profile-section="passwort"]'),
      ).toBeFocused();
      await expect(navItem(page, 'Passwort')).toHaveAttribute(
        'aria-current',
        'true',
      );
      await expect(
        page.locator('[data-profile-section="persoenliche-informationen"]'),
      ).toBeHidden();
      // Benachrichtigungen sind ein einzelner Eintrag mit einer Sektion.
      await expect(
        nav.getByRole('button', { name: /Benachrichtigungen/ }),
      ).toHaveCount(1);
      await navItem(page, 'Benachrichtigungen').click();
      await expect(
        page.locator('[data-profile-section="benachrichtigungen"]'),
      ).toBeVisible();
      await expect(page.locator('#profile-dialog-title')).toContainText(
        'Benachrichtigungen',
      );
      await expect(
        page.locator('[data-profile-section="benachrichtigungen"]'),
      ).toBeFocused();
      // Benachrichtigungen: pro Kategorie ein Schalter, kein Speichern-Button.
      const notificationSection = page.locator(
        '[data-profile-section="benachrichtigungen"]',
      );
      await expect(
        notificationSection.locator('input[name="pref_news"]'),
      ).toBeVisible();
      await expect(
        notificationSection.locator('input[name="pref_transfer"]'),
      ).toBeVisible();
      await expect(
        notificationSection.locator('input[name="pref_news"]'),
      ).not.toBeChecked();
      await expect(
        notificationSection.getByRole('button', {
          name: 'Benachrichtigungen speichern',
        }),
      ).toHaveCount(0);
      if (width === 390) {
        const surfaceBox = await page
          .locator('.profile-dialog__surface')
          .boundingBox();
        expect(surfaceBox!.width).toBe(390);
        expect(surfaceBox!.height).toBe(900);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(390);
      }
    });
  }

  test('Profil-Modal steht auf dem Desktop mittig und die Navigation ist ausgerichtet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/reader-ui-fixture?view=profile');
    await openModal(page);
    const box = await page.locator('[data-profile-dialog]').boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(
      Math.abs(box!.x - (viewport!.width - box!.width) / 2),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(box!.y - (viewport!.height - box!.height) / 2),
    ).toBeLessThanOrEqual(1);
    const edges = await page.evaluate(() => {
      const label = document.querySelector('.profile-dialog__group-label');
      const item = document.querySelector('.profile-dialog__nav-item');
      if (!label || !item) return null;
      return {
        label: Math.round(label.getBoundingClientRect().x),
        item: Math.round(item.getBoundingClientRect().x),
      };
    });
    expect(edges?.label).toBe(edges?.item);
  });

  test('offenes Profil-Modal sperrt das Scrollen der Seite im Hintergrund', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/reader-ui-fixture?view=profile');
    await openModal(page);
    // Seite hinter dem Modal künstlich scrollbar machen; overflow: hidden
    // sperrt nur das Nutzer-Scrollen, programmatisches Scrollen bleibt für
    // den Aufbau des Tests erhalten.
    await page.evaluate(() => {
      document.body.style.minHeight = '300vh';
    });
    await page.evaluate(() => window.scrollTo(0, 400));
    expect(await page.evaluate(() => window.scrollY)).toBe(400);
    await page.mouse.move(8, 8);
    await page.mouse.wheel(0, 300);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
    // Nach dem Schließen ist die Seite wieder scrollbar.
    await page.getByRole('button', { name: 'Profil schließen' }).click();
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(400);
  });

  test('Farbmodus im Modal: Hell, Dunkel und System', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.addInitScript(() =>
      localStorage.removeItem('fanblog:theme'),
    );
    const modal = page.getByRole('dialog', { name: /Mein Profil/ });
    await page.goto('/reader-ui-fixture?view=profile');
    await openModal(page);
    await navItem(page, 'Darstellung').click();
    const picker = page.locator('[data-theme-picker]');
    await expect(picker.getByRole('radio', { name: 'Dunkel' })).toBeChecked();
    await picker.getByRole('radio', { name: 'Hell' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(
      await page.evaluate(() => localStorage.getItem('fanblog:theme')),
    ).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await picker.getByRole('radio', { name: 'System' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(
      await page.evaluate(() => localStorage.getItem('fanblog:theme')),
    ).toBe('system');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await openModal(page);
    await navItem(page, 'Darstellung').click();
    await page.emulateMedia({ colorScheme: 'light' });
    await picker.getByRole('radio', { name: 'System' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 390, height: 844 });
    await modal.getByRole('button', { name: 'Profil schließen' }).click();
    await expect(modal).toBeHidden();
    await page
      .getByRole('button', { name: 'Menü öffnen', exact: true })
      .click();
    // Der Farbmodus liegt in den Einstellungen; im Drawer gibt es keinen
    // eigenen Schalter mehr.
    const drawer = page.getByRole('dialog', { name: 'Seitennavigation' });
    await expect(drawer.locator('[data-theme-toggle]')).toHaveCount(0);
    await page.locator('[data-mobile-menu-close]').click();
    await expect(
      page.getByRole('button', { name: 'Menü öffnen', exact: true }),
    ).toBeVisible();
    await openModal(page);
    await navItem(page, 'Darstellung').click();
    await expect(picker.getByRole('radio', { name: 'System' })).toBeChecked();
    await picker.getByRole('radio', { name: 'Hell' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await modal.getByRole('button', { name: 'Profil schließen' }).click();
    await openModal(page);
    await navItem(page, 'Darstellung').click();
    await expect(picker.getByRole('radio', { name: 'Hell' })).toBeChecked();
  });

  test('Datensparmodus im Modal: speichern, auf allen Viewports aktiv, Bilder tauschen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    const scrollBehavior = () =>
      page.evaluate(
        () => getComputedStyle(document.documentElement).scrollBehavior,
      );
    await page.goto('/reader-ui-fixture?view=profile');
    await openModal(page);
    await navItem(page, 'Darstellung').click();
    // Darstellung als Zweispalten-Grid: Farbmodus und Datensparmodus in
    // eigenen Containern.
    const grid = page.locator('.profile-display-grid');
    await expect(grid.locator('.profile-display-card')).toHaveCount(2);
    await expect(grid.locator('.profile-display-card').nth(0)).toContainText(
      'Farbmodus',
    );
    await expect(grid.locator('.profile-display-card').nth(1)).toContainText(
      'Datensparmodus',
    );
    let toggle = page.getByRole('checkbox', {
      name: 'Datensparmodus aktivieren',
    });
    await expect(toggle).not.toBeChecked();
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-data-saver',
      'on',
    );

    await toggle.check();
    await expect(page.locator('html')).toHaveAttribute('data-data-saver', 'on');
    expect(
      await page.evaluate(() =>
        localStorage.getItem('fanblog:data-saver'),
      ),
    ).toBe('on');

    // Der Schalter im Container wechselt sichtbar in den aktiven Zustand.
    const switchEl = page.locator('.profile-data-saver__switch');
    await expect(switchEl).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            getComputedStyle(
              document.querySelector('.profile-data-saver__switch')!,
            ).backgroundColor,
        ),
      )
      .toBe('rgb(227, 6, 19)');

    // Der Modus greift auf allen Viewports: auch am PC (1440px) wird
    // weiches Scrollen deaktiviert.
    await expect.poll(scrollBehavior).toBe('auto');
    await expect(page.locator('[data-data-saver-status]')).toContainText(
      'Aktiv:',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(scrollBehavior).toBe('auto');

    // Dekorative Bilder werden gegen einen Inline-SVG-Platzhalter getauscht.
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.setAttribute('data-decorative', '');
      img.src = '/images/article-default-480.webp';
      document.body.appendChild(img);
    });
    await expect(page.locator('img[data-decorative]')).toHaveAttribute(
      'src',
      /^data:image\/svg\+xml/,
    );

    // Nach dem Reload ist die Einstellung gespeichert und der Schalter gesetzt.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-data-saver', 'on');
    await openModal(page);
    await navItem(page, 'Darstellung').click();
    toggle = page.getByRole('checkbox', { name: 'Datensparmodus aktivieren' });
    await expect(toggle).toBeChecked();

    await toggle.uncheck();
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-data-saver',
      'on',
    );
    await expect(page.locator('[data-data-saver-status]')).toContainText(
      'werden geladen',
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            getComputedStyle(
              document.querySelector('.profile-data-saver__switch')!,
            ).backgroundColor,
        ),
      )
      .not.toBe('rgb(227, 6, 19)');
    expect(
      await page.evaluate(() =>
        localStorage.getItem('fanblog:data-saver'),
      ),
    ).toBe('off');
  });

  test('Geschlecht ist Pflicht und ersetzt die freie Icon-Auswahl', async ({
    page,
  }) => {
    for (const [gender, avatar] of [
      ['M', 'male'],
      ['W', 'female'],
      ['D', 'diverse'],
    ]) {
      await page.goto('/reader-ui-fixture?view=onboarding');
      await page.getByLabel('Username', { exact: true }).fill('justfelix');
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
      await page.getByLabel('Name', { exact: true }).fill('Max Mustermann');
      await page.getByLabel('Geburtsdatum').fill('2004-04-02');
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(
        'Bitte wähle M, W oder D',
      );
      await expect(
        page.getByLabel('Geschlecht', { exact: true }),
      ).toBeFocused();
      await page.getByLabel('Geschlecht', { exact: true }).selectOption(gender);
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
      await expect(page.locator('[data-onboarding-step="3"]')).toBeVisible();
      await expect(page.locator('[name="avatar"]')).toHaveCount(0);
      await expect(page.getByText('Wähle dein Standard-Icon.')).toHaveCount(0);
      await page.goto(`/reader-ui-fixture?view=profile&avatar=${avatar}`);
      await openModal(page);
      await expect(
        page.locator(`.profile-identity [data-avatar-variant="${avatar}"]`),
      ).toBeVisible();
    }
  });

  test('neue Validierungsfehler bleiben trotz Toast-Spamschutz sichtbar', async ({
    page,
  }) => {
    const now = new Date('2026-10-16T12:00:00Z');
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/reader-ui-fixture?view=onboarding');
    const next = page.getByRole('button', { name: 'Weiter', exact: true });
    const alert = page.getByRole('alert');
    await next.click();
    await expect(alert).toContainText('Bitte gib einen Username');
    await page.getByLabel('Username', { exact: true }).fill('justfelix');
    await expect(alert).toBeHidden();
    await next.click();
    await next.click();
    await expect(alert).toContainText('Bitte gib deinen Namen ein.');
    await page.getByLabel('Name', { exact: true }).fill('Max Mustermann');
    await page.getByLabel('Geburtsdatum').fill('2004-04-02');
    await page.getByLabel('Geschlecht', { exact: true }).selectOption('W');
    await next.click();
    const finish = page.getByRole('button', {
      name: 'Profil abschließen',
      exact: true,
    });
    await finish.click();
    await expect(alert).toContainText('Bitte klicken Sie das Kästchen');
    await page.clock.fastForward(2500);
    await finish.click();
    // Desktop-Frist: Der Toast verschwindet nach 4s trotz erneutem Klick.
    await page.clock.fastForward(1500);
    await expect(alert).toBeHidden();
  });

  test('Geburtsdatum unter 13: Toast mit AGB-Hinweis, kein Abschluss', async ({
    page,
  }) => {
    const now = new Date('2026-10-16T12:00:00Z');
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/reader-ui-fixture?view=onboarding');
    const next = page.getByRole('button', { name: 'Weiter', exact: true });
    const alert = page.getByRole('alert');
    await page.getByLabel('Username', { exact: true }).fill('justfelix');
    await next.click();
    await page.getByLabel('Name', { exact: true }).fill('Max Mustermann');
    // Stichtag 2026-10-16: unter 13 ist, wer nach dem 2013-10-16 geboren wurde.
    await page.getByLabel('Geburtsdatum').fill('2015-05-01');
    await page.getByLabel('Geschlecht', { exact: true }).selectOption('W');
    // „Weiter“ aus Schritt 2 wird blockiert, der Toast erläutert das Alter.
    await next.click();
    await expect(alert).toContainText('erst ab 13 Jahren');
    await expect(page.getByLabel('Geburtsdatum')).toBeVisible();
    // Auch ein direkter Submit wird abgefangen.
    await page.clock.fastForward(4000);
    await page
      .locator('[data-onboarding-form]')
      .evaluate((form) => (form as HTMLFormElement).requestSubmit());
    await expect(alert).toContainText('erst ab 13 Jahren');
    await expect(page.getByLabel('Geburtsdatum')).toBeVisible();
    // Am Stichtag selbst (genau 13) geht es weiter.
    await page.getByLabel('Geburtsdatum').fill('2013-10-16');
    await next.click();
    await expect(
      page.getByRole('button', { name: 'Profil abschließen', exact: true }),
    ).toBeVisible();
  });

  test('Profildaten: kein Einrichtungs-Hinweis, Angaben in der Profil-Karte', async ({
    page,
  }) => {
    await page.goto('/reader-ui-fixture?view=profile');
    await openModal(page);
    const dialog = page.getByRole('dialog', { name: /Mein Profil/ });
    // Wer sein Profil bereits eingerichtet hat, sieht keinen Einrichtungs-
    // Hinweis mehr, sondern die Bearbeitung seiner Angaben.
    await expect(
      dialog.getByRole('link', { name: 'Profil einrichten' }),
    ).toHaveCount(0);
    const form = page.locator('[data-profile-edit-form]');
    await expect(form).toBeVisible();
    await expect(form.getByLabel('Username', { exact: true })).toHaveValue(
      'justfelix',
    );
    await expect(form.getByLabel('Name', { exact: true })).toHaveValue(
      'Max Mustermann',
    );
    await expect(form.getByLabel('Geburtsdatum')).toHaveValue('2004-04-02');
    await page.route('**/api/profil/angaben', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, username: 'justfelix2' }),
      }),
    );
    await form.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(
      page.locator('dialog[open] [data-notification-stack]'),
    ).toContainText('Deine Änderungen sind gespeichert.');
    await expect(page.locator('.profile-identity__name')).toHaveText(
      'justfelix2',
    );
    await navItem(page, 'Passwort').click();
    await expect(
      page.locator('[data-profile-section="passwort"]'),
    ).toBeVisible();
    await navItem(page, 'Persönliche Informationen').click();
    await expect(form).toBeVisible();
    // Fehler der API erscheinen als Toast.
    await page.route('**/api/profil/angaben', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Dieser Username ist bereits vergeben.',
        }),
      }),
    );
    await form.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(
      page.locator('dialog[open] [data-notification-stack]'),
    ).toContainText('bereits vergeben');
  });

  test('Profilkarte: Hover und Klick auf Kommentar-Avatare', async ({
    page,
  }) => {
    await page.route('**/api/leser/profilkarte*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          username: 'justfelix',
          avatar_url: null,
          member_since: '2026-03-12T10:00:00Z',
          comment_count: 42,
        }),
      }),
    );
    await page.goto('/reader-ui-fixture?view=comments');
    const avatar = page.locator('.reader-comment__avatar').first();
    await avatar.hover();
    const card = page.locator('.reader-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('justfelix');
    await expect(card).toContainText('Mitglied seit 12. März 2026');
    await expect(card).toContainText('42 Kommentare');
    // Die Karte sitzt bündig unter dem Profilbild und überlappt den Kommentar.
    const avatarBox = await avatar.boundingBox();
    const cardBox = await card.boundingBox();
    expect(cardBox?.y).toBeCloseTo(
      (avatarBox?.y ?? 0) + (avatarBox?.height ?? 0) + 6,
      0,
    );
    expect(cardBox?.x).toBeCloseTo(avatarBox?.x ?? 0, 0);
    await expect(avatar).toHaveAttribute('aria-expanded', 'true');
    // Klick schließt die Karte (Touch), ein erneuter Klick öffnet sie wieder.
    await avatar.click();
    await expect(card).toHaveCount(0);
    await avatar.click();
    await expect(card).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 390]) {
      test(`Einrichtung und Profil: ${theme}, ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 960 });
        await page.addInitScript(
          (value) => localStorage.setItem('fanblog:theme', value),
          theme,
        );
        await page.goto('/reader-ui-fixture?view=onboarding');
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await expect(
          page.getByRole('heading', { name: 'Dein Profil einrichten' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Weiter', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText(
          'Bitte gib einen Username',
        );
        await expect(
          page.getByLabel('Username', { exact: true }),
        ).toBeFocused();
        await page.getByLabel('Username', { exact: true }).fill('justfelix');
        await page.screenshot({
          path: `test-results/reader-profile/username-${theme}-${width}.png`,
          fullPage: true,
        });
        await page.getByRole('button', { name: 'Weiter', exact: true }).click();
        await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
        await expect(page.locator('[aria-current="step"]')).toContainText(
          'Über dich',
        );
        await expect(
          page.getByText(
            'Name und Geburtsdatum sind nicht öffentlich sichtbar.',
          ),
        ).toBeVisible();
        await page.getByLabel('Name', { exact: true }).fill('Max Mustermann');
        await page.getByLabel('Geburtsdatum').fill('2004-04-02');
        await page.getByLabel('Geschlecht', { exact: true }).selectOption('W');
        await page.screenshot({
          path: `test-results/reader-profile/about-${theme}-${width}.png`,
          fullPage: true,
        });
        await page.getByRole('button', { name: 'Zurück', exact: true }).click();
        await expect(page.getByLabel('Username', { exact: true })).toHaveValue(
          'justfelix',
        );
        await page.getByRole('button', { name: 'Weiter', exact: true }).click();
        await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
          'Max Mustermann',
        );
        await page.getByRole('button', { name: 'Weiter', exact: true }).click();
        await expect(page.locator('input[name="avatar"]')).toHaveCount(0);
        await page
          .getByRole('button', { name: 'Profil abschließen', exact: true })
          .click();
        await expect(page.getByRole('alert')).toContainText(
          'Bitte klicken Sie das Kästchen',
        );
        await page.getByRole('checkbox').check();
        await expect(page.getByRole('alert')).toBeHidden();
        await expect(
          page.locator('form[data-onboarding-form]'),
        ).toHaveAttribute(
          'action',
          '/profil/einrichten?weiter=%2Fbeitraege%2Ftest-artikel%23kommentare',
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);

        await page.goto('/reader-ui-fixture?view=profile');
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await openModal(page);
        await expect(page.locator('.profile-identity__name')).toHaveText(
          'justfelix',
        );
        // Das Passwort-Feld gehört zur Löschung, nicht zur Passwort-Sektion.
        const deletionForm = page.locator('[data-account-deletion-form]');
        await expect(
          deletionForm.getByLabel('Aktuelles Passwort', { exact: true }),
        ).toBeHidden();
        await page.screenshot({
          path: `test-results/reader-profile/profile-${theme}-${width}.png`,
          fullPage: true,
        });
        await navItem(page, 'Konto löschen').click();
        const disclosure = page.locator('.account-deletion > summary');
        await disclosure.focus();
        await page.keyboard.press('Enter');
        const submit = page.getByRole('button', {
          name: 'Löschung per E-Mail bestätigen',
        });
        await expect(submit).toBeDisabled();
        await page
          .getByLabel('E-Mail-Adresse zur Bestätigung')
          .fill('felix@example.de');
        await deletionForm
          .getByLabel('Aktuelles Passwort', { exact: true })
          .fill('NurEineTestEingabe');
        await expect(submit).toBeDisabled();
        await page.getByRole('checkbox').check();
        await expect(submit).toBeEnabled();
        await deletionForm
          .getByRole('button', { name: 'Aktuelles Passwort anzeigen' })
          .click();
        await expect(
          deletionForm.getByLabel('Aktuelles Passwort', { exact: true }),
        ).toHaveAttribute('type', 'text');
        await deletionForm
          .getByRole('button', { name: 'Aktuelles Passwort ausblenden' })
          .click();
        await page.getByRole('checkbox').uncheck();
        await expect(submit).toBeDisabled();
        await page.screenshot({
          path: `test-results/reader-profile/deletion-${theme}-${width}.png`,
          fullPage: true,
        });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        await page.getByRole('button', { name: 'Abbrechen' }).click();
        await expect(disclosure).toBeFocused();
        await expect(
          deletionForm.getByLabel('Aktuelles Passwort', { exact: true }),
        ).toBeHidden();
        await disclosure.click();
        await expect(
          deletionForm.getByLabel('Aktuelles Passwort', { exact: true }),
        ).toHaveValue('');
        await expect(submit).toBeDisabled();
      });
    }
  }

  test('MFA-Feld, API-Fehler, Redaktion und unvollständiges Profil', async ({
    page,
  }) => {
    await page.goto('/reader-ui-fixture?view=profile&mfa&editor');
    await openModal(page);
    await expect(
      page.getByRole('link', { name: 'Redaktion öffnen' }),
    ).toHaveCount(0);
    await navItem(page, 'Konto löschen').click();
    await page.locator('.account-deletion > summary').click();
    await page
      .getByLabel('E-Mail-Adresse zur Bestätigung')
      .fill('felix@example.de');
    await page
      .locator('[data-account-deletion-form]')
      .getByLabel('Aktuelles Passwort', { exact: true })
      .fill('NurEineTestEingabe');
    await page.getByRole('checkbox').check();
    const submit = page.getByRole('button', {
      name: 'Löschung per E-Mail bestätigen',
    });
    await expect(submit).toBeDisabled();
    await page
      .locator('[data-account-deletion-form]')
      .getByLabel('Authenticator-Code')
      .fill('123456');
    await expect(submit).toBeEnabled();
    await page.route('**/api/profil/konto-loeschen', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'E-Mail-Adresse oder Passwort sind nicht korrekt.',
        }),
      }),
    );
    await submit.click();
    await expect(
      page.locator('dialog[open] [data-notification-stack]'),
    ).toContainText('E-Mail-Adresse oder Passwort sind nicht korrekt.');
    await expect(submit).toBeEnabled();

    // Erfolg ist nur der Versand der Bestätigungsmail: Das Formular wird
    // zurückgesetzt, der Bereich geschlossen und nichts gelöscht.
    await page.route('**/api/profil/konto-loeschen', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          message:
            'Wir haben dir eine Bestätigungsmail geschickt. Dein Konto wird erst gelöscht, wenn du den Link darin öffnest und die Löschung bestätigst.',
        }),
      }),
    );
    await submit.click();
    await expect(
      page.locator('dialog[open] [data-notification-stack]'),
    ).toContainText('Bestätigungsmail geschickt');
    await expect(page.locator('.account-deletion')).toHaveJSProperty(
      'open',
      false,
    );
    await expect(page.getByLabel('E-Mail-Adresse zur Bestätigung')).toHaveValue(
      '',
    );

    await page.goto('/reader-ui-fixture?view=profile&missing&denied');
    await expect(
      page.getByRole('dialog', { name: /Mein Profil/ }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(
      'nicht für die Redaktion freigeschaltet',
    );
    await expect(
      page.getByRole('link', { name: 'Profil einrichten' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Redaktion öffnen' }),
    ).toHaveCount(0);

    await page.goto('/reader-ui-fixture?view=onboarding&unconfirmed');
    await page.getByLabel('Username', { exact: true }).fill('justfelix');
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Max Mustermann');
    await page.getByLabel('Geburtsdatum').fill('2004-04-02');
    await page.getByLabel('Geschlecht', { exact: true }).selectOption('M');
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('noch nicht bestätigt');
    await expect(
      page.getByRole('button', { name: 'Profil abschließen', exact: true }),
    ).toBeDisabled();
  });

  test('Username-Live-Check blockt reservierte Namen und gibt sie wieder frei', async ({
    page,
  }) => {
    await page.route('**/api/username-verfuegbar?*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: '{"available":true}',
      }),
    );
    await page.route('**/api/username-verfuegbar?username=admin', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: '{"available":false}',
      }),
    );
    await page.goto('/reader-ui-fixture?view=onboarding');
    const username = page.getByLabel('Username', { exact: true });
    const feedback = page.locator('[data-username-feedback]');
    const next = page.getByRole('button', { name: 'Weiter', exact: true });

    await username.fill('admin');
    await expect(feedback).toContainText(
      'Dieser Name ist bereits vergeben oder reserviert.',
    );
    await expect(username).toHaveAttribute('aria-invalid', 'true');
    // Blockierter Name: Der Wizard lässt keinen Schrittwechsel zu.
    await next.click();
    await expect(page.locator('[data-onboarding-step="2"]')).toBeHidden();
    await expect(page.locator('[data-onboarding-step="1"]')).toBeVisible();
    await expect(feedback).toBeVisible();

    // Ein freier Name hebt die Sperre auf und lässt den Wizard weitergehen.
    await username.fill('normalerfan48');
    await expect(feedback).toBeHidden();
    await expect(username).not.toHaveAttribute('aria-invalid', 'true');
    await next.click();
    await page.getByLabel('Name', { exact: true }).fill('Max Mustermann');
    await page.getByLabel('Geburtsdatum').fill('2004-04-02');
    await page.getByLabel('Geschlecht', { exact: true }).selectOption('M');
    await next.click();
    await expect(
      page.getByRole('button', { name: 'Profil abschließen', exact: true }),
    ).toBeEnabled();
  });

  test('Username-Live-Check im Profil-Dialog deaktiviert das Speichern', async ({
    page,
  }) => {
    await page.route('**/api/username-verfuegbar?username=adm1n', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: '{"available":false}',
      }),
    );
    await page.goto('/reader-ui-fixture?view=profile');
    await openModal(page);
    const form = page.locator('[data-profile-edit-form]');
    const username = form.getByLabel('Username', { exact: true });
    const save = page.getByRole('button', { name: 'Änderungen speichern' });
    await expect(save).toBeEnabled();
    await username.fill('adm1n');
    await expect(form.locator('[data-username-feedback]')).toContainText(
      'Dieser Name ist bereits vergeben oder reserviert.',
    );
    await expect(save).toBeDisabled();
    await username.fill('justfelix48');
    await expect(form.locator('[data-username-feedback]')).toBeHidden();
    await expect(save).toBeEnabled();
  });
});
