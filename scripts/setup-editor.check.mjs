import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import process from 'node:process';
import {
  readEditorCheckConfig,
  readEditorSetupConfig,
  requireEditorAccount,
  setupEditor,
} from './lib/setup-editor.mjs';

const env = {
  PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321',
  SUPABASE_AUTH_SECRET_KEY: 'test-secret',
  ADMIN_EMAIL: ' Editor@my-blog.org ',
  ADMIN_PASSWORD: 'Local-test-password-123!',
};
const config = readEditorSetupConfig(env);
const editor = {
  id: 'editor-id',
  email: config.email,
  app_metadata: { is_editor: true, is_admin: true },
  email_confirmed_at: '2026-10-18T12:00:00Z',
};

function fakeAdmin(pages = [[]]) {
  const calls = [];
  return {
    calls,
    async listUsers({ page, perPage }) {
      calls.push(['list', page, perPage]);
      return { data: { users: pages[page - 1] ?? [] }, error: null };
    },
    async createUser(attributes) {
      calls.push(['create', attributes]);
      return { data: { user: editor }, error: null };
    },
    async getUserById(id) {
      calls.push(['verify', id]);
      return { data: { user: editor }, error: null };
    },
    async updateUserById(id, attributes) {
      calls.push(['update', id, attributes]);
      return {
        data: {
          user: {
            ...editor,
            ...attributes,
            app_metadata: attributes.app_metadata,
          },
        },
        error: null,
      };
    },
  };
}

test('normalizes email without trimming the password', () => {
  assert.equal(config.email, 'editor@my-blog.org');
  assert.equal(readEditorSetupConfig({ ...env, ADMIN_PASSWORD: '  long-password  ' }).password, '  long-password  ');
});

