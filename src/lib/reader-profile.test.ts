import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from './database.types';
import { ensureReaderProfile } from './reader-profile';

function makeAdminClient({
  existing = false,
  insertError = null as { message: string } | null,
} = {}) {
  const inserted: unknown[] = [];
  let existingRow = existing;
  const from = vi.fn((table: string) => {
    if (table !== 'reader_profiles') throw new Error(`unexpected ${table}`);
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: existingRow ? { id: 'u1' } : null,
            error: null,
          }),
        }),
      }),
      insert: async (row: unknown) => {
        inserted.push(row);
        if (insertError) {
          // Simuliert parallelen Insert: nach dem Konflikt existiert die Zeile.
          existingRow = insertError.message === 'duplicate key';
          return { error: insertError };
        }
        existingRow = true;
        return { error: null };
      },
    };
  });
  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, inserted };
}

describe('ensureReaderProfile', () => {
  it('legt kein Profil an, wenn bereits eines existiert', async () => {
    const { client, inserted } = makeAdminClient({ existing: true });
    await ensureReaderProfile(client, 'u1');
    expect(inserted).toHaveLength(0);
  });

  it('legt ein Profil mit generiertem Redaktions-Username an', async () => {
    const { client, inserted } = makeAdminClient();
    const userId = 'fffe1b0d-cb1e-424d-9ade-94cd7b8aa037';
    await ensureReaderProfile(client, userId);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual({
      id: userId,
      username: 'redaktion_fffe1b0dcb1e',
      avatar: 'male',
    });
  });

  it('akzeptiert einen parallelen Insert-Konflikt, wenn das Profil danach existiert', async () => {
    const { client } = makeAdminClient({
      insertError: { message: 'duplicate key' },
    });
    await expect(ensureReaderProfile(client, 'u1')).resolves.toBeUndefined();
  });

  it('wirft, wenn das Profil nach fehlgeschlagenem Insert weiterhin fehlt', async () => {
    const { client } = makeAdminClient({
      existing: false,
      insertError: { message: 'boom' },
    });
    await expect(ensureReaderProfile(client, 'u1')).rejects.toEqual({
      message: 'boom',
    });
  });
});
