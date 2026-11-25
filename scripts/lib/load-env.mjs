import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Liest eine Env-Datei im dotenv-Format. Unterstützt werden Kommentare (#),
// ein optionaler export-Prefix sowie einfach und doppelt quotierte Werte.
// Ungültige Zeilen werden übersprungen statt abgebrochen.
export function parseEnvFile(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const entry = line.startsWith('export ')
      ? line.slice('export '.length)
      : line;
    const equals = entry.indexOf('=');
    if (equals < 1) continue;
    const key = entry.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    values[key] = parseEnvValue(entry.slice(equals + 1).trim());
  }
  return values;
}

function parseEnvValue(value) {
  const quote = value[0];
  if (quote === '"' || quote === "'") {
    if (value.length >= 2 && value.endsWith(quote)) {
      const inner = value.slice(1, -1);
      return quote === '"'
        ? inner.replace(/\\n/g, '\n').replace(/\\"/g, '"')
        : inner;
    }
  }
  const comment = value.indexOf(' #');
  return (comment === -1 ? value : value.slice(0, comment)).trim();
}

// Vite-Dateireihenfolge für den Produktionsmodus, aufsteigende Priorität.
// Build und Laufzeit lesen damit dieselben Dateien mit derselben Rangfolge.
const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
];

// Überträgt die Werte aus den Env-Dateien in die Prozessumgebung. Bereits
// gesetzte Variablen (systemd, Shell) gewinnen immer; Dateien werden in
// Vite-Priorität zusammengeführt. Zurückgegeben werden die Namen der
// tatsächlich gelesenen Dateien – niemals die Werte selbst.
export function loadServerEnv({
  root = join(here, '..', '..'),
  env = process.env,
  files = ENV_FILES,
} = {}) {
  const merged = {};
  const loaded = [];
  for (const name of files) {
    let text;
    try {
      text = readFileSync(join(root, name), 'utf8');
    } catch {
      continue;
    }
    loaded.push(name);
    Object.assign(merged, parseEnvFile(text));
  }
  for (const [key, value] of Object.entries(merged)) {
    if (env[key] === undefined) env[key] = value;
  }
  return loaded;
}
