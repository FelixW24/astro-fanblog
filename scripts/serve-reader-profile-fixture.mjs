import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { dev } from 'astro';

const target = new URL('../src/pages/reader-ui-fixture.astro', import.meta.url);
const fixture = await readFile(
  new URL('../e2e/fixtures/reader-ui.astro', import.meta.url),
  'utf8',
);
const content = fixture.replaceAll('../../src/', '../');
if (existsSync(target) && (await readFile(target, 'utf8')) !== content)
  throw new Error('Refusing to overwrite an existing route.');
await writeFile(target, content);
process.env.READER_UI_FIXTURE = '1';
process.env.PLAYWRIGHT_TEST = '1';
let server;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server?.stop();
  await unlink(target).catch(() => {});
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
try {
  server = await dev({
    root: new URL('..', import.meta.url),
    server: { host: '127.0.0.1', port: 4341 },
    devToolbar: { enabled: false },
  });
} catch (error) {
  await stop();
  throw error;
}
