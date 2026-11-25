import { expect, test } from '@playwright/test';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
} from './admin-credentials';

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page
    .getByRole('main')
    .getByRole('link', { name: 'Neuer Beitrag' })
    .click();
  await expect(page.locator('#article-form')).toHaveAttribute(
    'data-editor-ready',
    'true',
  );
});

test('rendert Markdown mit Listen, Tabellen und verschachtelter Formatierung', async ({
  page,
}) => {
  await expect(page).toHaveURL(/\/admin\/beitraege\/neu$/);
  await expect(page.locator('#article-form')).toHaveAttribute(
    'data-current-step',
    '1',
  );
  await page.getByRole('textbox', { name: /^Titel/ }).fill('Markdown Vorschau');
  await page.getByLabel(/^URL-Slug/).fill('markdown-vorschau');
  await page
    .getByLabel(/Teaser/)
    .fill('Ein ausreichend langer Teaser für die Markdown-Vorschau.');
  await page.getByRole('button', { name: 'Weiter zu Inhalt' }).click();
  await page
    .getByLabel('Beitragstext')
    .fill(
      '## Analyse\n\n**Stark und *kursiv***\n\n- Erster Punkt\n  - Unterpunkt\n\n| Spieler | Tore |\n| --- | --- |\n| Max | 2 |\n\n```text\n**unverändert**\n```',
    );
  await page.getByRole('tab', { name: 'Vorschau', exact: true }).click();
  const preview = page.locator('.content-preview');
  await expect(preview.getByRole('heading', { name: 'Analyse' })).toBeVisible();
  await expect(preview.locator('strong em')).toHaveText('kursiv');
  await expect(preview.locator('ul ul li')).toHaveText('Unterpunkt');
  await expect(preview.locator('ul').first()).toHaveCSS(
    'list-style-type',
    'disc',
  );
  await expect(preview.getByRole('cell', { name: 'Max' })).toBeVisible();
  await expect(preview.locator('pre code')).toHaveText('**unverändert**\n');
});

