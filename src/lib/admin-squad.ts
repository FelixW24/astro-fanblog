import { playerPositions } from './player';

export const squadAreas = [
  { value: 'kader', label: 'Kader', statuses: ['first-team'] },
  { value: 'leihen', label: 'Leihen', statuses: ['loan-in', 'on-loan'] },
  { value: 'nachwuchs', label: 'Nachwuchs', statuses: ['academy'] },
  { value: 'abgaenge', label: 'Abgänge', statuses: ['departed'] },
] as const;

export function squadAreaForStatus(status: string) {
  return (
    squadAreas.find((area) =>
      (area.statuses as readonly string[]).includes(status),
    )?.value ?? 'kader'
  );
}

export function groupPlayersByPosition<T extends { position: string }>(
  players: T[],
) {
  return playerPositions.map((position) => ({
    ...position,
    players: players.filter((player) => player.position === position.value),
  }));
}
