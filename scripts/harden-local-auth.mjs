import { request } from 'node:http';
import { setTimeout } from 'node:timers/promises';

// CLI 2.116 does not expose this GoTrue setting (supabase/cli#5846).
// Recreate only the stateless local Auth container, retaining its exact Docker
// configuration. Keep the old container until the replacement is healthy.
function docker(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: '/var/run/docker.sock',
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 400)
            reject(new Error(`Docker ${method} failed (${res.statusCode}).`));
          else resolve(data ? JSON.parse(data) : undefined);
        });
      },
    );
    req.on('error', () =>
      reject(new Error('Lokaler Docker-Dienst nicht erreichbar.')),
    );
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

export async function hardenLocalAuth() {
  const name = 'supabase_auth_blog';
  const setting = 'GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD';
  const original = await docker('GET', `/containers/${name}/json`);
  if (original.Config.Env.includes(`${setting}=true`)) return;
  if (
    !original.Config.Image.includes('gotrue') ||
    Object.keys(original.NetworkSettings.Networks).join() !==
      'fanblog-local'
  ) {
    throw new Error(
      'Unerwarteter Auth-Container; keine Änderung durchgeführt.',
    );
  }
  const backup = `${name}_before_password_hardening_${Date.now()}`;
  await docker('POST', `/containers/${name}/stop?t=10`);
  await docker('POST', `/containers/${name}/rename?name=${backup}`);
  let replacement;
  try {
    replacement = await docker('POST', `/containers/create?name=${name}`, {
      ...original.Config,
      Hostname: name,
      Env: [
        ...original.Config.Env.filter(
          (value) => !value.startsWith(`${setting}=`),
        ),
        `${setting}=true`,
      ],
      HostConfig: original.HostConfig,
      NetworkingConfig: {
        EndpointsConfig: { 'fanblog-local': { Aliases: [name] } },
      },
    });
    await docker('POST', `/containers/${replacement.Id}/start`);
    let healthy = false;
    for (let attempt = 0; attempt < 45; attempt++) {
      const current = await docker('GET', `/containers/${replacement.Id}/json`);
      if (current.State.Health?.Status === 'healthy') {
        healthy = true;
        break;
      }
      if (!current.State.Running) break;
      await setTimeout(1000);
    }
    if (!healthy)
      throw new Error(
        'Auth-Start fehlgeschlagen; vorheriger Container wird wiederhergestellt.',
      );
  } catch (error) {
    if (replacement)
      await docker('DELETE', `/containers/${replacement.Id}?force=true`);
    await docker('POST', `/containers/${backup}/rename?name=${name}`);
    await docker('POST', `/containers/${name}/start`);
    throw error;
  }
  // No volumes are removed. Auth data lives in Postgres, not this container.
  await docker('DELETE', `/containers/${backup}`);
}
