import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Transporter } from 'nodemailer';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bugReportCooldown,
  bugReportRateLimit,
  createAuthLimiter,
} from './auth-rate-limit';
import {
  BUG_REPORT_CATEGORIES,
  BUG_REPORT_EMAIL,
  parseBugReport,
  renderBugReport,
  sendBugReport,
} from './bug-report';

const reportForm = (overrides: Record<string, string> = {}) => {
  const form = new FormData();
  form.set('category', 'Funktion');
  form.set('page', 'https://example.com/beitraege/demnaechst');
  form.set('description', 'Der Like-Button reagiert nicht.');
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
};

describe('parseBugReport', () => {
  it('liest einen vollständigen Bericht', () => {
    const { report, error } = parseBugReport(reportForm());
    expect(error).toBeUndefined();
    expect(report).toEqual({
      category: 'Funktion',
      page: 'https://example.com/beitraege/demnaechst',
      description: 'Der Like-Button reagiert nicht.',
    });
  });

  it('lehnt unbekannte Kategorien ab', () => {
    expect(parseBugReport(reportForm({ category: 'Spam' })).error).toBe(
      'Bitte wähle eine Kategorie.',
    );
  });

  it('lehnt fehlende und überlange Seiten ab', () => {
    expect(parseBugReport(reportForm({ page: '' })).error).toBe(
      'Bitte gib die Seite an, auf der der Fehler aufgetreten ist.',
    );
    expect(parseBugReport(reportForm({ page: 'a'.repeat(2049) })).error).toBe(
      'Bitte gib die Seite an, auf der der Fehler aufgetreten ist.',
    );
  });

  it('erzwingt die Beschreibungslänge', () => {
    expect(parseBugReport(reportForm({ description: 'zu kurz' })).error).toBe(
      'Bitte beschreibe den Fehler mit mindestens 10 Zeichen (maximal 2000).',
    );
    expect(
      parseBugReport(reportForm({ description: 'a'.repeat(2001) })).error,
    ).toBe(
      'Bitte beschreibe den Fehler mit mindestens 10 Zeichen (maximal 2000).',
    );
  });
});

describe('renderBugReport', () => {
  it('baut Betreff und Body mit Absender', () => {
    const message = renderBugReport(
      {
        category: 'Funktion',
        page: 'https://example.com/beitraege/demnaechst',
        description: 'Der Like-Button reagiert nicht.',
      },
      { id: 'user-1', email: 'fan@example.de' },
    );

    expect(message.subject).toBe(
      'Fehlermeldung: Funktion – https://example.com/beitraege/demnaechst',
    );
    expect(message.text).toBe(
      'Kategorie: Funktion\r\n' +
        'Seite: https://example.com/beitraege/demnaechst\r\n' +
        '\r\n' +
        'Der Like-Button reagiert nicht.\r\n' +
        '\r\n' +
        'Gemeldet von: fan@example.de',
    );
    expect(message.replyTo).toBe('fan@example.de');
    expect(message.from).toBe('fan@example.de');
  });

  it('fällt auf die Konto-Adresse als Reply-to zurück', () => {
    const message = renderBugReport(
      {
        category: 'Inhalt',
        page: 'https://example.com/',
        description: 'Tippfehler im Artikel.',
      },
      { id: 'user-1', email: 'fan@example.de' },
    );
    expect(message.replyTo).toBe('fan@example.de');
    expect(message.from).toBe('fan@example.de');
    expect(message.text).toContain('Gemeldet von: fan@example.de');
  });

  it('nennt die Benutzer-ID, wenn keine Adresse vorhanden ist', () => {
    const message = renderBugReport(
      {
        category: 'Inhalt',
        page: 'https://example.com/',
        description: 'Tippfehler im Artikel.',
      },
      { id: 'user-1' },
    );
    expect(message.text).toContain('Gemeldet von: user-1');
    expect(message.replyTo).toBeUndefined();
    expect(message.from).toBeUndefined();
  });
});

