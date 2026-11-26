import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NEWSLETTER_LIMITS,
  NEWSLETTER_RETENTION,
  confirmUrl,
  csvCell,
  defaultNewsletterSettings,
  formatSubscriberTimestamp,
  mapSettingsRow,
  newsletterRetentionCutoffs,
  newsletterSubscriberId,
  newsletterToken,
  newsletterUnsubscribeUrl,
  normalizeEmail,
  parseNewsletterSettings,
  parseNewsletterSignup,
  renderConfirmationMail,
  renderIssueMail,
  splitParagraphs,
  subscribersCsv,
  validNewsletterToken,
} from './newsletter';

afterEach(() => {
  vi.unstubAllEnvs();
});

const SECRET = 's'.repeat(32);
const ID = '11111111-2222-4333-8444-555555555555';

function settingsForm(overrides: Record<string, string> = {}) {
  const defaults = defaultNewsletterSettings();
  const form = new FormData();
  form.set('modal_enabled', 'on');
  form.set('newsletter_enabled', 'on');
  form.set('heading', defaults.heading);
  form.set('intro', defaults.intro);
  form.set('email_label', defaults.emailLabel);
  form.set('email_placeholder', defaults.emailPlaceholder);
  form.set('submit_label', defaults.submitLabel);
  form.set('privacy_note', defaults.privacyNote);
  form.set('success_message', defaults.successMessage);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === '') form.delete(key);
    else form.set(key, value);
  }
  return form;
}

