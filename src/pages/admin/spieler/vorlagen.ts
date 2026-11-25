import type { APIRoute } from 'astro';
import { getAdmin, isSameOrigin } from '../../../lib/admin';
import {
  parseChartTemplate,
  parseChartTemplateRename,
} from '../../../lib/player-chart-templates';

const templateIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, cookies }) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
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
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(
      { error: 'Die Vorlagendaten konnten nicht gelesen werden.' },
      400,
    );
  }
  if (form.get('action') === 'rename') {
    const parsed = parseChartTemplateRename(form);
    if (parsed.error) return json({ error: parsed.error }, 400);
    const { data, error } = await supabase
      .from('player_chart_templates')
      .update({ name: parsed.name })
      .eq('id', parsed.id)
      .select('*')
      .single();
    if (error)
      return json(
        {
          error:
            error.code === '23505'
              ? 'Für diese Position gibt es bereits eine Vorlage mit diesem Namen. Wähle einen anderen Namen.'
              : 'Die Vorlage konnte nicht umbenannt werden. Versuche es erneut.',
        },
        error.code === '23505' ? 409 : 500,
      );
    if (!data)
      return json(
        { error: 'Diese Vorlage existiert nicht mehr. Lade die Seite neu.' },
        404,
      );
    return json({ template: data });
  }
  if (form.get('action') === 'delete') {
    const id = String(form.get('template_id') ?? '');
    if (!templateIdPattern.test(id))
      return json({ error: 'Wähle eine gespeicherte Vorlage aus.' }, 400);
    const { data, error } = await supabase
      .from('player_chart_templates')
      .delete()
      .eq('id', id)
      .select('id');
    if (error)
      return json(
        {
          error:
            'Die Vorlage konnte nicht gelöscht werden. Versuche es erneut.',
        },
        500,
      );
    if (!data?.length)
      return json(
        { error: 'Diese Vorlage existiert nicht mehr. Lade die Seite neu.' },
        404,
      );
    return json({ deleted: id });
  }
  if (form.get('action') !== 'save')
    return json({ error: 'Unbekannte Vorlagenaktion.' }, 400);
  const parsed = parseChartTemplate(form);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const { data, error } = await supabase
    .from('player_chart_templates')
    .insert(parsed.template)
    .select('*')
    .single();
  if (error)
    return json(
      {
        error:
          error.code === '23505'
            ? 'Für diese Position gibt es bereits eine Vorlage mit diesem Namen. Wähle einen anderen Namen.'
            : 'Die Vorlage konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten. Versuche es erneut.',
      },
      error.code === '23505' ? 409 : 500,
    );
  return json({ template: data }, 201);
};
