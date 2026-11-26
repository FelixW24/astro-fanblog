import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { categories, categoryMeta } from './content';
import type { Database } from './database.types';
import {
  createNoReplyTransport,
  noReplyAddress,
  noReplyFromHeader,
} from './mail';
import { createAdminAuthClient } from './supabase';
import { appConfig } from '../config/app-config';

type AdminClient = SupabaseClient<Database>;

export interface NotificationPreference {
  category: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
}

// Liest die Benachrichtigungs-Einstellungen aus dem Profil-Formular. Pro
// Kategorie gibt es einen Schalter (pref_<slug>): E-Mail-Benachrichtigung
// läuft automatisch mit, die In-App-Benachrichtigung ist Default — beide
// Kanäle folgen dem Schalter. Unbekannte Felder werden ignoriert, weil nur
// bekannte Slugs ausgelesen werden.
export function parseNotificationPreferences(form: FormData): {
  preferences: NotificationPreference[];
  error?: string;
} {
  return {
    preferences: categories.map((category) => {
      const enabled = form.get(`pref_${category.slug}`) === 'on';
      return {
        category: category.slug,
        emailEnabled: enabled,
        inAppEnabled: enabled,
      };
    }),
  };
}

export function siteOrigin(): string {
  return appConfig().siteOrigin;
}

export function articleUrl(slug: string, origin = siteOrigin()): string {
  return new URL(`/beitraege/${slug}`, origin).toString();
}

// HMAC-Secret für Abmeldelinks in Benachrichtigungs-E-Mails. Ohne Secret
// (nicht konfiguriert oder kürzer als 32 Zeichen) wird kein Direktlink
// erzeugt — die Mail verweist dann nur auf die Profileinstellungen.
function unsubscribeSecret(): string | null {
  const secret = appConfig().notifications.unsubscribeSecret;
  return typeof secret === 'string' && secret.length >= 32 ? secret : null;
}

