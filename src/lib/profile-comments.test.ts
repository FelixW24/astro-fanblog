import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import {
  commentPermalink,
  getOwnComments,
  profileCommentsPage,
} from './profile-comments';

describe('own profile comments', () => {
  it.each([null, '', '0', '-1', '1.5', 'NaN', 'Infinity', '10001'])(
    'normalizes invalid page %s',
    (value) => {
      expect(profileCommentsPage(value)).toBe(1);
    },
  );
  it('keeps valid pages and builds a paginated comment deep link', () => {
    expect(profileCommentsPage('3')).toBe(3);
    expect(commentPermalink('derby', 75)).toBe(
      '/beitraege/derby?kommentar=75#kommentar-75',
    );
  });
  it('filters by the authenticated owner even for editors and limits results', async () => {
    const result = { data: [], count: 0, error: null };
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue(result),
    };
    const client = { from: vi.fn(() => query) };
    expect(
      await getOwnComments(
        client as unknown as SupabaseClient<Database>,
        'reader-a',
        2,
      ),
    ).toEqual(result);
    expect(client.from).toHaveBeenCalledWith('comments');
    expect(query.eq.mock.calls).toEqual([
      ['user_id', 'reader-a'],
      ['status', 'published'],
      ['articles.status', 'published'],
    ]);
    expect(query.lte).toHaveBeenCalledWith(
      'articles.published_at',
      expect.any(String),
    );
    expect(query.order).toHaveBeenCalledWith('id', { ascending: false });
    expect(query.range).toHaveBeenCalledWith(20, 39);
  });
  it('does not query without an authenticated owner', async () => {
    const client = { from: vi.fn() };
    await expect(
      getOwnComments(client as unknown as SupabaseClient<Database>, '', 1),
    ).rejects.toThrow();
    expect(client.from).not.toHaveBeenCalled();
  });
});
