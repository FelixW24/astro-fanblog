import type { APIRoute } from 'astro';
import {
  isLiveCheckableUsername,
  normalizeUsername,
} from '../../lib/username-check';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// Live-Feedback beim Username: Die Prüfung läuft serverseitig über die RPC
// check_username (reservierte Namen plus Duplikate). Die Blacklist selbst
// bleibt dabei für Clients nicht auslesbar.
export const GET: APIRoute = async (context) => {
  const username = normalizeUsername(
    context.url.searchParams.get('username') ?? '',
  );
  if (!isLiveCheckableUsername(username))
    return respond({ error: 'Ungültiger Username.' }, 400);
  const { data, error } = await context.locals.supabase!.rpc('check_username', {
    p_username: username,
  });
  if (error || typeof data !== 'boolean')
    return respond(
      { error: 'Der Username konnte momentan nicht geprüft werden.' },
      503,
    );
  return respond({ available: data });
};