// Signiertes Token im Format v1.<userId>.<category>.<hmac-base64url>, damit
// der Abmeldelink in der E-Mail ohne Anmeldung einmalig Kategorie und
// Empfänger eindeutig zuordnet.
export function unsubscribeToken(
  userId: string,
  category: string,
): string | null {
  const secret = unsubscribeSecret();
  if (!secret || !userId || !category) return null;
  const payload = `v1.${userId}.${category}`;
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function validUnsubscribeToken(
  token: string | null | undefined,
  userId: string,
  category: string,
): boolean {
  const secret = unsubscribeSecret();
  if (!secret || !token || !userId || !category) return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const [, tokenUserId, tokenCategory, signature] = parts;
  if (tokenUserId !== userId || tokenCategory !== category) return false;
  const payload = `v1.${tokenUserId}.${tokenCategory}`;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(signature, 'base64url');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Komfort-Link wie beim Newsletter: Ein Klick auf /benachrichtigungen-abmelden
// deaktiviert die Benachrichtigung für diese Kategorie ohne Anmeldung.
export function unsubscribeUrl(
  userId: string,
  category: string,
  origin = siteOrigin(),
): string | null {
  const token = unsubscribeToken(userId, category);
  if (!token) return null;
  return new URL(
    `/benachrichtigungen-abmelden?token=${encodeURIComponent(token)}`,
    origin,
  ).toString();
}

export interface NewArticleMail {
  subject: string;
  text: string;
  html: string;
}

// Betreff, Text- und HTML-Template der Benachrichtigungsmail für einen neuen
// Beitrag. Versand läuft immer über das No-Reply-Postfach (siehe
// lib/mail.ts). Pro Empfänger, weil der Abmeldelink das signierte Token des
// jeweiligen Kontos enthält.
export function renderNewArticleMail(
  article: { title: string; slug: string; excerpt: string; category: string },
  recipient: { userId: string },
  origin = siteOrigin(),
): NewArticleMail {
  const label = categoryMeta(article.category).label;
  const url = articleUrl(article.slug, origin);
  const settingsUrl = new URL('/profil', origin).toString();
  const unsubscribe = unsubscribeUrl(
    recipient.userId,
    article.category,
    origin,
  );
  const subject = `Neuer Beitrag (${label}): ${article.title}`;
  const text = [
    'Hallo,',
    '',
    `es gibt einen neuen Beitrag auf Astro Fanblog in der Kategorie „${label}“:`,
    '',
    `„${article.title}“`,
    '',
    article.excerpt,
    '',
    `Beitrag lesen: ${url}`,
    '',
    'Du erhältst diese E-Mail, weil du in deinen Profileinstellungen die',
    `Benachrichtigung für die Kategorie „${label}“ aktiviert hast.`,
    ...(unsubscribe
      ? [
          `Abmelden (ohne Anmeldung): ${unsubscribe}`,
          `Oder über dein Profil (Benachrichtigungen): ${settingsUrl}`,
        ]
      : [
          `Abmelden kannst du dich jederzeit über dein Profil (Benachrichtigungen): ${settingsUrl}`,
        ]),
    '',
    'Viele Grüße',
    'Dein Astro Fanblog-Team',
    '',
    '—',
    'Astro Fanblog · Ehrlicher Fanblog rund um den FC Example',
    `Impressum: ${new URL('/impressum', origin)}`,
    `Datenschutz: ${new URL('/datenschutz', origin)}`,
    `AGB: ${new URL('/agb', origin)}`,
    'Diese Nachricht wurde automatisch über das No-Reply-Postfach von Astro Fanblog versendet. Bitte antworte nicht auf diese E-Mail.',
  ].join('\r\n');
  // Gleiche Optik wie die Supabase-Auth-Mails (supabase/templates/*.html):
  // Tabellen-Layout, helle Seite, weiße Karte, roter Fanblog-Button.
  const html = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body
    style="
      margin: 0;
      padding: 24px 16px;
      background: #f7f7f5;
      font-family:
        -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #151719;
    "
  >
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="background: #f7f7f5"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="560"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="width: 100%; max-width: 560px"
          >
            <tr>
              <td
                style="
                  padding: 0 8px 20px;
                  font-size: 18px;
                  font-weight: 700;
                  color: #151719;
                  text-align: left;
                "
              >
                Astro Fanblog<span style="color: #006284">.</span>
                <span
                  style="
                    display: block;
                    padding-top: 2px;
                    font-size: 10px;
                    font-weight: 600;
                    letter-spacing: 0.18em;
                    text-transform: uppercase;
                    color: #62676b;
                  "
                  >FC-Fanblog</span
                >
              </td>
            </tr>
            <tr>
              <td
                style="
                  padding: 32px;
                  background: #ffffff;
                  border: 1px solid #e2e3e4;
                  border-radius: 16px;
                "
              >
                <p
                  style="
                    margin: 0 0 8px;
                    font-size: 10px;
                    font-weight: 600;
                    letter-spacing: 0.18em;
                    text-transform: uppercase;
                    color: #62676b;
                  "
                >
                  Neue Benachrichtigung · ${escapeHtml(label)}
                </p>
                <h2
                  style="
                    margin: 0 0 16px;
                    font-size: 20px;
                    line-height: 1.3;
                    color: #151719;
                  "
                >
                  ${escapeHtml(article.title)}
                </h2>
                <p
                  style="
                    margin: 0 0 24px;
                    font-size: 15px;
                    line-height: 1.6;
                    color: #151719;
                  "
                >
                  ${escapeHtml(article.excerpt)}
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
                        >Beitrag lesen</a
                      >
                    </td>
                  </tr>
                </table>
                <p
                  style="
                    margin: 0;
                    font-size: 13px;
                    line-height: 1.6;
                    color: #62676b;
                  "
                >
                  Du erhältst diese E-Mail, weil du die Benachrichtigung für
                  die Kategorie „${escapeHtml(label)}“ in deinen
                  Profileinstellungen aktiviert hast.
                  ${unsubscribe ? `<a href="${escapeHtml(unsubscribe)}" style="color: #006284">Benachrichtigung für „${escapeHtml(label)}“ abbestellen</a> · ` : ''}<a href="${escapeHtml(settingsUrl)}" style="color: #006284">Einstellungen im Profil</a>
                </p>
              </td>
            </tr>
            <tr>
              <td
                style="
                  padding: 20px 8px 0;
                  font-size: 12px;
                  line-height: 1.6;
                  color: #62676b;
                  text-align: left;
                "
              >
                Astro Fanblog · Ehrlicher Fanblog rund um den FC Example<br />
                <a href="${escapeHtml(new URL('/impressum', origin).toString())}" style="color: #62676b">Impressum</a>
                ·
                <a href="${escapeHtml(new URL('/datenschutz', origin).toString())}" style="color: #62676b">Datenschutz</a>
                ·
                <a href="${escapeHtml(new URL('/agb', origin).toString())}" style="color: #62676b">AGB</a><br />
                Automatisch über das No-Reply-Postfach versendet — bitte nicht
                antworten.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface SendMailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  // Optionale Zusatz-Header, z. B. List-Unsubscribe (RFC 8058 One-Click)
  // für Newsletter-Mails.
  headers?: Record<string, string>;
}

// Default-Versand über das konfigurierte No-Reply-Postfach. Ohne SMTP-
// Konfiguration oder bei Versandfehler false zurückgeben; der Aufrufer
// (Veröffentlichungsprozess) läuft davon unbeeindruckt weiter.
export const sendNoReplyMail = async (
  message: SendMailMessage,
): Promise<boolean> => {
  const transporter = createNoReplyTransport();
  const envelopeFrom = noReplyAddress();
  const from = noReplyFromHeader();
  if (!transporter || !envelopeFrom || !from) {
    console.error('notifications.smtp_unconfigured');
    return false;
  }
  try {
    await transporter.sendMail({
      from,
      envelope: { from: envelopeFrom, to: message.to },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: message.headers,
    });
    return true;
  } catch (error) {
    console.error('notifications.send_failed', error);
    return false;
  }
};

// Bildet user_id auf die Konto-E-Mail-Adresse ab; liest dafür die Auth-Users
// seitenweise über den Admin-Client (Service-Role) aus.
async function listUserEmails(
  adminClient: AdminClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const wanted = new Set(userIds);
  const emails = new Map<string, string>();
  const perPage = 200;
  let page = 1;
  for (;;) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    for (const user of data.users) {
      if (wanted.has(user.id) && user.email) emails.set(user.id, user.email);
    }
    if (data.users.length < perPage || emails.size === wanted.size) break;
    page += 1;
  }
  return emails;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += limit) {
    results.push(
      ...(await Promise.all(items.slice(index, index + limit).map(fn))),
    );
  }
  return results;
}

