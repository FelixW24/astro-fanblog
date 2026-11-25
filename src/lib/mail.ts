import nodemailer, { type Transporter } from 'nodemailer';
import { appConfig } from '../config/app-config';

// Gemeinsamer SMTP-Versand der Anwendung über das No-Reply-Postfach
// (produktuell no-reply@example.com über den konfigurierten SMTP-Server).
// Bug-Reports und Beitrags-Benachrichtigungen nutzen
// dieselbe Konfiguration; die Zugangsdaten liegen ausschließlich in
// der zentralen Serverkonfiguration (MAIL_SMTP_* und MAIL_FROM).

// Technische Absenderadresse (Envelope). Muss zum Postfach gehören, weil der
// Anbieter fremde Envelope-Absender mit 553 ablehnt.
export function noReplyAddress(): string | null {
  return appConfig().mail.from?.trim() || null;
}

// Sichtbarer From-Header mit Anzeigename, sofern die konfigurierte Adresse
// noch keinen Anzeigenamen trägt.
export function noReplyFromHeader(): string | null {
  const address = noReplyAddress();
  if (!address) return null;
  return address.includes('<') ? address : `Astro Fanblog <${address}>`;
}

// Ohne vollständige SMTP-Konfiguration null zurückgeben; Aufrufer antworten
// dann mit einem klaren Hinweis statt eines Crashes. Default-Port 465
// entspricht dem Produktionspostfach (implizites TLS); bei 587 handelt
// nodemailer STARTTLS. Die Timeouts begrenzen, wie lange ein hängender
// SMTP-Server eine Anfrage blockieren darf.
export function createNoReplyTransport(): Transporter | null {
  const { smtpHost: host, smtpUser: user, smtpPassword: pass, smtpPort } =
    appConfig().mail;
  if (!host || !user || !pass) return null;
  const port = smtpPort;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}
