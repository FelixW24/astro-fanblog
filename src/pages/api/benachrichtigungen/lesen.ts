import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/admin';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// Markiert In-App-Benachrichtigungen als gelesen: ohne id alle eigenen
// ungelesenen, mit id nur die einzelne. Die RLS-Policy erlaubt nur eigene
// Zeilen und nur das Setzen von read_at.
export const POST: APIRoute = async (context) => {
  const user = context.locals.readerUser;
  if (!user)
    return respond(
      { error: 'Du bist nicht mehr angemeldet. Bitte lade die Seite neu.' },
      401,
    );
  if (!isSameOrigin(context.request))
    return respond(
      {
        error:
          'Die Anfrage konnte nicht verifiziert werden. Bitte lade die Seite neu.',
      },
      403,
    );
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return respond({ error: 'Ungültige Anfrage.' }, 400);
  }
  const idRaw = String(form.get('id') ?? '').trim();
  let query = context.locals
    .supabase!.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);
  if (idRaw) {
    const id = Number(idRaw);
    if (!Number.isSafeInteger(id) || id < 1)
      return respond({ error: 'Ungültige Benachrichtigung.' }, 400);
    query = query.eq('id', id);
  }
  const { error: updateError } = await query;
  if (updateError) {
    console.error('notifications.mark_read_failed', {
      code: updateError.code,
    });
    return respond(
      {
        error:
          'Die Benachrichtigungen konnten nicht als gelesen markiert werden. Bitte versuche es später erneut.',
      },
      503,
    );
  }
  const { count, error: countError } = await context.locals
    .supabase!.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);
  if (countError) {
    console.error('notifications.unread_count_failed', {
      code: countError.code,
    });
    return respond({ success: true });
  }
  return respond({ success: true, unread: count ?? 0 });
};
