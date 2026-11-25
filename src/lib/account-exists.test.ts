import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { emailHasAccount } from './account-exists';

type ListUser = { email: string | undefined };

type Page = {
  users: ListUser[];
  nextPage: number | null;
  total?: number;
};

// Minimaler Admin-Client: liefert die vorbereiteten Seiten der Reihe nach.
function adminClient(pages: (Page | { error: true })[]) {
  let calls = 0;
  const client = {
    auth: {
      admin: {
        listUsers: async () => {
          const page = pages[calls];
          calls += 1;
          if (!page) return { data: { users: [] }, error: null };
          if ('error' in page) return { data: { users: [] }, error: true };
          const { users, nextPage, total } = page;
          return {
            data: {
              users,
              nextPage,
              lastPage: 1,
              total: total ?? users.length,
            },
            error: null,
          };
        },
      },
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

describe('emailHasAccount', () => {
  it('findet das Konto unabhängig von Großschreibung und Leerzeichen', async () => {
    const client = adminClient([
      { users: [{ email: 'Fan@Example.ORG' }], nextPage: null },
    ]);
    expect(await emailHasAccount(client, '  fan@example.org  ')).toBe(true);
  });

  it('erkennt fehlende Konten innerhalb einer Seite', async () => {
    const client = adminClient([
      { users: [{ email: 'fan@example.org' }], nextPage: null },
    ]);
    expect(await emailHasAccount(client, 'anders@example.org')).toBe(false);
  });

  it('blättert bis zur Fundstelle in späteren Seiten', async () => {
    const client = adminClient([
      { users: [{ email: 'a@example.org' }], nextPage: 2, total: 3 },
      {
        users: [
          { email: 'b@example.org' },
          { email: 'fan@example.org' },
          { email: 'c@example.org' },
        ],
        nextPage: null,
      },
    ]);
    expect(await emailHasAccount(client, 'fan@example.org')).toBe(true);
  });

  it('endet mit false, wenn alle Seiten ohne Fund durchsucht sind', async () => {
    const client = adminClient([
      { users: [{ email: 'a@example.org' }], nextPage: 2, total: 2 },
      { users: [{ email: 'b@example.org' }], nextPage: null },
    ]);
    expect(await emailHasAccount(client, 'fan@example.org')).toBe(false);
  });

  it('liefert undefined bei Suchfehlern statt falscher Aussagen', async () => {
    const failing = adminClient([{ error: true }]);
    expect(await emailHasAccount(failing, 'fan@example.org')).toBeUndefined();
  });

  it('behandelt leere Adressen ohne Suche als kein Konto', async () => {
    const client = adminClient([]);
    expect(await emailHasAccount(client, '   ')).toBe(false);
  });
});
