import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../lib/admin';
import {
  bugReportCooldown,
  bugReportRateLimit,
} from '../../lib/auth-rate-limit';
import { parseBugReport, renderBugReport, sendBugReport } from '../../lib/bug-report';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// Nimmt Fehlerberichte aus dem Footer-Modal entgegen. Nur angemeldete
// Leser dürfen melden (die Session identifiziert den Absender und trägt
// das 5-Minuten-Limit); der Server versendet die Mail per SMTP.
export const POST: APIRoute = async (context) => {
  const user = context.locals.readerUser;
  if (!user)
    return respond(
      { error: 'Für Fehlermeldungen musst du angemeldet sein.' },
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
  const { report, error } = parseBugReport(form);
  if (!report) return respond({ error }, 400);
  // Der Cooldown wird vorab geprüft, aber erst nach erfolgreichem Versand
  // gezählt: Ein SMTP-Fehler verbraucht den 5-Minuten-Slot nicht.
  const cooldown = bugReportCooldown(user.id);
  if (cooldown) {
    const minutes = Math.ceil(cooldown / 60);
    return respond(
      {
        error: `Du hast gerade erst einen Fehler gemeldet. Bitte warte noch ${minutes} Minute${minutes === 1 ? '' : 'n'} und versuche es erneut.`,
      },
      429,
    );
  }
  const sent = await sendBugReport(renderBugReport(report, user));
  if (!sent)
    return respond(
      {
        error:
          'Der Fehlerbericht konnte nicht gesendet werden. Bitte versuche es später erneut.',
      },
      503,
    );
  bugReportRateLimit(user.id);
  return respond({ sent: true });
};
