import { expect, test } from '@playwright/test';

test('zeigt alle Beitragsbilder gleich breit auf Desktop und Mobilgeräten', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const carousel = page.getByRole('region', { name: 'Neueste Beiträge' });
  const images = carousel.locator('.article-card-cover');
  expect(await images.count()).toBeGreaterThan(1);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(async () => {
      const widths = await images.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().width),
      );
      expect(widths[0]).toBeGreaterThan(0);
      for (const imageWidth of widths.slice(1)) {
        expect(Math.abs(imageWidth - widths[0])).toBeLessThanOrEqual(1);
      }
    }).toPass();
  }
});

test('zeigt bis zu fünf Beiträge, die Archivkarte und beginnt danach von vorn', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const carousel = page.getByRole('region', { name: 'Neueste Beiträge' });
  const slides = carousel.locator('[data-carousel-slide]');
  const next = carousel.getByRole('button', { name: 'Nächster Beitrag' });

  const slideCount = await slides.count();
  expect(slideCount).toBeGreaterThan(1);
  expect(slideCount).toBeLessThanOrEqual(6);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Neueste Beiträge' }),
  ).toBeVisible();
  const dots = carousel.locator('[data-carousel-dot]');
  await expect(dots).toHaveCount(slideCount);
  await expect(dots.first()).toHaveAttribute('aria-current', 'true');

  const viewport = carousel.locator('[data-carousel-viewport]');
  const box = await viewport.boundingBox();
  if (!box) throw new Error('Das Karussell ist nicht sichtbar.');
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
  await page.mouse.up();
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');

  await carousel.getByRole('button', { name: 'Vorheriger Beitrag' }).click();
  await expect(dots.first()).toHaveAttribute('aria-current', 'true');

  for (let index = 1; index < slideCount; index += 1) {
    await next.click();
  }

  await expect(dots.last()).toHaveAttribute('aria-current', 'true');
  await expect(
    carousel.getByRole('link', { name: /Alle Beiträge entdecken/ }),
  ).toBeVisible();

  await next.click();

  await expect(dots.first()).toHaveAttribute('aria-current', 'true');
  await expect(slides.first()).not.toHaveAttribute('aria-hidden');
});

test('bleibt beim Lesen und nach manueller Auswahl auf dem gewählten Beitrag', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');

  const carousel = page.getByRole('region', { name: 'Neueste Beiträge' });
  const slideCount = await carousel.locator('[data-carousel-slide]').count();
  expect(slideCount).toBeGreaterThan(1);
  const dots = carousel.locator('[data-carousel-dot]');
  await expect(dots.first()).toHaveAttribute('aria-current', 'true');

  await page.clock.fastForward(15_000);
  await expect(dots.first()).toHaveAttribute('aria-current', 'true');

  await carousel.getByRole('button', { name: 'Nächster Beitrag' }).click();
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
  await page.getByRole('searchbox', { name: 'Beiträge durchsuchen' }).focus();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(15_000);
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(carousel.locator('.latest-carousel__status')).toBeVisible();
});

