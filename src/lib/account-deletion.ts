import type { SupabaseClient, User } from '@supabase/supabase-js';
import { appConfig } from '../config/app-config';
import {
  ACCOUNT_DELETION_TOKEN_TTL_SECONDS,
  accountDeletionToken,
  accountDeletionTokenUserId,
} from './account-deletion-token';
import { logReaderAction } from './audit-log';
import type { Database } from './database.types';
import { escapeHtml, mailFooter, mailShell } from './mail-template';
import {
  sendNoReplyMail,
  siteOrigin,
  type SendMailMessage,
} from './notifications';

type Client = SupabaseClient<Database>;

const unavailable =
  'Die Kontolöschung konnte nicht bestätigt werden. Bitte versuche es später erneut oder melde dich erneut an.';

// Der Antrag selbst löscht nichts: Ohne zugestellte Bestätigungsmail bleibt
// das Konto unverändert, deshalb ist ein Versandfehler ein Fehler des Antrags.
export const deletionMailUnavailable =
  'Die Bestätigungsmail konnte nicht versendet werden. Dein Konto wurde nicht gelöscht. Bitte versuche es später erneut.';

// HMAC-Secret für den Bestätigungslink (siehe config/app-config.ts). Ohne
// Secret lässt sich kein Link erzeugen — dann bleibt nur der Fehlerhinweis.
function tokenSecret(): string | null {
  const secret = appConfig().accountDeletion.tokenSecret;
  return typeof secret === 'string' && secret.length >= 32 ? secret : null;
}

export function accountDeletionLink(
  userId: string,
  origin = siteOrigin(),
): string | null {
  const token = accountDeletionToken(tokenSecret(), userId);
  if (!token) return null;
  return new URL(
    `/konto-loeschen/bestaetigen?token=${encodeURIComponent(token)}`,
    origin,
  ).toString();
}

// Nutzer-ID aus dem Link der Bestätigungsmail. Prüft Signatur, Zweck und
// Ablauf; liefert null für ungültige und abgelaufene Links.
export function accountDeletionUserId(
  token: string | null | undefined,
  now = Date.now(),
): string | null {
  return accountDeletionTokenUserId(tokenSecret(), token, now);
}

export interface AccountDeletionMail {
  subject: string;
  text: string;
  html: string;
}

