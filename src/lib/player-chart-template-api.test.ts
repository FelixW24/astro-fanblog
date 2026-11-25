import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  origin: true,
  user: { id: 'editor' } as { id: string } | null,
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  from: vi.fn(),
}));
vi.mock('./admin', () => ({
  isSameOrigin: () => mocks.origin,
  getAdmin: async () => ({ user: mocks.user, supabase: { from: mocks.from } }),
}));
import { POST } from '../pages/admin/spieler/vorlagen';
const id = 'e687677e-df36-486d-8c6b-550e3a79504b';
function form(action = 'save') {
  const data = new FormData();
  Object.entries({
    action,
    template_id: id,
    template_name: 'Innenverteidiger',
    position: 'abwehr',
    chart_type: 'bar',
    chart_metrics: 'Pass: 80\nTempo: 60\nPhysis: 70',
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}
async function send(data = form()) {
  return (await POST({
    request: new Request('https://example.com/admin/spieler/vorlagen', {
      method: 'POST',
      body: data,
    }),
    cookies: {},
  } as Parameters<typeof POST>[0])) as Response;
}
describe('template API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.origin = true;
    mocks.user = { id: 'editor' };
    mocks.insert.mockReturnValue({
      select: () => ({ single: async () => ({ data: { id }, error: null }) }),
    });
    mocks.update.mockReturnValue({
      eq: () => ({
        select: () => ({
          single: async () => ({
            data: { id, name: 'Innenverteidiger' },
            error: null,
          }),
        }),
      }),
    });
    mocks.remove.mockReturnValue({
      eq: () => ({ select: async () => ({ data: [{ id }], error: null }) }),
    });
    mocks.from.mockReturnValue({
      insert: mocks.insert,
      update: mocks.update,
      delete: mocks.remove,
    });
  });
  it('rejects foreign-origin requests before writing', async () => {
    mocks.origin = false;
    expect((await send()).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('requires an authenticated editor session', async () => {
    mocks.user = null;
    expect((await send()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects invalid templates before writing', async () => {
    const data = form();
    data.set('chart_metrics', 'Pass: 50');
    expect((await send(data)).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('saves only the reusable structure', async () => {
    expect((await send()).status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith({
      name: 'Innenverteidiger',
      position: 'abwehr',
      chart_type: 'bar',
      metric_labels: ['Pass', 'Tempo', 'Physis'],
    });
  });
  it('explains a duplicate name', async () => {
    mocks.insert.mockReturnValue({
      select: () => ({
        single: async () => ({ data: null, error: { code: '23505' } }),
      }),
    });
    const response = await send();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('anderen Namen');
  });
  it('renames a saved template', async () => {
    const response = await send(form('rename'));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ name: 'Innenverteidiger' });
    expect((await response.json()).template).toMatchObject({
      id,
      name: 'Innenverteidiger',
    });
  });
  it('rejects an invalid new name before writing', async () => {
    const data = form('rename');
    data.set('template_name', 'ab');
    expect((await send(data)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects renaming a built-in template', async () => {
    const data = form('rename');
    data.set('template_id', 'builtin:abwehr');
    expect((await send(data)).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('explains a duplicate name on rename', async () => {
    mocks.update.mockReturnValue({
      eq: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { code: '23505' } }),
        }),
      }),
    });
    const response = await send(form('rename'));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('anderen Namen');
  });
  it('rejects built-in template deletion', async () => {
    const data = form('delete');
    data.set('template_id', 'builtin:abwehr');
    expect((await send(data)).status).toBe(400);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('deletes a saved template', async () => {
    const response = await send(form('delete'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: id });
  });
  it('reports a template removed in another session', async () => {
    mocks.remove.mockReturnValue({
      eq: () => ({ select: async () => ({ data: [], error: null }) }),
    });
    expect((await send(form('delete'))).status).toBe(404);
  });
});