test('öffnet den Beitrag beim Klick auf die gesamte Karte', async ({
  page,
}) => {
  await page.goto('/');

  const card = page.locator('.article-card-link').first();
  const href = await card.getAttribute('href');
  expect(href).toMatch(/^\/beitraege\//);

  await card.click({ position: { x: 8, y: 8 } });
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test.describe('mobiles Karussell', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('zeigt die Archivkarte vollständig ohne Rest der vorherigen Folie', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const carousel = page.getByRole('region', { name: 'Neueste Beiträge' });
    const viewport = carousel.locator('[data-carousel-viewport]');
    const slides = carousel.locator('[data-carousel-slide]');

    for (const width of [320, 360, 390, 620]) {
      await page.setViewportSize({ width, height: 844 });
      await carousel.locator('[data-carousel-dot]').last().click();
      await expect(slides.last()).not.toHaveAttribute('aria-hidden');
      await expect(async () => {
        const bounds = await viewport.evaluate((element) => {
          const outer = element.getBoundingClientRect();
          const slide = element.querySelector(
            '[data-carousel-slide]:last-child',
          )!;
          const card = slide.querySelector('.latest-carousel__all')!;
          const inner = card.getBoundingClientRect();
          return {
            viewportWidth: element.clientWidth,
            slideWidth: slide.getBoundingClientRect().width,
            left: inner.left - outer.left,
            right: inner.right - outer.right,
            overflows: card.scrollWidth > card.clientWidth,
            textFits: Array.from(card.children).every((child) => {
              const box = child.getBoundingClientRect();
              return box.left >= inner.left && box.right <= inner.right;
            }),
          };
        });
        expect(
          Math.abs(bounds.slideWidth - bounds.viewportWidth),
        ).toBeLessThanOrEqual(1);
        expect(Math.abs(bounds.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(bounds.right)).toBeLessThanOrEqual(1);
        expect(bounds.overflows).toBe(false);
        expect(bounds.textFits).toBe(true);
      }).toPass();
      await carousel.getByRole('button', { name: 'Nächster Beitrag' }).click();
      await expect(
        carousel.locator('[data-carousel-dot]').first(),
      ).toHaveAttribute('aria-current', 'true');
    }
  });

  test('autoplayt nicht und überlässt horizontales Wischen dem Browser', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/');

    const carousel = page.getByRole('region', { name: 'Neueste Beiträge' });
    const dots = carousel.locator('[data-carousel-dot]');
    const viewport = carousel.locator('[data-carousel-viewport]');

    expect(
      await carousel.locator('[data-carousel-slide]').count(),
    ).toBeGreaterThan(1);
    await expect(dots.first()).toHaveAttribute('aria-current', 'true');

    await page.clock.fastForward(15_000);
    await expect(dots.first()).toHaveAttribute('aria-current', 'true');

    await expect(viewport).toHaveCSS(
      'touch-action',
      /manipulation|pan-x.*pan-y.*pinch-zoom|pan-y.*pan-x.*pinch-zoom/,
    );
  });
});

test('blättert per Tastatur gezielt und behält stabile Bedienflächen', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'Neueste Beiträge' });
  const dots = carousel.locator('[data-carousel-dot]');
  const before = await dots.evaluateAll((elements) =>
    elements.map((element) => {
      const { x, width, height } = element.getBoundingClientRect();
      return { x, width, height };
    }),
  );
  await dots.nth(2).focus();
  await page.keyboard.press('Enter');
  await expect(dots.nth(2)).toHaveAttribute('aria-current', 'true');
  await expect(carousel.locator('.latest-carousel__status')).toHaveText(
    /Beitrag 3 von/,
  );
  const after = await dots.evaluateAll((elements) =>
    elements.map((element) => {
      const { x, width, height } = element.getBoundingClientRect();
      return { x, width, height };
    }),
  );
  expect(after).toEqual(before);
  for (const box of after) {
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('Bedienelemente bleiben in beiden Themes eine rahmenlose Zeile ohne Überlauf', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'Neueste Beiträge' });
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 640 });
    const navigation = carousel.getByRole('group', { name: 'Beitragsauswahl' });
    await expect(navigation).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await expect(navigation).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
      await expect(navigation).toHaveCSS('border-top-width', '0px');
      for (const selector of [
        '.latest-carousel__arrow',
        '.latest-carousel__dot',
      ]) {
        const button = navigation.locator(selector).first();
        await page.mouse.move(0, 0);
        const color = await button.evaluate((element) =>
          element.matches('.latest-carousel__dot')
            ? getComputedStyle(element, '::before').backgroundColor
            : getComputedStyle(element).color,
        );
        await button.hover();
        const hoverColor = await button.evaluate((element) =>
          element.matches('.latest-carousel__dot')
            ? getComputedStyle(element, '::before').backgroundColor
            : getComputedStyle(element).color,
        );
        expect(hoverColor).toBe(color);
        await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        const shadow = await button.evaluate((element) =>
          element.matches('.latest-carousel__dot')
            ? getComputedStyle(element, '::before').filter
            : getComputedStyle(element.querySelector('span')!).filter,
        );
        expect(shadow).toContain('drop-shadow(');
      }
    }
    const fits = await navigation.evaluate((element) => {
      const outer = element.getBoundingClientRect();
      return (
        outer.height === 44 &&
        element.scrollWidth <= element.clientWidth &&
        Array.from(element.querySelectorAll('button')).every((button) => {
          const box = button.getBoundingClientRect();
          return (
            box.left >= outer.left &&
            box.right <= outer.right &&
            box.top === outer.top &&
            box.bottom === outer.bottom &&
            box.width >= 24 &&
            box.height >= 44
          );
        })
      );
    });
    expect(fits).toBe(true);
    await expect(navigation.locator('.latest-carousel__status')).toHaveClass(
      /visually-hidden/,
    );
    await expect(navigation.locator('[aria-live="polite"]')).toHaveText(
      /Beitrag 1 von/,
    );
    await navigation.getByRole('button', { name: 'Nächster Beitrag' }).click();
    await expect(navigation.locator('.latest-carousel__status')).toHaveText(
      /Beitrag 2 von/,
    );
    await navigation
      .getByRole('button', { name: 'Vorheriger Beitrag' })
      .click();
  }
});

