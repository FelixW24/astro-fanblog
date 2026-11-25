// Profilkarte über den Avataren der Kommentar-Sektion: Beim Hover/Klick ruft
// der Client die öffentlichen Kartendaten (Username, Avatar, Mitgliedschaft,
// Kommentarzahl) über die Server-RPC reader_profile_card ab.
// Private Angaben wie Name oder Geburtsdatum bleiben über RLS geschützt und
// verlassen den Server nie.

export interface ReaderCardData {
  username: string;
  avatarUrl: string | null;
  memberSince: string | null;
  commentCount: number;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readerCardUrl(userId: string): string | null {
  const trimmed = userId.trim();
  if (!uuidPattern.test(trimmed)) return null;
  return `/api/leser/profilkarte?id=${encodeURIComponent(trimmed)}`;
}

export function parseReaderCardResponse(
  payload: unknown,
): ReaderCardData | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { username, avatar_url, member_since, comment_count } =
    payload as Record<string, unknown>;
  if (typeof username !== 'string' || username === '') return null;
  return {
    username,
    avatarUrl:
      typeof avatar_url === 'string' && avatar_url !== '' ? avatar_url : null,
    memberSince:
      typeof member_since === 'string' && member_since !== ''
        ? member_since
        : null,
    commentCount:
      typeof comment_count === 'number' &&
      Number.isInteger(comment_count) &&
      comment_count >= 0
        ? comment_count
        : 0,
  };
}

// „Mitglied seit 12. März 2026“ – ungültige Datumswerte entfallen still.
export function memberSinceLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `Mitglied seit ${date.toLocaleDateString('de-DE', {
    dateStyle: 'long',
    timeZone: 'Europe/Berlin',
  })}`;
}

export function commentCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'Kommentar' : 'Kommentare'}`;
}
