import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  findMissingMigrations,
  localMigrationVersions,
  main,
  readMigration,
  shouldAutoApply,
} from './check-migrations.mjs';

const tempDirs: string[] = [];

function makeMigrationsDir(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'astro-fanblog-migrations-'));
  tempDirs.push(dir);
  for (const file of files) writeFileSync(join(dir, file), '-- sql\n');
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('liest lokale Migrationsversionen sortiert aus den Dateinamen', () => {
  const dir = makeMigrationsDir([
    '20260902000000_second.sql',
    '20260901000000_first.sql',
    'notes.txt',
  ]);
  expect(localMigrationVersions(dir)).toEqual([
    '20260901000000',
    '20260902000000',
  ]);
});

it('findet nur die lokalen Versionen, die in der Datenbank fehlen', () => {
  const local = ['20260901000000', '20260902000000', '20260903000000'];
  const applied = ['20260901000000', '20260902000000'];
  expect(findMissingMigrations(local, applied)).toEqual(['20260903000000']);
  expect(findMissingMigrations(local, local)).toEqual([]);
  expect(findMissingMigrations(local, [])).toEqual(local);
});

it('überspringt den Check ohne Datenbank-URL mit Exit-Code 0', async () => {
  const env: NodeJS.ProcessEnv = {};
  const logs: string[] = [];
  const code = await main({ env, log: (line) => logs.push(String(line)), loadEnv: false });
  expect(code).toBe(0);
  expect(logs.join('\n')).toContain('übersprungen');
});

it('hat im echten Migrationsverzeichnis mindestens eine Migration', () => {
  const versions = localMigrationVersions();
  expect(versions.length).toBeGreaterThan(0);
  expect(versions).toEqual([...versions].sort());
  expect(versions.every((v) => /^\d{14}$/.test(v))).toBe(true);
});

it('liest Datei und SQL einer Migration anhand des Versionsstempels', () => {
  const dir = makeMigrationsDir(['20260901000000_first.sql']);
  const migration = readMigration('20260901000000', dir);
  expect(migration?.file).toBe('20260901000000_first.sql');
  expect(migration?.sql).toContain('-- sql');
  expect(readMigration('20990101000000', dir)).toBeNull();
});

it('Auto-Apply ist default an und per Flag oder Env abschaltbar', () => {
  expect(shouldAutoApply({ args: [], env: {} })).toBe(true);
  expect(shouldAutoApply({ args: ['--no-apply'], env: {} })).toBe(false);
  expect(shouldAutoApply({ args: [], env: { MIGRATIONS_AUTO_APPLY: '0' } })).toBe(false);
  expect(shouldAutoApply({ args: [], env: { MIGRATIONS_AUTO_APPLY: 'false' } })).toBe(false);
  expect(shouldAutoApply({ args: [], env: { MIGRATIONS_AUTO_APPLY: '1' } })).toBe(true);
});
