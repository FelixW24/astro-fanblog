import { Worker } from 'node:worker_threads';

interface SearchableArticle {
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  content: string;
}

export interface SearchResult<T> {
  articles: T[];
  error?: string;
}

const normalize = (text: string) =>
  text.normalize('NFC').toLocaleLowerCase('de-DE');

export async function searchArticles<T extends SearchableArticle>(
  articles: T[],
  query: string,
): Promise<SearchResult<T>> {
  const input = query.trim();
  if (!input) return { articles };
  if (input.length > 200)
    return {
      articles: [],
      error: 'Bitte beschränke deine Suche auf 200 Zeichen.',
    };
  const fields = articles.map((article) => [
    article.title,
    article.excerpt,
    article.category.replaceAll('-', ' '),
    ...article.tags,
    article.content,
  ]);
  if (!input.startsWith('/')) {
    const terms = normalize(input).split(/\s+/);
    return {
      articles: articles.filter((_, index) => {
        const text = normalize(fields[index].join('\n'));
        return terms.every((term) => text.includes(term));
      }),
    };
  }
  const expression = input.match(/^\/(.*)\/([imu]*)$/s);
  if (!expression)
    return {
      articles: [],
      error:
        'Nutze für reguläre Ausdrücke /muster/i. Erlaubte Optionen: i, m und u.',
    };
  const [, pattern, flags] = expression;
  try {
    new RegExp(pattern, flags);
  } catch {
    return {
      articles: [],
      error: 'Der reguläre Ausdruck ist ungültig. Bitte prüfe das Suchmuster.',
    };
  }
  // Run user patterns away from the server thread and terminate expensive matches.
  const matches = await new Promise<boolean[] | null>((resolve) => {
    const worker = new Worker(
      `
      const { parentPort, workerData } = require('node:worker_threads');
      const regex = new RegExp(workerData.pattern, workerData.flags);
      parentPort.postMessage(workerData.fields.map(values => values.some(value => regex.test(value))));
    `,
      { eval: true, workerData: { pattern, flags, fields } },
    );
    const finish = (result: boolean[] | null) => {
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), 500);
    worker.once('message', (result: boolean[]) => finish(result));
    worker.once('error', () => finish(null));
  });
  return matches
    ? { articles: articles.filter((_, index) => matches[index]) }
    : {
        articles: [],
        error:
          'Dieses Suchmuster benötigt zu viel Zeit. Bitte vereinfache den regulären Ausdruck.',
      };
}
