import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { appConfig } from '../config/app-config';
import type { Database } from './database.types';
import { escapeHtml, mailFooter, mailShell } from './mail-template';
import { siteOrigin } from './notifications';

// Newsletter: Anmeldung über das Willkommens-Modal (Double-Opt-in), Versand
// redaktionell gesteuert aus /admin/newsletter, Abmeldung per signiertem
// Ein-Klick-Link in jeder Mail (kein Formular, keine Anmeldung).

export type NewsletterPurpose = 'confirm' | 'unsubscribe';

export type SubscriberStatus = 'pending' | 'active' | 'unsubscribed';

/** Anzeigetexte des Willkommens-Modals (camelCase für die Komponenten). */
export interface NewsletterSettings {
  modalEnabled: boolean;
  newsletterEnabled: boolean;
  heading: string;
  intro: string;
  emailLabel: string;
  emailPlaceholder: string;
  submitLabel: string;
  privacyNote: string;
  successMessage: string;
}

/** Gleiche Felder in Spaltenform für Upserts in newsletter_settings. */
export type NewsletterSettingsRow = {
  modal_enabled: boolean;
  newsletter_enabled: boolean;
  heading: string;
  intro: string;
  email_label: string;
  email_placeholder: string;
  submit_label: string;
  privacy_note: string;
  success_message: string;
};

type SettingsRow = Database['public']['Tables']['newsletter_settings']['Row'];

// Feldlängen entsprechen den Check-Constraints der Migration; das Formular
// in der Redaktion wird serverseitig gegen dieselben Grenzen validiert.
export const NEWSLETTER_LIMITS = {
  heading: 120,
  intro: 2000,
  emailLabel: 200,
  emailPlaceholder: 254,
  submitLabel: 80,
  privacyNote: 1000,
  successMessage: 1000,
} as const;

export function defaultNewsletterSettings(): NewsletterSettings {
  return {
    modalEnabled: true,
    newsletterEnabled: true,
    heading: 'Willkommen auf Astro Fanblog!',
    intro:
      'Schön, dass du hier bist! Astro Fanblog ist ein Studentenprojekt rund um den FC Example.\n\nWir stecken noch mitten im Aufbau – deshalb kann es passieren, dass mal etwas nicht funktioniert oder Inhalte fehlen. Danke für dein Verständnis! Wenn dir etwas auffällt, melde es uns gerne über „Fehler melden“ im Footer.',
    emailLabel: 'E-Mail-Adresse für unseren Newsletter',
    emailPlaceholder: 'du@beispiel.de',
    submitLabel: 'Newsletter abonnieren',
    privacyNote:
      'Mit dem Abonnieren stimmst du dem Erhalt von Newsletter-E-Mails zu. Du kannst dich jederzeit mit einem Klick über den Abmeldelink in jeder E-Mail wieder abmelden. Mehr dazu in unserer Datenschutzerklärung.',
    successMessage:
      'Fast geschafft! Wir haben dir eine E-Mail mit einem Bestätigungslink geschickt. Bitte klicke auf den Link, um deine Anmeldung abzuschließen.',
  };
}

export function mapSettingsRow(row: SettingsRow): NewsletterSettings {
  return {
    modalEnabled: row.modal_enabled,
    newsletterEnabled: row.newsletter_enabled,
    heading: row.heading,
    intro: row.intro,
    emailLabel: row.email_label,
    emailPlaceholder: row.email_placeholder,
    submitLabel: row.submit_label,
    privacyNote: row.privacy_note,
    successMessage: row.success_message,
  };
}

