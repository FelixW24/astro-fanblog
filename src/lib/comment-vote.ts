import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type CommentVoteValue = -1 | 0 | 1;

export type CommentVoteResult =
  | {
      ok: true;
      commentId: number;
      value: CommentVoteValue;
      likes: number;
      dislikes: number;
    }
  | { ok: false; reason: 'invalid' | 'not_found' | 'save' };

// Serverseitige Bewertungslogik für Kommentare. Wird von der Formular-Route
// POST /kommentare (Redirect-Fallback ohne JavaScript) und der JSON-API
// POST /api/kommentare/vote (clientseitiger Versand ohne Seitenreload, siehe
// scripts/reader-comments.ts) gemeinsam genutzt. value 0 entfernt die
// Bewertung, -1 und 1 setzen Daumen runter/hoch.
export async function castCommentVote(
  client: SupabaseClient<Database>,
  params: { articleId: number; commentId: number; userId: string; value: number },
): Promise<CommentVoteResult> {
  const { articleId, commentId, userId, value } = params;
  if (
    !Number.isSafeInteger(commentId) ||
    commentId <= 0 ||
    ![-1, 0, 1].includes(value)
  )
    return { ok: false, reason: 'invalid' };
  const { data: comment } = await client
    .from('comments')
    .select('id')
    .eq('id', commentId)
    .eq('article_id', articleId)
    .maybeSingle();
  if (!comment) return { ok: false, reason: 'not_found' };
  const result =
    value === 0
      ? await client
          .from('comment_votes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', userId)
      : await client
          .from('comment_votes')
          .upsert(
            { comment_id: commentId, user_id: userId, value },
            { onConflict: 'comment_id,user_id' },
          );
  if (result.error) return { ok: false, reason: 'save' };
  // Autoritative Werte aus der gleichen RPC-Quelle wie die Anzeige.
  const { data: scores } = await client.rpc('comment_scores', {
    target_article: articleId,
  });
  const score = (scores ?? []).find((s) => s.comment_id === commentId);
  return {
    ok: true,
    commentId,
    value: value as CommentVoteValue,
    likes: Number(score?.likes ?? 0),
    dislikes: Number(score?.dislikes ?? 0),
  };
}
