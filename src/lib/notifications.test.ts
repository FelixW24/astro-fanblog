import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { categories } from './content';
import type { Database } from './database.types';
import {
  articleUrl,
  dispatchNewArticleNotification,
  parseNotificationPreferences,
  renderNewArticleMail,
  siteOrigin,
  unsubscribeToken,
  unsubscribeUrl,
  validUnsubscribeToken,
  type SendMailMessage,
} from './notifications';

const publishedArticle = {
  id: 7,
  title: 'Neuer Testbeitrag',
  slug: 'neuer-testbeitrag',
  excerpt: 'Ein Teaser zum Testbeitrag mit genug Zeichen.',
  category: 'news',
  status: 'published',
  published_at: new Date(Date.now() - 60_000).toISOString(),
};

function makeAdminClient({
  article = publishedArticle as typeof publishedArticle | null,
  preferences = [] as {
    user_id: string;
    email_enabled: boolean;
    in_app_enabled: boolean;
  }[],
  users = [] as { id: string; email: string | null }[],
  insertError = null as { message: string } | null,
} = {}) {
  const inserted: unknown[][] = [];
  const from = vi.fn((table: string) => {
    if (table === 'articles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: article,
              error: article ? null : { message: 'not found' },
            }),
          }),
        }),
      };
    }
    if (table === 'article_notification_preferences') {
      return {
        select: () => ({
          eq: async () => ({ data: preferences, error: null }),
        }),
      };
    }
    if (table === 'notifications') {
      return {
        insert: async (rows: unknown[]) => {
          inserted.push(rows);
          return { error: insertError };
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  const listUsers = vi.fn(
    async ({ page }: { page: number; perPage: number }) => ({
      data: { users: page === 1 ? users : [] },
      error: null,
    }),
  );
  const client = {
    from,
    auth: { admin: { listUsers } },
  } as unknown as SupabaseClient<Database>;
  return { client, inserted, listUsers };
}

describe('parseNotificationPreferences', () => {
  it('setzt beide Kanäle pro Kategorie aus dem einen Schalter', () => {
    const form = new FormData();
    form.set('pref_news', 'on');
    form.set('pref_transfer', 'on');
    form.set('pref_unbekannt', 'on');
    const { preferences, error } = parseNotificationPreferences(form);
    expect(error).toBeUndefined();
    expect(preferences).toHaveLength(categories.length);
    const byCategory = new Map(preferences.map((p) => [p.category, p]));
    expect(byCategory.get('news')).toEqual({
      category: 'news',
      emailEnabled: true,
      inAppEnabled: true,
    });
    expect(byCategory.get('transfer')).toEqual({
      category: 'transfer',
      emailEnabled: true,
      inAppEnabled: true,
    });
    expect(byCategory.get('weiteres')).toEqual({
      category: 'weiteres',
      emailEnabled: false,
      inAppEnabled: false,
    });
  });

  it('liefert überall false, wenn kein Schalter gesetzt ist', () => {
    const { preferences } = parseNotificationPreferences(new FormData());
    expect(preferences.every((p) => !p.emailEnabled && !p.inAppEnabled)).toBe(
      true,
    );
  });
});

describe('renderNewArticleMail', () => {
  it('baut Betreff, Text und HTML mit Beitrags-URL und No-Reply-Hinweis', () => {
    const mail = renderNewArticleMail(
      publishedArticle,
      { userId: 'u1' },
      'https://blog.example',
    );
    expect(mail.subject).toBe('Neuer Beitrag (News): Neuer Testbeitrag');
    expect(mail.text).toContain(
      'Beitrag lesen: https://blog.example/beitraege/neuer-testbeitrag',
    );
    expect(mail.text).toContain('No-Reply-Postfach');
    expect(mail.text).toContain('Benachrichtigungen');
    expect(mail.text).toContain(publishedArticle.excerpt);
    // Rechtlicher Footer: Verlinkung zu Impressum/Datenschutz/AGB und Abmeldung
    expect(mail.text).toContain('https://blog.example/impressum');
    expect(mail.text).toContain('https://blog.example/datenschutz');
    expect(mail.text).toContain('https://blog.example/agb');
    expect(mail.text).toContain('https://blog.example/profil');
    expect(mail.html).toContain('Neuer Testbeitrag');
    expect(mail.html).toContain('https://blog.example/beitraege/neuer-testbeitrag');
  });

  it('enthält ohne Secret nur den Profil-Link, mit Secret den Abmeldelink', () => {
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', '');
    const without = renderNewArticleMail(
      publishedArticle,
      { userId: 'u1' },
      'https://blog.example',
    );
    expect(without.text).not.toContain('benachrichtigungen-abmelden');
    expect(without.html).not.toContain('benachrichtigungen-abmelden');

    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', 'x'.repeat(32));
    const withLink = renderNewArticleMail(
      publishedArticle,
      { userId: 'u1' },
      'https://blog.example',
    );
    const link = unsubscribeUrl('u1', 'news', 'https://blog.example');
    expect(link).toContain(
      'https://blog.example/benachrichtigungen-abmelden?token=',
    );
    expect(withLink.text).toContain(link as string);
    expect(withLink.html).toContain('benachrichtigungen-abmelden');
    vi.unstubAllEnvs();
  });

  it('escaped HTML-sonderzeichen im Template', () => {
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', 'x'.repeat(32));
    const mail = renderNewArticleMail(
      { ...publishedArticle, title: '<b>Fett</b> & "Anführungsz"' },
      { userId: 'u1' },
      'https://blog.example',
    );
    expect(mail.html).toContain('&lt;b&gt;Fett&lt;/b&gt; &amp; &quot;Anführungsz&quot;');
    expect(mail.html).not.toContain('<b>Fett</b>');
    vi.unstubAllEnvs();
  });

  it('nutzt die konfigurierte Site-Origin als Default', () => {
    expect(articleUrl('slug-x')).toBe(`${siteOrigin()}/beitraege/slug-x`);
  });
});

describe('unsubscribeToken', () => {
  it('signiert und verifiziert ein Token, manipulierte Tokens fallen durch', () => {
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', 's'.repeat(32));
    const token = unsubscribeToken('user-1', 'news');
    expect(token).toBeTruthy();
    expect(validUnsubscribeToken(token, 'user-1', 'news')).toBe(true);
    expect(validUnsubscribeToken(token, 'user-2', 'news')).toBe(false);
    expect(validUnsubscribeToken(token, 'user-1', 'transfers')).toBe(false);
    expect(validUnsubscribeToken(`${token}x`, 'user-1', 'news')).toBe(false);
    expect(validUnsubscribeToken(null, 'user-1', 'news')).toBe(false);
    vi.unstubAllEnvs();
  });

  it('liefert ohne Secret kein Token und keine URL', () => {
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', '');
    expect(unsubscribeToken('user-1', 'news')).toBeNull();
    expect(unsubscribeUrl('user-1', 'news', 'https://blog.example')).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe('dispatchNewArticleNotification', () => {
  it('legt In-App-Zeilen an und versendet E-Mails nur an die aktiviert haben', async () => {
    const { client, inserted } = makeAdminClient({
      preferences: [
        { user_id: 'u1', email_enabled: true, in_app_enabled: true },
        { user_id: 'u2', email_enabled: true, in_app_enabled: false },
        { user_id: 'u3', email_enabled: false, in_app_enabled: true },
        { user_id: 'u4', email_enabled: false, in_app_enabled: false },
      ],
      users: [
        { id: 'u1', email: 'u1@example.de' },
        { id: 'u2', email: 'u2@example.de' },
        { id: 'u3', email: null },
      ],
    });
    const sendMail = vi.fn(async (message: SendMailMessage) =>
      message.to.includes('@'),
    );
    const result = await dispatchNewArticleNotification({
      slug: publishedArticle.slug,
      adminClient: client,
      sendMail,
      origin: 'https://blog.example',
    });

    expect(result).toEqual({
      articleId: 7,
      inApp: 2,
      emails: 2,
      skipped: false,
    });
    expect(inserted).toHaveLength(1);
    const rows = inserted[0] as { user_id: string; article_id: number }[];
    expect(rows.map((row) => row.user_id).sort()).toEqual(['u1', 'u3']);
    expect(rows[0].article_id).toBe(7);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'u1@example.de',
        subject: 'Neuer Beitrag (News): Neuer Testbeitrag',
      }),
    );
    const text = sendMail.mock.calls[0][0].text;
    expect(text).toContain('https://blog.example/beitraege/neuer-testbeitrag');
  });

  it('zählt nur erfolgreiche E-Mail-Verschickungen', async () => {
    const { client } = makeAdminClient({
      preferences: [
        { user_id: 'u1', email_enabled: true, in_app_enabled: false },
        { user_id: 'u2', email_enabled: true, in_app_enabled: false },
      ],
      users: [
        { id: 'u1', email: 'u1@example.de' },
        { id: 'u2', email: 'u2@example.de' },
      ],
    });
    const sendMail = vi
      .fn()
      .mockImplementation(
        async ({ to }: { to: string }) => to === 'u1@example.de',
      );
    const result = await dispatchNewArticleNotification({
      slug: publishedArticle.slug,
      adminClient: client,
      sendMail,
    });
    expect(result.emails).toBe(1);
    expect(result.inApp).toBe(0);
  });

  it('überspringt Entwürfe und terminierte Beiträge', async () => {
    for (const article of [
      { ...publishedArticle, status: 'draft' },
      {
        ...publishedArticle,
        published_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
      null,
    ]) {
      const { client, inserted } = makeAdminClient({
        article,
        preferences: [
          { user_id: 'u1', email_enabled: true, in_app_enabled: true },
        ],
      });
      const sendMail = vi.fn(async () => true);
      const result = await dispatchNewArticleNotification({
        slug: publishedArticle.slug,
        adminClient: client,
        sendMail,
      });
      expect(result.skipped).toBe(true);
      expect(inserted).toHaveLength(0);
      expect(sendMail).not.toHaveBeenCalled();
    }
  });

  it('unterbricht nichts, wenn keine Präferenzen existieren', async () => {
    const { client, inserted } = makeAdminClient({ preferences: [] });
    const result = await dispatchNewArticleNotification({
      slug: publishedArticle.slug,
      adminClient: client,
      sendMail: vi.fn(),
    });
    expect(result).toMatchObject({
      articleId: 7,
      inApp: 0,
      emails: 0,
      skipped: true,
    });
    expect(inserted).toHaveLength(0);
  });

  it('fährt trotz Einfügefehler mit den E-Mails fort', async () => {
    const { client } = makeAdminClient({
      preferences: [
        { user_id: 'u1', email_enabled: true, in_app_enabled: true },
      ],
      users: [{ id: 'u1', email: 'u1@example.de' }],
      insertError: { message: 'boom' },
    });
    const result = await dispatchNewArticleNotification({
      slug: publishedArticle.slug,
      adminClient: client,
      sendMail: vi.fn(async () => true),
    });
    expect(result).toMatchObject({ inApp: 0, emails: 1, skipped: false });
  });

  it('wirft nie, auch wenn der Admin-Client komplett fehlschlägt', async () => {
    const client = {
      from: () => {
        throw new Error('no database');
      },
    } as unknown as SupabaseClient<Database>;
    const result = await dispatchNewArticleNotification({
      slug: 'egal',
      adminClient: client,
      sendMail: vi.fn(),
    });
    expect(result.skipped).toBe(true);
  });
});
