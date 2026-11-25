import type { APIRoute } from 'astro';
import { getAdmin, isSameOrigin } from '../../lib/admin';
import { importFotMobData } from '../../lib/fotmob';

const noStore = { 'Cache-Control': 'no-store' } as const;

/**
 * Editor-Endpunkt für den FotMob-Import im Spielformular: nimmt einen
 * FotMob-Link entgegen, lädt die Match-Daten von der FotMob-API und gibt
 * Ergebnis und Basis-Statistiken als JSON zurück, damit das Formular sie
 * vor dem Speichern befüllen und die Redaktion sie anpassen kann.
 * Nur für eingeloggte Redakteure, nur same-origin.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request))
    return Response.json(
      { error: 'Die Anfrage konnte nicht verifiziert werden.' },
      { status: 403, headers: noStore },
    );
  const { user } = await getAdmin({ request, cookies });
  if (!user)
    return Response.json(
      { error: 'Bitte zuerst im Redaktionsbereich anmelden.' },
      { status: 401, headers: noStore },
    );
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: 'Die Anfrage war ungültig.' },
      { status: 400, headers: noStore },
    );
  }
  const url = String(form.get('fotmob_url') ?? '').trim();
  const isHome = String(form.get('is_home') ?? '') === 'true';
  if (!url)
    return Response.json(
      { error: 'Bitte zuerst einen FotMob-Link eintragen.' },
      { status: 400, headers: noStore },
    );
  const { result, error } = await importFotMobData(url, isHome);
  if (error || !result)
    return Response.json(
      { error: error ?? 'Die FotMob-Daten konnten nicht geladen werden.' },
      { status: 422, headers: noStore },
    );
  return Response.json(
    {
      stats: result.stats,
      homeGoals: result.homeGoals,
      awayGoals: result.awayGoals,
    },
    { headers: noStore },
  );
};
