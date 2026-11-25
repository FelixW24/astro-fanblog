import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/admin';
import { trackingRateLimit } from '../../../lib/auth-rate-limit';
import { createRequestClient } from '../../../lib/supabase';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

const VISITOR_KEY_PATTERN = /^[a-zA-Z0-9-]{8,80}$/;

// Zählt einen Beitrags-View, once pro Besucher und Beitrag (unique
// article_id+visitor_key). Der Client meldet erst nach 30 Sekunden
// Verweildauer; die RLS-Policy lässt nur veröffentlichte Beiträge zu.
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
  const articleId = Number(body?.article_id);
  const visitorKey = String(body?.visitor_key ?? '');
  if (!Number.isSafeInteger(articleId) || articleId < 1)
    return respond({ error: 'Ungültige Beitrags-ID.' }, 400);
  if (!VISITOR_KEY_PATTERN.test(visitorKey))
    return respond({ error: 'Ungültiger Besucher-Schlüssel.' }, 400);

  const supabase = createRequestClient(context);
  // Anonyme Select-Policy: nur veröffentlichte Beiträge sind sichtbar.
  const { data: article } = await supabase
    .from('articles')
    .select('id')
    .eq('id', articleId)
    .maybeSingle();
  if (!article) return respond({ error: 'Beitrag nicht gefunden.' }, 404);

  // Append-only: anon hat nur INSERT (kein SELECT/UPDATE), daher kein
  // upsert. Ein Duplikat (unique article_id+visitor_key) ist ein Erfolg.
  const { error } = await supabase
    .from('article_views')
    .insert({ article_id: articleId, visitor_key: visitorKey });
  if (error && error.code !== '23505')
    return respond({ error: 'View konnte nicht gespeichert werden.' }, 500);
  return respond({ ok: true });
};
