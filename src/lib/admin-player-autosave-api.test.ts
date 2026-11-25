import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  origin: true,
  user: { id: 'editor' } as { id: string } | null,
  applyPlayerAutosave: vi.fn(),
}));
vi.mock('./admin', () => ({
  isSameOrigin: () => mocks.origin,
  getAdmin: async () => ({ user: mocks.user, supabase: { mocked: true } }),
}));
vi.mock('./admin-player-autosave', () => ({
  applyPlayerAutosave: mocks.applyPlayerAutosave,
}));
import { POST } from '../pages/admin/spieler/[id]/autosave';

async function send(id = '7', body: BodyInit = new FormData()) {
  return (await POST({
    params: { id },
    request: new Request(`https://example.com/admin/spieler/${id}/autosave`, {
      method: 'POST',
      body,
    }),
    cookies: {},
  } as unknown as Parameters<typeof POST>[0])) as Response;
}

describe('spieler autosave API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.origin = true;
    mocks.user = { id: 'editor' };
    mocks.applyPlayerAutosave.mockResolvedValue({
      profileSaved: true,
      ratingsSaved: 2,
      ratingsRemoved: 1,
      ratingErrors: [],
      notFound: false,
    });
  });

  it('lehnt Anfragen von fremder Origin ab, ohne zu schreiben', async () => {
    mocks.origin = false;
    const response = await send();
    expect(response.status).toBe(403);
    expect(mocks.applyPlayerAutosave).not.toHaveBeenCalled();
  });

  it('verlangt eine authentifizierte Redaktions-Session', async () => {
    mocks.user = null;
    const response = await send();
    expect(response.status).toBe(401);
    expect(mocks.applyPlayerAutosave).not.toHaveBeenCalled();
  });

  it.each(['x', '0', '-3'])('lehnt ungültige Spieler-IDs ab: %s', async (id) => {
    const response = await send(id);
    expect(response.status).toBe(400);
    expect(mocks.applyPlayerAutosave).not.toHaveBeenCalled();
  });

  it('lehnt nicht lesbare Formulardaten ab', async () => {
    const response = await send('7', 'plain text ohne multipart-header');
    expect(response.status).toBe(400);
    expect(mocks.applyPlayerAutosave).not.toHaveBeenCalled();
  });

  it('meldet ein unbekanntes Spielerprofil', async () => {
    mocks.applyPlayerAutosave.mockResolvedValue({
      profileSaved: false,
      ratingsSaved: 0,
      ratingsRemoved: 0,
      ratingErrors: [],
      notFound: true,
    });
    const response = await send();
    expect(response.status).toBe(404);
  });

  it('speichert im Hintergrund und antwortet mit JSON-Zählwerten', async () => {
    const form = new FormData();
    form.set('name', 'Lukas Lücke');
    form.set('match_5_rating', '2,5');
    const response = await send('7', form);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(await response.json()).toEqual({
      ok: true,
      profileSaved: true,
      ratingsSaved: 2,
      ratingsRemoved: 1,
    });
    const [supabaseArg, playerIdArg, formDataArg] =
      mocks.applyPlayerAutosave.mock.calls[0];
    expect(supabaseArg).toEqual({ mocked: true });
    expect(playerIdArg).toBe(7);
    expect(formDataArg.get('match_5_rating')).toBe('2,5');
  });
});
