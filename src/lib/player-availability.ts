import type { Player } from './content';
import type { Database } from './database.types';
import { formatPlayerDate } from './player';

type LoanRecord = Database['public']['Tables']['loans']['Row'];
export type PlayerWithLoans = Player & { loans: LoanRecord[] };
export type CurrentLoan = {
  players: Player;
  direction: 'incoming' | 'outgoing';
  partner_club: string | null;
  starts_on: string | null;
  ends_on: string | null;
  note: string | null;
  source_url: string | null;
};

export function loanDirection(status: string) {
  return status === 'loan-in'
    ? 'incoming'
    : status === 'on-loan'
      ? 'outgoing'
      : null;
}

/** A loan is a view of the player, never a second player identity. */
export function currentLoan(player: PlayerWithLoans): CurrentLoan | null {
  const direction = loanDirection(player.squad_status);
  if (!direction) return null;
  const details = [...(player.loans ?? [])]
    .filter((loan) => loan.status === 'active' && loan.direction === direction)
    .sort((a, b) => b.starts_on.localeCompare(a.starts_on) || b.id - a.id)[0];
  return {
    players: player,
    direction,
    partner_club: details?.partner_club ?? null,
    starts_on: details?.starts_on ?? null,
    ends_on: details?.ends_on ?? null,
    note: details?.note ?? null,
    source_url: details?.source_url ?? null,
  };
}

export function injuryDescription(
  player: Pick<Player, 'is_injured' | 'injury_since' | 'injury_until'>,
) {
  if (!player.is_injured) return null;
  const since = player.injury_since
    ? `seit ${formatPlayerDate(player.injury_since)}`
    : '';
  const until = player.injury_until
    ? `voraussichtlich bis ${formatPlayerDate(player.injury_until)}`
    : 'Rückkehr offen';
  const days =
    player.injury_since && player.injury_until
      ? Math.round(
          (Date.parse(player.injury_until) - Date.parse(player.injury_since)) /
            86400000,
        ) + 1
      : null;
  return [
    'Verletzt',
    since,
    until,
    days === null ? '' : `${days} ${days === 1 ? 'Tag' : 'Tage'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
