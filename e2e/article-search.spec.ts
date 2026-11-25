import { expect, test } from '@playwright/test';

test('Suche unterstützt Regex und zeigt ungültige Muster verständlich an', async ({
  page,
}) => {
  await page.goto('/beitraege');
  const search = page.getByRole('searchbox', { name: 'Beiträge durchsuchen' });
  await search.fill('/.*/i');
  await page.getByRole('button', { name: 'Suche starten' }).click();
  await expect(search).toHaveValue('/.*/i');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await search.fill('/[/');
  await page.getByRole('button', { name: 'Suche starten' }).click();
  await expect(page.getByRole('alert')).toContainText('ungültig');
  await expect(
    page.getByRole('heading', { name: 'Bitte passe deine Suche an.' }),
  ).toBeVisible();
});
