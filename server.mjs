// Produktionsstart des gebauten Servers. Lädt zuerst die zentrale Env-Datei
// (.env.local, Fallback .env) in den Prozess und startet danach den
// Standalone-Server. Ein direkter Aufruf `node dist/server/entry.mjs` umgeht
// das Laden und die npm-Startprüfung; immer `npm start` verwenden.
import console from 'node:console';
import { loadServerEnv } from './scripts/lib/load-env.mjs';

const files = loadServerEnv();
if (files.length > 0) {
  console.log(`astro-fanblog env: ${files.join(', ')} geladen`);
}
await import('./dist/server/entry.mjs');
