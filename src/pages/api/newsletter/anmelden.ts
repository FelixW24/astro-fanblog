import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/admin';
import {
  newsletterSignupCooldown,
  newsletterSignupRateLimit,
} from '../../../lib/auth-rate-limit';
import {
  confirmUrl,
  loadNewsletterSettings,
  parseNewsletterSignup,
  renderConfirmationMail,
} from '../../../lib/newsletter';
import { sendNoReplyMail } from '../../../lib/notifications';
import {
  createAdminAuthClient,
  createServerClient,
} from '../../../lib/supabase';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// Generische Erfolgsmeldung: Sie verrät nicht, ob die Adresse bereits
// existiert oder bestätigt ist (kein E-Mail-Enumeration über das Modal).
const GENERIC_OK =
  'Danke für dein Interesse! Falls du den Newsletter noch nicht bestätigt hast, findest du eine E-Mail mit Bestätigungslink in deinem Postfach – bitte schau auch im Spam-Ordner nach.';

// Nimmt Newsletter-Anmeldungen aus dem Willkommens-Modal entgegen. Jeder
// Besucher darf sich anmelden (kein Konto nötig); die Adresse landet als
// pending in der Datenbank und eine signierte Bestätigungsmail geht über das
// No-Reply-Postfach raus (Double-Opt-in). Abonnenten-Adressen sind über RLS
// nicht für anon/authenticated erreichbar, deshalb Service-Role-Client.
export const POST: APIRoute = async (context) => {
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
  const parsed = parseNewsletterSignup(form);
  if ('error' in parsed) return respond({ error: parsed.error }, 400);
  const { email } = parsed;

  // Pro Adresse nur alle 60 Sekunden eine Bestätigungsmail; der Cooldown
  // wird erst nach erfolgreichem Versand gezählt.
  const cooldown = newsletterSignupCooldown(email);
  if (cooldown) {
    return respond(
      {
        error: `Für diese Adresse wurde gerade erst eine Bestätigungsmail verschickt. Bitte warte ${Math.ceil(cooldown / 60)} Minute${cooldown >= 120 ? 'n' : ''} oder prüfe dein Postfach.`,
      },
      429,
    );
  }

  const admin = createAdminAuthClient();
  const settings = await loadNewsletterSettings(createServerClient());

  const existing = await admin
    .from('newsletter_subscribers')
    .select('id, status')
    .eq('email', email)
    .maybeSingle();
  if (existing.error) {
    console.error('newsletter.signup_lookup_failed', existing.error);
    return respond(
      {
        error:
          'Die Anmeldung ist gerade nicht verfügbar. Bitte versuche es später erneut.',
      },
      503,
    );
  }

  let subscriberId = existing.data?.id ?? null;
  let needsConfirmationMail = false;

  if (!existing.data) {
    const inserted = await admin
      .from('newsletter_subscribers')
      .insert({
        email,
        status: 'pending',
        consent_text: settings.privacyNote,
      })
      .select('id')
      .single();
    if (inserted.error || !inserted.data) {
      console.error('newsletter.signup_insert_failed', inserted.error);
      return respond(
        {
          error:
            'Die Anmeldung konnte nicht gespeichert werden. Bitte versuche es später erneut.',
        },
        503,
      );
    }
    subscriberId = inserted.data.id;
    needsConfirmationMail = true;
  } else if (existing.data.status === 'pending') {
    // Erneute Anmeldung vor der Bestätigung: Bestätigungsmail erneut senden.
    needsConfirmationMail = true;
  } else if (existing.data.status === 'unsubscribed') {
    // Reaktivierung nach Abmeldung: erneutes Double-Opt-in erforderlich.
    const reactivated = await admin
      .from('newsletter_subscribers')
      .update({
        status: 'pending',
        consent_text: settings.privacyNote,
        confirmed_at: null,
        unsubscribed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.data.id);
    if (reactivated.error) {
      console.error('newsletter.signup_reactivate_failed', reactivated.error);
      return respond(
        {
          error:
            'Die Anmeldung ist gerade nicht verfügbar. Bitte versuche es später erneut.',
        },
        503,
      );
    }
    needsConfirmationMail = true;
  }
  // status === 'active': bereits bestätigt, keine Mail nötig.

  if (needsConfirmationMail) {
    const link = confirmUrl(subscriberId!);
    if (!link) {
      console.error('newsletter.token_secret_missing');
      return respond(
        {
          error:
            'Der Newsletter ist gerade nicht verfügbar. Bitte versuche es später erneut.',
        },
        503,
      );
    }
    const sent = await sendNoReplyMail({
      to: email,
      ...renderConfirmationMail({ to: email, confirmUrl: link, settings }),
    });
    if (!sent)
      return respond(
        {
          error:
            'Die Bestätigungsmail konnte nicht gesendet werden. Bitte versuche es später erneut.',
        },
        503,
      );
    newsletterSignupRateLimit(email);
  }

  // Bewusst immer dieselbe Antwort, egal ob neu, pending oder bereits aktiv.
  return respond({ ok: true, message: GENERIC_OK });
};
