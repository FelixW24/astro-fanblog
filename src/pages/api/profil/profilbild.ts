import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/admin';
import {
  avatarStoragePath,
  readerAvatarPublicUrl,
  sniffAvatarMime,
  staleAvatarStoragePaths,
  validateAvatarUpload,
} from '../../../lib/avatar-upload';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// Profilbild-Upload aus dem Profil-Modal und dem Onboarding. Das Bild wird im
// Namen des Nutzers in dessen eigenem Storage-Ordner abgelegt; der Pfad wird
// nur gespeichert, wenn die Profilzeile bereits existiert.
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

  const client = context.locals.supabase!;
  const action = form.get('action');

  // Im Onboarding existiert die Zeile in reader_profiles noch nicht. Dann
  // darf set_reader_avatar_url nicht aufgerufen werden — ältere
  // Datenbankstände melden dort „Profile not found“ — und der Pfad läuft
  // stattdessen über das Formular mit; complete_reader_profile speichert
  // ihn beim Abschluss des Profils.
  const { data: profile } = await client
    .from('reader_profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  if (action === 'remove') {
    // Ohne Profilzeile sind alle eigenen Avatar-Dateien überflüssig; mit
    // Zeile wird nur die gespeicherte Datei sowie mögliche Reste anderer
    // Formate entfernt.
    const paths = profile?.avatar_url
      ? staleAvatarStoragePaths(user.id, profile.avatar_url).concat(
          profile.avatar_url,
        )
      : staleAvatarStoragePaths(user.id, '');
    await client.storage.from('reader-avatars').remove(paths);
    if (profile) {
      // Ohne Argument setzt der Standard der RPC den Pfad auf null.
      const { error } = await client.rpc('set_reader_avatar_url');
      if (error)
        return respond(
          {
            error:
              'Das Profilbild konnte nicht entfernt werden. Bitte versuche es später erneut.',
          },
          500,
        );
    }
    return respond({ avatarUrl: null });
  }

  if (action !== 'upload')
    return respond({ error: 'Ungültige Aktion.' }, 400);

  const file = form.get('file');
  if (!(file instanceof File))
    return respond({ error: 'Bitte wähle eine Bilddatei aus.' }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validationError = validateAvatarUpload(
    { size: file.size, type: file.type, name: file.name },
    bytes,
  );
  if (validationError) return respond({ error: validationError }, 400);

  const mime = sniffAvatarMime(bytes);
  if (!mime) return respond({ error: 'Ungültige Bilddatei.' }, 400);
  const path = avatarStoragePath(user.id, mime);

  const { error: uploadError } = await client.storage
    .from('reader-avatars')
    .upload(path, new Blob([bytes], { type: mime }), {
      contentType: mime,
      upsert: true,
    });
  if (uploadError)
    return respond(
      {
        error:
          'Das Profilbild konnte nicht gespeichert werden. Bitte versuche es später erneut.',
      },
      500,
    );

  // Mit bestehender Profilzeile wird der Pfad sofort gespeichert; im
  // Onboarding übernimmt ihn complete_reader_profile erst beim Abschluss.
  if (profile) {
    const { error: rpcError } = await client.rpc('set_reader_avatar_url', {
      p_avatar_url: path,
    });
    if (rpcError) {
      // Speicherdaten ohne Profilverweis nicht stehen lassen.
      await client.storage.from('reader-avatars').remove([path]);
      return respond(
        {
          error:
            'Das Profilbild konnte nicht gespeichert werden. Bitte versuche es später erneut.',
        },
        500,
      );
    }
  }

  // Ältere Uploads anderer Formate aufräumen, damit nur eine Datei bleibt.
  await client.storage
    .from('reader-avatars')
    .remove(staleAvatarStoragePaths(user.id, path));

  // Der Pfad wird zusätzlich zurückgegeben, damit das Onboarding ihn beim
  // Abschluss des Profils über complete_reader_profile speichern kann.
  return respond({ avatarUrl: readerAvatarPublicUrl(path), path });
};
