import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/admin';
import { parseNotificationPreferences } from '../../../lib/notifications';
import { ensureReaderProfile } from '../../../lib/reader-profile';
import { createAdminAuthClient } from '../../../lib/supabase';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// Benachrichtigungs-Einstellungen aus dem Profil-Modal: pro Kategorie, ob bei
// neuen Beiträgen per E-Mail und/oder in der Plattform benachrichtigt werden
// soll. Die RLS-Policies stellen sicher, dass nur eigene Zeilen geschrieben
// werden (user_id = auth.uid()).
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
  if (form.get('action') !== 'update-notifications')
    return respond({ error: 'Ungültige Aktion.' }, 400);
  const { preferences, error } = parseNotificationPreferences(form);
  if (error) return respond({ error }, 400);
  // Redaktionskonten bekommen automatisch ein Leserkonto, damit alle
  // Leserkonto-Berechtigungen (FK auf reader_profiles) greifen.
  try {
    await ensureReaderProfile(createAdminAuthClient(), user.id);
  } catch {
    return respond(
      {
        error:
          'Deine Benachrichtigungseinstellungen konnten nicht gespeichert werden. Bitte versuche es später erneut.',
      },
      503,
    );
  }
  try {
    const rows = preferences.map((preference) => ({
      user_id: user.id,
      category: preference.category,
      email_enabled: preference.emailEnabled,
      in_app_enabled: preference.inAppEnabled,
      updated_at: new Date().toISOString(),
    }));
    const { error: upsertError } = await context.locals
      .supabase!.from('article_notification_preferences')
      .upsert(rows, { onConflict: 'user_id,category' });
    if (upsertError) {
      console.error('notifications.preferences_save_failed', {
        code: upsertError.code,
      });
      return respond(
        {
          error:
            'Deine Benachrichtigungseinstellungen konnten nicht gespeichert werden. Bitte versuche es später erneut.',
        },
        503,
      );
    }
    return respond({ success: true });
  } catch {
    return respond(
      {
        error:
          'Deine Benachrichtigungseinstellungen konnten nicht gespeichert werden. Bitte versuche es später erneut.',
      },
      503,
    );
  }
};