// Bestätigungsmail der Kontolöschung. Bewusst als Text plus schlichter
// HTML-Variante, weil der Link eine irreversible Aktion auslöst.
export function renderAccountDeletionMail(options: {
  url: string;
  origin?: string;
}): AccountDeletionMail {
  const origin = options.origin ?? siteOrigin();
  const { url } = options;
  const hours = ACCOUNT_DELETION_TOKEN_TTL_SECONDS / 3600;
  const subject = 'Bitte bestätige die Löschung deines Astro Fanblog-Kontos';
  const footer = mailFooter(origin);
  const text = [
    'Hallo,',
    '',
    'du hast die Löschung deines Fanblog-Kontos beantragt. Dein Konto wurde',
    'noch nicht gelöscht. Erst wenn du den folgenden Link öffnest und die',
    'Löschung dort bestätigst, löschen wir dein Konto endgültig:',
    '',
    url,
    '',
    `Der Link ist ${hours} Stunden gültig und nur für dieses Konto bestimmt.`,
    'Danach kannst du die Löschung im Profil erneut beantragen.',
    '',
    'Nach der Bestätigung löschen wir deine Konto- und Profildaten und melden',
    'dich auf allen Geräten ab. Bereits veröffentlichte Kommentare bleiben',
    'ohne Zuordnung zu deinem Konto als „Gelöschter Nutzer“ erhalten.',
    '',
    'Wenn du die Löschung nicht beantragt hast, ignoriere diese E-Mail. Dein',
    'Konto bleibt dann bestehen; ändere vorsichtshalber dein Passwort im',
    'Profil.',
    '',
    'Viele Grüße',
    'Dein Astro Fanblog-Team',
    '',
    footer.text,
  ].join('\r\n');
  const bodyHtml = `<p
                  style="
                    margin: 0 0 24px;
                    font-size: 15px;
                    line-height: 1.6;
                    color: #151719;
                  "
                >
                  Du hast die Löschung deines Fanblog-Kontos beantragt. Dein
                  Konto wurde noch nicht gelöscht. Erst wenn du den Button
                  anklickst und die Löschung auf der Seite bestätigst, löschen
                  wir dein Konto endgültig.
                </p>
                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  style="margin: 0 0 24px"
                >
                  <tr>
                    <td style="background: #006284; border-radius: 10px">
                      <a
                        href="${escapeHtml(url)}"
                        style="
                          display: inline-block;
                          padding: 12px 24px;
                          font-size: 15px;
                          font-weight: 600;
                          color: #ffffff;
                          text-decoration: none;
                        "
                        >Löschung bestätigen</a
                      >
                    </td>
                  </tr>
                </table>
                <p
                  style="
                    margin: 0 0 16px;
                    font-size: 13px;
                    line-height: 1.6;
                    color: #62676b;
                  "
                >
                  Der Link ist ${hours} Stunden gültig und nur für dieses Konto
                  bestimmt. Danach kannst du die Löschung im Profil erneut
                  beantragen.
                </p>
                <p
                  style="
                    margin: 0 0 16px;
                    font-size: 13px;
                    line-height: 1.6;
                    color: #62676b;
                  "
                >
                  Nach der Bestätigung löschen wir deine Konto- und Profildaten
                  und melden dich auf allen Geräten ab. Bereits veröffentlichte
                  Kommentare bleiben ohne Zuordnung zu deinem Konto als
                  „Gelöschter Nutzer“ erhalten.
                </p>
                <p
                  style="
                    margin: 0;
                    font-size: 13px;
                    line-height: 1.6;
                    color: #62676b;
                  "
                >
                  Wenn du die Löschung nicht beantragt hast, ignoriere diese
                  E-Mail. Dein Konto bleibt dann bestehen; ändere vorsichtshalber
                  dein Passwort im Profil.
                </p>`;
  const { html } = mailShell(
    'Konto · Löschung bestätigen',
    'Löschung deines Kontos bestätigen',
    bodyHtml,
    footer.html,
    subject,
  );
  return { subject, text, html };
}

