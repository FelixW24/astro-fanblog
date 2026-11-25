export type MarkdownImport = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category?: string;
  author?: string;
  tags: string[];
  seoTitle?: string;
  seoDescription?: string;
  coverImageUrl?: string;
  coverImageAlt?: string;
  sourceUrls: string[];
  warnings: string[];
};

type Frontmatter = Record<string, string | string[]>;

const aliases = {
  title: ['title', 'titel'],
  excerpt: ['excerpt', 'teaser', 'description', 'beschreibung', 'summary'],
  slug: ['slug'],
  category: ['category', 'kategorie', 'rubrik'],
  author: ['author', 'autor'],
  tags: ['tags', 'schlagwoerter', 'schlagwörter'],
  seoTitle: ['seo_title', 'seotitle'],
  seoDescription: ['seo_description', 'seodescription'],
  coverImageUrl: ['cover_image_url', 'cover', 'image', 'bild'],
  coverImageAlt: ['cover_image_alt', 'cover_alt', 'image_alt', 'bild_alt'],
  sourceUrls: ['source_urls', 'sources', 'quellen'],
} as const;

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase('de-DE').replace(/[ -]+/g, '_');
}

function scalar(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).replace(/\\([\\"'])/g, '$1');
  }
  return trimmed;
}

function inlineList(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  return trimmed.slice(1, -1).split(',').map(scalar).filter(Boolean);
}

function parseFrontmatter(source: string): {
  data: Frontmatter;
  body: string;
  warning?: string;
} {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0]?.trim() !== '---') return { data: {}, body: normalized };

  const end = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---',
  );
  if (end === -1) {
    return {
      data: {},
      body: normalized,
      warning: 'Das YAML-Frontmatter hat keinen schließenden --- Trenner.',
    };
  }

  const data: Frontmatter = {};
  const frontmatter = lines.slice(1, end);
  for (let index = 0; index < frontmatter.length; index += 1) {
    const match = /^([^:#][^:]*):(?:\s*(.*))?$/.exec(frontmatter[index]);
    if (!match) continue;
    const key = normalizeKey(match[1]);
    const value = match[2]?.trim() ?? '';

    if (value === '|' || value === '>') {
      const values: string[] = [];
      while (
        index + 1 < frontmatter.length &&
        /^\s+/.test(frontmatter[index + 1])
      ) {
        values.push(frontmatter[index + 1].trim());
        index += 1;
      }
      data[key] = values.join(value === '|' ? '\n' : ' ').trim();
      continue;
    }

    const list = inlineList(value);
    if (list) {
      data[key] = list;
      continue;
    }

    if (!value) {
      const values: string[] = [];
      while (index + 1 < frontmatter.length) {
        const item = /^\s*-\s+(.+)$/.exec(frontmatter[index + 1]);
        if (!item) break;
        values.push(scalar(item[1]));
        index += 1;
      }
      data[key] = values;
      continue;
    }

    data[key] = scalar(value);
  }

  return { data, body: lines.slice(end + 1).join('\n') };
}

function getValue(data: Frontmatter, keys: readonly string[]) {
  for (const key of keys) {
    const value = data[normalizeKey(key)];
    if (Array.isArray(value)) return value.join(', ');
    if (value) return value;
  }
  return '';
}

function getList(data: Frontmatter, keys: readonly string[]) {
  for (const key of keys) {
    const value = data[normalizeKey(key)];
    if (Array.isArray(value)) return value;
    if (value)
      return value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
  }
  return [];
}

function unique(values: string[], limit: number) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLocaleLowerCase('de-DE');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function stripMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/!?\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_match, target, label) =>
      String(label || target),
    )
    .replace(/[*_~`>#]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  const shortened = value.slice(0, max - 1);
  const wordBoundary = shortened.lastIndexOf(' ');
  return `${shortened.slice(0, wordBoundary > max * 0.65 ? wordBoundary : undefined).trim()}…`;
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function categorySlug(value: string) {
  const normalized = slugify(value);
  const categories: Record<string, string> = {
    'spielbericht-analyse': 'spielbericht-analyse',
    'spielberichte-analyse': 'spielbericht-analyse',
    analyse: 'spielbericht-analyse',
    news: 'news',
    'pk-zusammenfassung': 'pk-zusammenfassung',
    'pk-kompakt': 'pk-zusammenfassung',
    pressekonferenz: 'pk-zusammenfassung',
    transfer: 'transfer',
    transfers: 'transfer',
    weiteres: 'weiteres',
    more: 'weiteres',
  };
  return categories[normalized];
}

function firstParagraph(content: string) {
  const blocks = content.split(/\n\s*\n/);
  const paragraph = blocks.find((block) => {
    const line = block.trim();
    return line && !/^(#{1,6}\s|[-*+]\s|\d+\.\s|>|---+$|!\[|```)/.test(line);
  });
  return paragraph ? stripMarkdown(paragraph.replace(/\n/g, ' ')) : '';
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseMarkdownImport(
  source: string,
  filename = 'Unbenannter Beitrag.md',
): MarkdownImport {
  const { data, warning, body } = parseFrontmatter(source);
  const warnings = warning ? [warning] : [];
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const firstContentLine = lines.findIndex((line) => line.trim());
  const heading =
    firstContentLine >= 0
      ? /^#\s+(.+)$/.exec(lines[firstContentLine].trim())
      : null;
  if (heading) lines.splice(firstContentLine, 1);

  const content = lines.join('\n').trim();
  const filenameTitle = filename
    .replace(/\.(?:md|markdown|txt)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  const title = truncate(
    stripMarkdown(
      getValue(data, aliases.title) || heading?.[1] || filenameTitle,
    ),
    180,
  );
  const excerpt = truncate(
    stripMarkdown(getValue(data, aliases.excerpt)) || firstParagraph(content),
    360,
  );
  const requestedCategory = getValue(data, aliases.category);
  const category = categorySlug(requestedCategory);
  if (requestedCategory && !category)
    warnings.push(
      `Die Kategorie „${requestedCategory}“ ist unbekannt und wurde nicht übernommen.`,
    );
  if (/!\[\[[^\]]+\]\]/.test(content))
    warnings.push(
      'Lokale Obsidian-Anhänge wurden nicht hochgeladen. Ergänze dafür öffentliche Bild-URLs.',
    );
  if (/\[\[[^\]]+\]\]/.test(content))
    warnings.push(
      'Obsidian-Wikilinks bleiben als Text erhalten und müssen bei Bedarf in Weblinks umgewandelt werden.',
    );

  const coverImageUrl = getValue(data, aliases.coverImageUrl);
  if (coverImageUrl && !isHttpUrl(coverImageUrl))
    warnings.push(
      'Das Titelbild wurde nicht übernommen, weil es keine öffentliche HTTP(S)-URL ist.',
    );

  const sourceUrls = unique(getList(data, aliases.sourceUrls), 10).filter(
    isHttpUrl,
  );
  const suppliedSources = getList(data, aliases.sourceUrls);
  if (sourceUrls.length !== unique(suppliedSources, 10).length)
    warnings.push('Ungültige Quellen-URLs wurden ausgelassen.');

  return {
    title,
    slug: slugify(getValue(data, aliases.slug) || title),
    excerpt,
    content,
    category,
    author: getValue(data, aliases.author) || undefined,
    tags: unique(
      getList(data, aliases.tags).map((tag) => tag.replace(/^#/, '')),
      10,
    ),
    seoTitle: getValue(data, aliases.seoTitle) || undefined,
    seoDescription: getValue(data, aliases.seoDescription) || undefined,
    coverImageUrl:
      coverImageUrl && isHttpUrl(coverImageUrl) ? coverImageUrl : undefined,
    coverImageAlt: getValue(data, aliases.coverImageAlt) || undefined,
    sourceUrls,
    warnings,
  };
}
