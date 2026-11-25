import { expect, test } from '@playwright/test';

test('leitet alte Leihprofile auf das gemeinsame Spielerprofil weiter', async ({
  page,
}) => {
  await page.goto('/leihspieler/thijs-beispiel');

  await expect(
    page.getByRole('heading', { name: 'Alex Beispiel' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Profil', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Leihdetails' }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Leihdetails').getByText('FC Bologna'),
  ).toBeVisible();
  await expect(
    page.getByText('Geliehen', { exact: true }).first(),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/kader\/thijs-beispiel$/);
  const charts = await page.locator('.player-radar, .player-bars').count();
  await page.goto('/kader/thijs-beispiel');
  await expect(page.locator('.player-radar, .player-bars')).toHaveCount(charts);
});

test('verlinkt die Leihspieler-Übersicht mit dem Detailprofil', async ({
  page,
}) => {
  await page.goto('/leihspieler/geliehen');

  await page.getByRole('link', { name: 'Alex Beispiel', exact: true }).click();
  await expect(page).toHaveURL(/\/kader\/thijs-beispiel$/);
});

for (const width of [390, 1440]) {
  test(`wechselt im Seitenheader zwischen getrennten Leiharten bei ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/leihspieler');
    await expect(page).toHaveURL(/\/leihspieler\/verliehen$/);
    const navigation = page.getByRole('navigation', {
      name: 'Leiharten',
      exact: true,
    });
    for (const [label, slug, other] of [
      ['Geliehen', 'geliehen', 'Verliehen'],
      ['Verliehen', 'verliehen', 'Geliehen'],
    ]) {
      await navigation.getByRole('link', { name: new RegExp(label) }).click();
      await expect(page).toHaveURL(new RegExp('/leihspieler/' + slug + '$'));
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        label,
      );
      await expect(
        navigation.getByRole('link', { name: new RegExp(label) }),
      ).toHaveAttribute('aria-current', 'page');
      await expect(navigation.locator('[aria-current]')).toHaveCount(1);
      const cards = page.locator('.loan-player-card');
      const count = await cards.count();
      await expect(cards.getByText(other, { exact: true })).toHaveCount(0);
      await expect(cards.getByText(label, { exact: true })).toHaveCount(count);
      if (count) {
        await expect(page.locator('.loans-group')).toHaveCount(1);
        await expect(page.locator('.loans-group__heading h2 span')).toHaveText(
          String(count),
        );
      } else {
        await expect(
          page.getByRole('heading', { name: /Aktuell keine/ }),
        ).toBeVisible();
      }
      await expect(
        navigation.getByRole('link', { name: new RegExp(label) }),
      ).toContainText('(' + count + ')');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Verliehen',
    );
    await expect(
      page.locator('.loan-player-card').getByText('Geliehen', { exact: true }),
    ).toHaveCount(0);
  });
}

test('zeigt geliehene Spieler auch ohne JavaScript getrennt', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/leihspieler/geliehen');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Geliehen',
  );
  await expect(
    page.locator('.loan-player-card').getByText('Verliehen', { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Leiharten', exact: true })
    .getByRole('link', { name: /Verliehen/ })
    .click();
  await expect(page).toHaveURL(/\/leihspieler\/verliehen$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Verliehen',
  );
  await expect(
    page.locator('.loan-player-card').getByText('Geliehen', { exact: true }),
  ).toHaveCount(0);
  await context.close();
});

test('kennzeichnet einen verliehenen FC-Spieler als Leihabgang', async ({
  page,
}) => {
  await page.goto('/leihspieler/lena-mayer');

  await expect(
    page.getByRole('heading', { name: 'Lena Mayer' }),
  ).toBeVisible();
  await expect(
    page.getByText('Verliehen', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByLabel('Leihdetails').getByText('Widzew Łódź').first(),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/kader\/lena-mayer$/);
});

test('verlinkt denselben geliehenen Spieler aus Kader und Leihübersicht', async ({
  page,
}) => {
  await page.goto('/kader');
  const squadLink = page.getByRole('link', {
    name: 'Spielerprofil von Alex Beispiel öffnen',
  });
  await expect(squadLink.getByText('Geliehen', { exact: true })).toBeVisible();
  const profileUrl = await squadLink.getAttribute('href');
  await expect(
    page.getByRole('link', {
      name: 'Spielerprofil von Lena Mayer öffnen',
    }),
  ).toHaveCount(0);
  await page.goto('/leihspieler/geliehen');
  await expect(
    page.getByRole('link', { name: 'Alex Beispiel', exact: true }),
  ).toHaveAttribute('href', profileUrl!);
  await page.goto('/leihspieler/verliehen');
  await expect(
    page
      .getByRole('link', { name: 'Lena Mayer', exact: true })
      .getByText('Verliehen', { exact: true }),
  ).toBeVisible();
});
