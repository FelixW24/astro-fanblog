import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import ArticleCard from './ArticleCard.astro';
import LatestArticlesCarousel from './LatestArticlesCarousel.astro';
import type { Article } from '../lib/content';

const article: Article = {
  id: 1,
  slug: 'spieltag',
  title: 'Ein Spieltag in Example',
  category: 'spielbericht-analyse',
  excerpt: 'Die Analyse der Partie.',
  author: 'Astro Fanblog',
  content: '',
  read_minutes: 3,
  published_at: '2026-10-07T12:00:00Z',
  created_at: '2026-10-07T12:00:00Z',
  updated_at: '2026-10-07T12:00:00Z',
  status: 'published',
  is_featured: false,
  cover_image_url: null,
  cover_disabled: false,
  cover_image_alt: null,
  seo_description: null,
  seo_title: null,
  source_urls: [],
  tags: [],
};

it('serves responsive WebP defaults and keeps ordinary cards lazy', async () => {
  const container = await AstroContainer.create();
  const html = await container.renderToString(ArticleCard, {
    props: { article },
  });
  expect(html).toContain('src="/images/article-default.webp"');
  expect(html).toContain('/images/article-default-480.webp 480w');
  expect(html).toContain('sizes=');
  expect(html).toContain('width="1672" height="941"');
  expect(html).toContain('loading="lazy"');
  expect(html).not.toContain('fetchpriority="high"');
});

it('preserves custom cover URLs without claiming default image sizes', async () => {
  const container = await AstroContainer.create();
  const html = await container.renderToString(ArticleCard, {
    props: { article: { ...article, cover_image_url: '/custom.jpg' } },
  });
  expect(html).toContain('src="/custom.jpg"');
  expect(html).not.toContain('srcset=');
  expect(html).not.toContain('sizes=');
  expect(html).not.toContain('width="1672"');
});

it('prioritizes only the first carousel cover', async () => {
  const container = await AstroContainer.create();
  const html = await container.renderToString(LatestArticlesCarousel, {
    props: {
      articles: [article, { ...article, id: 2, slug: 'zweiter-beitrag' }],
    },
  });
  expect(html.match(/loading="eager"/g)).toHaveLength(1);
  expect(html.match(/fetchpriority="high"/g)).toHaveLength(1);
  expect(html.match(/loading="lazy"/g)).toHaveLength(1);
});
