import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import process from 'node:process';
import console from 'node:console';
import {
  EditorSetupError,
  readEditorCheckConfig,
  requireEditorAccount,
} from './lib/setup-editor.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => arg !== '--production')) {
    throw new EditorSetupError('Erlaubte Option: --production.');
  }
  const production = args.includes('--production');
  const env = loadEnv(production ? 'production' : 'development', process.cwd(), '');
  const config = readEditorCheckConfig(env, production);
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  await requireEditorAccount(client.auth.admin, config);
  console.log('Eigenes Redaktionskonto geprüft.');
} catch (error) {
  console.error(error instanceof EditorSetupError
    ? error.message
    : 'Kontoprüfung fehlgeschlagen. Auth-Dienst prüfen. Anleitung: docs/redaktionskonto.md');
  process.exitCode = 1;
}
