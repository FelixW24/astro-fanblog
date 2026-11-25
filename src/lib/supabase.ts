import {
  createServerClient as createSsrClient,
  parseCookieHeader,
} from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import type { Database } from './database.types';
import { authTransport } from './auth-transport';
import { appConfig } from '../config/app-config';

// A request can pass through middleware, layouts and route helpers. All of them
// must share the same rotating session; never share a client between requests.
const requestClients = new WeakMap<
  Request,
  ReturnType<typeof createSsrClient<Database>>
>();

function getSupabaseConfig() {
  const { url, publishableKey } = appConfig().supabase;

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase ist nicht konfiguriert. PUBLIC_SUPABASE_URL und PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlen.',
    );
  }

  return { url, publishableKey };
}

export function createServerClient() {
  const { url, publishableKey } = getSupabaseConfig();

  return createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// Password re-verification must never replace the browser's current session.
export function createVerificationClient(clientAddress?: string) {
  const { url, publishableKey } = getSupabaseConfig();
  return createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: authTransport(
        url,
        publishableKey,
        clientAddress,
        appConfig().supabase.authSecretKey,
        import.meta.env.PROD,
      ),
    },
  });
}

export function createAdminAuthClient() {
  const { url } = getSupabaseConfig();
  const secret = appConfig().supabase.authSecretKey;
  if (!secret) throw new Error('Serverseitiger Auth-Schlüssel fehlt.');
  return createClient<Database>(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function createRequestClient(context: {
  request: Request;
  cookies: AstroCookies;
  clientAddress?: string;
}) {
  const { request, cookies } = context;
  // clientAddress is accessed lazily: on prerendered routes the getter throws
  // PrerenderClientAddressNotAvailable, which must not break the call.
  let clientAddress: string | undefined;
  try {
    clientAddress = context.clientAddress;
  } catch {
    clientAddress = undefined;
  }
  const existing = requestClients.get(request);
  if (existing) return existing;
  const { url, publishableKey } = getSupabaseConfig();
  const cookieValues = new Map(
    parseCookieHeader(request.headers.get('Cookie') ?? '').map(
      ({ name, value }) => [name, value ?? ''],
    ),
  );
  const client = createSsrClient<Database>(url, publishableKey, {
    global: {
      fetch: authTransport(
        url,
        publishableKey,
        clientAddress,
        appConfig().supabase.authSecretKey,
        import.meta.env.PROD,
      ),
    },
    cookies: {
      getAll() {
        return [...cookieValues].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          if (value) cookieValues.set(name, value);
          else cookieValues.delete(name);
          // Authentication is exclusively server-side. Keep live cookies bound
          // to the browser session, but preserve expiry on deletion cookies.
          const sessionOptions = { ...options };
          if (value) {
            delete sessionOptions.maxAge;
            delete sessionOptions.expires;
          }
          cookies.set(name, value, {
            ...sessionOptions,
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure:
              import.meta.env.PROD ||
              new URL(request.url).protocol === 'https:',
          });
        });
      },
    },
  });
  requestClients.set(request, client);
  return client;
}
