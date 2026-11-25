import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/admin';
import { requestAccountDeletion } from '../../../lib/account-deletion';
import { createVerificationClient } from '../../../lib/supabase';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// Löschung des eigenen Leserkontos aus dem Profil-Modal heraus. Der klassische
// Formular-Post auf /profil entfällt mit der Seite; das Modal bleibt geöffnet
// und zeigt Rückmeldung direkt im Formular.
//
// Der Antrag löscht nichts: Nach der Prüfung von Passwort und MFA verschicken
// wir eine Bestätigungsmail. Erst der Link darin führt zu
// /konto-loeschen/bestaetigen und damit zur endgültigen Löschung. Die
// Browsersitzung bleibt bis dahin bestehen, damit ein nicht bestätigter Antrag
// das Konto nicht aussperrt.
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
  if (form.get('action') !== 'delete-account')
    return respond({ error: 'Ungültige Aktion.' }, 400);
  try {
    const error = await requestAccountDeletion(
      user,
      form,
      createVerificationClient(context.clientAddress),
      { ipAddress: context.clientAddress },
    );
    if (error) return respond({ error });
    return respond({
      message:
        'Wir haben dir eine Bestätigungsmail geschickt. Dein Konto wird erst gelöscht, wenn du den Link darin öffnest und die Löschung bestätigst.',
    });
  } catch {
    return respond(
      {
        error:
          'Die Kontolöschung ist gerade nicht verfügbar. Bitte versuche es später erneut.',
      },
      503,
    );
  }
};
