import { describe, expect, it } from 'vitest';
import { groupPlayersByPosition, squadAreaForStatus } from './admin-squad';

describe('Redaktionelle Kaderübersicht', () => {
  it.each([
    ['first-team', 'kader'],
    ['loan-in', 'leihen'],
    ['on-loan', 'leihen'],
    ['academy', 'nachwuchs'],
    ['departed', 'abgaenge'],
  ])('ordnet %s dem Bereich %s zu', (status, area) => {
    expect(squadAreaForStatus(status)).toBe(area);
  });

  it('zeigt alle Positionen und erhält die Sortierung innerhalb der Gruppen', () => {
    const players = [
      { id: 1, position: 'sturm' },
      { id: 2, position: 'torwart' },
      { id: 3, position: 'sturm' },
    ];
    const groups = groupPlayersByPosition(players);
    expect(groups.map(({ value }) => value)).toEqual([
      'torwart',
      'abwehr',
      'mittelfeld',
      'sturm',
    ]);
    expect(
      groups.map(({ players: members }) => members.map(({ id }) => id)),
    ).toEqual([[2], [], [], [1, 3]]);
    expect(players.map(({ id }) => id)).toEqual([1, 2, 3]);
  });
});
