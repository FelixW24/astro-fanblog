import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  spawn: vi.fn(),
  harden: vi.fn(),
}));
vi.mock('node:child_process', () => ({
  execFileSync: mocks.exec,
  spawnSync: mocks.spawn,
}));
vi.mock('./harden-local-auth.mjs', () => ({
  hardenLocalAuth: mocks.harden,
}));

const authEnv = [
  'GOTRUE_DISABLE_SIGNUP=false',
  'GOTRUE_EXTERNAL_EMAIL_ENABLED=true',
  'GOTRUE_MAILER_AUTOCONFIRM=false',
  'GOTRUE_PASSWORD_MIN_LENGTH=10',
  'GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true',
  'GOTRUE_MFA_TOTP_VERIFY_ENABLED=true',
  'GOTRUE_SESSIONS_TIMEBOX=12h0m0s',
  'GOTRUE_SESSIONS_INACTIVITY_TIMEOUT=1h0m0s',
];
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.spawn.mockReturnValue({ status: 0 });
  mocks.harden.mockResolvedValue(undefined);
  mocks.exec.mockImplementation((command, args) => {
    if (command === 'docker') {
      if (args[0] === 'network') {
        return JSON.stringify([
          {
            Options: {
              'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1',
            },
          },
        ]);
      }
      return JSON.stringify([
        {
          Name: '/supabase_auth_blog',
          Config: { Env: authEnv },
          NetworkSettings: { Ports: {} },
        },
      ]);
    }
    return '';
  });
});

it('startet Supabase und zieht keine Migrationen mehr nach', async () => {
  await import('./start-supabase.mjs');
  const cliCalls = mocks.exec.mock.calls.filter(([command]) =>
    command.endsWith('/supabase'),
  );
  expect(cliCalls.map(([, args]) => args[0])).toEqual(['start']);
  expect(
    mocks.exec.mock.calls.some(([, args]) => args[0] === 'migration'),
  ).toBe(false);
});

it('bricht ab, wenn der Container-Start fehlschlägt', async () => {
  const normal = mocks.exec.getMockImplementation()!;
  mocks.exec.mockImplementation((command, args, options) => {
    if (args[0] === 'start') throw new Error('container failed');
    return normal(command, args, options);
  });
  await expect(import('./start-supabase.mjs')).rejects.toThrow(
    'container failed',
  );
  expect(
    mocks.exec.mock.calls.some(([, args]) => args[0] === 'migration'),
  ).toBe(false);
});
