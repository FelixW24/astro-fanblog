import { expect, it } from 'vitest';
import { articleCover } from './article-cover';

it('uses the default cover for missing or blank URLs', () => {
  for (const url of [null, '', '   ']) {
    expect(
      articleCover({
        cover_image_url: url,
        cover_image_alt: null,
        title: 'Titel',
      }),
    ).toMatchObject({ src: '/images/article-default.webp', isDefault: true });
  }
});

it('preserves a custom cover even without an alternative description', () => {
  expect(
    articleCover({
      cover_image_url: '/custom.jpg',
      cover_image_alt: null,
      title: 'Titel',
    }),
  ).toEqual({ src: '/custom.jpg', alt: 'Titel', isDefault: false });
});

it('liefert im Datensparmodus die kleine Cover-Variante aus', () => {
  const article = {
    cover_image_url: null,
    cover_image_alt: null,
    title: 'Titel',
  };
  expect(articleCover(article, { compact: true })).toMatchObject({
    src: '/images/article-default-480.webp',
    srcset: '/images/article-default-480.webp 480w',
    width: 480,
    height: 270,
    isDefault: true,
  });
  expect(articleCover(article, { compact: true, hero: true })).toMatchObject({
    src: '/images/article-default-800.webp',
    width: 800,
    height: 450,
    isDefault: true,
  });
  expect(articleCover(article, { compact: false })).toMatchObject({
    src: '/images/article-default.webp',
    width: 1672,
    height: 941,
  });
});

it('behält eigene Cover auch im Datensparmodus unverändert', () => {
  expect(
    articleCover(
      { cover_image_url: '/custom.jpg', cover_image_alt: null, title: 'Titel' },
      { compact: true },
    ),
  ).toEqual({ src: '/custom.jpg', alt: 'Titel', isDefault: false });
});

it('liefert kein Cover, wenn die Redaktion das Bild deaktiviert hat', () => {
  for (const url of [null, '/custom.jpg']) {
    expect(
      articleCover({
        cover_image_url: url,
        cover_image_alt: null,
        cover_disabled: true,
        title: 'Titel',
      }),
    ).toBeNull();
  }
  expect(
    articleCover({
      cover_image_url: null,
      cover_image_alt: null,
      cover_disabled: false,
      title: 'Titel',
    }),
  ).toMatchObject({ isDefault: true });
});
