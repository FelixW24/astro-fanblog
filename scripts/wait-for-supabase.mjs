import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';

const timeoutSeconds = Number(process.argv[2] ?? 120);
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  throw new Error('Der Supabase-Timeout muss eine positive Sekundenzahl sein.');
}
const deadline = Date.now() + timeoutSeconds * 1000;
const url = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:55321';
const healthUrl = new URL('/auth/v1/health', url);
console.log(`Warte maximal ${timeoutSeconds}s auf Supabase (${healthUrl.origin}) ...`);

while (Date.now() < deadline) {
  try {
    // The local launcher verifies Docker configuration and completes auth
    // hardening before it prints the success line. A healthy HTTP endpoint
    // alone cannot attest that this post-start setup has finished.
    const containers = execFileSync('docker', ['inspect', '--format', '{{.State.Running}}', 'supabase_auth_blog', 'supabase_kong_blog'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim().split(/\s+/);
    if (containers.length === 2 && containers.every((value) => value === 'true')) {
      const response = await globalThis.fetch(healthUrl, { signal: globalThis.AbortSignal.timeout(2500) });
      if (response.ok) {
        console.log('Supabase Auth ist erreichbar.');
        process.exit(0);
      }
    }
  } catch {
    // Supabase is still starting; retry until timeout.
  }
  await delay(1000);
}
console.error(`Supabase ist nach ${timeoutSeconds}s nicht bereit. Prüfe das Supabase-tmux-Pane und Docker-Logs.`);
process.exit(1);
