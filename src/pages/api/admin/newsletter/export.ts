import type { APIRoute } from 'astro';
import { getAdmin } from '../../../../lib/admin';
import { logAdminAction } from '../../../../lib/audit-log';
import { subscribersCsv } from '../../../../lib/newsletter';
import { createAdminAuthClient } from '../../../../lib/supabase';

const noStore = { 'Cache-Control': 'no-store' } as const;

/**
 * CSV-Export der Abonnentenliste für die Redaktion (z. B. für Backups oder
 * Datenauskunftsfälle). Nur für eingeloggte Redakteure; die Adressen sind
 * per RLS exklusiv dem Service-Role-Client zugänglich. DerExport wird für
 * die DSGVO-Nachvollziehbarkeit im Audit-Log protokolliert.
 */
export const GET: APIRoute = async ({ request, cookies }) => {
  const { user } = await getAdmin({ request, cookies });
  if (!user)
    return new Response('Bitte zuerst im Redaktionsbereich anmelden.', {
      status: 401,
      headers: noStore,
    });

  const admin = createAdminAuthClient();
  const { data: subscribers, error } = await admin
    .from('newsletter_subscribers')
    .select('email, status, created_at, confirmed_at, unsubscribed_at')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) {
    console.error('newsletter.export_list_failed', error);
    return new Response(
      'Die Abonnentenliste konnte nicht geladen werden. Bitte versuche es später erneut.',
      { status: 503, headers: noStore },
    );
  }

  logAdminAction({
    action: 'read',
    entity: 'newsletter_subscribers',
    actorEmail: user.email ?? undefined,
    detail: `export count=${subscribers?.length ?? 0}`,
  });

  // BOM voranstellen, damit Excel die Datei als UTF-8 erkennt (Umlaute).
  const csv = `\uFEFF${subscribersCsv(subscribers ?? [])}`;
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      ...noStore,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="astro-fanblog-newsletter-abonnenten-${stamp}.csv"`,
    },
  });
};
