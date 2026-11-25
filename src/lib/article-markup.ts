export type InlinePart = {
  type: 'text' | 'strong' | 'emphasis' | 'link';
  text: string;
  href?: string;
};

export type ArticleBlock =
  | {
      type: 'paragraph' | 'heading-2' | 'heading-3' | 'quote';
      parts: InlinePart[];
    }
  | { type: 'unordered-list' | 'ordered-list'; items: InlinePart[][] }
  | { type: 'divider' };

const inlinePattern =
  /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function safeArticleHref(value: string) {
  if (value.startsWith('/') || value.startsWith('#')) return value;
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

export function parseInline(value: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let cursor = 0;

  for (const match of value.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    if (index > cursor)
      parts.push({ type: 'text', text: value.slice(cursor, index) });

    if (match[1]) parts.push({ type: 'strong', text: match[1] });
    else if (match[2]) parts.push({ type: 'emphasis', text: match[2] });
    else if (match[3] && match[4]) {
      const href = safeArticleHref(match[4]);
      parts.push(
        href
          ? { type: 'link', text: match[3], href }
          : { type: 'text', text: match[3] },
      );
    }
    cursor = index + match[0].length;
  }

  if (cursor < value.length)
    parts.push({ type: 'text', text: value.slice(cursor) });
  return parts;
}

export function parseArticleContent(content: string): ArticleBlock[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ArticleBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (/^---+$/.test(line)) {
      blocks.push({ type: 'divider' });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: heading[1].length === 2 ? 'heading-2' : 'heading-3',
        parts: parseInline(heading[2]),
      });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', parts: parseInline(quote.join(' ')) });
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      const items: InlinePart[][] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^[-*]\s+(.+)$/);
        if (!item) break;
        items.push(parseInline(item[1]));
        index += 1;
      }
      blocks.push({ type: 'unordered-list', items });
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      const items: InlinePart[][] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^\d+\.\s+(.+)$/);
        if (!item) break;
        items.push(parseInline(item[1]));
        index += 1;
      }
      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      const next = lines[index].trim();
      if (
        /^(#{2,3})\s+/.test(next) ||
        /^>\s?/.test(next) ||
        /^[-*]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        /^---+$/.test(next)
      )
        break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({
      type: 'paragraph',
      parts: parseInline(paragraph.join(' ')),
    });
  }

  return blocks;
}
