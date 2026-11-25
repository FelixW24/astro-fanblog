import type { APIRoute } from 'astro';
import { parseCookieHeader } from '@supabase/ssr';
import { isSameOrigin } from '../../../lib/admin';
import { changeOwnPassword } from '../../../lib/password-change';
import { createVerificationClient } from '../../../lib/supabase';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// Passwortwechsel aus dem Profil-Modal. Nach dem Wechsel laufen alle Sitzungen
// ab; die Antwort leitet auf die Anmeldung mit Erfolgs-Hinweis weiter.
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
  if (form.get('action') !== 'change-password')
    return respond({ error: 'Ungültige Aktion.' }, 400);
  try {
    const error = await changeOwnPassword(
      user,
      form,
      createVerificationClient(context.clientAddress),
    );
    if (error) return respond({ error });
    for (const { name } of parseCookieHeader(
      context.request.headers.get('cookie') ?? '',
    )) {
      if (/^sb-.*-auth-token(?:\.\d+)?$/.test(name))
        context.cookies.delete(name, { path: '/' });
    }
    context.session?.destroy();
    return respond({ redirect: '/anmelden?passwort=geaendert' });
  } catch {
    return respond(
      {
        error:
          'Der Passwortwechsel ist gerade nicht verfügbar. Bitte versuche es später erneut.',
      },
      503,
    );
  }
};
