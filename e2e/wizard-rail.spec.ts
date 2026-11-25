import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Exercise the real editor stylesheet without requiring an account or a
// running database, like checkbox-style.spec.ts does for the form rules.
const loadStyles = () =>
  Promise.all(
    ['tokens.css', 'admin/editor.css'].map(async (path) =>
      (
        await readFile(
          new URL(`../src/styles/${path}`, import.meta.url),
          'utf8',
        )
      ).replaceAll(/@import[^;]+;/g, ''),
    ),
  );

test('Wizard-Schiene bleibt beim Hovern sichtbar und läuft durch die Kreise', async ({
  page,
}) => {
  const styles = await loadStyles();
  await page.setContent(`
    <html lang="de">
    <style>${styles.join('\n')}
      body { margin: 40px; }
    </style>
    <nav class="editor-wizard-progress" aria-label="Schritte im Artikel-Wizard">
      <ol>
        <li><button type="button"><span>1</span><strong>Grundlagen</strong><small>Titel & Teaser</small></button></li>
        <li><button type="button"><span>2</span><strong>Inhalt</strong><small>Text & Vorschau</small></button></li>
        <li class="is-complete"><button type="button"><span>3</span><strong>Details</strong><small>SEO & Einordnung</small></button></li>
        <li><button type="button"><span>4</span><strong>Abschluss</strong><small>Prüfen & speichern</small></button></li>
      </ol>
    </nav>
    </html>`);

  const li2 = page.locator('li').nth(1);
  const button2 = li2.locator('button');
  const circle2 = button2.locator('span');
  await expect(li2).toBeVisible();

  // Kreis und Text liegen über der Schiene, der Button darunter.
  const spanStyle = await circle2.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { position: cs.position, zIndex: cs.zIndex };
  });
  expect(spanStyle.position).toBe('relative');
  expect(spanStyle.zIndex).toBe('2');

  const buttonStyle = await button2.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { position: cs.position, zIndex: cs.zIndex };
  });
  expect(buttonStyle.position).toBe('static');
  expect(buttonStyle.zIndex).toBe('auto');

  // Die Schiene verbindet Kreismitte mit Kreismitte.
  const rail = await li2.evaluate((el) => {
    const cs = getComputedStyle(el, '::after');
    const liRect = el.getBoundingClientRect();
    const circle = el.querySelector('span')!.getBoundingClientRect();
    return {
      content: cs.content,
      left: cs.left,
      right: cs.right,
      railY: liRect.top + liRect.height / 2,
      circleCenterY: circle.top + circle.height / 2,
    };
  });
  expect(rail.content).toContain('""');
  expect(rail.left).toBe('16px');
  expect(rail.right).toBe('-44px');
  expect(Math.abs(rail.railY - rail.circleCenterY)).toBeLessThan(6);

  // Beim Hovern bleibt die Schiene über der Hover-Fläche: Der Treffer auf
  // der Linie gehört zum Listenelement, nicht zum Button mit Hintergrund.
  await button2.hover();
  const probe = await li2.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const x = rect.left + 48;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return hit?.tagName;
  });
  expect(probe).toBe('LI');
});
