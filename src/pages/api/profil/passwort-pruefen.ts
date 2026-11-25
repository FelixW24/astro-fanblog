import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/admin';
import { verifyOwnPassword } from '../../../lib/password-change';
import { createVerificationClient } from '../../../lib/supabase';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// Prüft das aktuelle Passwort im Profil-Modal. Erst nach Bestätigung schaltet
// der Client die Felder für das neue Passwort frei; der Passwortwechsel selbst
// prüft serverseitig erneut.
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
  if (form.get('action') !== 'verify-password')
    return respond({ error: 'Ungültige Aktion.' }, 400);
  try {
    const error = await verifyOwnPassword(
      user,
      form,
      createVerificationClient(context.clientAddress),
    );
    if (error) return respond({ error });
    return respond({ verified: true });
  } catch {
    return respond(
      {
        error:
          'Das Passwort konnte nicht geprüft werden. Bitte versuche es später erneut.',
      },
      503,
    );
  }
};
