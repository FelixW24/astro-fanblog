import { appConfig } from './app-config';

export interface AdminAccountConfig {
  readonly email: string;
  readonly password: string;
}

type AdminAccountEnv = {
  readonly ADMIN_EMAIL?: string;
  readonly ADMIN_PASSWORD?: string;
};

export function readAdminAccountConfig(
  env: AdminAccountEnv,
): AdminAccountConfig | null {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase() ?? '';
  const password = env.ADMIN_PASSWORD ?? '';

  if (!email || !password) return null;

  return Object.freeze({ email, password });
}

const editorConfig = appConfig().editor;
export const adminAccountConfig = readAdminAccountConfig({
  ADMIN_EMAIL: editorConfig.email,
  ADMIN_PASSWORD: editorConfig.password,
});

export function matchesAdminEmail(
  email: string,
  config: AdminAccountConfig | null = adminAccountConfig,
) {
  return Boolean(config && email.trim().toLowerCase() === config.email);
}

export function matchesAdminCredentials(
  email: string,
  password: string,
  config: AdminAccountConfig | null = adminAccountConfig,
) {
  return Boolean(
    matchesAdminEmail(email, config) && config?.password === password,
  );
}

