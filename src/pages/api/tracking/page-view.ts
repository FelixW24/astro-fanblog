import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/admin';
import { trackingRateLimit } from '../../../lib/auth-rate-limit';
import { createRequestClient } from '../../../lib/supabase';
import { isTrackedPath } from '../../../lib/tracking';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

const VISITOR_KEY_PATTERN = /^[a-zA-Z0-9-]{8,80}$/;

// Erfasst einen Website-Besuch (Pageview) für öffentliche Seiten. Die
// Redaktion liest die Daten unter /admin/tracking aus.
export const POST: APIRoute = async (context) => {
  if (!isSameOrigin(context.request))
    return respond(
      { error: 'Die Anfrage konnte nicht verifiziert werden.' },
      403,
    );
  const retry = trackingRateLimit(context.clientAddress ?? 'unknown');
  if (retry)
    return new Response(JSON.stringify({ error: 'Zu viele Anfragen.' }), {
      status: 429,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(retry),
      },
    });
  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return respond({ error: 'Ungültige Anfrage.' }, 400);
  }
  const path = String(body?.path ?? '');
  const visitorKey = String(body?.visitor_key ?? '');
  if (!isTrackedPath(path) || path.length > 500)
    return respond({ error: 'Ungültiger Pfad.' }, 400);
  if (!VISITOR_KEY_PATTERN.test(visitorKey))
    return respond({ error: 'Ungültiger Besucher-Schlüssel.' }, 400);

  const supabase = createRequestClient(context);
  const { error } = await supabase
    .from('page_views')
    .insert({ path, visitor_key: visitorKey });
  if (error)
    return respond({ error: 'Besuch konnte nicht gespeichert werden.' }, 500);
  return respond({ ok: true });
};
