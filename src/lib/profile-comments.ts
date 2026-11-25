import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export const profileCommentsPageSize = 20;

export function profileCommentsPage(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 && page <= 10000 ? page : 1;
}

export function commentPermalink(slug: string, id: number): string {
  return `/beitraege/${encodeURIComponent(slug)}?kommentar=${id}#kommentar-${id}`;
}

export async function getOwnComments(
  client: SupabaseClient<Database>,
  userId: string,
  page: number,
) {
  // Identity comes exclusively from the authenticated server-side user.
  if (!userId) throw new Error('Authenticated user required');
  const offset = (page - 1) * profileCommentsPageSize;
  return client
    .from('comments')
    .select(
      'id, body, created_at, parent_id, articles!comments_article_id_fkey!inner(title, slug)',
      { count: 'exact' },
    )
    .eq('user_id', userId)
    .eq('status', 'published')
    .eq('articles.status', 'published')
    .lte('articles.published_at', new Date().toISOString())
    .order('id', { ascending: false })
    .range(offset, offset + profileCommentsPageSize - 1);
}

export type OwnComment = NonNullable<
  Awaited<ReturnType<typeof getOwnComments>>['data']
>[number];
