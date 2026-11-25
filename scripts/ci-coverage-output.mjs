import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';

if (!process.env.GITHUB_OUTPUT) {
  throw new Error(
    'GITHUB_OUTPUT fehlt; dieses Skript läuft nur in GitHub Actions.',
  );
}

let coverage = 'Keine Werte verfügbar';
try {
  const { total } = JSON.parse(
    readFileSync('coverage/coverage-summary.json', 'utf8'),
  );
  coverage = [
    'Scope: src/lib/**/*.ts (ohne generierte Typen; inklusive ungetesteter Dateien)',
    `Aussagen ${total.statements.pct} %`,
    `Zweige ${total.branches.pct} %`,
    `Funktionen ${total.functions.pct} %`,
    `Zeilen ${total.lines.pct} %`,
  ].join(' · ');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

appendFileSync(process.env.GITHUB_OUTPUT, `coverage=${coverage}\n`);
