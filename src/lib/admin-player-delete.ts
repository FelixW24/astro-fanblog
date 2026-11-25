import { getAdmin, isSameOrigin, type RequestContext } from './admin';
import { squadAreaForStatus } from './admin-squad';
import { logAdminAction } from './audit-log';

/** GET only previews; a confirmed same-origin POST performs the deletion. */
export async function preparePlayerDeletion(
  context: RequestContext,
  playerId: string | undefined,
) {
  const { request } = context;
  const redirect = (location: string) =>
    new Response(null, { status: 303, headers: { Location: location } });
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
    return new Response('Methode nicht erlaubt.', {
      status: 405,
      headers: { Allow: 'GET, HEAD, POST' },
    });
  }
  if (request.method === 'POST' && !isSameOrigin(request)) {
    return new Response(
      'Die Anfrage konnte nicht verifiziert werden. Bitte lade die Seite neu.',
      { status: 403 },
    );
  }
  const id = Number(playerId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return new Response('Ungültige Spieler-ID.', { status: 400 });
  }
  const { supabase, user } = await getAdmin(context);
  if (!user) return redirect('/admin/login');

  const { data: player, error: loadError } = await supabase
    .from('players')
    .select('id, name, squad_status')
    .eq('id', id)
    .maybeSingle();
  if (loadError) {
    return new Response(
      'Das Spielerprofil konnte nicht geladen werden. Bitte versuche es erneut.',
      { status: 500 },
    );
  }
  if (!player)
    return new Response(
      'Das Spielerprofil wurde nicht gefunden oder bereits gelöscht.',
      { status: 404 },
    );
  const backUrl = `/admin/spieler?bereich=${squadAreaForStatus(player.squad_status)}`;
  let error: string | null = null;
  let status = 200;
  if (request.method === 'POST') {
    const form = await request.formData();
    if (form.get('confirm_delete') !== String(id)) {
      error = 'Bitte bestätige das endgültige Löschen des Spielerprofils.';
      status = 400;
    } else {
      // The existing foreign key removes player_charts atomically.
      // Selecting the deleted row also detects RLS-denied/no-op deletions.
      const result = await supabase
        .from('players')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (result.error) {
        error =
          'Das Spielerprofil konnte nicht gelöscht werden. Bitte versuche es erneut.';
        status = 500;
      } else if (!result.data) {
        error =
          'Es wurde kein Spieler gelöscht. Das Profil wurde bereits entfernt oder dir fehlt die Berechtigung. Bitte lade die Übersicht neu.';
        status = 409;
      } else {
        logAdminAction({
          action: 'delete',
          entity: 'player',
          entityId: id,
          actorEmail: user.email ?? undefined,
          detail: `name=${player.name}`,
        });
        return redirect(`${backUrl}&saved=deleted`);
      }
    }
  }
  return { player, user, backUrl, error, status };
}
