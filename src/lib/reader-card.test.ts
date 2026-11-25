import { describe, expect, it } from 'vitest';
import {
  commentCountLabel,
  memberSinceLabel,
  parseReaderCardResponse,
  readerCardUrl,
} from './reader-card';

const uuid = 'c3986556-6aac-4877-b663-b0734ce0e00e';

describe('readerCardUrl', () => {
  it('builds the card URL for a valid profile id', () => {
    expect(readerCardUrl(` ${uuid} `)).toBe(
      `/api/leser/profilkarte?id=${uuid}`,
    );
  });
  it('rejects malformed ids', () => {
    expect(readerCardUrl('nope')).toBeNull();
    expect(readerCardUrl('')).toBeNull();
    expect(readerCardUrl(`${uuid.slice(0, 35)}x`)).toBeNull();
  });
});

describe('parseReaderCardResponse', () => {
  it('reads all public card fields', () => {
    expect(
      parseReaderCardResponse({
        username: 'justfelix',
        avatar_url: '/storage/avatar.webp',
        member_since: '2026-10-29T16:44:43.727Z',
        comment_count: 7,
      }),
    ).toEqual({
      username: 'justfelix',
      avatarUrl: '/storage/avatar.webp',
      memberSince: '2026-10-29T16:44:43.727Z',
      commentCount: 7,
    });
  });
  it('tolerates missing optional fields', () => {
    expect(parseReaderCardResponse({ username: 'justfelix' })).toEqual({
      username: 'justfelix',
      avatarUrl: null,
      memberSince: null,
      commentCount: 0,
    });
  });
  it('falls back to zero for malformed counts', () => {
    expect(
      parseReaderCardResponse({ username: 'justfelix', comment_count: 'viele' }),
    ).toMatchObject({ commentCount: 0 });
  });
  it.each([null, {}, { username: '' }, { username: 42 }, 'card'])(
    'rejects malformed payloads %s',
    (payload) => {
      expect(parseReaderCardResponse(payload)).toBeNull();
    },
  );
});

describe('memberSinceLabel', () => {
  it('formats the membership date in German', () => {
    const label = memberSinceLabel('2026-03-12T10:00:00Z');
    expect(label).toMatch(/^Mitglied seit 12\. März 2026$/);
  });
  it('returns null without or with an invalid date', () => {
    expect(memberSinceLabel(null)).toBeNull();
    expect(memberSinceLabel('')).toBeNull();
    expect(memberSinceLabel('kein Datum')).toBeNull();
  });
});

describe('commentCountLabel', () => {
  it('uses the singular for exactly one comment', () => {
    expect(commentCountLabel(1)).toBe('1 Kommentar');
  });
  it('uses the plural otherwise', () => {
    expect(commentCountLabel(0)).toBe('0 Kommentare');
    expect(commentCountLabel(42)).toBe('42 Kommentare');
  });
});
