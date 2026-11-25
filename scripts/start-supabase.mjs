import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { hardenLocalAuth } from './harden-local-auth.mjs';

const network = 'fanblog-local';
const bindingOption = 'com.docker.network.bridge.host_binding_ipv4';
const cli = 'node_modules/.bin/supabase';
const inspect = (args) =>
  JSON.parse(execFileSync('docker', args, { encoding: 'utf8' }));
const exists =
  spawnSync('docker', ['network', 'inspect', network], { stdio: 'ignore' })
    .status === 0;
if (!exists) {
  execFileSync(
    'docker',
    [
      'network',
      'create',
      '--driver',
      'bridge',
      '--opt',
      `${bindingOption}=127.0.0.1`,
      network,
    ],
    { stdio: 'pipe' },
  );
}
if (
  inspect(['network', 'inspect', network])[0].Options[bindingOption] !==
  '127.0.0.1'
) {
  throw new Error('Das Blog-Docker-Netzwerk muss Ports an 127.0.0.1 binden.');
}
if (process.argv.includes('--restart')) {
  execFileSync(cli, ['stop', '--project-id', 'blog'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}
execFileSync(
  cli,
  [
    'start',
    '--network-id',
    network,
    '--exclude',
    'edge-runtime,imgproxy,logflare,realtime,supavisor,vector',
  ],
  { stdio: ['ignore', 'pipe', 'inherit'] },
);

await hardenLocalAuth();
const containers = inspect([
  'inspect',
  'supabase_db_blog',
  'supabase_kong_blog',
  'supabase_studio_blog',
  'supabase_auth_blog',
]);
for (const container of containers) {
  for (const ports of Object.values(container.NetworkSettings.Ports)) {
    if (ports?.some((port) => port.HostIp !== '127.0.0.1')) {
      throw new Error(
        'Unsichere Portbindung. Bitte npm run supabase:restart ausführen.',
      );
    }
  }
}
const auth = containers.find(
  (container) => container.Name === '/supabase_auth_blog',
);
if (
  !auth.Config.Env.includes('GOTRUE_DISABLE_SIGNUP=false') ||
  !auth.Config.Env.includes('GOTRUE_EXTERNAL_EMAIL_ENABLED=true') ||
  !auth.Config.Env.includes('GOTRUE_MAILER_AUTOCONFIRM=false') ||
  !auth.Config.Env.includes('GOTRUE_PASSWORD_MIN_LENGTH=10') ||
  !auth.Config.Env.includes(
    'GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true',
  ) ||
  !auth.Config.Env.includes('GOTRUE_MFA_TOTP_VERIFY_ENABLED=true') ||
  !auth.Config.Env.includes('GOTRUE_SESSIONS_TIMEBOX=12h0m0s') ||
  !auth.Config.Env.includes('GOTRUE_SESSIONS_INACTIVITY_TIMEOUT=1h0m0s')
) {
  throw new Error(
    'Auth-Konfiguration veraltet. Bitte npm run supabase:restart ausführen.',
  );
}
console.log(
  'Supabase läuft auf localhost; E-Mail-Bestätigung aktiv, Passwortminimum 10 Zeichen.',
);
