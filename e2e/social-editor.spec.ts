import { expect, test } from '@playwright/test';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
} from './admin-credentials';

test('schützt das Social-Media-Studio vor anonymem Zugriff', async ({
  page,
}) => {
  await page.goto('/admin/social-media');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.locator('[data-social-editor]')).toHaveCount(0);
});

test('gestaltet, exportiert und öffnet einen Social-Media-Entwurf', async ({
  page,
}) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await completeAdminMfa(page);
  await page
    .getByRole('navigation', { name: 'Redaktionsnavigation' })
    .getByRole('link', { name: 'Social Media' })
    .click();
  const downloadButton = page.getByRole('button', {
    name: 'PNG herunterladen',
  });
  await expect(downloadButton).toBeEnabled();
  // Labels must not include initial textarea contents or select options.
  await expect(page.getByLabel('Überschrift', { exact: true })).toHaveValue(
    'Was zählt. Was bleibt.',
  );
  await page
    .getByLabel('Unterzeile / Quelle', { exact: true })
    .fill('Astro Fanblog · Redaktion');
  await page.getByLabel('Markenlogo', { exact: true }).selectOption('compact');

  await page
    .getByLabel('Überschrift', { exact: true })
    .fill('Der FC ist bereit.');
  await page.getByLabel('Vorlage', { exact: true }).selectOption('quote');
  await page.getByLabel('Format', { exact: true }).selectOption('story');
  await expect(page.locator('canvas')).toHaveAttribute('height', '1920');
  await expect(page.locator('canvas')).toHaveAccessibleName(
    /Der FC ist bereit/,
  );
  const pngPromise = page.waitForEvent('download');
  await downloadButton.click();
  const png = await pngPromise;
  expect(png.suggestedFilename()).toBe('astro-fanblog-quote-story.png');
  const draftPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Entwurf speichern' }).click();
  const draft = await draftPromise;
  const path = await draft.path();
  expect(path).toBeTruthy();
  await page.getByLabel('Entwurf öffnen').setInputFiles(path!);
  await expect(page.locator('[data-status]')).toHaveText('Entwurf geöffnet.');
  await expect(page.getByLabel('Überschrift', { exact: true })).toHaveValue(
    'Der FC ist bereit.',
  );
  await page.getByLabel('Entwurf öffnen').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":999}'),
  });
  await expect(page.locator('[data-status]')).toContainText('ungültige');
  await expect(page.getByLabel('Überschrift', { exact: true })).toHaveValue(
    'Der FC ist bereit.',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: 'test-results/social-editor-mobile.png',
    fullPage: true,
  });
});