// Öffentlich lesbare Modal-Texte laden; ohne Zeile oder bei Fehler fallen
// wir auf die Defaults zurück, damit die Seite nie wegen der Settings stehen
// bleibt. Der anonyme Lesezugriff ist in der Migration per Policy erlaubt.
export async function loadNewsletterSettings(
  supabase: SupabaseClient<Database>,
): Promise<NewsletterSettings> {
  const { data, error } = await supabase
    .from('newsletter_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle();
  if (error) console.error('newsletter.settings_load_failed', error);
  return data ? mapSettingsRow(data) : defaultNewsletterSettings();
}

// HMAC-Secret für die signierten Links. Ohne Secret (nicht konfiguriert
// oder kürzer als 32 Zeichen) werden keine Links erzeugt.
function tokenSecret(): string | null {
  const secret = appConfig().newsletter.tokenSecret;
  return typeof secret === 'string' && secret.length >= 32 ? secret : null;
}

// Ablauf- und Löschfristen in Tagen/Jahren (Unix-Sekunden bzw..DB-Zeitstempel).
// Bestätigungslinks laufen nach 7 Tagen ab; Abmeldelinks bleiben unbegrenzt
// gültig, damit auch alte Mails noch abmelden können. Unbestätigte Anmeldungen
// werden nach 30 Tagen gelöscht (keine Einwilligung erfolgt), abgemeldete
// Adressen spätestens 3 Jahre nach der Abmeldung (Datenschutz Abschnitt 6).
export const NEWSLETTER_RETENTION = {
  confirmTokenDays: 7,
  pendingDeleteDays: 30,
  unsubscribedDeleteYears: 3,
} as const;

const DAY_SECONDS = 24 * 60 * 60;
const DAY_MS = DAY_SECONDS * 1000;

// Signiertes Token im Format v1.<id>.<purpose>.<expiry>.<hmac-base64url>.
// expiry ist ein Unix-Zeitstempel in Sekunden und mit signiert, damit er
// nicht nachträglich verlängert werden kann; 0 bedeutet ohne Ablauf. Der
// Zweck (confirm/unsubscribe) ist einkodiert, damit ein Bestätigungslink
// nicht als Abmeldung missbraucht werden kann und umgekehrt.
export function newsletterToken(
  id: string,
  purpose: NewsletterPurpose,
): string | null {
  const secret = tokenSecret();
  if (!secret || !id || !purpose) return null;
  const expiry =
    purpose === 'confirm'
      ? Math.floor(Date.now() / 1000) +
        NEWSLETTER_RETENTION.confirmTokenDays * DAY_SECONDS
      : 0;
  const payload = `v1.${id}.${purpose}.${expiry}`;
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function validNewsletterToken(
  token: string | null | undefined,
  id: string,
  purpose: NewsletterPurpose,
): boolean {
  const secret = tokenSecret();
  if (!secret || !token || !id || !purpose) return false;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') return false;
  const [, tokenId, tokenPurpose, expiry, signature] = parts;
  if (tokenId !== id || tokenPurpose !== purpose) return false;
  // Ablaufzeit als reine Ziffern (Unix-Sekunden, 0 = ohne Ablauf).
  if (!/^\d{1,10}$/.test(expiry)) return false;
  if (Number(expiry) !== 0 && Number(expiry) * 1000 < Date.now()) return false;
  // HMAC-SHA256 als base64url ohne Padding ist immer 43 Zeichen; strikte
  // Zeichensatz-Prüfung, damit gepaddete oder angehängte Suffixe (die der
  // base64-Decoder sonst ignorieren würde) nicht als gültig durchgehen.
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const payload = `v1.${tokenId}.${tokenPurpose}.${expiry}`;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(signature, 'base64url');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Abonnenten-ID aus einem Link-Token lesen (Format v1.<id>.<zweck>.<ablauf>).
// Liefert null, wenn der Token nicht das erwartete Format hat; Sin und
// Signatur prüft validNewsletterToken.
export function newsletterSubscriberId(
  token: string | null | undefined,
): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1' || !parts[1]) return null;
  return parts[1];
}

export function confirmUrl(id: string, origin = siteOrigin()): string | null {
  const token = newsletterToken(id, 'confirm');
  if (!token) return null;
  return new URL(
    `/newsletter/bestaetigen?token=${encodeURIComponent(token)}`,
    origin,
  ).toString();
}

// Komfort-Abmeldung wie bei den Beitrags-Benachrichtigungen: Ein Klick auf
// /newsletter/abmelden deaktiviert das Abonnement sofort ohne Anmeldung.
export function newsletterUnsubscribeUrl(
  id: string,
  origin = siteOrigin(),
): string | null {
  const token = newsletterToken(id, 'unsubscribe');
  if (!token) return null;
  return new URL(
    `/newsletter/abmelden?token=${encodeURIComponent(token)}`,
    origin,
  ).toString();
}

// E-Mail-Adresse normalisieren und prüfen. Kleinschreibung, keine Leer- und
// Steuerzeichen, übliches local@domain.tld-Muster, maximal 254 Zeichen
// (RFC 5321). Liefert null statt einer Adresse, wenn ungültig.
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (/[\s@]{2,}|@[^@]*@/.test(email)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export function parseNewsletterSignup(
  form: FormData,
): { email: string } | { error: string } {
  const email = normalizeEmail(form.get('email'));
  if (!email) return { error: 'Bitte gib eine gültige E-Mail-Adresse ein.' };
  return { email };
}

function textField(
  form: FormData,
  name: string,
  max: number,
  min = 1,
): string | null {
  const raw = form.get(name);
  if (typeof raw !== 'string') return null;
  const value = raw.replace(/\r/g, '').trim();
  if (value.length < min || value.length > max) return null;
  return value;
}

// Liest das Settings-Formular aus /admin/newsletter. Checkboxen werden als
// 'on' erwartet; Textfelder gegen die Datenbank-Constraints geprüft.
export function parseNewsletterSettings(form: FormData): {
  settings?: NewsletterSettingsRow;
  error?: string;
} {
  const heading = textField(form, 'heading', NEWSLETTER_LIMITS.heading);
  const intro = textField(form, 'intro', NEWSLETTER_LIMITS.intro);
  const emailLabel = textField(
    form,
    'email_label',
    NEWSLETTER_LIMITS.emailLabel,
  );
  const submitLabel = textField(
    form,
    'submit_label',
    NEWSLETTER_LIMITS.submitLabel,
  );
  const privacyNote = textField(
    form,
    'privacy_note',
    NEWSLETTER_LIMITS.privacyNote,
  );
  const successMessage = textField(
    form,
    'success_message',
    NEWSLETTER_LIMITS.successMessage,
  );
  const emailPlaceholder = textField(
    form,
    'email_placeholder',
    NEWSLETTER_LIMITS.emailPlaceholder,
    0,
  );
  if (
    !heading ||
    !intro ||
    !emailLabel ||
    !submitLabel ||
    !privacyNote ||
    !successMessage ||
    emailPlaceholder === null
  ) {
    return {
      error:
        'Ein Textfeld ist leer oder überschreitet die zulässige Länge. Bitte prüfe die markierten Felder.',
    };
  }
  return {
    settings: {
      modal_enabled: form.get('modal_enabled') === 'on',
      newsletter_enabled: form.get('newsletter_enabled') === 'on',
      heading,
      intro,
      email_label: emailLabel,
      email_placeholder: emailPlaceholder,
      submit_label: submitLabel,
      privacy_note: privacyNote,
      success_message: successMessage,
    },
  };
}

// Intro-Text des Modals in Absätze aufteilen (Leerzeilen trennen).
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((part) =>
      part
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

// Zeitstempel der Abonnentenliste in der Redaktion lesbar formatieren.
export function formatSubscriberTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  }).format(date);
}

export interface NewsletterMail {
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

// Double-Opt-in-Mail: Der Bestätigungslink ist pro Abonnent signiert. Erst
// mit dem Klick wird der Status auf active gesetzt.
export function renderConfirmationMail(options: {
  to: string;
  confirmUrl: string;
  settings: NewsletterSettings;
  origin?: string;
}): NewsletterMail {
  const origin = options.origin ?? siteOrigin();
  const { confirmUrl, settings } = options;
  const subject = 'Bitte bestätige deine Newsletter-Anmeldung – Astro Fanblog';
  const footer = mailFooter(origin);
  const text = [
    'Hallo,',
    '',
    'du möchtest den Newsletter von Astro Fanblog abonnieren. Bitte bestätige',
    'deine Anmeldung mit einem Klick auf diesen Link:',
    '',
    confirmUrl,
    '',
    'Der Link ist nur für diese E-Mail-Adresse gültig. Hast du dich nicht',
    'angemeldet, ignoriere diese E-Mail einfach – es passiert nichts.',
    '',
    'Nach der Bestätigung erhältst du unseren Newsletter per E-Mail. Du',
    'kannst dich jederzeit mit einem Klick über den Abmeldelink in jeder',
    'unserer E-Mails wieder abmelden.',
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
                  Du möchtest den Newsletter von Astro Fanblog abonnieren. Bitte
                  bestätige deine Anmeldung mit einem Klick auf den Button:
                </p>
                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  style="margin: 0 0 24px"
                >
                  <tr>
                    <td style="background: #d20a0a; border-radius: 10px">
                      <a
                        href="${escapeHtml(confirmUrl)}"
                        style="
                          display: inline-block;
                          padding: 12px 24px;
                          font-size: 15px;
                          font-weight: 600;
                          color: #ffffff;
                          text-decoration: none;
                        "
                        >Anmeldung bestätigen</a
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
                  Der Link ist nur für diese E-Mail-Adresse gültig. Hast du dich
                  nicht angemeldet, ignoriere diese E-Mail einfach.
                  ${escapeHtml(settings.privacyNote)}
                </p>`;
  const { html } = mailShell(
    'Newsletter · Double-Opt-in',
    'Anmeldung bestätigen',
    bodyHtml,
    footer.html,
    subject,
  );
  return { subject, text, html };
}

// Newsletter-Ausgabe, die die Redaktion in /admin/newsletter versendet. Pro
// Empfänger, weil der Abmeldelink das signierte Token des Abonnements enthält.
// List-Unsubscribe mit One-Click (RFC 8058), damit kompatible Mailprogramme
// die Abmeldung ebenfalls mit einem Klick anbieten.
export function renderIssueMail(options: {
  to: string;
  subject: string;
  body: string;
  unsubscribeUrl: string;
  origin?: string;
}): NewsletterMail {
  const origin = options.origin ?? siteOrigin();
  const { subject, body, unsubscribeUrl } = options;
  const homeUrl = new URL('/', origin).toString();
  const footer = mailFooter(origin);
  const text = [
    body.trim(),
    '',
    `Weiterlesen auf Astro Fanblog: ${homeUrl}`,
    '',
    `Abmelden (ein Klick, ohne Anmeldung): ${unsubscribeUrl}`,
    '',
    footer.text,
  ].join('\r\n');
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map(
      (part) =>
        `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #151719;">${escapeHtml(part).replaceAll('\n', '<br />')}</p>`,
    )
    .join('');
  const bodyHtml = `${paragraphs}
                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  style="margin: 0 0 24px"
                >
                  <tr>
                    <td style="background: #d20a0a; border-radius: 10px">
                      <a
                        href="${escapeHtml(homeUrl)}"
                        style="
                          display: inline-block;
                          padding: 12px 24px;
                          font-size: 15px;
                          font-weight: 600;
                          color: #ffffff;
                          text-decoration: none;
                        "
                        >Zu Astro Fanblog</a
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
                  Du erhältst diese E-Mail, weil du den Fanblog-Newsletter
                  abonniert hast.
                  <a href="${escapeHtml(unsubscribeUrl)}" style="color: #d20a0a">Newsletter abbestellen (ein Klick, ohne Anmeldung)</a>
                </p>`;
  const { html } = mailShell(
    'Newsletter',
    subject,
    bodyHtml,
    footer.html,
    subject,
  );
  return {
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

// Spaltendaten für den CSV-Export in der Redaktion.
export interface SubscriberExportRow {
  email: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}

// Eine CSV-Zelle quoten. Werte, die in Tabellenkalkulationen als Formel
// gedeutet werden könnten (CSV-Injection), bekommen ein Hochkomma vorangestellt.
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

// Status-Label für die Abonnentenliste und den CSV-Export; unbekannte Werte
// fallen roh durch (die Datenbank erzwingt die drei bekannten Status).
export function subscriberStatusLabel(status: string): string {
  const labels: Record<SubscriberStatus, string> = {
    pending: 'ausstehend',
    active: 'aktiv',
    unsubscribed: 'abgemeldet',
  };
  return labels[status as SubscriberStatus] ?? status;
}

export function subscribersCsv(rows: SubscriberExportRow[]): string {
  const header = [
    'E-Mail-Adresse',
    'Status',
    'Angemeldet',
    'Bestätigt',
    'Abgemeldet',
  ]
    .map(csvCell)
    .join(',');
  const body = rows.map((row) =>
    [
      row.email,
      subscriberStatusLabel(row.status),
      row.created_at,
      row.confirmed_at ?? '',
      row.unsubscribed_at ?? '',
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...body].join('\r\n');
}

// Löschzeitpunkte für die automatische Bereinigung (Datenschutz Abschnitt 6):
// unbestätigte Anmeldungen nach 30 Tagen, abgemeldete Adressen spätestens
// drei Jahre nach der Abmeldung.
export function newsletterRetentionCutoffs(now = Date.now()): {
  pending: string;
  unsubscribed: string;
} {
  return {
    pending: new Date(
      now - NEWSLETTER_RETENTION.pendingDeleteDays * DAY_MS,
    ).toISOString(),
    unsubscribed: new Date(
      now - NEWSLETTER_RETENTION.unsubscribedDeleteYears * 365 * DAY_MS,
    ).toISOString(),
  };
}

// Bereinigt abgelaufene Einträge serverseitig. Läuft read-only bestehend
// nebenher; Fehler brechen den aufrufenden Request nicht ab. Aufruf durch
// die Redaktion beim Öffnen der Newsletter-Verwaltung.
export async function purgeStaleSubscribers(
  admin: SupabaseClient<Database>,
): Promise<void> {
  const { pending, unsubscribed } = newsletterRetentionCutoffs();
  const pendingDelete = await admin
    .from('newsletter_subscribers')
    .delete()
    .eq('status', 'pending')
    .lt('created_at', pending);
  if (pendingDelete.error)
    console.error('newsletter.purge_pending_failed', pendingDelete.error);
  const unsubscribedDelete = await admin
    .from('newsletter_subscribers')
    .delete()
    .eq('status', 'unsubscribed')
    .lt('unsubscribed_at', unsubscribed);
  if (unsubscribedDelete.error)
    console.error(
      'newsletter.purge_unsubscribed_failed',
      unsubscribedDelete.error,
    );
}