// Schritt 1: Der Nutzer bestätigt im Profil E-Mail-Adresse, Passwort und
// gegebenenfalls den Authenticator-Code. Danach verschicken wir nur die
// Bestätigungsmail; gelöscht wird erst über den Link in dieser Mail.
export async function requestAccountDeletion(
  user: User,
  form: FormData,
  verification: Client,
  options: {
    sendMail?: (message: SendMailMessage) => Promise<boolean>;
    origin?: string;
    ipAddress?: string;
  } = {},
): Promise<string | null> {
  const { sendMail = sendNoReplyMail, origin = siteOrigin(), ipAddress } = options;
  const email = String(form.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(form.get('password') ?? '');
  if (
    !email ||
    email !== user.email?.toLowerCase() ||
    !password ||
    password.length > 1024
  )
    return 'Bitte gib deine eigene E-Mail-Adresse und dein aktuelles Passwort ein.';
  if (form.get('confirm_delete') !== 'on')
    return 'Bitte bestätige die endgültige Löschung deines Kontos.';
  let signedIn = false;
  try {
    const login = await verification.auth.signInWithPassword({
      email,
      password,
    });
    signedIn = Boolean(login.data.session);
    if (login.error || !login.data.session || login.data.user?.id !== user.id) {
      logReaderAction({
        action: 'request',
        entity: 'account-deletion',
        userId: user.id,
        actorEmail: email,
        detail: 'Fehlgeschlagene Authentifizierung (Passwort/MFA)',
        ipAddress,
      });
      return 'E-Mail-Adresse oder Passwort sind nicht korrekt.';
    }
    const factors = await verification.auth.mfa.listFactors();
    if (factors.error) return unavailable;
    const verified = factors.data.totp.filter((f) => f.status === 'verified');
    if (verified.length) {
      const factorId = String(form.get('factor_id') ?? '');
      const code = String(form.get('code') ?? '').trim();
      if (!verified.some((f) => f.id === factorId) || !/^\d{6}$/.test(code))
        return 'Bestätige die Kontolöschung zusätzlich mit deinem Authenticator-Code.';
      const mfa = await verification.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (mfa.error) {
        logReaderAction({
          action: 'request',
          entity: 'account-deletion',
          userId: user.id,
          actorEmail: email,
          detail: 'Fehlgeschlagene MFA-Verifizierung',
          ipAddress,
        });
        return 'Der Authenticator-Code ist ungültig oder abgelaufen.';
      }
    }
    const url = accountDeletionLink(user.id, origin);
    if (!url) {
      console.error('auth.account_deletion_link_unavailable');
      return deletionMailUnavailable;
    }
    const mail = renderAccountDeletionMail({ url, origin });
    const sent = await sendMail({
      to: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    if (!sent) {
      logReaderAction({
        action: 'request',
        entity: 'account-deletion',
        userId: user.id,
        actorEmail: email,
        detail: 'Bestätigungsmail konnte nicht versendet werden (SMTP)',
        ipAddress,
      });
      return deletionMailUnavailable;
    }
    logReaderAction({
      action: 'request',
      entity: 'account-deletion',
      userId: user.id,
      actorEmail: email,
      detail: 'Bestätigungsmail versendet',
      ipAddress,
    });
    return null;
  } catch {
    console.error('auth.account_deletion_request_failed');
    return unavailable;
  } finally {
    if (signedIn) {
      try {
        await verification.auth.signOut({ scope: 'local' });
      } catch {
        console.error('auth.verification_session_cleanup_failed');
      }
    }
  }
}

export type AccountDeletionConfirmation =
  'deleted' | 'missing' | 'invalid' | 'failed';

// Schritt 2: Der Link aus der Bestätigungsmail löscht das Konto endgültig.
// Das Token ist an die Nutzer-ID gebunden und läuft ab; ein zweiter Klick
// findet kein Konto mehr und wird als 'missing' gemeldet.
export async function confirmAccountDeletion(
  token: string | null | undefined,
  admin: Client,
  options: {
    now?: number;
    ipAddress?: string;
    actorEmail?: string;
  } = {},
): Promise<AccountDeletionConfirmation> {
  const { now = Date.now(), ipAddress, actorEmail } = options;
  const userId = accountDeletionUserId(token, now);
  if (!userId) {
    logReaderAction({
      action: 'confirm',
      entity: 'account-deletion',
      detail: 'Ungültiges oder abgelaufenes Token',
      ipAddress,
    });
    return 'invalid';
  }
  try {
    const deletion = await admin.auth.admin.deleteUser(userId);
    if (!deletion.error) {
      logReaderAction({
        action: 'delete',
        entity: 'account-deletion',
        userId,
        actorEmail,
        detail: 'Konto endgültig gelöscht',
        ipAddress,
      });
      return 'deleted';
    }
    if (deletion.error.status === 404) {
      logReaderAction({
        action: 'confirm',
        entity: 'account-deletion',
        userId,
        detail: 'Konto bereits gelöscht (404)',
        ipAddress,
      });
      return 'missing';
    }
    console.error('auth.account_deletion_confirm_failed');
    logReaderAction({
      action: 'confirm',
      entity: 'account-deletion',
      userId,
      detail: `Löschung fehlgeschlagen: ${deletion.error.message}`,
      ipAddress,
    });
    return 'failed';
  } catch {
    console.error('auth.account_deletion_confirm_failed');
    logReaderAction({
      action: 'confirm',
      entity: 'account-deletion',
      userId,
      detail: 'Löschung fehlgeschlagen (Exception)',
      ipAddress,
    });
    return 'failed';
  }
}