test('hält alle Karten einschließlich Archiv bei unterschiedlichen Textlängen gleich groß', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const carousel = page.getByRole('region', { name: 'Neueste Beiträge' });
  const cards = carousel.locator(
    '.latest-carousel__slide .article-card, .latest-carousel__all',
  );
  expect(await cards.count()).toBeGreaterThan(2);

  for (const width of [320, 390, 620, 621, 820, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const measure = () =>
      cards.evaluateAll((elements) =>
        elements.map((element) => {
          const { width, height } = element.getBoundingClientRect();
          return { width, height };
        }),
      );
    await expect(async () => {
      const sizes = await measure();
      const viewportWidth = await carousel
        .locator('[data-carousel-viewport]')
        .evaluate((element) => element.clientWidth);
      for (const size of sizes) {
        expect(Math.abs(size.width - viewportWidth)).toBeLessThanOrEqual(1);
        expect(Math.abs(size.height - sizes[0].height)).toBeLessThanOrEqual(1);
      }
    }).toPass();
    const before = await measure();

    await carousel.locator('.card-copy').evaluateAll((copies) => {
      copies.forEach((copy, index) => {
        copy.querySelector('h2')!.textContent =
          index % 2 === 0 ? 'Kurz' : 'SehrLangerBeitragstitel'.repeat(50);
        copy.querySelector('p')!.textContent =
          index % 2 === 0 ? '' : 'Ausführliche Vorschau. '.repeat(100);
        copy.querySelector('.card-footer > span')!.textContent =
          index % 2 === 0 ? 'Felix' : 'SehrLangerAutorenname'.repeat(30);
      });
    });
    expect(await measure()).toEqual(before);
    expect(
      await cards.evaluateAll((elements) =>
        elements.every((element) => {
          const bounds = element.getBoundingClientRect();
          const footer = element.querySelector('.card-footer');
          const footerBounds = footer?.getBoundingClientRect();
          return (
            element.scrollWidth <= element.clientWidth + 1 &&
            element.scrollHeight <= element.clientHeight + 1 &&
            (!footerBounds ||
              (footerBounds.top >= bounds.top &&
                footerBounds.bottom <= bounds.bottom))
          );
        }),
      ),
    ).toBe(true);

    const controls = carousel.locator('.latest-carousel__controls');
    // Compare within the carousel: clicking may scroll the document to reveal controls.
    const controlsOffset = () =>
      controls.evaluate((element) =>
        element.getBoundingClientRect().top -
        element.closest('[data-latest-carousel]')!.getBoundingClientRect().top,
      );
    const controlsBefore = await controlsOffset();
    await carousel.locator('[data-carousel-dot]').last().click();
    await expect(async () => {
      expect(await controlsOffset()).toBeCloseTo(controlsBefore, 0);
      const viewport = carousel.locator('[data-carousel-viewport]');
      const offset = await viewport.evaluate((element) =>
        Math.abs(
          element.scrollLeft -
            (element.querySelector('[data-carousel-slide]:last-child') as HTMLElement)
              .offsetLeft,
        ),
      );
      expect(offset).toBeLessThanOrEqual(1);
    }).toPass();
    await carousel.locator('[data-carousel-dot]').first().click();
  }
});