describe('sendBugReport', () => {
  const savedEnv = { ...process.env };
  const withEnv = (values: Record<string, string | undefined>) => {
    for (const key of Object.keys(process.env))
      if (key.startsWith('BUG_REPORT_') || key.startsWith('MAIL_'))
        delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  afterEach(() => {
    withEnv({});
    for (const [key, value] of Object.entries(savedEnv))
      process.env[key] = value;
  });

  it('lehnt ohne SMTP-Konfiguration ab', async () => {
    withEnv({
      BUG_REPORT_SMTP_HOST: undefined,
      BUG_REPORT_SMTP_USER: undefined,
      BUG_REPORT_SMTP_PASS: undefined,
    });
    await expect(sendBugReport({ subject: 'x', text: 'y' })).resolves.toBe(
      false,
    );
  });

  it('sendet an die Redaktionsadresse und meldet Fehler als false', async () => {
    withEnv({
      BUG_REPORT_SMTP_HOST: 'mail.example.com',
      BUG_REPORT_SMTP_USER: 'noreply@example.com',
      BUG_REPORT_SMTP_PASS: 'geheim',
      BUG_REPORT_MAIL_FROM: 'Astro Fanblog <noreply@example.com>',
    });
    const mails: Array<Record<string, unknown>> = [];
    const transport = {
      sendMail: async (options: Record<string, unknown>) => {
        mails.push(options);
        return {};
      },
    } as unknown as Transporter;
    const message = {
      subject: 'Fehlermeldung: Funktion',
      text: 'Body',
      replyTo: 'leser@example.de',
      from: 'leser@example.de',
    };
    await expect(sendBugReport(message, () => transport)).resolves.toBe(true);
    expect(mails).toEqual([
      {
        // From-Header: Adresse des Lesers; Envelope: eigenes Postfach,
        // weil der Anbieter fremde Absender mit 553 ablehnt.
        from: 'leser@example.de',
        envelope: {
          from: 'Astro Fanblog <noreply@example.com>',
          to: BUG_REPORT_EMAIL,
        },
        to: BUG_REPORT_EMAIL,
        subject: 'Fehlermeldung: Funktion',
        text: 'Body',
        replyTo: 'leser@example.de',
      },
    ]);

    const failing = {
      sendMail: async () => {
        throw new Error('smtp offline');
      },
    } as unknown as Transporter;
    await expect(sendBugReport(message, () => failing)).resolves.toBe(false);
  });

  it('nutzt ohne Leser-Adresse das Postfach als sichtbaren Absender', async () => {
    withEnv({
      BUG_REPORT_SMTP_HOST: 'mail.example.com',
      BUG_REPORT_SMTP_USER: 'noreply@example.com',
      BUG_REPORT_SMTP_PASS: 'geheim',
      BUG_REPORT_MAIL_FROM: undefined,
    });
    const mails: Array<Record<string, unknown>> = [];
    const transport = {
      sendMail: async (options: Record<string, unknown>) => {
        mails.push(options);
        return {};
      },
    } as unknown as Transporter;
    await expect(
      sendBugReport(
        {
          subject: 'x',
          text: 'y',
          replyTo: 'fan@example.de',
          from: 'fan@example.de',
        },
        () => transport,
      ),
    ).resolves.toBe(true);
    expect(mails[0].from).toBe('fan@example.de');
    expect(mails[0].envelope).toEqual({
      from: 'noreply@example.com',
      to: BUG_REPORT_EMAIL,
    });
  });
});

it('erlaubt nur einen Fehlerbericht pro Leser und 5 Minuten', () => {
  const limiter = createAuthLimiter(':memory:');
  try {
    expect(limiter.consume('user-1', 'bug-report', 1000)).toBe(0);
    expect(limiter.consume('user-1', 'bug-report', 1000)).toBe(300);
    expect(limiter.consume('user-2', 'bug-report', 1000)).toBe(0);
    expect(limiter.consume('user-1', 'bug-report', 301_000)).toBe(0);
  } finally {
    limiter.close();
  }
});

it('prüft den Bug-Report-Cooldown ohne den Zähler zu erhöhen', () => {
  const limiter = createAuthLimiter(':memory:');
  try {
    expect(limiter.peek('user-1', 'bug-report', 1000)).toBe(0);
    expect(limiter.consume('user-1', 'bug-report', 1000)).toBe(0);
    // Nach einem gezählten Versand blockiert peek für das ganze Fenster.
    expect(limiter.peek('user-1', 'bug-report', 1000)).toBe(300);
    // peek allein blockiert nicht und zählt nicht mit.
    expect(limiter.peek('user-1', 'bug-report', 2000)).toBe(299);
    expect(limiter.peek('user-1', 'bug-report', 2000)).toBe(299);
    // Ablauf des Fensters: consume erlaubt einen neuen Bericht, danach
    // läuft der Cooldown erneut.
    expect(limiter.consume('user-1', 'bug-report', 301_000)).toBe(0);
    expect(limiter.peek('user-1', 'bug-report', 301_000)).toBe(300);
    expect(limiter.peek('user-1', 'bug-report', 600_999)).toBe(1);
  } finally {
    limiter.close();
  }
});

it('begrenzt bugReportRateLimit über die geteilte SQLite-Datei', () => {
  const directory = mkdtempSync(join(tmpdir(), 'blog-bug-report-'));
  process.env.AUTH_RATE_LIMIT_DB = join(directory, 'limits.sqlite');
  try {
    expect(bugReportRateLimit('user-1')).toBe(0);
    expect(bugReportCooldown('user-1')).toBeGreaterThan(0);
    expect(bugReportRateLimit('user-1')).toBeGreaterThan(0);
    expect(bugReportCooldown('user-2')).toBe(0);
  } finally {
    delete process.env.AUTH_RATE_LIMIT_DB;
    rmSync(directory, { recursive: true, force: true });
  }
});

it('bietet eine feste Kategorienauswahl', () => {
  expect(BUG_REPORT_CATEGORIES).toEqual([
    'Darstellung',
    'Funktion',
    'Inhalt',
    'Sonstiges',
  ]);
});
