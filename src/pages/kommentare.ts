import type { APIRoute } from 'astro';
import { isSameOrigin } from '../lib/admin';
import { castCommentVote } from '../lib/comment-vote';
import { createRequestClient } from '../lib/supabase';

export const POST: APIRoute = async (context) => {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!isSameOrigin(context.request))
    return new Response('Ungültige Anfrage.', { status: 403, headers });
  const form = await context.request.formData();
  const slug = String(form.get('article_slug') ?? '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    return new Response('Ungültiger Beitrag.', { status: 400, headers });
  const destination = `/beitraege/${slug}`;
  const redirect = (error?: string, commentId?: number, pending = false) =>
    new Response(null, {
      status: 303,
      headers: {
        ...headers,
        Location: error
          ? `${destination}?kommentarfehler=${error}#kommentare`
          : pending
            ? `${destination}?pruefung=ausstehend#kommentare`
            : commentId
              ? `${destination}?kommentar=${commentId}#kommentar-${commentId}`
              : `${destination}#kommentare`,
      },
    });
  const client = context.locals.supabase ?? createRequestClient(context);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        Location: `/anmelden?weiter=${encodeURIComponent(`${destination}#kommentare`)}`,
      },
    });
  if (!user.email_confirmed_at) return redirect('email');
  const { data: profile } = await client
    .from('reader_profiles')
    .select('id, is_ghost')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile)
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        Location: `/profil/einrichten?weiter=${encodeURIComponent(`${destination}#kommentare`)}`,
      },
    });
  // Geistermodus: Lesen bleibt möglich, Schreiben (Kommentare, Antworten,
  // Bewertungen) ist serverseitig gesperrt - unabhaengig von der UI.
  if (profile.is_ghost) return redirect('ghost');
  const { data: article } = await client
    .from('articles')
    .select('id')
    .eq('slug', slug)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .maybeSingle();
  if (!article)
    return new Response('Beitrag nicht gefunden.', { status: 404, headers });
  const action = form.get('action');
  if (action === 'comment') {
    const body = String(form.get('body') ?? '').trim();
    const parent = form.get('parent_id');
    const parentId = parent ? Number(parent) : null;
    if (!body || body.length > 2000) return redirect('text');
    if (parentId !== null && (!Number.isSafeInteger(parentId) || parentId <= 0))
      return redirect('invalid');
    const { data, error } = await client
      .rpc('submit_comment', {
        target_article: article.id,
        parent_comment: parentId ?? undefined,
        comment_body: body,
      })
      .single();
    return redirect(
      error
        ? error.message.includes('comment_banned')
          ? 'banned'
          : error.message === 'comment_rate_limited'
            ? 'rate'
            : 'save'
        : undefined,
      data?.id,
      data?.status === 'pending',
    );
  }
  if (action === 'vote') {
    const id = Number(form.get('comment_id'));
    const rawValue = form.get('value');
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !['-1', '0', '1'].includes(String(rawValue))
    )
      return redirect('invalid');
    const result = await castCommentVote(client, {
      articleId: article.id,
      commentId: id,
      userId: user.id,
      value: Number(rawValue),
    });
    if (!result.ok)
      return redirect(result.reason === 'save' ? 'save' : 'invalid', id);
    return redirect(undefined, id);
  }
  return redirect('invalid');
};