test('führt schrittweise durch das Erstellen eines Beitrags', async ({
  page,
}) => {
  const wizard = page.getByRole('navigation', {
    name: 'Schritte im Artikel-Wizard',
  });
  const basics = wizard.getByRole('button', { name: /Grundlagen/ });

  await expect(basics).toHaveAttribute('aria-current', 'step');
  await expect(
    page.getByRole('heading', { name: 'Beitragskopf' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Beitragstext' }),
  ).toBeHidden();

  await page.getByRole('button', { name: 'Weiter zu Inhalt' }).click();
  await expect(basics).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('alert')).toContainText(
    'Bitte fülle „Titel“ aus.',
  );

  await page
    .getByRole('textbox', { name: /^Titel/ })
    .fill('Ein Beitrag aus dem Wizard');
  await page
    .getByLabel(/Teaser/)
    .fill('Dieser ausreichend lange Teaser beschreibt den neuen Beitrag.');
  await page.getByRole('button', { name: 'Weiter zu Inhalt' }).click();

  await expect(wizard.getByRole('button', { name: /Inhalt/ })).toHaveAttribute(
    'aria-current',
    'step',
  );
  await page
    .getByLabel('Beitragstext')
    .fill('Dieser Beitragstext ist lang genug für die Formularvalidierung.');
  await page.getByRole('button', { name: 'Weiter zu Details' }).click();

  await expect(
    page.getByRole('heading', { name: 'SEO & Suche' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Einordnung' })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter zum Abschluss' }).click();

  await expect(
    page.getByRole('heading', { name: 'Veröffentlichen' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Beitrag anlegen' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(
    page.getByRole('heading', { name: 'SEO & Suche' }),
  ).toBeVisible();
});

test('zeigt nach erfolgreichem Anlegen eine Benachrichtigung', async ({
  page,
}) => {
  await page.goto('/admin?saved=created');

  const notification = page.getByRole('status');
  await expect(notification).toContainText('Beitrag angelegt');
  await expect(notification).toContainText(
    'Der neue Beitrag wurde erfolgreich gespeichert.',
  );
  await expect(page).toHaveURL(/\/admin$/);

  await page
    .getByRole('button', { name: 'Benachrichtigung schließen' })
    .click();
  await expect(notification).toBeHidden();
});

test('stellt einen lokalen Entwurf über den gestalteten Dialog wieder her', async ({
  page,
}) => {
  const title = page.getByRole('textbox', { name: /^Titel/ });
  await title.fill('Lokal gespeicherter Titel');
  await expect(page.locator('#editor-save-state')).toContainText(
    'Lokal gespeichert',
  );

  await page.reload();
  const restoreDialog = page.getByRole('dialog', {
    name: 'Lokalen Entwurf wiederherstellen?',
  });
  await expect(restoreDialog).toBeVisible();
  await restoreDialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(title).toBeEmpty();

  await page.reload();
  await restoreDialog.getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(title).toHaveValue('Lokal gespeicherter Titel');
});

test('fügt einen Link mit geprüfter URL über den Dialog ein', async ({
  page,
}) => {
  await page.getByRole('textbox', { name: /^Titel/ }).fill('Link im Beitrag');
  await page.getByLabel(/Teaser/).fill('Ein Teaser für den Link im Beitrag.');
  await page.getByRole('button', { name: 'Weiter zu Inhalt' }).click();

  const content = page.getByLabel('Beitragstext');
  await content.fill('Ein Linktext');
  await content.selectText();
  await page.getByRole('button', { name: 'Link einfügen' }).click();

  const linkDialog = page.getByRole('dialog', { name: 'Link einfügen' });
  await expect(linkDialog).toBeVisible();
  await linkDialog.getByRole('button', { name: 'Link einfügen' }).click();
  await expect(linkDialog.getByRole('alert')).toBeVisible();
  await linkDialog
    .getByRole('textbox', { name: 'Ziel-URL' })
    .fill('https://example.org');
  await linkDialog.getByRole('button', { name: 'Link einfügen' }).click();
  await expect(linkDialog).toBeHidden();
  await expect(content).toHaveValue('[Ein Linktext](https://example.org)');
});

test('fragt vor dem Ersetzen eines Beitrags durch Markdown nach', async ({
  page,
}) => {
  const title = page.getByRole('textbox', { name: /^Titel/ });
  await title.fill('Bisheriger Titel');
  const markdown = {
    name: 'import.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Importierter Titel\n\nNeuer Beitragstext.'),
  };

  await page.locator('[data-markdown-file]').setInputFiles(markdown);
  const importDialog = page.getByRole('dialog', {
    name: 'Markdown importieren?',
  });
  await expect(importDialog).toBeVisible();
  await importDialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(importDialog).toBeHidden();
  await expect(page.locator('[data-markdown-file]')).toHaveJSProperty(
    'value',
    '',
  );
  await expect(title).toHaveValue('Bisheriger Titel');

  await page.locator('[data-markdown-file]').setInputFiles(markdown);
  await expect(importDialog).toBeVisible();
  await importDialog.getByRole('button', { name: 'Importieren' }).click();
  await expect(title).toHaveValue('Importierter Titel');
});

test('legt einen verworfenen lokalen Entwurf nicht erneut an', async ({
  page,
}) => {
  const form = page.locator('#article-form');
  const draftKey = await form.getAttribute('data-draft-key');
  expect(draftKey).toBeTruthy();

  await page
    .getByRole('textbox', { name: /^Titel/ })
    .fill('Kurzzeitig geänderter Titel');
  await page.getByRole('button', { name: 'Lokalen Entwurf löschen' }).click();
  await page.waitForTimeout(800);

  const storedDraft = await page.evaluate(
    (key) => localStorage.getItem(key),
    draftKey as string,
  );
  expect(storedDraft).toBeNull();
});

test('legt nach einem gültigen Submit keinen lokalen Entwurf erneut an', async ({
  page,
}) => {
  const form = page.locator('#article-form');
  const draftKey = await form.getAttribute('data-draft-key');
  expect(draftKey).toBeTruthy();

  await page
    .getByRole('textbox', { name: /^Titel/ })
    .fill('Ein vollständig vorbereiteter Beitrag');
  await page
    .getByLabel(/Teaser/)
    .fill(
      'Dieser ausreichend lange Teaser bereitet den Beitrag zum Speichern vor.',
    );
  await page.getByRole('button', { name: 'Weiter zu Inhalt' }).click();
  await page
    .getByLabel('Beitragstext')
    .fill('Dieser Beitragstext ist lang genug für die Formularvalidierung.');
  await form.evaluate((element) => {
    element.addEventListener('submit', (event) => event.preventDefault());
    (element as HTMLFormElement).requestSubmit();
  });
  await page.waitForTimeout(800);

  const storedDraft = await page.evaluate(
    (key) => localStorage.getItem(key),
    draftKey as string,
  );
  expect(storedDraft).toBeNull();
});

test.describe('Berliner Veröffentlichungszeit', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('setzt „Jetzt“ unabhängig von der Browser-Zeitzone', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-07-01T12:34:00.000Z'));
    await page.locator('[data-publish-now]').evaluate((element) => {
      (element as HTMLButtonElement).click();
    });

    await expect(page.locator('#published-at')).toHaveValue('2026-07-01T14:34');
  });
});
