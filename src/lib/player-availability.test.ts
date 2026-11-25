import { describe, expect, it } from 'vitest';
import {
  currentLoan,
  injuryDescription,
  type PlayerWithLoans,
} from './player-availability';

const player = (status: string) =>
  ({
    id: 42,
    name: 'Alex Beispiel',
    slug: 'thijs-beispiel',
    squad_status: status,
    loans: [],
  }) as unknown as PlayerWithLoans;
const details = (id: number, direction: string, date = '2026-07-01') => ({
  id,
  player_id: 42,
  direction,
  status: 'active',
  starts_on: date,
  partner_club: 'Partner ' + id,
});

describe('one player, one profile', () => {
  it.each(['first-team', 'academy', 'departed'])(
    'does not list %s as a current loan',
    (status) => {
      const p = player(status);
      p.loans = [details(1, 'incoming')] as PlayerWithLoans['loans'];
      expect(currentLoan(p)).toBeNull();
    },
  );
  it('changes direction using the player status without inventing another profile', () => {
    const p = player('loan-in');
    const incoming = currentLoan(p);
    expect(incoming?.players).toBe(p);
    expect(incoming?.direction).toBe('incoming');
    p.squad_status = 'on-loan';
    expect(currentLoan(p)?.players.id).toBe(42);
    expect(currentLoan(p)?.direction).toBe('outgoing');
  });
  it('never shows old incoming details for an outgoing player', () => {
    const p = player('on-loan');
    p.loans = [details(1, 'incoming')] as PlayerWithLoans['loans'];
    expect(currentLoan(p)).toMatchObject({
      direction: 'outgoing',
      partner_club: null,
    });
  });
  it('uses one latest matching active loan, without duplicating the player', () => {
    const p = player('loan-in');
    p.loans = [
      details(1, 'incoming'),
      details(2, 'incoming', '2026-08-01'),
      { ...details(3, 'incoming', '2026-09-01'), status: 'ended' },
    ] as PlayerWithLoans['loans'];
    expect(currentLoan(p)?.partner_club).toBe('Partner 2');
    expect(p.loans[0].id).toBe(1);
  });
});

describe('injury duration', () => {
  it('shows the inclusive duration across a daylight-saving transition', () => {
    expect(
      injuryDescription({
        is_injured: true,
        injury_since: '2026-10-20',
        injury_until: '2026-11-02',
      }),
    ).toContain('14 Tage');
  });
  it('keeps an estimated past date from silently marking a player healthy', () => {
    expect(
      injuryDescription({
        is_injured: true,
        injury_since: '2020-01-01',
        injury_until: '2020-01-01',
      }),
    ).toContain('1 Tag');
  });
  it('supports unknown return dates', () => {
    expect(
      injuryDescription({
        is_injured: true,
        injury_since: '2026-10-20',
        injury_until: null,
      }),
    ).toContain('Rückkehr offen');
  });
  it('does not show an injury for healthy players', () => {
    expect(
      injuryDescription({
        is_injured: false,
        injury_since: null,
        injury_until: null,
      }),
    ).toBeNull();
  });
});
