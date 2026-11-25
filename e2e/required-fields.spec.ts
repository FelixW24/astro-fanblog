import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { initRequiredFields } from '../src/scripts/required-fields';

const styles = readFileSync(
  new URL('../src/styles/forms.css', import.meta.url),
  'utf8',
);

test.describe('Pflichtfeld-Kennzeichnung', () => {
  test.skip(
    process.env.READER_UI_FIXTURE !== '1',
    'Run with e2e/reader-profile.config.ts for the isolated component fixture.',
  );

  test('Einrichtung: Sternchen sind auch ohne JavaScript vorhanden', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4341/reader-ui-fixture?view=onboarding');
    await expect(page.locator('.required-fields-note')).toBeVisible();
    await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute(
      'required',
    );
    await expect(
      page.locator('#username-label .required-marker'),
    ).toBeVisible();
    await context.close();
  });

  test('Profil: Passwort und Bestätigungen bleiben zugänglich beschriftet', async ({
    page,
  }) => {
    await page.goto('/reader-ui-fixture?view=profile&mfa=1');
    await page.getByRole('button', { name: 'Mein Profil öffnen' }).click();
    await expect(
      page.getByRole('dialog', { name: /Mein Profil/ }),
    ).toBeVisible();
    await page
      .locator('.profile-dialog__nav')
      .getByRole('button', { name: 'Konto löschen', exact: true })
      .click();
    await page.locator('.account-deletion > summary').click();
    const form = page.locator('[data-account-deletion-form]');
    await expect(form.locator('.required-fields-note')).toBeVisible();
    for (const label of await form.locator('label').all()) {
      await expect(label.locator('.required-marker')).toBeVisible();
    }
    await expect(
      form.getByLabel('Authenticator-Code', { exact: true }),
    ).toBeVisible();
    for (const marker of await form.locator('.required-marker').all()) {
      await expect(marker).toHaveText('');
    }
    await form
      .getByLabel('Aktuelles Passwort', { exact: true })
      .fill('Testpasswort');
    await form
      .getByRole('button', { name: 'Aktuelles Passwort anzeigen', exact: true })
      .click();
    await expect(
      form.getByRole('button', {
        name: 'Aktuelles Passwort ausblenden',
        exact: true,
      }),
    ).toBeVisible();
  });

  test('Bedingte Felder: Bild-URL bleibt optional, Alternativtext folgt der URL', async ({
    page,
  }) => {
    await page.setContent(`
      <style>${styles}</style>
      <form>
        <p class="required-fields-note">Mit * gekennzeichnete Felder sind Pflichtfelder.</p>
        <label>Bild-URL
          <input name="profile_image_url" type="url" placeholder="https://…"></label>
        <label>Alternativtext<span class="required-marker" aria-hidden="true"></span>
          <input name="profile_image_alt" maxlength="240" data-required-with="profile_image_url"></label>
      </form>
    `);
    await page.evaluate(initRequiredFields, undefined);
    const url = page.getByLabel('Bild-URL', { exact: true });
    const alt = page.getByLabel('Alternativtext', { exact: true });
    const markers = page.locator('.required-marker');

    await expect(url).not.toHaveAttribute('required');
    await expect(alt).not.toHaveAttribute('required');
    expect(
      await page
        .locator('form')
        .evaluate((form: HTMLFormElement) => form.checkValidity()),
    ).toBe(true);

    await url.fill('https://example.org/max.jpg');
    await expect(alt).toHaveAttribute('required');
    await expect(url).not.toHaveAttribute('required');
    await expect(markers.filter({ visible: true })).toHaveCount(1);
    expect(
      await page
        .locator('form')
        .evaluate((form: HTMLFormElement) => form.checkValidity()),
    ).toBe(false);

    await alt.fill('Max Mustermann im Trikot');
    expect(
      await page
        .locator('form')
        .evaluate((form: HTMLFormElement) => form.checkValidity()),
    ).toBe(true);

    await url.fill('');
    await expect(alt).not.toHaveAttribute('required');
    await expect(markers.filter({ visible: true })).toHaveCount(0);
  });

  test('Bedingte Felder: Bildpaar, optionale Sperre, Positionswechsel und Reset', async ({
    page,
  }) => {
    await page.setContent(`
      <style>${styles}</style>
      <form>
        <p class="required-fields-note">Mit * gekennzeichnete Felder sind Pflichtfelder.</p>
        <label>Bild-URL<span class="required-marker" aria-hidden="true"></span>
          <input name="image_url" data-required-pair="image"></label>
        <label>Alternativtext<span class="required-marker" aria-hidden="true"></span>
          <textarea name="image_alt" data-required-pair="image"></textarea></label>
        <label>Schreibsperre<input type="checkbox" name="ban"></label>
        <label>Dauer<span class="required-marker" aria-hidden="true"></span>
          <input type="number" name="duration" min="1" value="1" data-ban-field></label>
        <label>Einheit<span class="required-marker" aria-hidden="true"></span>
          <select name="unit" data-ban-field><option value="hours">Stunden</option></select></label>
        <label>Leistungswert<span class="required-marker" aria-hidden="true"></span>
          <input name="metric" type="number" disabled></label>
        <button type="reset">Zurücksetzen</button>
      </form>
    `);
    await page.evaluate(initRequiredFields, undefined);
    const url = page.getByLabel('Bild-URL', { exact: true });
    const alt = page.getByLabel('Alternativtext', { exact: true });
    const markers = page.locator('.required-marker');
    await expect(page.locator('.required-fields-note')).toBeHidden();
    await expect(markers.filter({ visible: true })).toHaveCount(0);
    await url.fill('https://example.org/image.jpg');
    await expect(url).toHaveAttribute('required');
    await expect(alt).toHaveAttribute('required');
    await expect(markers.filter({ visible: true })).toHaveCount(2);
    await expect(page.locator('.required-fields-note')).toBeVisible();
    expect(
      await page
        .locator('form')
        .evaluate((form: HTMLFormElement) => form.checkValidity()),
    ).toBe(false);
    await alt.fill('Spieler auf dem Platz');
    expect(
      await page
        .locator('form')
        .evaluate((form: HTMLFormElement) => form.checkValidity()),
    ).toBe(true);
    await url.fill('');
    expect(
      await page
        .locator('form')
        .evaluate((form: HTMLFormElement) => form.checkValidity()),
    ).toBe(false);
    await alt.fill('');
    await expect(markers.filter({ visible: true })).toHaveCount(0);
    await page.getByLabel('Schreibsperre').check();
    await expect(page.getByLabel('Dauer', { exact: true })).toHaveAttribute(
      'required',
    );
    await expect(markers.filter({ visible: true })).toHaveCount(2);
    await page.getByLabel('Schreibsperre').uncheck();
    await expect(page.getByLabel('Dauer', { exact: true })).toBeDisabled();
    await page
      .getByLabel('Leistungswert')
      .evaluate((input: HTMLInputElement) => {
        input.disabled = false;
        input.required = true;
      });
    await expect(markers.filter({ visible: true })).toHaveCount(1);
    await page
      .getByLabel('Leistungswert')
      .evaluate((input: HTMLInputElement) => {
        input.disabled = true;
      });
    await url.fill('https://example.org/image.jpg');
    await page.getByRole('button', { name: 'Zurücksetzen' }).click();
    await expect(url).not.toHaveAttribute('required');
    await expect(markers.filter({ visible: true })).toHaveCount(0);
    await expect(page.locator('.required-fields-note')).toBeHidden();
  });
});
