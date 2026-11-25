import { loadEnv } from 'vite';
import { expect, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { totp } from './totp.mjs';

const env = loadEnv('development', process.cwd(), '');

function required(name: 'ADMIN_EMAIL' | 'ADMIN_PASSWORD') {
  const value = process.env[name] ?? env[name];
  if (!value)
    throw new Error(`${name} muss für die Admin-E2E-Tests gesetzt sein.`);
  return value;
}

export const adminEmail = required('ADMIN_EMAIL');
export const adminPassword = required('ADMIN_PASSWORD');

function adminCode() {
  const secret = process.env.ADMIN_TOTP_SECRET ?? env.ADMIN_TOTP_SECRET;
  if (!secret)
    throw new Error(
      'ADMIN_TOTP_SECRET fehlt. Verwende npm run test:auth für ein isoliertes Testkonto.',
    );
  return totp(secret);
}

export async function completeAdminMfa(
  page: Page,
  options: { trustDevice?: boolean } = {},
) {
  await expect(page).toHaveURL(/\/admin\/sicherheit$/);
  if (options.trustDevice) {
    await page.getByRole('checkbox', { name: /24 Stunden/ }).check();
  }
  await page.getByLabel('Authenticator-Code').fill(adminCode());
  await page.getByRole('button', { name: 'Code bestätigen' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

export async function verifyAdminMfa(client: SupabaseClient) {
  const { data, error } = await client.auth.mfa.listFactors();
  expect(error).toBeNull();
  const factor = data!.totp.find((item) => item.status === 'verified');
  expect(factor).toBeTruthy();
  const result = await client.auth.mfa.challengeAndVerify({
    factorId: factor!.id,
    code: adminCode(),
  });
  expect(result.error).toBeNull();
}
