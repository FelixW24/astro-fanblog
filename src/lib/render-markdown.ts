import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { footnoteLabel: 'Fußnoten' })
  .use(rehypeSanitize)
  .use(rehypeStringify);

/** Shared by article and preview. Raw HTML is not enabled. */
export function renderMarkdown(content: string): string {
  return String(processor.processSync(content));
}
