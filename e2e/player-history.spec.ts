import { expect, test } from '@playwright/test';
import {
  adminEmail,
  adminPassword,
  completeAdminMfa,
} from './admin-credentials';

test('pflegt Noten, Nominierung und Wechsel in der Spielhistorie und zeigt sie öffentlich', async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(10_000);
  const opponent = `Testverein ${Date.now()}`;
  let matchEditUrl: string | undefined;
  await page.goto('/admin/login');
  await page.getByLabel('E-Mail-Adresse').fill(adminEmail);
  await page.getByLabel('Passwort').fill(adminPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await completeAdminMfa(page);
  try {
    // Vergangenen Gegner mit Ergebnis anlegen, damit er im Verlauf erscheint.
    await page
      .getByRole('navigation', { name: 'Redaktionsnavigation' })
      .getByRole('link', { name: 'Spielplan', exact: true })
      .click();
    await page.getByRole('link', { name: 'Spiel hinzufügen' }).click();
    await expect(page).toHaveURL(/\/admin\/spielplan\/neu$/);
    await page.getByLabel('Gegner', { exact: true }).fill(opponent);
    await page.getByLabel('Gegnerkürzel').fill('TST');
    await page.getByLabel('Anstoß (Berliner Zeit)').fill('2026-10-24T15:30');
    await page.getByLabel(/Tore Heim/).fill('2');
    await page.getByLabel(/Tore Gast/).fill('1');
    await page
      .getByRole('button', { name: 'Spiel speichern', exact: true })
      .click();
    await expect(page.getByRole('status')).toHaveText('Spiel angelegt.');
    await page.getByRole('link', { name: `${opponent} bearbeiten` }).click();
    matchEditUrl = page.url();
    // Ergebnis landet in der Admin-Übersicht.
    await page.goto('/admin/spielplan');
    await expect(
      page.getByRole('row').filter({ hasText: opponent }),
    ).toContainText('2 : 1');

    await page.goto('/admin/spieler');
    await page.getByRole('link', { name: 'Lukas Lücke bearbeiten' }).click();
    await page.getByRole('tab', { name: 'Spielhistorie' }).click();

    const section = page.locator('#verlauf');
    await expect(
      section.getByRole('heading', { name: 'Spielhistorie' }),
    ).toBeVisible();
    const item = section
      .locator('.match-timeline-item')
      .filter({ hasText: opponent });
    await expect(item).toBeVisible();
    await expect(item.locator('strong')).toContainText(
      `Heim gegen ${opponent}`,
    );
    await expect(item.locator('.match-timeline-head small')).toContainText(
      '2 : 1',
    );
    await expect(item.locator('.match-grade--none').first()).toHaveText(
      'Noch keine Note',
    );

    const noteInput = item.getByLabel('Note', { exact: true });
    const minutesOutput = item.locator('[data-minutes-output]');
    const subField = item.locator('[data-sub-field]');
    const subLabel = item.locator('[data-sub-label]');
    const subInput = item.locator('[data-sub-field] input');
    const replacementField = item.locator('[data-replacement-field]');
    const replacementSelect = item.getByLabel('Einwechselspieler');
    // Zentraler Speicher-Button: speichert Profil und alle geänderten
    // Verlaufseinträge auf einmal.
    const saveButton = page.getByRole('button', {
      name: 'Speichern und weiter bearbeiten',
    });

    await test.step('Note allein wird gespeichert, Spielminuten werden automatisch berechnet', async () => {
      await noteInput.fill('7,5');
      await saveButton.click();
      await expect(section.getByRole('status')).toContainText(
        '1 Eintrag gespeichert',
      );
      await expect(item.locator('.match-grade--good').first()).toHaveText(
        'Note 7,5 · 90 Min',
      );
      await expect(minutesOutput).toHaveText('90 Min');
      await expect(noteInput).toHaveValue('7,5');
    });

    await test.step('Eingewechselt blendet die Einwechselminute ein und berechnet die Spielminuten daraus', async () => {
      await noteInput.fill('6,7');
      await item.getByLabel('Eingewechselt').check();
      await expect(subField).toBeVisible();
      await expect(subLabel).toHaveText('Einwechselminute');
      await expect(replacementField).toBeHidden();
      await subInput.fill('67');
      await item.getByLabel('Notiz').fill('Zwei Paraden, sicher im Strafraum');
      await saveButton.click();
      await expect(page.getByRole('status').first()).toContainText(
        'Spielerprofil wurde gespeichert.',
      );
      await expect(section.getByRole('status')).toContainText(
        '1 Eintrag gespeichert',
      );
      await expect(item.locator('.match-grade--neutral')).toHaveText(
        'Note 6,7 · 23 Min · eingewechselt 67.',
      );
      await expect(minutesOutput).toHaveText('23 Min');
      await expect(item.locator('.match-timeline-note')).toContainText(
        'Zwei Paraden',
      );
    });

    await test.step('Öffentliches Spielerprofil zeigt die Spielhistorie neben dem Leistungsprofil', async () => {
      const adminUrl = page.url();
      await page.goto('/kader');
      await page
        .getByRole('link', { name: 'Spielerprofil von Lukas Lücke öffnen' })
        .click();
      await expect(page).toHaveURL(/\/kader\/[a-z0-9-]+/);
      const panel = page.locator('.player-history-panel');
      await expect(
        panel.getByRole('heading', { name: 'Spielhistorie' }),
      ).toBeVisible();
      const item = panel
        .locator('.player-history-item')
        .filter({ hasText: opponent });
      await expect(item).toBeVisible();
      const score = item.locator('.player-history-score');
      await expect(score).toHaveText('2 : 1');
      // Ergebnis wird ohne Kasten farbig gehighlightet (Sieg = grün).
      await expect(score).toHaveClass(/player-history-score--sieg/);
      const scoreColor = await score.evaluate(
        (el) => getComputedStyle(el).color,
      );
      expect(['rgb(31, 138, 59)', 'rgb(76, 194, 106)']).toContain(scoreColor);
      await expect(item.locator('.player-history-fact--neutral')).toHaveText(
        'Note 6,7',
      );
      const minutesFact = item.locator('.player-history-fact', {
        hasText: '23 Min',
      });
      await expect(minutesFact).toHaveText('23 Min');
      const subTag = item.locator('.player-history-fact--sub-in');
      await expect(subTag).toHaveText('67.');
      await expect(subTag).toHaveClass(/player-history-fact--sub-in/);
      await expect(subTag).toHaveAttribute('aria-label', 'eingewechselt 67.');
      // Grün je nach Theme (hell: #1f8a3b, dunkel: #4cc26a).
      const subColor = await subTag
        .locator('svg')
        .evaluate((el) => getComputedStyle(el).color);
      expect(['rgb(31, 138, 59)', 'rgb(76, 194, 106)']).toContain(subColor);
      await expect(item.locator('.player-history-fact--neutral svg')).toBeVisible();
      await expect(minutesFact.locator('svg')).toBeVisible();
      await expect(item.locator('.player-history-note')).toContainText(
        'Zwei Paraden',
      );
      // Der Verlauf ist ein eigener scrollbarer Container.
      await expect
        .poll(() =>
          page
            .locator('.player-history-panel__scroll')
            .evaluate((el) => getComputedStyle(el).overflowY),
        )
        .toBe('auto');
      // Desktop: Panel sitzt neben dem Leistungsprofil.
      const overview = page.locator('.player-profile-overview');
      const charts = page.locator('.player-profile-chart-list');
      const panelBox = await panel.boundingBox();
      const chartsBox = await charts.boundingBox();
      if (chartsBox && panelBox) {
        expect(panelBox.x).toBeGreaterThan(chartsBox.x);
        expect(Math.abs(panelBox.y - chartsBox.y)).toBeLessThan(80);
      }
      // Ab Tablet steht der Verlauf unter dem Leistungsprofil.
      await page.setViewportSize({ width: 820, height: 1000 });
      const panelBoxMobile = await panel.boundingBox();
      const chartsBoxMobile = await charts.boundingBox();
      if (chartsBoxMobile && panelBoxMobile) {
        expect(panelBoxMobile.y).toBeGreaterThan(chartsBoxMobile.y);
      }
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(overview).toBeVisible();
      await page.goto(adminUrl);
    });

    await test.step('Eintrag bleibt nach erneutem Laden erhalten', async () => {
      await page.reload();
      await expect(item.locator('.match-grade--neutral')).toHaveText(
        'Note 6,7 · 23 Min · eingewechselt 67.',
      );
      await expect(noteInput).toHaveValue('6,7');
      await expect(minutesOutput).toHaveText('23 Min');
      await expect(item.getByLabel('Eingewechselt')).toBeChecked();
      await expect(subInput).toHaveValue('67');
    });

    await test.step('Ausgewechselt zeigt Auswechselminute und Einwechselspieler aus dem Kader', async () => {
      await item.getByLabel('Eingewechselt').uncheck();
      await item.getByLabel('Ausgewechselt').check();
      await expect(subLabel).toHaveText('Auswechselminute');
      await expect(replacementField).toBeVisible();
      await subInput.fill('75');
      await expect(minutesOutput).toHaveText('75 Min');
      const replacementName = (
        await replacementSelect.locator('option').nth(1).textContent()
      )?.replace(/^#\d+\s*/, '');
      await replacementSelect.selectOption({ index: 1 });
      await saveButton.click();
      await expect(section.getByRole('status')).toContainText(
        '1 Eintrag gespeichert',
      );
      await expect(item.locator('.match-grade')).toContainText(
        `ausgewechselt 75. für ${replacementName}`,
      );
      await expect(minutesOutput).toHaveText('75 Min');
    });

    await test.step('Nicht nominiert sperrt die Eingabefelder, Status-Haken bleiben klickbar', async () => {
      await item.getByLabel('Ausgewechselt').uncheck();
      await item.getByLabel('Nicht nominiert').check();
      await expect(noteInput).toBeDisabled();
      await expect(minutesOutput).toHaveText('—');
      await expect(subField).toBeHidden();
      await expect(replacementField).toBeHidden();
      await expect(item.getByLabel('Eingewechselt')).toBeEnabled();
      await expect(item.getByLabel('Ausgewechselt')).toBeEnabled();
      await saveButton.click();
      await expect(section.getByRole('status')).toContainText(
        '1 Eintrag gespeichert',
      );
      await expect(item.locator('.match-grade--none')).toHaveText(
        'Nicht nominiert',
      );
    });

    await test.step('Klick auf Eingewechselt beendet „Nicht nominiert“ direkt', async () => {
      await item.getByLabel('Eingewechselt').check();
      await expect(item.getByLabel('Nicht nominiert')).not.toBeChecked();
      await expect(noteInput).toBeEnabled();
      await expect(subField).toBeVisible();
      // Zustand für den Folgeschritt wiederherstellen.
      await item.getByLabel('Nicht nominiert').check();
      await expect(noteInput).toBeDisabled();
    });

    await test.step('Bank ergibt 0 Spielminuten ohne Wechselminute', async () => {
      await item.getByLabel('Nicht nominiert').uncheck();
      await item.getByLabel('Bank').check();
      await expect(minutesOutput).toHaveText('0 Min');
      await expect(subField).toBeHidden();
      await expect(replacementField).toBeHidden();
      await expect(noteInput).toBeEnabled();
      await saveButton.click();
      await expect(section.getByRole('status')).toContainText(
        '1 Eintrag gespeichert',
      );
      await expect(item.locator('.match-grade--none')).toHaveText(
        'Bank · 0 Min',
      );
    });

    await test.step('Leerer Eintrag wird entfernt', async () => {
      await item.getByLabel('Bank').uncheck();
      await expect(noteInput).toBeEnabled();
      await expect(minutesOutput).toHaveText('90 Min');
      await saveButton.click();
      await expect(section.getByRole('status')).toContainText(
        '1 Eintrag gespeichert',
      );
      await expect(item.locator('.match-grade--none').first()).toHaveText(
        'Noch keine Note',
      );
    });

    await test.step('Öffentliche Spielhistorie zeigt den Zeitstrahl mit Ergebnis', async () => {
      await page.goto('/spielplan');
      const historyItem = page
        .locator('.match-history__item')
        .filter({ hasText: opponent });
      await expect(historyItem).toBeVisible();
      await expect(historyItem.locator('.match-history__score')).toHaveText(
        '2 : 1',
      );
      await expect(
        historyItem.locator('.match-history__outcome--sieg'),
      ).toHaveText('Sieg');
      await expect(historyItem.locator('.match-history__teams')).toContainText(
        'FC Example',
      );
    });

    await test.step('Nächstes-Spiel-Container verlinkt auf den Spielplan', async () => {
      await page.goto('/');
      await expect(page.locator('.next-match__main').first()).toHaveAttribute(
        'href',
        '/spielplan',
      );
    });
  } finally {
    if (!matchEditUrl) {
      await page.goto('/admin/spielplan');
      const href = await page
        .getByRole('link', { name: `${opponent} bearbeiten` })
        .getAttribute('href')
        .catch(() => null);
      if (href) matchEditUrl = new URL(href, page.url()).toString();
    }
    if (matchEditUrl) {
      await page.goto(matchEditUrl);
      await page.getByLabel('Dieses Spiel endgültig löschen').check();
      await page
        .getByRole('button', { name: 'Spiel löschen', exact: true })
        .click();
      await expect(page.getByRole('status')).toHaveText('Spiel gelöscht.');
    }
  }
});
