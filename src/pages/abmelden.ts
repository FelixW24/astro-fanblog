import type { APIRoute } from 'astro';
import { isSameOrigin } from '../lib/admin';
import { createRequestClient } from '../lib/supabase';
import { clearTrustedDeviceCookie, signOutSafely } from '../lib/auth-security';

export const POST: APIRoute = async (context) => {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!isSameOrigin(context.request))
    return new Response('Ungültige Anfrage.', { status: 403, headers });
  context.session?.destroy();
  clearTrustedDeviceCookie(context.cookies);
  if (!(await signOutSafely(createRequestClient(context))))
    return new Response('Abmeldung fehlgeschlagen. Bitte versuche es erneut.', {
      status: 503,
      headers,
    });
  return new Response(null, {
    status: 303,
    headers: { ...headers, Location: '/beitraege' },
  });
};
