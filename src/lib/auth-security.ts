import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import type { Database } from './database.types';
import { appConfig } from '../config/app-config';

export type EmailProof = {
  tokenHash: string;
  expiresAt: number;
  next?: string;
};
export type RecoveryApproval = {
  userId: string;
  sessionId: string;
  expiresAt: number;
};

export function validRecoveryApproval(
  approval: RecoveryApproval | undefined,
  userId: string | undefined,
  sessionId: unknown,
  now = Date.now(),
) {
  return Boolean(
    approval &&
    approval.expiresAt > now &&
    approval.userId === userId &&
    approval.sessionId === sessionId,
  );
}

export function validEmailProof(
  proof: EmailProof | undefined,
  now = Date.now(),
) {
  return Boolean(
    proof &&
    /^(?:pkce_)?[a-f0-9]{56}$/i.test(proof.tokenHash) &&
    proof.expiresAt > now,
  );
}

export async function signOutSafely(client: SupabaseClient<Database>) {
  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (!error) return true;
    // Never log upstream messages, tokens or personal data.
    console.error('auth.signout_failed', { status: error.status });
  } catch {
    console.error('auth.signout_failed');
  }
  return false;
}

export async function hasSecondFactor(client: SupabaseClient<Database>) {
  const { data, error } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel();
  return !error && data?.currentLevel === 'aal2';
}

// Vertrauens-Cookie für die Redaktion: Nach erfolgreicher Zweitfaktor-Prüfung
// kann ein Gerät für 24 Stunden markiert werden. Das Cookie ist HMAC-signiert
// und an die Benutzer-ID gebunden; ohne konfiguriertes Secret (mindestens 32
// Zeichen) ist die Funktion deaktiviert und alle Prüfungen schlagen fehl.
export const TRUSTED_DEVICE_COOKIE = 'b48_editor_trusted';
export const TRUSTED_DEVICE_TTL_MS = 24 * 60 * 60 * 1000;

function trustedDeviceSecret(): string | null {
  const secret = appConfig().editor.trustSecret;
  return typeof secret === 'string' && secret.length >= 32 ? secret : null;
}

export function trustedDeviceEnabled() {
  return trustedDeviceSecret() !== null;
}

function signTrustedDevice(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function issueTrustedDeviceCookie(
  userId: string,
  now = Date.now(),
): string | null {
  const secret = trustedDeviceSecret();
  if (!secret || !userId) return null;
  const expiresAt = now + TRUSTED_DEVICE_TTL_MS;
  const payload = `v1.${userId}.${expiresAt}`;
  return `${payload}.${signTrustedDevice(payload, secret)}`;
}

export function validTrustedDeviceCookie(
  value: string | null | undefined,
  userId: string,
  now = Date.now(),
) {
  const secret = trustedDeviceSecret();
  if (!secret || !value || !userId) return false;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const [, cookieUserId, expiresRaw, signature] = parts;
  const expiresAt = Number(expiresRaw);
  if (cookieUserId !== userId) return false;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  const payload = `v1.${cookieUserId}.${expiresRaw}`;
  const expected = Buffer.from(signTrustedDevice(payload, secret), 'hex');
  const given = Buffer.from(signature, 'hex');
  return (
    expected.length === given.length && timingSafeEqual(expected, given)
  );
}

export function setTrustedDeviceCookie(
  cookies: AstroCookies,
  userId: string,
  requestUrl: string,
  now = Date.now(),
) {
  const value = issueTrustedDeviceCookie(userId, now);
  if (!value) return false;
  cookies.set(TRUSTED_DEVICE_COOKIE, value, {
    path: '/admin',
    httpOnly: true,
    sameSite: 'lax',
    secure:
      import.meta.env.PROD || new URL(requestUrl).protocol === 'https:',
    maxAge: Math.floor(TRUSTED_DEVICE_TTL_MS / 1000),
  });
  return true;
}

export function clearTrustedDeviceCookie(cookies: AstroCookies) {
  cookies.delete(TRUSTED_DEVICE_COOKIE, { path: '/admin' });
}

// Gekürzter Hash statt Klartext: erlaubt, wiederholte Fehlversuche für
// dieselbe Adresse zu erkennen, ohne die Adresse selbst in Logs zu schreiben.
export function authEmailHash(email: string) {
  const normalized = email.trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

// Login-Fehlschläge diagnosefähig machen, ohne Passwörter, Cookies,
// Upstream-Meldungen oder Klartext-Personendaten zu loggen.
export function logAuthFailure(
  event: string,
  failure: { status?: number; code?: string | null },
  details: { address?: string; emailHash?: string } = {},
) {
  console.warn(`auth.${event}`, {
    status: failure.status ?? 0,
    code: failure.code ?? 'unknown',
    ...details,
  });
}
