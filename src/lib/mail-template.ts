// Gemeinsame Bausteine für HTML-E-Mails aus der Anwendung: einheitlicher
// Rahmen mit Fanblog-Kopf, weiße Karte und Fußzeile mit Impressum.

// HTML-Escaping für alle dynamischen Werte in den Mail-Templates.
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function mailFooter(origin: string): { text: string; html: string } {
  const impressum = new URL('/impressum', origin).toString();
  const datenschutz = new URL('/datenschutz', origin).toString();
  const agb = new URL('/agb', origin).toString();
  return {
    text: [
      '—',
      'Astro Fanblog · Ehrlicher Fanblog rund um den FC Example',
      `Impressum: ${impressum}`,
      `Datenschutz: ${datenschutz}`,
      `AGB: ${agb}`,
      'Diese Nachricht wurde automatisch über das No-Reply-Postfach von Astro Fanblog versendet. Bitte antworte nicht auf diese E-Mail.',
    ].join('\r\n'),
    html: `<tr>
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
                <a href="${escapeHtml(impressum)}" style="color: #62676b">Impressum</a>
                ·
                <a href="${escapeHtml(datenschutz)}" style="color: #62676b">Datenschutz</a>
                ·
                <a href="${escapeHtml(agb)}" style="color: #62676b">AGB</a><br />
                Automatisch über das No-Reply-Postfach versendet — bitte nicht
                antworten.
              </td>
            </tr>`,
  };
}

export function mailShell(
  eyebrow: string,
  title: string,
  bodyHtml: string,
  footerHtml: string,
  subject: string,
): { subject: string; html: string } {
  return {
    subject,
    html: `<!doctype html>
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
                  ${escapeHtml(eyebrow)}
                </p>
                <h2
                  style="
                    margin: 0 0 16px;
                    font-size: 20px;
                    line-height: 1.3;
                    color: #151719;
                  "
                >
                  ${escapeHtml(title)}
                </h2>
                ${bodyHtml}
              </td>
            </tr>
            ${footerHtml}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}
