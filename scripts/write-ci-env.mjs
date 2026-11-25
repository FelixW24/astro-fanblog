import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import process from 'node:process';

if (!process.env.GITHUB_ENV) {
  throw new Error(
    'GITHUB_ENV fehlt; dieses Skript läuft nur in GitHub Actions.',
  );
}

const status = JSON.parse(
  execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
);

if (status.API_URL !== 'http://127.0.0.1:55321' || !status.PUBLISHABLE_KEY) {
  throw new Error('Der lokale Supabase-Stack ist nicht bereit.');
}

appendFileSync(
  process.env.GITHUB_ENV,
  `PUBLIC_SUPABASE_URL=${status.API_URL}\nPUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}\nSITE_ORIGIN=http://127.0.0.1:4330\n`,
);
