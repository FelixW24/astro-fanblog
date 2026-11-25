import { expect, test } from '@playwright/test';

// Zuschneide-Modal des Profilbilds: „Profilbild hochladen“ öffnet das Modal,
// das Bild wird darin ausgewählt und zugeschnitten (Zoom, Verschiebung), erst
// „Übernehmen“ lädt hoch. Der Upload wird abgefangen, damit der Flow ohne
// angemeldeten Nutzer prüfbar ist.

test.describe('Avatar crop dialog', () => {
  test.skip(
    process.env.READER_UI_FIXTURE !== '1',
    'Run with e2e/reader-profile.config.ts for the isolated component fixture.',
  );

  // 1×1-PNG; das Modal skaliert es auf den Rahmen hoch.
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const openCrop = async (page: import('@playwright/test').Page) => {
    await page.getByRole('button', { name: 'Mein Profil öffnen' }).click();
    await expect(
      page.getByRole('dialog', { name: /Mein Profil/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Profilbild ändern' }).click();
    const crop = page.getByRole('dialog', { name: 'Profilbild zuschneiden' });
    await expect(crop).toBeVisible();
    return crop;
  };

  const chooseImage = async (
    page: import('@playwright/test').Page,
    crop: import('@playwright/test').Locator,
  ) => {
    const chooserPromise = page.waitForEvent('filechooser');
    await crop.getByRole('button', { name: 'Bild auswählen' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'bild.png',
      mimeType: 'image/png',
      buffer: tinyPng,
    });
  };

  test('Modal öffnet leer, Auswahl lädt das Bild, Abbrechen lädt nichts hoch', async ({
    page,
  }) => {
    const uploads: string[] = [];
    await page.route('**/api/profil/profilbild', async (route) => {
      uploads.push(route.request().method());
      await route.fulfill({ json: { avatarUrl: '/storage/avatar.png' } });
    });
    await page.goto('/reader-ui-fixture?view=profile');
    const crop = await openCrop(page);

    // Ohne Bild ist der Zuschnitt gesperrt.
    await expect(
      crop.getByRole('button', { name: 'Übernehmen' }),
    ).toBeDisabled();
    await expect(crop.getByLabel(/Bildausschnitt anpassen/)).toBeHidden();
    await expect(crop.locator('.avatar-crop__empty-icon')).toBeVisible();
    await chooseImage(page, crop);

    const image = crop.locator('[data-avatar-crop-image]');
    await expect(crop.getByLabel(/Bildausschnitt anpassen/)).toBeVisible();
    await expect(crop.getByRole('button', { name: 'Übernehmen' })).toBeEnabled();

    // Zoom-Regler vergrößert die Anzeige des Bildes.
    const initialWidth = await image.evaluate((el) => el.style.width);
    await crop.getByLabel('Zoomstufe').fill('2');
    await expect
      .poll(() => image.evaluate((el) => el.style.width))
      .not.toBe(initialWidth);

    // Tastatur: Pfeiltasten verschieben den Ausschnitt.
    const frame = crop.getByLabel(/Bildausschnitt anpassen/);
    const before = await image.evaluate((el) => el.style.transform);
    await frame.click();
    await page.keyboard.press('ArrowLeft');
    const afterPan = await image.evaluate((el) => el.style.transform);
    expect(afterPan).not.toBe(before);

    // Maus: Ziehen verschiebt den Ausschnitt ebenfalls.
    await page.mouse.down();
    await page.mouse.move(200, 200);
    await page.mouse.up();
    const afterDrag = await image.evaluate((el) => el.style.transform);
    expect(afterDrag).not.toBe(afterPan);

    await crop.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(crop).toBeHidden();
    await expect(page.locator('[data-avatar-image]')).toHaveCount(0);
    expect(uploads).toEqual([]);
  });

  test('Falsche Dateien werden mit Toast abgelehnt', async ({ page }) => {
    const uploads: string[] = [];
    await page.route('**/api/profil/profilbild', async (route) => {
      uploads.push(route.request().method());
      await route.fulfill({ json: { avatarUrl: '/storage/avatar.png' } });
    });
    await page.goto('/reader-ui-fixture?view=profile');
    const crop = await openCrop(page);

    // Falsches Format: Textdatei statt Bild.
    const textChooser = page.waitForEvent('filechooser');
    await crop.getByRole('button', { name: 'Bild auswählen' }).click();
    (await textChooser).setFiles({
      name: 'notizen.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('kein Bild'),
    });
    await expect(
      page.locator('dialog[open] [data-notification-stack]'),
    ).toContainText('JPEG-, PNG- oder WebP-Datei');
    await expect(
      crop.getByLabel(/Bildausschnitt anpassen/),
    ).toBeHidden();

    // Korrektur des Feldes und erneuter Versuch mit zu großer Datei.
    const imageChooser = page.waitForEvent('filechooser');
    await crop.getByRole('button', { name: 'Bild auswählen' }).click();
    (await imageChooser).setFiles({
      name: 'riesig.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(3 * 1024 * 1024, 1),
    });
    await expect(
      page.locator('dialog[open] [data-notification-stack]'),
    ).toContainText('maximal 2 MB');
    expect(uploads).toEqual([]);
  });

  test('Übernehmen lädt den zugeschnittenen Ausschnitt hoch', async ({
    page,
  }) => {
    let requestContentType = '';
    await page.route('**/api/profil/profilbild', async (route) => {
      requestContentType = route.request().headers()['content-type'] ?? '';
      await route.fulfill({ json: { avatarUrl: '/storage/avatar.png' } });
    });
    await page.goto('/reader-ui-fixture?view=profile');
    const crop = await openCrop(page);
    await chooseImage(page, crop);

    await crop.getByLabel('Zoomstufe').fill('2');
    await crop.getByRole('button', { name: 'Übernehmen' }).click();

    await expect(crop).toBeHidden();
    await expect(page.locator('[data-avatar-image]')).toHaveAttribute(
      'src',
      /\/storage\/avatar\.png\?version=\d+/,
    );
    expect(requestContentType).toContain('multipart/form-data');
  });

  test('Onboarding: Profilbild-Pfad wird mitgenommen und Entfernen leert ihn', async ({
    page,
  }) => {
    const actions: string[] = [];
    await page.route('**/api/profil/profilbild', async (route) => {
      const body = (
        route.request().postDataBuffer() ?? Buffer.alloc(0)
      ).toString();
      const action = body.includes('remove') ? 'remove' : 'upload';
      actions.push(action);
      if (action === 'remove')
        await route.fulfill({ json: { avatarUrl: null } });
      else
        await route.fulfill({
          json: {
            avatarUrl: '/storage/avatar.webp',
            path: '0d1a3f4c-2b5e-4f6a-8c9d-0e1f2a3b4c5d/avatar.webp',
          },
        });
    });
    await page.goto('/reader-ui-fixture?view=onboarding');
    await page.getByLabel('Username', { exact: true }).fill('justfelix');
    await page
      .getByRole('button', { name: 'Weiter', exact: true })
      .click();
    await page.getByLabel('Name', { exact: true }).fill('Max Mustermann');
    await page.getByLabel('Geburtsdatum').fill('2004-04-02');

    // Ohne eigenes Bild folgt das Fallback-Icon der Geschlecht-Auswahl.
    await expect(
      page.locator('[data-avatar-figure] [data-avatar-variant="male"]'),
    ).toBeVisible();
    await page
      .getByLabel('Geschlecht', { exact: true })
      .selectOption('W');
    await expect(
      page.locator('[data-avatar-figure] [data-avatar-variant="female"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-avatar-figure] [data-avatar-variant="male"]'),
    ).toBeHidden();

    await page.locator('[data-avatar-label]').click();
    const crop = page.getByRole('dialog', { name: 'Profilbild zuschneiden' });
    await expect(crop).toBeVisible();
    await chooseImage(page, crop);
    await crop.getByRole('button', { name: 'Übernehmen' }).click();

    // Der Storage-Pfad aus dem Upload wird im Hidden-Feld mitgegeben.
    await expect(crop).toBeHidden();
    await expect(page.locator('[data-avatar-image]')).toHaveAttribute(
      'src',
      /\/storage\/avatar\.webp\?version=\d+/,
    );
    await expect(page.locator('[data-avatar-path]')).toHaveValue(
      '0d1a3f4c-2b5e-4f6a-8c9d-0e1f2a3b4c5d/avatar.webp',
    );

    // Entfernen räumt Vorschau und Pfad wieder auf.
    await page
      .getByRole('button', { name: 'Profilbild entfernen' })
      .click();
    await expect(page.locator('[data-avatar-image]')).toHaveCount(0);
    await expect(page.locator('[data-avatar-path]')).toHaveValue('');
    expect(actions).toEqual(['upload', 'remove']);
  });
});
