const defaultCoverAlt =
  'Illustration eines Fußballstadions in Rot und Dunkelblau – Astro Fanblog';

/**
 * Vorgerenderte Varianten des Standardcovers. Im Datensparmodus liefern wir
 * serverseitig die kleine Variante aus (480w statt bis 1672w, bzw. 800w als
 * Hero), damit Above-the-fold-Bilder deutlich weniger Daten kosten.
 */
export const articleDefaultCovers = {
  full: {
    src: '/images/article-default.webp',
    srcset:
      '/images/article-default-480.webp 480w, /images/article-default-800.webp 800w, /images/article-default-1200.webp 1200w, /images/article-default.webp 1672w',
    width: 1672,
    height: 941,
  },
  compact: {
    src: '/images/article-default-480.webp',
    srcset: '/images/article-default-480.webp 480w',
    width: 480,
    height: 270,
  },
  compactHero: {
    src: '/images/article-default-800.webp',
    srcset: '/images/article-default-800.webp 800w',
    width: 800,
    height: 450,
  },
} as const;

export type ArticleCover = {
  src: string;
  srcset?: string;
  width?: number;
  height?: number;
  alt: string;
  isDefault: boolean;
};

export function articleCover(
  article: {
    cover_image_url: string | null;
    cover_image_alt: string | null;
    cover_disabled?: boolean | null;
    title: string;
  },
  options: { compact?: boolean; hero?: boolean } = {},
): ArticleCover | null {
  // Redaktionell deaktiviertes Titelbild: Der Beitrag hat bewusst kein Bild.
  if (article.cover_disabled) return null;
  const src = article.cover_image_url?.trim();
  if (src) {
    return {
      src,
      alt: article.cover_image_alt?.trim() || article.title,
      isDefault: false,
    };
  }
  const preset = options.compact
    ? options.hero
      ? articleDefaultCovers.compactHero
      : articleDefaultCovers.compact
    : articleDefaultCovers.full;
  return { ...preset, alt: defaultCoverAlt, isDefault: true };
}
