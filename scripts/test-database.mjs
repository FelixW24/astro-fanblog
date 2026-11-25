import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

execFileSync(
  process.execPath,
  ['scripts/generate-blocklist-migration.mjs', '--check'],
  { stdio: 'inherit' },
);

// psql supports transactional multi-statement fixtures; CLI db query does not.
for (const file of [
  'security.sql',
  'player-deletion.sql',
  'player-availability.sql',
  'matches.sql',
  'readers.sql',
  'reader-avatar.sql',
  'player-profile-save.sql',
  'player-chart-templates.sql',
  'player-match-ratings.sql',
  'moderation.sql',
  'blocklist.sql',
  'reserved-usernames.sql',
  'profile-card.sql',
  'comment-rate-limit.sql',
  'article-notifications.sql',
  'ghost-mode.sql',
]) {
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_blog',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    {
      input: readFileSync(
        new URL(`../supabase/tests/${file}`, import.meta.url),
      ),
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
}

await import('./test-comment-concurrency.mjs');
