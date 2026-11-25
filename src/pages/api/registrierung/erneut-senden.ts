import type { APIRoute } from 'astro';
import {
  authEmailHash,
  logAuthFailure,
} from '../../../lib/auth-security';
import { isSameOrigin } from '../../../lib/admin';
import {
  signupResendCooldown,
  signupResendRateLimit,
} from '../../../lib/auth-rate-limit';
import {
  formatResendCountdown,
  parseResendRequest,
  resendUnavailable,
  resendUnavailableMessage,
} from '../../../lib/signup-resend';

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

// Fordert die Bestätigungsmail erneut an. Der Cooldown (eine Mail pro
// Minute und Adresse) startet schon beim Registrieren; die Route prüft
// ihn vorab und verbraucht ihn erst nach geordnetem Abschluss.
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
  const { email, next, error } = parseResendRequest(form);
  if (error) return respond({ error }, 400);
  const cooldown = signupResendCooldown(email);
  if (cooldown)
    return respond(
      {
        error: `Du hast gerade erst eine E-Mail erhalten. Neue E-Mail möglich in ${formatResendCountdown(cooldown)}.`,
        retry: cooldown,
      },
      429,
    );
  const supabase = context.locals.supabase!;
  const confirmationUrl = new URL('/auth/bestaetigen', context.url.origin);
  confirmationUrl.searchParams.set('weiter', next);
  const { error: resendError } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: confirmationUrl.href },
  });
  if (resendError) {
    logAuthFailure(
      'signup_resend_failed',
      { status: resendError.status, code: resendError.code },
      {
        address: context.clientAddress,
        emailHash: authEmailHash(email),
      },
    );
    // Vorübergehende Störungen verbrauchen den Cooldown nicht; andere
    // Fehler (Adresse unbekannt oder bereits bestätigt) antworten wie ein
    // erfolgreicher Versand, damit die Kontoverfügbarkeit nicht verraten
    // wird.
    if (resendUnavailable(resendError.status))
      return respond({ error: resendUnavailableMessage }, 503);
  }
  signupResendRateLimit(email);
  return respond({ sent: true });
};
