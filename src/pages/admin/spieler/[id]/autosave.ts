import type { APIRoute } from 'astro';
import { getAdmin, isSameOrigin } from '../../../../lib/admin';
import { applyPlayerAutosave } from '../../../../lib/admin-player-autosave';
import { logAdminAction } from '../../../../lib/audit-log';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });

// Unsichtbarer Autosave für die Spielerprofil-Bearbeitung: Das Formular wird
// im Hintergrund abgeschickt, sobald ein Feld verlassen wird. Antwort ist
// reines JSON — es gibt keine Redirects und keine sichtbare Rückmeldung.
export const POST: APIRoute = async ({ params, request, cookies }) => {
  if (!isSameOrigin(request))
    return json(
      {
        error:
          'Die Anfrage konnte nicht verifiziert werden. Lade die Seite neu.',
      },
      403,
    );
  const { supabase, user } = await getAdmin({ request, cookies });
  if (!user)
    return json(
      { error: 'Deine Anmeldung ist abgelaufen. Melde dich erneut an.' },
      401,
    );
  const playerId = Number(params.id);
  if (!Number.isSafeInteger(playerId) || playerId < 1)
    return json({ error: 'Ungültige Spieler-ID.' }, 400);
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Die Profildaten konnten nicht gelesen werden.' }, 400);
  }
  const result = await applyPlayerAutosave(supabase, playerId, formData);
  if (result.notFound)
    return json(
      { error: 'Dieses Spielerprofil existiert nicht mehr.' },
      404,
    );
  if (result.profileSaved || result.ratingsSaved || result.ratingsRemoved)
    logAdminAction({
      action: 'update',
      entity: 'player',
      entityId: playerId,
      actorEmail: user.email ?? undefined,
      detail: `autosave profile=${result.profileSaved} ratings=${result.ratingsSaved}+${result.ratingsRemoved}`,
    });
  return json({
    ok: true,
    profileSaved: result.profileSaved,
    ratingsSaved: result.ratingsSaved,
    ratingsRemoved: result.ratingsRemoved,
  });
};
