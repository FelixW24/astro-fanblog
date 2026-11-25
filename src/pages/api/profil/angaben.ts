import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/admin';
import { parseProfileEdit } from '../../../lib/profile-edit';
import { profileSaveUsernameError } from '../../../lib/username-check';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// Profildaten-Bearbeitung aus dem Profil-Modal: Username, Name und
// Geburtsdatum. update_reader_profile prüft serverseitig, dass das Profil
// dem angemeldeten Leser gehört.
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
  if (form.get('action') !== 'update-profile')
    return respond({ error: 'Ungültige Aktion.' }, 400);
  const { values, error } = parseProfileEdit(form);
  if (error) return respond({ error }, 400);
  try {
    const { error: updateError } = await context.locals.supabase!.rpc(
      'update_reader_profile',
      {
        p_username: values.username,
        p_full_name: values.full_name,
        p_birth_date: values.birth_date,
      },
    );
    if (updateError) {
      // Trigger-Meldung für reservierte Namen und Unique-Constraint direkt
      // durchreichen; alles andere bleibt generisch.
      const usernameError = profileSaveUsernameError(
        updateError.code,
        updateError.message,
      );
      if (usernameError) return respond({ error: usernameError }, 400);
      console.error('profile.update_failed', { code: updateError.code });
      return respond(
        {
          error:
            'Deine Angaben konnten nicht gespeichert werden. Bitte versuche es später erneut.',
        },
        503,
      );
    }
    return respond({ success: true, username: values.username });
  } catch {
    return respond(
      {
        error:
          'Deine Angaben konnten nicht gespeichert werden. Bitte versuche es später erneut.',
      },
      503,
    );
  }
};
