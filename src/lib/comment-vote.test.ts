import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from './database.types';
import { castCommentVote } from './comment-vote';

type MockOptions = {
  comment?: { id: number } | null;
  voteError?: { message: string } | null;
  scores?: { comment_id: number; likes: number; dislikes: number }[];
};

function makeClient({
  comment = { id: 7 },
  voteError = null,
  scores = [{ comment_id: 7, likes: 3, dislikes: 1 }],
}: MockOptions = {}) {
  const voteResult = { error: voteError };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: comment, error: null }),
    delete: () => query,
    upsert: () => query,
    // Der Supabase-Query-Builder ist thenable; await liefert das Ergebnis.
    then: (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve(voteResult).then(onFulfilled),
  };
  return {
    from: () => query,
    rpc: async () => ({ data: scores, error: null }),
  } as unknown as SupabaseClient<Database>;
}

const params = { articleId: 1, commentId: 7, userId: 'reader-1' };

describe('castCommentVote', () => {
  it('speichert einen Like und liefert die aktualisierten Scores', async () => {
    const result = await castCommentVote(makeClient(), { ...params, value: 1 });
    expect(result).toEqual({
      ok: true,
      commentId: 7,
      value: 1,
      likes: 3,
      dislikes: 1,
    });
  });

  it('entfernt die Bewertung bei value 0', async () => {
    const result = await castCommentVote(makeClient(), { ...params, value: 0 });
    expect(result).toMatchObject({ ok: true, value: 0, likes: 3 });
  });

  it('liefert not_found, wenn der Kommentar nicht zum Beitrag gehört', async () => {
    const result = await castCommentVote(makeClient({ comment: null }), {
      ...params,
      value: 1,
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('liefert save bei Datenbankfehler', async () => {
    const result = await castCommentVote(
      makeClient({ voteError: { message: 'db down' } }),
      { ...params, value: 1 },
    );
    expect(result).toEqual({ ok: false, reason: 'save' });
  });

  it('lehnt ungültige Werte ab', async () => {
    const result = await castCommentVote(makeClient(), { ...params, value: 2 });
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rechnet fehlende Scores auf 0 um', async () => {
    const result = await castCommentVote(makeClient({ scores: [] }), {
      ...params,
      value: 1,
    });
    expect(result).toMatchObject({ ok: true, likes: 0, dislikes: 0 });
  });
});