test('rejects incomplete config, placeholders and unsafe targets before connecting', () => {
  for (const patch of [
    { ADMIN_EMAIL: '' },
    { ADMIN_EMAIL: 'invalid' },
    { ADMIN_EMAIL: 'redaktion@example.com' },
    { ADMIN_PASSWORD: 'short' },
    { ADMIN_PASSWORD: 'ein-langes-zufaelliges-passwort' },
    { SUPABASE_AUTH_SECRET_KEY: '' },
    { PUBLIC_SUPABASE_URL: '' },
    { PUBLIC_SUPABASE_URL: 'https://secret:password@my-blog.org' },
    { PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321/auth/v1' },
    { PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321?secret=value' },
    { PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321#secret' },
    { PUBLIC_SUPABASE_URL: 'https://my-blog.org' },
  ]) assert.throws(() => readEditorSetupConfig({ ...env, ...patch }));
  assert.throws(() => readEditorSetupConfig({ ...env, PUBLIC_SUPABASE_URL: 'http://my-blog.org' }, true));
  assert.equal(readEditorSetupConfig({ ...env, PUBLIC_SUPABASE_URL: 'https://my-blog.org' }, true).url, 'https://my-blog.org');
});

test('creates a confirmed editor and admin and reads back the stored account', async () => {
  const admin = fakeAdmin();
  assert.equal(await setupEditor(admin, config), 'created');
  assert.deepEqual(admin.calls, [
    ['list', 1, 100],
    ['create', { email: config.email, password: config.password, email_confirm: true, app_metadata: { is_editor: true, is_admin: true } }],
    ['verify', editor.id],
  ]);
});

test('finds existing editors on later pages without changing credentials or MFA', async () => {
  const admin = fakeAdmin([
    Array.from({ length: 100 }, (_, index) => ({ email: `reader${index}@my-blog.org` })),
    [{ ...editor, email: ' EDITOR@MY-BLOG.ORG ' }],
  ]);
  assert.equal(await setupEditor(admin, config), 'existing');
  assert.deepEqual(admin.calls, [['list', 1, 100], ['list', 2, 100]]);
});

test('marks an existing editor account explicitly as admin', async () => {
  const admin = fakeAdmin([
    [{ ...editor, app_metadata: { is_editor: true, provider: 'email' } }],
  ]);
  assert.equal(await setupEditor(admin, config), 'existing');
  assert.deepEqual(admin.calls, [
    ['list', 1, 100],
    ['update', editor.id, { app_metadata: { is_editor: true, provider: 'email', is_admin: true } }],
  ]);
});

test('fails when the admin flag cannot be persisted on an existing account', async () => {
  const admin = fakeAdmin([
    [{ ...editor, app_metadata: { is_editor: true } }],
  ]);
  admin.updateUserById = async () => ({ data: null, error: { message: 'upstream' } });
  await assert.rejects(setupEditor(admin, config), /Admin-Recht konnte nicht gesetzt werden/);
});

test('does not promote an existing reader', async () => {
  const admin = fakeAdmin([[{ ...editor, app_metadata: { is_editor: false }, user_metadata: { is_editor: true } }]]);
  await assert.rejects(setupEditor(admin, config), /ohne Redaktionsrechte/);
  assert.equal(admin.calls.length, 1);
});

test('fails closed when listing fails, without attempting creation', async () => {
  const admin = fakeAdmin();
  admin.listUsers = async () => ({ data: null, error: { message: 'sensitive upstream details' } });
  await assert.rejects(setupEditor(admin, config), /Kontoprüfung fehlgeschlagen/);
  assert.deepEqual(admin.calls, []);
});

test('creation errors never fall back to updating an account', async () => {
  const admin = fakeAdmin();
  admin.createUser = async () => ({ data: null, error: { message: 'duplicate or concurrent creation' } });
  await assert.rejects(setupEditor(admin, config), /nicht angelegt/);
  assert.deepEqual(admin.calls, [['list', 1, 100]]);
});

test('reports failed verification after creation', async () => {
  for (const result of [
    { data: null, error: { message: 'unavailable' } },
    { data: { user: { ...editor, app_metadata: {} } }, error: null },
    { data: { user: { ...editor, app_metadata: { is_editor: true } } }, error: null },
    { data: { user: { ...editor, email: 'wrong@my-blog.org' } }, error: null },
    { data: { user: { ...editor, email_confirmed_at: null } }, error: null },
  ]) {
    const admin = fakeAdmin();
    admin.getUserById = async () => result;
    await assert.rejects(setupEditor(admin, config), /Konto wurde angelegt/);
  }
});

test('startup check needs no stored admin password', async () => {
  const check = readEditorCheckConfig({ ...env, ADMIN_PASSWORD: '' });
  assert.equal('password' in check, false);
  const admin = fakeAdmin([[editor]]);
  await requireEditorAccount(admin, check);
  assert.deepEqual(admin.calls, [['list', 1, 100]]);
});

test('startup stops with setup instructions when the account is missing or unusable', async () => {
  for (const users of [
    [],
    [{ ...editor, app_metadata: {}, user_metadata: { is_editor: true } }],
    [{ ...editor, email_confirmed_at: null }],
    [{ ...editor, banned_until: '2999-01-01T00:00:00Z' }],
    [{ ...editor, id: '10000000-0000-0000-0000-000000000001' }],
    [{ ...editor, email: 'another@my-blog.org' }],
  ]) {
    const admin = fakeAdmin([users]);
    await assert.rejects(requireEditorAccount(admin, config), /Start abgebrochen.*npm run admin:setup/);
    assert.equal(admin.calls.length, 1);
  }
});

test('the bundled example admin cannot satisfy the configuration', () => {
  assert.throws(() => readEditorCheckConfig({ ...env, ADMIN_EMAIL: 'admin@fanblog.local' }), /Beispielkonto/);
});

test('startup searches later pages and tolerates expired bans', async () => {
  const admin = fakeAdmin([
    Array.from({ length: 100 }, (_, index) => ({ email: `reader${index}@my-blog.org` })),
    [{ ...editor, banned_until: '2020-01-01T00:00:00Z' }],
  ]);
  await requireEditorAccount(admin, config);
  assert.deepEqual(admin.calls, [['list', 1, 100], ['list', 2, 100]]);
});

test('startup stops on Auth errors instead of trusting a local marker', async () => {
  const admin = fakeAdmin();
  admin.listUsers = async () => ({ data: null, error: { message: 'secret upstream details' } });
  await assert.rejects(requireEditorAccount(admin, config), /Kontoprüfung fehlgeschlagen/);
  assert.deepEqual(admin.calls, []);
});

test('npm dev, preview and start stop before launching when their account check fails', () => {
  const project = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const target of ['dev', 'preview', 'start']) {
    for (const fail of [false, true]) {
      const directory = mkdtempSync(join(tmpdir(), 'editor-start-'));
      try {
        writeFileSync(join(directory, 'package.json'), JSON.stringify({
          type: 'module',
          scripts: {
            [`pre${target}`]: project.scripts[`pre${target}`],
            'admin:check': 'node check.mjs',
            'check:migrations': 'node migrations.mjs',
            [target]: 'node launch.mjs',
          },
        }));
        writeFileSync(join(directory, 'check.mjs'), `process.exit(${fail ? 1 : 0});`);
        writeFileSync(join(directory, 'migrations.mjs'), 'process.exit(0);');
        writeFileSync(join(directory, 'launch.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('launched', 'yes');");
        const result = spawnSync('npm', ['run', target], {
          cwd: directory,
          encoding: 'utf8',
          env: { ...process.env, npm_config_ignore_scripts: 'false' },
        });
        assert.equal(result.status, fail ? 1 : 0, result.stderr);
        assert.equal(existsSync(join(directory, 'launched')), !fail);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  }
});
