import type { Transporter } from 'nodemailer';
import { createNoReplyTransport, noReplyAddress } from './mail';

// Fehlermeldung aus dem Footer-Modal: Angemeldete Leser senden ihren Bericht
// über POST /api/bug-report. Der Server versendet die Nachricht per SMTP an
// die Redaktionsadresse; die Zugangsdaten liegen ausschließlich in Env-Vars.
export const BUG_REPORT_EMAIL = 'bug-report@example.com';

export const BUG_REPORT_CATEGORIES = [
  'Darstellung',
  'Funktion',
  'Inhalt',
  'Sonstiges',
] as const;

export interface BugReport {
  category: string;
  page: string;
  description: string;
}

// Die Feldgrenzen spiegeln die Constraints im Modal; der Server vertraut
// dem Client nicht, sondern prüft erneut.
export const parseBugReport = (
  form: FormData,
): { error?: string; report?: BugReport } => {
  const category = String(form.get('category') ?? '').trim();
  const page = String(form.get('page') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  if (!(BUG_REPORT_CATEGORIES as readonly string[]).includes(category))
    return { error: 'Bitte wähle eine Kategorie.' };
  if (!page || page.length > 2048)
    return {
      error: 'Bitte gib die Seite an, auf der der Fehler aufgetreten ist.',
    };
  if (description.length < 10 || description.length > 2000)
    return {
      error:
        'Bitte beschreibe den Fehler mit mindestens 10 Zeichen (maximal 2000).',
    };
  return { report: { category, page, description } };
};

export interface BugReportMessage {
  subject: string;
  text: string;
  replyTo?: string;
  // Sichtbarer Absender im From-Header. Kann eine beliebige, vom Leser
  // angegebene Adresse sein (Anonymität); der envelope-Absender bleibt
  // immer das SMTP-Postfach, weil der Anbieter nur eigene Adressen annimmt.
  from?: string;
}

// Betreff und Body für die Redaktionsmail; die Anmeldung des Lesers steht
// mit im Text, damit die Redaktion Rückfragen stellen kann.
export const renderBugReport = (
  report: BugReport,
  user: { id: string; email?: string | null },
): BugReportMessage => {
  const subject = `Fehlermeldung: ${report.category} – ${report.page}`;
  const lines = [
    `Kategorie: ${report.category}`,
    `Seite: ${report.page}`,
    '',
    report.description,
    '',
    `Gemeldet von: ${user.email ?? user.id}`,
  ];
  const from = user.email || undefined;
  return {
    subject,
    text: lines.join('\r\n'),
    replyTo: from,
    from,
  };
};

// Ohne vollständige SMTP-Konfiguration gibt der Versand null zurück; die
// Route antwortet dann mit einem klaren Hinweis statt eines Crashes.
export const sendBugReport = async (
  message: BugReportMessage,
  transporterFactory: () => Transporter | null = createNoReplyTransport,
): Promise<boolean> => {
  const transporter = transporterFactory();
  if (!transporter) {
    console.error('bug_report.smtp_unconfigured');
    return false;
  }
  try {
    // Der Envelope-Absender muss dem SMTP-Postfach gehören; der Anbieter
    // lehnt fremde Adressen mit 553 ab. Die Leser-Adresse steht nur im
    // From-Header, nie im Envelope.
    const sender = noReplyAddress();
    if (!sender) {
      console.error('bug_report.smtp_unconfigured');
      return false;
    }
    await transporter.sendMail({
      from: message.from ?? sender,
      envelope: { from: sender, to: BUG_REPORT_EMAIL },
      to: BUG_REPORT_EMAIL,
      subject: message.subject,
      text: message.text,
      replyTo: message.replyTo,
    });
    return true;
  } catch (error) {
    console.error('bug_report.send_failed', error);
    return false;
  }
};
