import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from 'vite';
import process from 'node:process';
import console from 'node:console';
import { randomUUID } from 'node:crypto';

const env = loadEnv('development', process.cwd(), '');
if (env.PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:55321') {
  throw new Error(
    'Dieses Skript konfiguriert ausschließlich die lokale Blog-Datenbank.',
  );
}
const email = (process.argv[2] ?? env.ADMIN_EMAIL)?.trim().toLowerCase();
if (!email) throw new Error('ADMIN_EMAIL fehlt.');
const literal = "'" + email.replaceAll("'", "''") + "'";
const delimiter = '$configure_' + randomUUID().replaceAll('-', '') + '$';
const directory = mkdtempSync(join(tmpdir(), 'blog-editor-'));
try {
  const file = join(directory, 'configure.sql');
  writeFileSync(
    file,
    `do ${delimiter}
  declare editor_id uuid;
  begin
    select id into strict editor_id from auth.users
      where lower(btrim(email)) = ${literal};
    update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_editor":true,"is_admin":true}'::jsonb
      where id = editor_id;
  end ${delimiter};`,
    { mode: 0o600 },
  );
  execFileSync(
    'node_modules/.bin/supabase',
    ['db', 'query', '--file', file],
    { stdio: 'pipe' },
  );
  console.log('Lokales Redaktionskonto für die Datenbank freigeschaltet.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