export interface NotificationItem {
  id: number;
  title: string;
  slug: string;
  category: string;
  created_at: string;
  read_at: string | null;
}

export const NOTIFICATION_BELL_LIMIT = 10;

// Neueste eigene Benachrichtigungen plus Ungelesen-Zahl für die Glocke im
// Header. Der Request-Client genügt: Die RLS-Policy erlaubt eigene Zeilen.
export async function getNotificationBellData(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ items: NotificationItem[]; unreadCount: number }> {
  const unread = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  const items = await supabase
    .from('notifications')
    .select('id, title, slug, category, created_at, read_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_BELL_LIMIT);
  return {
    items: (items.data ?? []) as NotificationItem[],
    unreadCount: unread.count ?? 0,
  };
}

export interface DispatchOptions {
  slug: string;
  adminClient?: AdminClient;
  sendMail?: (message: SendMailMessage) => Promise<boolean>;
  origin?: string;
}

export interface DispatchResult {
  articleId: number | null;
  inApp: number;
  emails: number;
  skipped: boolean;
}

// Fan-out beim Veröffentlichen eines Beitrags: In-App-Benachrichtigungen für
// alle Abonnenten der Kategorie in public.notifications eintragen und
// E-Mail-Benachrichtigungen über das No-Reply-Postfach versenden. Läuft
// ausschließlich mit dem Service-Role-Client (RLS umgehen, weil Zeilen für
// fremde Konten angelegt werden) und wirft nie: Ein Fehler hier darf das
// Veröffentlichen des Beitrags nicht verhindern.
export async function dispatchNewArticleNotification({
  slug,
  adminClient = createAdminAuthClient(),
  sendMail = sendNoReplyMail,
  origin = siteOrigin(),
}: DispatchOptions): Promise<DispatchResult> {
  const skipped: DispatchResult = {
    articleId: null,
    inApp: 0,
    emails: 0,
    skipped: true,
  };
  try {
    const { data: article, error: articleError } = await adminClient
      .from('articles')
      .select('id, title, slug, excerpt, category, status, published_at')
      .eq('slug', slug)
      .single();
    if (articleError || !article) {
      console.error('notifications.article_lookup_failed', articleError);
      return skipped;
    }
    // Nur tatsächlich sichtbare Beiträge benachrichtigen; Entwürfe und
    // terminierte Beiträge warten auf ihre Veröffentlichung.
    if (
      article.status !== 'published' ||
      !article.published_at ||
      new Date(article.published_at) > new Date()
    ) {
      return { ...skipped, articleId: article.id };
    }

    const { data: preferences, error: prefsError } = await adminClient
      .from('article_notification_preferences')
      .select('user_id, email_enabled, in_app_enabled')
      .eq('category', article.category);
    if (prefsError) {
      console.error('notifications.preferences_failed', prefsError);
      return { ...skipped, articleId: article.id };
    }
    if (!preferences || preferences.length === 0) {
      return { ...skipped, articleId: article.id };
    }

    const inAppRows = preferences
      .filter((preference) => preference.in_app_enabled)
      .map((preference) => ({
        user_id: preference.user_id,
        article_id: article.id,
        category: article.category,
        title: article.title,
        slug: article.slug,
      }));
    let inApp = 0;
    if (inAppRows.length > 0) {
      const { error: insertError } = await adminClient
        .from('notifications')
        .insert(inAppRows);
      if (insertError) {
        console.error('notifications.insert_failed', insertError);
      } else {
        inApp = inAppRows.length;
      }
    }

    const emailUserIds = preferences
      .filter((preference) => preference.email_enabled)
      .map((preference) => preference.user_id);
    let emails = 0;
    if (emailUserIds.length > 0) {
      const userEmails = await listUserEmails(adminClient, emailUserIds);
      const results = await mapLimit(emailUserIds, 5, async (userId) => {
        const to = userEmails.get(userId);
        if (!to) return false;
        // Pro Empfänger rendern: Der Abmeldelink trägt das signierte Token
        // des jeweiligen Kontos.
        const mail = renderNewArticleMail(article, { userId }, origin);
        return await sendMail({
          to,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        });
      });
      emails = results.filter(Boolean).length;
    }

    return { articleId: article.id, inApp, emails, skipped: false };
  } catch (error) {
    console.error('notifications.dispatch_failed', error);
    return skipped;
  }
}