describe('normalizeEmail', () => {
  it('normalisiert gültige Adressen auf Kleinschreibung', () => {
    expect(normalizeEmail('  Felix.Walter@Example.DE ')).toBe(
      'felix.walter@example.de',
    );
    expect(normalizeEmail('a+b@c.de')).toBe('a+b@c.de');
  });

  it('lehnt ungültige Eingaben ab', () => {
    expect(normalizeEmail('keine-adresse')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail('a b@c.de')).toBeNull();
    expect(normalizeEmail('a@@c.de')).toBeNull();
    expect(normalizeEmail('@c.de')).toBeNull();
    expect(normalizeEmail('a@.de')).toBeNull();
    expect(normalizeEmail(`${'a'.repeat(250)}@c.de`)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});

describe('parseNewsletterSignup', () => {
  it('liefert die normalisierte Adresse', () => {
    const form = new FormData();
    form.set('email', 'User@AstroFanblog.de');
    expect(parseNewsletterSignup(form)).toEqual({ email: 'user@example.com' });
  });

  it('liefert einen Fehler bei ungültiger Adresse', () => {
    const form = new FormData();
    form.set('email', 'kaputt');
    const result = parseNewsletterSignup(form);
    expect('error' in result).toBe(true);
  });
});

describe('newsletterToken', () => {
  it('signiert und verifiziert Tokens pro Zweck', () => {
    vi.stubEnv('NEWSLETTER_TOKEN_SECRET', SECRET);
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', '');
    const confirm = newsletterToken(ID, 'confirm');
    const unsubscribe = newsletterToken(ID, 'unsubscribe');
    expect(confirm).toBeTruthy();
    expect(validNewsletterToken(confirm, ID, 'confirm')).toBe(true);
    // Zweck ist einkodiert: Bestätigungslink ist kein Abmeldelink.
    expect(validNewsletterToken(confirm, ID, 'unsubscribe')).toBe(false);
    expect(validNewsletterToken(unsubscribe, ID, 'confirm')).toBe(false);
    expect(validNewsletterToken(unsubscribe, ID, 'unsubscribe')).toBe(true);
    // Falsche ID oder manipulierte Signatur fallen durch.
    expect(validNewsletterToken(confirm, 'anderer', 'confirm')).toBe(false);
    expect(validNewsletterToken(`${confirm}x`, ID, 'confirm')).toBe(false);
    expect(validNewsletterToken(null, ID, 'confirm')).toBe(false);
    expect(validNewsletterToken('v1.abc.confirm', ID, 'confirm')).toBe(false);
    // Gepaddete Signatur (base64 mit '='): Suffixe nach dem Padding duerfen
    // nicht akzeptiert werden.
    const [p, i, pur, exp, sig] = confirm!.split('.');
    const padded = `${sig}==`;
    expect(
      validNewsletterToken(`${p}.${i}.${pur}.${exp}.${padded}`, ID, 'confirm'),
    ).toBe(false);
    expect(
      validNewsletterToken(`${p}.${i}.${pur}.${exp}.${padded}x`, ID, 'confirm'),
    ).toBe(false);
  });

  it('baut Tokens im Format v1.<id>.<zweck>.<ablauf>.<signatur>', () => {
    vi.stubEnv('NEWSLETTER_TOKEN_SECRET', SECRET);
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', '');
    const now = Math.floor(Date.now() / 1000);
    const confirm = newsletterToken(ID, 'confirm')!.split('.');
    expect(confirm).toHaveLength(5);
    expect(confirm[0]).toBe('v1');
    expect(confirm[1]).toBe(ID);
    expect(confirm[2]).toBe('confirm');
    // Ablauf = jetzt + 7 Tage (mit etwas Puffer nach unten und oben).
    const expiry = Number(confirm[3]);
    expect(expiry).toBeGreaterThan(
      now + (NEWSLETTER_RETENTION.confirmTokenDays - 1) * 24 * 3600,
    );
    expect(expiry).toBeLessThan(
      now + (NEWSLETTER_RETENTION.confirmTokenDays + 1) * 24 * 3600,
    );
    // Abmeldelinks laufen nie ab (0).
    const unsubscribe = newsletterToken(ID, 'unsubscribe')!.split('.');
    expect(unsubscribe).toHaveLength(5);
    expect(unsubscribe[3]).toBe('0');
  });

  it('lehnt abgelaufene confirm-Tokens ab, unsubscribe bleibt gueltig', () => {
    vi.stubEnv('NEWSLETTER_TOKEN_SECRET', SECRET);
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', '');
    const sign = (payload: string) =>
      createHmac('sha256', SECRET).update(payload).digest('base64url');
    const past = Math.floor(Date.now() / 1000) - 1;
    const expired = `v1.${ID}.confirm.${past}.${sign(`v1.${ID}.confirm.${past}`)}`;
    // Korrekt signiert, aber abgelaufen: Link ungueltig, Format bleibt lesbar.
    expect(validNewsletterToken(expired, ID, 'confirm')).toBe(false);
    expect(newsletterSubscriberId(expired)).toBe(ID);

    const future = Math.floor(Date.now() / 1000) + 60;
    const fresh = `v1.${ID}.confirm.${future}.${sign(`v1.${ID}.confirm.${future}`)}`;
    expect(validNewsletterToken(fresh, ID, 'confirm')).toBe(true);

    // Ablauf nachträglich auf "ohne Ablauf" verdrehen: Signatur passt nicht.
    const forged = `v1.${ID}.confirm.0.${sign(`v1.${ID}.confirm.${past}`)}`;
    expect(validNewsletterToken(forged, ID, 'confirm')).toBe(false);

    // Ungültige Ablaufwerte (nicht nummerisch, zu lang) fallen durch.
    const text = `v1.${ID}.confirm.abc.${sign(`v1.${ID}.confirm.abc`)}`;
    expect(validNewsletterToken(text, ID, 'confirm')).toBe(false);
    const long = `v1.${ID}.confirm.${'1'.repeat(11)}.${sign(`v1.${ID}.confirm.${'1'.repeat(11)}`)}`;
    expect(validNewsletterToken(long, ID, 'confirm')).toBe(false);
  });

  it('liefert ohne Secret (auch über Fallback) kein Token', () => {
    vi.stubEnv('NEWSLETTER_TOKEN_SECRET', '');
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', '');
    expect(newsletterToken(ID, 'confirm')).toBeNull();
    expect(validNewsletterToken('v1.a.confirm.0.b', ID, 'confirm')).toBe(false);
    expect(confirmUrl(ID, 'https://blog.example')).toBeNull();
    expect(newsletterUnsubscribeUrl(ID, 'https://blog.example')).toBeNull();
  });

  it('fällt auf das Notification-Secret zurück', () => {
    vi.stubEnv('NEWSLETTER_TOKEN_SECRET', '');
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', SECRET);
    expect(newsletterToken(ID, 'confirm')).toBeTruthy();
  });
});

describe('newsletterSubscriberId', () => {
  it('liest die Abonnenten-ID aus Links im gültigen Format', () => {
    vi.stubEnv('NEWSLETTER_TOKEN_SECRET', SECRET);
    expect(newsletterSubscriberId(newsletterToken(ID, 'confirm'))).toBe(ID);
    expect(newsletterSubscriberId(newsletterToken(ID, 'unsubscribe'))).toBe(ID);
  });

  it('lehnt leere und strukturungültige Token ab', () => {
    expect(newsletterSubscriberId(null)).toBeNull();
    expect(newsletterSubscriberId('')).toBeNull();
    expect(newsletterSubscriberId('v1.)).')).toBeNull();
    // Altes 4-Teil-Format ohne Ablauffeld ist kein gültiger Link mehr.
    expect(
      newsletterSubscriberId(`v1.${ID}.confirm.${'a'.repeat(43)}`),
    ).toBeNull();
    expect(
      newsletterSubscriberId(`v1..confirm.0.${'a'.repeat(43)}`),
    ).toBeNull();
  });
});

describe('Link-Helfer', () => {
  it('bauen URLs mit signiertem Token', () => {
    vi.stubEnv('NEWSLETTER_TOKEN_SECRET', SECRET);
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', '');
    const confirm = confirmUrl(ID, 'https://blog.example')!;
    expect(confirm).toContain(
      'https://blog.example/newsletter/bestaetigen?token=',
    );
    expect(confirm).toContain(`v1.${ID}.confirm.`);
    const unsubscribe = newsletterUnsubscribeUrl(ID, 'https://blog.example')!;
    expect(unsubscribe).toContain(
      'https://blog.example/newsletter/abmelden?token=',
    );
    expect(unsubscribe).toContain(`v1.${ID}.unsubscribe.0.`);
  });
});

describe('parseNewsletterSettings', () => {
  it('liest ein gültiges Formular inkl. Checkboxen', () => {
    const { settings, error } = parseNewsletterSettings(settingsForm());
    expect(error).toBeUndefined();
    expect(settings).toMatchObject({
      modal_enabled: true,
      newsletter_enabled: true,
      heading: defaultNewsletterSettings().heading,
    });
  });

  it('übernimmt abgewählte Checkboxen als false', () => {
    const form = settingsForm();
    form.delete('modal_enabled');
    form.delete('newsletter_enabled');
    const { settings } = parseNewsletterSettings(form);
    expect(settings?.modal_enabled).toBe(false);
    expect(settings?.newsletter_enabled).toBe(false);
  });

  it('lehnt leere Pflichtfelder und zu lange Texte ab', () => {
    expect(
      parseNewsletterSettings(settingsForm({ heading: '' })).error,
    ).toBeTruthy();
    expect(
      parseNewsletterSettings(
        settingsForm({ intro: 'x'.repeat(NEWSLETTER_LIMITS.intro + 1) }),
      ).error,
    ).toBeTruthy();
    expect(
      parseNewsletterSettings(
        settingsForm({
          privacy_note: 'x'.repeat(NEWSLETTER_LIMITS.privacyNote + 1),
        }),
      ).error,
    ).toBeTruthy();
  });

  it('teilt den Intro-Text an Leerzeilen', () => {
    expect(splitParagraphs('eins\n\nzwei\n\n\n drei \nvier')).toEqual([
      'eins',
      'zwei',
      'drei\nvier',
    ]);
  });

  it('formatiert Zeitstempel und hält ungültige Werte aus', () => {
    expect(formatSubscriberTimestamp(null)).toBe('—');
    expect(formatSubscriberTimestamp('kaputt')).toBe('—');
    const formatted = formatSubscriberTimestamp('2026-11-18T14:30:00.000Z');
    expect(formatted).toMatch(/18\.11\.2026/);
  });
});

describe('mapSettingsRow / defaults', () => {
  it('mapped eine Datenbankzeile auf die Komponenten-Struktur', () => {
    const row = {
      id: true,
      modal_enabled: false,
      newsletter_enabled: true,
      heading: 'Hallo',
      intro: 'Text',
      email_label: 'E-Mail',
      email_placeholder: 'du@beispiel.de',
      submit_label: 'Anmelden',
      privacy_note: 'Hinweis',
      success_message: 'Danke',
      updated_at: '2026-11-18T00:00:00.000Z',
    };
    expect(mapSettingsRow(row)).toEqual({
      modalEnabled: false,
      newsletterEnabled: true,
      heading: 'Hallo',
      intro: 'Text',
      emailLabel: 'E-Mail',
      emailPlaceholder: 'du@beispiel.de',
      submitLabel: 'Anmelden',
      privacyNote: 'Hinweis',
      successMessage: 'Danke',
    });
  });

  it('Defaults nennen das offene Projekt und den Aufbau', () => {
    const defaults = defaultNewsletterSettings();
    expect(defaults.intro).toContain('offenes Fanblog-Projekt');
    expect(defaults.intro).toContain('Aufbau');
    // Auf Wunsch ohne Namensnennung und Unabhängigkeits-Label im Modal.
    expect(defaults.intro).not.toContain('Max Mustermann');
    expect(defaults.intro).not.toContain('unabhängiges');
    expect(defaults.modalEnabled).toBe(true);
    expect(defaults.newsletterEnabled).toBe(true);
  });
});

describe('renderConfirmationMail', () => {
  it('enthält den Bestätigungslink in Text und HTML', () => {
    vi.stubEnv('NEWSLETTER_TOKEN_SECRET', SECRET);
    const url = confirmUrl(ID, 'https://blog.example')!;
    const mail = renderConfirmationMail({
      to: 'user@example.de',
      confirmUrl: url,
      settings: defaultNewsletterSettings(),
      origin: 'https://blog.example',
    });
    expect(mail.subject).toContain('bestätige');
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url);
    expect(mail.text).toContain('Abmeldelink');
    expect(mail.html).toContain('/datenschutz');
  });
});

describe('renderIssueMail', () => {
  it('personalisiert jede Mail mit dem Abmeldelink und One-Click-Headern', () => {
    vi.stubEnv('NEWSLETTER_TOKEN_SECRET', SECRET);
    const url = newsletterUnsubscribeUrl(ID, 'https://blog.example')!;
    const mail = renderIssueMail({
      to: 'user@example.de',
      subject: 'Neue Ausgabe',
      body: 'Hallo <b>du</b>,\n\nhttps://blog.example/beitraege/x',
      unsubscribeUrl: url,
      origin: 'https://blog.example',
    });
    expect(mail.subject).toBe('Neue Ausgabe');
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url);
    expect(mail.html).toContain('&lt;b&gt;du&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>du</b>');
    expect(mail.headers?.['List-Unsubscribe']).toBe(`<${url}>`);
    expect(mail.headers?.['List-Unsubscribe-Post']).toBe(
      'List-Unsubscribe=One-Click',
    );
    expect(mail.text).toContain('ein Klick');
  });
});

describe('csvCell / subscribersCsv', () => {
  it('escaped CSV-Injection-Präfixe und Anführungszeichen', () => {
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
    expect(csvCell('+SUM(A1)')).toBe('"\'+SUM(A1)"');
    expect(csvCell('-x')).toBe('"\'-x"');
    expect(csvCell('@cmd')).toBe('"\'@cmd"');
    expect(csvCell('\tx')).toBe('"\'\tx"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('user@example.com')).toBe('"user@example.com"');
  });

  it('baut den Export mit Headern, Status-Labels und leeren Spalten', () => {
    const csv = subscribersCsv([
      {
        email: 'user@example.com',
        status: 'active',
        created_at: '2026-11-18T10:00:00.000Z',
        confirmed_at: '2026-11-18T11:00:00.000Z',
        unsubscribed_at: null,
      },
      {
        email: '=x@boese.de',
        status: 'unsubscribed',
        created_at: '2026-11-01T10:00:00.000Z',
        confirmed_at: null,
        unsubscribed_at: '2026-11-02T10:00:00.000Z',
      },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      '"E-Mail-Adresse","Status","Angemeldet","Bestätigt","Abgemeldet"',
    );
    expect(lines[1]).toContain('"user@example.com","aktiv"');
    expect(lines[2]).toContain("'=x@boese.de");
    expect(lines[2]).toContain('"abgemeldet"');
    expect(lines[1]).toContain(',"2026-11-18T10:00:00.000Z",');
  });
});

describe('newsletterRetentionCutoffs', () => {
  it('berechnet die Löschfristen aus der Datenschutzerklärung', () => {
    const now = Date.UTC(2026, 10, 18, 12, 0, 0);
    const { pending, unsubscribed } = newsletterRetentionCutoffs(now);
    const day = 24 * 60 * 60 * 1000;
    expect(pending).toBe(
      new Date(
        now - NEWSLETTER_RETENTION.pendingDeleteDays * day,
      ).toISOString(),
    );
    expect(unsubscribed).toBe(
      new Date(
        now - NEWSLETTER_RETENTION.unsubscribedDeleteYears * 365 * day,
      ).toISOString(),
    );
  });
});
