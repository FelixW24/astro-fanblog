import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestContext } from './admin';
import { preparePlayerDeletion } from './admin-player-delete';

const mocks = vi.hoisted(() => ({
  getAdmin: vi.fn(),
  origin: vi.fn(),
  from: vi.fn(),
  remove: vi.fn(),
  read: vi.fn(),
  deleted: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('./admin', () => ({
  getAdmin: mocks.getAdmin,
  isSameOrigin: mocks.origin,
}));

function context(method = 'GET', confirmed = true): RequestContext {
  const body = new FormData();
  if (confirmed) body.set('confirm_delete', '42');
  return {
    request: new Request('https://example.com/admin/spieler/42/loeschen', {
      method,
      ...(method === 'POST' ? { body } : {}),
    }),
    cookies: {} as RequestContext['cookies'],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.origin.mockReturnValue(true);
  mocks.read.mockResolvedValue({
    data: { id: 42, name: 'Testspieler', squad_status: 'on-loan' },
    error: null,
  });
  mocks.deleted.mockResolvedValue({ data: { id: 42 }, error: null });
  mocks.eq.mockReturnValue({
    select: () => ({ maybeSingle: mocks.deleted }),
  });
  mocks.remove.mockReturnValue({ eq: mocks.eq });
  mocks.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
    delete: mocks.remove,
  });
  mocks.getAdmin.mockResolvedValue({
    user: { email: 'editor@example.com' },
    supabase: { from: mocks.from },
  });
});

describe('player deletion', () => {
  it.each(['GET', 'HEAD'])(
    'never deletes on %s and preserves the squad area',
    async (method) => {
      const result = await preparePlayerDeletion(context(method), '42');
      expect(result).toMatchObject({
        backUrl: '/admin/spieler?bereich=leihen',
        status: 200,
      });
      expect(mocks.remove).not.toHaveBeenCalled();
    },
  );

  it('deletes only the selected player after confirmation and redirects', async () => {
    const result = await preparePlayerDeletion(context('POST'), '42');
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get('Location')).toBe(
      '/admin/spieler?bereich=leihen&saved=deleted',
    );
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.eq).toHaveBeenCalledWith('id', 42);
  });

  it('requires explicit confirmation', async () => {
    expect(
      await preparePlayerDeletion(context('POST', false), '42'),
    ).toMatchObject({ status: 400 });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('rejects cross-origin requests before accessing the database', async () => {
    mocks.origin.mockReturnValue(false);
    expect(await preparePlayerDeletion(context('POST'), '42')).toMatchObject({
      status: 403,
    });
    expect(mocks.getAdmin).not.toHaveBeenCalled();
  });

  it('requires an authorized editor', async () => {
    mocks.getAdmin.mockResolvedValue({ user: null });
    const result = await preparePlayerDeletion(context('POST'), '42');
    expect((result as Response).headers.get('Location')).toBe('/admin/login');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'abc', '1.5', '9007199254740992'])(
    'rejects invalid ID %s',
    async (id) => {
      expect(await preparePlayerDeletion(context('POST'), id)).toMatchObject({
        status: 400,
      });
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it('rejects unsupported methods', async () => {
    expect(await preparePlayerDeletion(context('DELETE'), '42')).toMatchObject({
      status: 405,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('handles a missing player without deleting', async () => {
    mocks.read.mockResolvedValue({ data: null, error: null });
    expect(await preparePlayerDeletion(context('POST'), '42')).toMatchObject({
      status: 404,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('handles read errors without attempting deletion', async () => {
    mocks.read.mockResolvedValue({
      data: null,
      error: { message: 'unavailable' },
    });
    expect(await preparePlayerDeletion(context('POST'), '42')).toMatchObject({
      status: 500,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('does not report a database error as success', async () => {
    mocks.deleted.mockResolvedValue({
      data: null,
      error: { message: 'internal details' },
    });
    const result = await preparePlayerDeletion(context('POST'), '42');
    expect(result).toMatchObject({ status: 500 });
    expect(JSON.stringify(result)).not.toContain('internal details');
  });

  it('does not report a denied or concurrent no-op as success', async () => {
    mocks.deleted.mockResolvedValue({ data: null, error: null });
    expect(await preparePlayerDeletion(context('POST'), '42')).toMatchObject({
      status: 409,
    });
  });
});
