import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/admin';
import { castCommentVote, type CommentVoteValue } from '../../../lib/comment-vote';
import { createRequestClient } from '../../../lib/supabase';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// JSON-Variante des Vote-POSTs aus /kommentare: Der clientseitige Versand
// (scripts/reader-comments.ts) aktualisiert den Button ohne Seitenreload.
// Ohne JavaScript bleibt der Formular-POST mit Redirect als Fallback aktiv.
// Alle fachlichen Prüfungen entsprechen der Formular-Route.
export const POST: APIRoute = async (context) => {
  if (!isSameOrigin(context.request))
    return json({ ok: false, error: 'Ungültige Anfrage.' }, 403);
  const form = await context.request.formData();
  const slug = String(form.get('article_slug') ?? '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    return json({ ok: false, error: 'invalid' }, 400);
  const client = context.locals.supabase ?? createRequestClient(context);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return json({ ok: false, error: 'login' }, 401);
  if (!user.email_confirmed_at) return json({ ok: false, error: 'email' }, 403);
  const { data: profile } = await client
    .from('reader_profiles')
    .select('id, is_ghost')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return json({ ok: false, error: 'profile' }, 403);
  // Geistermodus: Bewerten ist serverseitig gesperrt, unabhängig von der UI.
  if (profile.is_ghost) return json({ ok: false, error: 'ghost' }, 403);
  const { data: article } = await client
    .from('articles')
    .select('id')
    .eq('slug', slug)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .maybeSingle();
  if (!article) return json({ ok: false, error: 'invalid' }, 404);
  const commentId = Number(form.get('comment_id'));
  const rawValue = String(form.get('value'));
  if (
    !Number.isSafeInteger(commentId) ||
    commentId <= 0 ||
    !['-1', '0', '1'].includes(rawValue)
  )
    return json({ ok: false, error: 'invalid' }, 400);
  const result = await castCommentVote(client, {
    articleId: article.id,
    commentId,
    userId: user.id,
    value: Number(rawValue) as CommentVoteValue,
  });
  if (!result.ok)
    return json(
      { ok: false, error: result.reason },
      result.reason === 'not_found' ? 404 : 500,
    );
  return json({
    ok: true,
    commentId: result.commentId,
    value: result.value,
    likes: result.likes,
    dislikes: result.dislikes,
  });
};
