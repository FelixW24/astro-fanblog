import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadServerEnv, parseEnvFile } from './lib/load-env.mjs';

describe('parseEnvFile', () => {
  it('liest Schlüssel, Werte, Kommentare und Quoting im dotenv-Format', () => {
    expect(
      parseEnvFile(
        [
          '# Kommentar',
          'HOST=mail.example.org',
          'LEER=',
          "SINGLE='wert mit # hash'",
          'DOUBLE="zeile 1\\nzeile 2"',
          'export EXPORTIERT=ja',
          'OHNE_GLEICHZEICHEN',
          '1INVALID=weg',
          'INLINE=wert  # rest ist kommentar',
          '',
        ].join('\n'),
      ),
    ).toEqual({
      HOST: 'mail.example.org',
      LEER: '',
      SINGLE: 'wert mit # hash',
      DOUBLE: 'zeile 1\nzeile 2',
      EXPORTIERT: 'ja',
      INLINE: 'wert',
    });
  });
});

describe('loadServerEnv', () => {
  it('lädt .env.local mit Vorrang vor .env in die Prozessumgebung', () => {
    const directory = mkdtempSync(join(tmpdir(), 'astro-fanblog-env-'));
    try {
      writeFileSync(join(directory, '.env'), 'FALLBACK=aus-env\nNUR_ENV=1\n');
      writeFileSync(
        join(directory, '.env.local'),
        'BUG_REPORT_SMTP_HOST=mail.example.org\nFALLBACK=aus-env-local\n',
      );
      const env: Record<string, string | undefined> = {
        FALLBACK: 'aus-prozess',
      };
      const loaded = loadServerEnv({ root: directory, env });
      expect(loaded).toEqual(['.env', '.env.local']);
      expect(env).toEqual({
        FALLBACK: 'aus-prozess',
        NUR_ENV: '1',
        BUG_REPORT_SMTP_HOST: 'mail.example.org',
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('akzeptiert fehlende Env-Dateien ohne Fehler', () => {
    const directory = mkdtempSync(join(tmpdir(), 'astro-fanblog-env-'));
    try {
      const env: Record<string, string | undefined> = {};
      const loaded = loadServerEnv({ root: directory, env });
      expect(loaded).toEqual([]);
      expect(env).toEqual({});
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
