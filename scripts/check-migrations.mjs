// Prüft vor dem Produktionsstart, ob alle lokalen Migrationen in der
// Zieldatenbank angewendet sind, und wendet fehlende auf sicheren Wegen
// automatisch an. Läuft über `prestart` bei jedem `npm start`, bevor der
// Server online geht.
//
// Modi:
// - Default: fehlende Migrationen werden angewendet (nur fehlende, strikt
//   aufsteigend, jede in eigener Transaktion mit Versionseintrag, Advisory
//   Lock gegen parallele Starts, statement_timeout gegen Hänger). Bei einem
//   Fehler wird abgebrochen und der Start blockiert (Exit 1).
// - --no-apply oder MIGRATIONS_AUTO_APPLY=0: reiner Check, fehlende
//   Migrationen blockieren mit Exit 1.
// - --dry-run: nur anzeigen, welche Migrationen angewendet würden.
//
// Ohne SUPABASE_DB_URL/DATABASE_URL wird der Check übersprungen.
import console from 'node:console';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { loadServerEnv } from './lib/load-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');
// Session-Advisory-Lock, damit zwei gleichzeitige Starts nicht parallel migrieren.
const MIGRATION_LOCK_ID = 48012026;
const STATEMENT_TIMEOUT_MS = 120_000;

// Versionstempel aller lokalen Migrationen, sortiert. Supabase speichert in
// schema_migrations nur den führenden Timestamp (z. B. 20260831113608), nicht
// den beschreibenden Dateinamen-Suffix.
export function localMigrationVersions(dir = migrationsDir) {
  return readdirSync(dir)
    .map((file) => file.match(/^(\d{14})[^/]*\.sql$/)?.[1])
    .filter((version) => version !== undefined)
    .sort();
}

// Lokale Versionen, die in der Datenbank noch nicht angewendet sind.
export function findMissingMigrations(localVersions, appliedVersions) {
  const applied = new Set(appliedVersions);
  return localVersions.filter((version) => !applied.has(version));
}

// Liest Datei und SQL einer Migration anhand ihres Versionsstempels.
export function readMigration(version, dir = migrationsDir) {
  const file = readdirSync(dir).find(
    (name) => name.startsWith(`${version}_`) && name.endsWith('.sql'),
  );
  if (!file) return null;
  return { version, file, sql: readFileSync(join(dir, file), 'utf8') };
}

// Auto-Apply ist default an; --no-apply oder MIGRATIONS_AUTO_APPLY=0 schaltet
// ihn ab (reiner Check, fehlende Migrationen blockieren den Start).
/**
 * @param {{ args?: string[], env?: NodeJS.ProcessEnv }} [options]
 */
export function shouldAutoApply({ args = [], env = process.env } = {}) {
  if (args.includes('--no-apply')) return false;
  const flag = env.MIGRATIONS_AUTO_APPLY?.trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'no' || flag === 'off') {
    return false;
  }
  return true;
}

function createClient(connectionString) {
  const { hostname } = new URL(connectionString);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  return {
    connectionString,
    connectionTimeoutMillis: 5000,
    options: `-c statement_timeout=${STATEMENT_TIMEOUT_MS}`,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  };
}

// Liest die angewendeten Versionen aus supabase_migrations.schema_migrations.
// Eine noch fehlende Tabelle (42P01) bedeutet: keine Migration angewendet.
export async function appliedMigrationVersions(connectionString) {
  const { Client } = await import('pg');
  const client = new Client(createClient(connectionString));
  await client.connect();
  try {
    const result = await client.query(
      'SELECT version FROM supabase_migrations.schema_migrations',
    );
    return result.rows.map((row) => String(row.version));
  } catch (error) {
    if (error?.code === '42P01') return [];
    throw error;
  } finally {
    await client.end();
  }
}

// Wendet die fehlenden Migrationen einzeln und atomar an: pro Migration eine
// Transaktion inklusive Versionseintrag, danach Advisory Lock freigeben. Bei
// einem Fehler bleibt die Transaktion zurückgerollt; bereits angewendete
// Migrationen bleiben bestehen (nächster Lauf ist idempotent).
export async function applyMissingMigrations(
  connectionString,
  missing,
  { dir = migrationsDir, log = console.log } = {},
) {
  const { Client } = await import('pg');
  const client = new Client(createClient(connectionString));
  await client.connect();
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
  try {
    for (const version of missing) {
      const migration = readMigration(version, dir);
      if (!migration) {
        throw new Error(`Keine Datei für Migration ${version} gefunden`);
      }
      log(`migrations: wende ${version} (${migration.file}) an`);
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1)',
          [version],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(
          `Migration ${version} (${migration.file}) fehlgeschlagen: ${error?.message ?? error}`,
          { cause: error },
        );
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    await client.end();
  }
}

export async function main({
  env = process.env,
  args = [],
  log = console.log,
  error = console.error,
  loadEnv = true,
} = {}) {
  if (loadEnv) loadServerEnv({ env });
  const connectionString = env.SUPABASE_DB_URL ?? env.DATABASE_URL;
  if (!connectionString) {
    log(
      'migrations: SUPABASE_DB_URL nicht gesetzt, Check übersprungen ' +
        '(lokal genügt npm run supabase:reset)',
    );
    return 0;
  }

  const local = localMigrationVersions();
  let applied;
  try {
    applied = await appliedMigrationVersions(connectionString);
  } catch (err) {
    error(
      `migrations: Check nicht möglich (${err?.message ?? err}); ` +
        'Server startet trotzdem, bitte manuell prüfen',
    );
    // Ein nicht erreichbarer Check darf den Start nicht blockieren.
    return 0;
  }

  const missing = findMissingMigrations(local, applied);
  if (missing.length === 0) {
    log(`migrations: alle ${local.length} Migrationen angewendet`);
    return 0;
  }

  if (args.includes('--dry-run')) {
    log(
      `migrations: Trockenlauf, ${missing.length} Migration(en) würden angewendet:\n` +
        missing.map((version) => `  - ${version}`).join('\n'),
    );
    return 0;
  }

  if (!shouldAutoApply({ args, env })) {
    error(
      `migrations: ${missing.length} lokale Migration(en) fehlen in der Datenbank:\n` +
        missing.map((version) => `  - ${version}`).join('\n') +
        '\nAuto-Apply deaktiviert (--no-apply oder MIGRATIONS_AUTO_APPLY=0); ' +
        'bitte manuell einspielen, dann erneut starten.',
    );
    return 1;
  }

  log(`migrations: ${missing.length} Migration(en) fehlen, Auto-Apply gestartet`);
  try {
    await applyMissingMigrations(connectionString, missing, { log });
  } catch (err) {
    error(
      `migrations: Auto-Apply abgebrochen (${err?.message ?? err}). ` +
        'Bereits angewendete Migrationen bleiben bestehen; bitte Ursache prüfen ' +
        '(Backup siehe docs/freigabe-1.0.md) und erneut starten.',
    );
    return 1;
  }

  const after = await appliedMigrationVersions(connectionString);
  const stillMissing = findMissingMigrations(local, after);
  if (stillMissing.length > 0) {
    error(
      `migrations: ${stillMissing.length} Migration(en) fehlen weiterhin:\n` +
        stillMissing.map((version) => `  - ${version}`).join('\n'),
    );
    return 1;
  }
  log(`migrations: alle ${local.length} Migrationen angewendet`);
  return 0;
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  process.exitCode = await main({ args: process.argv.slice(2) });
}
