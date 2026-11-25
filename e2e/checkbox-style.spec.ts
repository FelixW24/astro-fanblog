import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Exercise the real shared stylesheet with both reader and admin form rules,
// without requiring an account or a running database.
const loadStyles = () =>
  Promise.all(
    [
      'tokens.css',
      'public/base.css',
      'public/readers.css',
      'admin/shell.css',
      'admin/editor.css',
      'checkbox.css',
    ].map(async (path) =>
      (
        await readFile(
          new URL(`../src/styles/${path}`, import.meta.url),
          'utf8',
        )
      ).replaceAll(/@import[^;]+;/g, ''),
    ),
  );

for (const theme of ['light', 'dark']) {
  test(`Einheitliche Checkboxen: ${theme}`, async ({ page }) => {
    const styles = await loadStyles();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`
      <html data-theme="${theme}" lang="de">
      <style>${styles.join('\n')}
        body { margin: 16px; background: var(--color-canvas); color: var(--color-ink-black); font-family: var(--font-ranade); }
        .preview { padding: 16px; border: 1px solid var(--color-fog); border-radius: 12px; }
        h1 { font-size: 18px; margin: 0 0 20px; }
        .session-notice { display: grid; gap: 16px; }
        .editor-preview { display: grid; gap: 16px; margin-top: 20px; }
      </style>
      <main class="preview">
        <h1>Checkboxen · Astro Fanblog</h1>
        <form class="reader-form reader-form--auth reader-panel--auth">
          <div class="session-notice">
            <label class="reader-checkbox"><input type="checkbox" name="privacy" required><span>Ich habe die Datenschutzhinweise zur Kenntnis genommen.</span></label>
            <label class="reader-checkbox"><input type="checkbox" checked><span>Ich akzeptiere die AGB.</span></label>
          </div>
        </form>
        <section class="editor-preview">
          <label class="field check-field"><input type="checkbox" id="partial"><span>Teilweise ausgewählt</span></label>
          <label class="field check-field"><input type="checkbox" disabled checked><span>Deaktiviert</span></label>
        </section>
      </main></html>`);

    const privacy = page.getByRole('checkbox', { name: /Datenschutzhinweise/ });
    await expect(privacy).toHaveCSS('appearance', 'none');
    await expect(privacy).toHaveCSS('border-radius', '4px');
    await expect(privacy).toHaveCSS('background-image', 'none');
    expect(
      await privacy.evaluate(
        (box: HTMLInputElement) => box.validity.valueMissing,
      ),
    ).toBe(true);
    await page
      .getByText('Ich habe die Datenschutzhinweise zur Kenntnis genommen.')
      .click();
    await expect(privacy).toBeChecked();
    await expect(privacy).not.toHaveCSS('background-image', 'none');
    expect(
      await privacy.evaluate((box: HTMLInputElement) =>
        new FormData(box.form!).get('privacy'),
      ),
    ).toBe('on');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(privacy).toBeFocused();
    await expect(privacy).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Space');
    await expect(privacy).not.toBeChecked();
    await privacy.evaluate((box) => box.setAttribute('aria-invalid', 'true'));
    await expect(privacy).toHaveCSS('outline-width', '2px');
    await privacy.evaluate((box) => box.removeAttribute('aria-invalid'));

    const partial = page.getByRole('checkbox', {
      name: 'Teilweise ausgewählt',
    });
    await partial.evaluate((box: HTMLInputElement) => {
      box.indeterminate = true;
    });
    await expect(partial).not.toHaveCSS('background-image', 'none');
    for (const box of await page.getByRole('checkbox').all()) {
      await expect(box).toHaveCSS('width', '18px');
      await expect(box).toHaveCSS('height', '18px');
    }
    const disabled = page.getByRole('checkbox', { name: 'Deaktiviert' });
    await expect(disabled).toBeDisabled();
    await expect(disabled).toHaveCSS('cursor', 'not-allowed');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page
      .locator('main')
      .screenshot({ path: `test-results/checkbox-${theme}.png` });

    await page.emulateMedia({ forcedColors: 'active' });
    await expect(privacy).toHaveCSS('appearance', 'auto');
    await expect(privacy).toHaveCSS('background-image', 'none');
    await expect(partial).toHaveCSS('background-image', 'none');
    await expect(disabled).toHaveCSS('background-image', 'none');
  });
}
