import type { APIRoute } from 'astro';
import { readerAvatarPublicUrl } from '../../../lib/avatar-upload';
import { readerCardUrl } from '../../../lib/reader-card';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// Öffentliche Profilkarte für die Kommentar-Sektion: Die Server-RPC
// reader_profile_card stellt nur öffentliche Angaben bereit; private
// Details bleiben durch RLS geschützt.
export const GET: APIRoute = async (context) => {
  const userId = context.url.searchParams.get('id') ?? '';
  const url = readerCardUrl(userId);
  if (!url) return respond({ error: 'Ungültige Profil-ID.' }, 400);
  const { data, error } = await context.locals.supabase!.rpc(
    'reader_profile_card',
    { p_user_id: userId },
  );
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row)
    return respond(
      { error: 'Die Profilkarte konnte momentan nicht geladen werden.' },
      503,
    );
  return respond({
    username: row.username,
    avatar_url: row.avatar_url ? readerAvatarPublicUrl(row.avatar_url) : null,
    member_since: row.member_since,
    comment_count: row.comment_count,
  });
};
