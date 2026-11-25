import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import process from 'node:process';
import console from 'node:console';
import { EditorSetupError, readEditorSetupConfig, setupEditor } from './lib/setup-editor.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('npm run admin:setup [-- --production]\nLiest .env.local und Server-Umgebungsvariablen. Anleitung: docs/redaktionskonto.md');
} else {
  try {
    if (args.some((arg) => arg !== '--production') || args.length > 1) {
      throw new EditorSetupError('Erlaubte Option: --production. Keine Zugangsdaten als Argumente übergeben.');
    }
    const production = args.includes('--production');
    const env = loadEnv(production ? 'production' : 'development', process.cwd(), '');
    const config = readEditorSetupConfig(env, production);
    const client = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const result = await setupEditor(client.auth.admin, config);
    console.log(result === 'created'
      ? 'Redaktionskonto angelegt und geprüft. Unter /admin/login anmelden und Zwei-Faktor-Authentifizierung einrichten.'
      : 'Redaktionskonto existiert bereits. Passwort, E-Mail und Rechte bleiben unverändert.');
  } catch (error) {
    // Do not print raw SDK errors: these may contain credentials or request details.
    console.error(error instanceof EditorSetupError
      ? error.message
      : 'Redaktionseinrichtung fehlgeschlagen. Konfiguration und Auth-Dienst prüfen. Anleitung: docs/redaktionskonto.md');
    process.exitCode = 1;
  }
}
