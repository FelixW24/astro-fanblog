import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { emptyPlayer, type PlayerFormValues } from './admin-player';
import { savePlayerLoan } from './admin-loan';

type Client = SupabaseClient<Database>;

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  insert: vi.fn(),
  updateResult: { error: null as null | { message: string } },
}));

function loanValues(squad_status: string): PlayerFormValues {
  return {
    ...emptyPlayer,
    squad_status,
    loan_partner_club: 'FC St. Pauli',
    loan_starts_on: '2026-08-27',
    loan_ends_on: '2027-06-30',
    loan_note: '',
    loan_source_url: '',
  };
}

const client = { from: mocks.from } as unknown as Client;

beforeEach(() => {
  vi.resetAllMocks();
  const selectChain = {
    eq: mocks.eq,
    order: mocks.order,
    limit: mocks.limit,
  };
  mocks.eq.mockReturnValue(selectChain);
  mocks.order.mockReturnValue(selectChain);
  mocks.limit.mockResolvedValue({ data: [], error: null });
  mocks.select.mockReturnValue(selectChain);
  mocks.update.mockReturnValue({ eq: mocks.updateEq });
  mocks.updateResult.error = null;
  mocks.updateEq.mockImplementation(() =>
    Object.assign(Promise.resolve(mocks.updateResult), { eq: mocks.updateEq }),
  );
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({
    select: mocks.select,
    update: mocks.update,
    insert: mocks.insert,
  });
});

describe('savePlayerLoan', () => {
  it('schließt aktive Leihen ab, wenn der Spieler keinen Leihstatus mehr hat', async () => {
    const result = await savePlayerLoan(client, 42, loanValues('first-team'));
    expect(result).toBeNull();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
    expect(mocks.updateEq).toHaveBeenCalledWith('player_id', 42);
    expect(mocks.updateEq).toHaveBeenCalledWith('status', 'active');
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler beim Abschließen ohne Leihstatus', async () => {
    mocks.updateResult.error = { message: 'rls' };
    const result = await savePlayerLoan(client, 42, loanValues('departed'));
    expect(result).toContain('abgeschlossen');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('aktualisiert die vorhandene aktive Leihe', async () => {
    mocks.limit.mockResolvedValue({ data: [{ id: 7 }], error: null });
    const result = await savePlayerLoan(client, 42, loanValues('on-loan'));
    expect(result).toBeNull();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'outgoing',
        partner_club: 'FC St. Pauli',
        starts_on: '2026-08-27',
        ends_on: '2027-06-30',
        status: 'active',
      }),
    );
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 7);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('legt eine neue Leihe an, wenn noch keine aktive existiert', async () => {
    const result = await savePlayerLoan(client, 42, loanValues('loan-in'));
    expect(result).toBeNull();
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        player_id: 42,
        direction: 'incoming',
        partner_club: 'FC St. Pauli',
      }),
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler beim Laden der vorhandenen Leihe', async () => {
    mocks.limit.mockResolvedValue({
      data: null,
      error: { message: 'rls' },
    });
    const result = await savePlayerLoan(client, 42, loanValues('on-loan'));
    expect(result).toContain('geladen');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler beim Schreiben der Leihe', async () => {
    mocks.updateResult.error = { message: 'check' };
    mocks.limit.mockResolvedValue({ data: [{ id: 7 }], error: null });
    const result = await savePlayerLoan(client, 42, loanValues('on-loan'));
    expect(result).toContain('gespeichert');

    mocks.updateResult.error = null;
    mocks.insert.mockResolvedValue({ error: { message: 'check' } });
    mocks.limit.mockResolvedValue({ data: [], error: null });
    const insertResult = await savePlayerLoan(
      client,
      42,
      loanValues('on-loan'),
    );
    expect(insertResult).toContain('gespeichert');
  });
});
