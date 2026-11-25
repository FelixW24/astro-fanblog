interface ArticleMetadata {
  title: string;
  excerpt: string;
  author: string;
  published_at: string | null;
  tags: string[];
}

export function serializeJsonLd(value: unknown): string {
  // Editorial text must never be able to close the JSON-LD script element.
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function publicHttpUrl(
  value: string | null,
  base: string,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function websiteStructuredData(
  canonical: string,
  title: string,
  description: string,
) {
  const origin = new URL(canonical).origin;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': origin + '/#organization',
        name: 'Astro Fanblog',
        url: origin + '/',
      },
      {
        '@type': 'WebSite',
        '@id': origin + '/#website',
        name: 'Astro Fanblog',
        url: origin + '/',
        inLanguage: 'de-DE',
        publisher: { '@id': origin + '/#organization' },
      },
      {
        '@type': 'WebPage',
        '@id': canonical + '#webpage',
        url: canonical,
        name: title,
        description,
        inLanguage: 'de-DE',
        isPartOf: { '@id': origin + '/#website' },
      },
    ],
  };
}

export function articleStructuredData(
  article: ArticleMetadata,
  canonical: string,
  image: string,
  sources: string[],
) {
  const origin = new URL(canonical).origin;
  const publicImage = publicHttpUrl(image, canonical);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': canonical + '#article',
    url: canonical,
    mainEntityOfPage: { '@id': canonical + '#webpage' },
    headline: article.title,
    description: article.excerpt,
    inLanguage: 'de-DE',
    author: {
      '@type': /^(Astro Fanblog|Redaktion(?: Astro Fanblog)?)$/i.test(
        article.author.trim(),
      )
        ? 'Organization'
        : 'Person',
      name: article.author,
    },
    publisher: { '@id': origin + '/#organization' },
    ...(article.published_at ? { datePublished: article.published_at } : {}),
    ...(publicImage ? { image: [publicImage] } : {}),
    ...(article.tags.length ? { keywords: article.tags } : {}),
    ...(sources.length
      ? {
          citation: sources.flatMap((source) => {
            const url = publicHttpUrl(source, canonical);
            return url ? [url] : [];
          }),
        }
      : {}),
    isAccessibleForFree: true,
  };
}

interface PlayerMetadata {
  name: string;
  date_of_birth: string | null;
  height_cm: number | null;
  bio: string | null;
}

export function playerStructuredData(player: PlayerMetadata, canonical: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': canonical + '#person',
    url: canonical,
    name: player.name,
    mainEntityOfPage: { '@id': canonical + '#webpage' },
    ...(player.bio ? { description: player.bio } : {}),
    ...(player.date_of_birth ? { birthDate: player.date_of_birth } : {}),
    ...(player.height_cm ? { height: player.height_cm + ' cm' } : {}),
  };
}
