import type { APIContext } from 'astro';
import { describe, expect, it, vi } from 'vitest';
import { POST } from './profilbild';

const testOrigin =
  process.env.SITE_ORIGIN ||
  import.meta.env.SITE_ORIGIN ||
  'https://blog.example';

const userId = '11111111-1111-1111-1111-111111111111';

function jpegFile(): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])], 'avatar', {
    type: 'image/jpeg',
  });
}

function setup(profile: { avatar_url: string | null } | null) {
  const upload = vi.fn().mockResolvedValue({ data: { path: 'x' }, error: null });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: profile }),
  };
  const supabase = {
    from: vi.fn(() => query),
    rpc,
    storage: { from: () => ({ upload, remove }) },
  };
  return { upload, remove, rpc, supabase };
}

function createContext(
  supabase: ReturnType<typeof setup>['supabase'],
  form: FormData,
): APIContext {
  return {
    request: new Request(`${testOrigin}/api/profil/profilbild`, {
      method: 'POST',
      headers: { Origin: testOrigin },
      body: form,
    }),
    locals: {
      readerUser: { id: userId },
      supabase,
    },
  } as unknown as APIContext;
}

function uploadForm(): FormData {
  const form = new FormData();
  form.set('action', 'upload');
  form.set('file', jpegFile());
  return form;
}

describe('Profilbild-Upload', () => {
  it('speichert den Pfad im Onboarding ohne Profilzeile ohne RPC', async () => {
    const { rpc, supabase } = setup(null);
    const response = await POST(createContext(supabase, uploadForm()));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { avatarUrl: string; path: string };
    expect(body.path).toBe(`${userId}/avatar.jpeg`);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('speichert den Pfad mit bestehender Profilzeile über die RPC', async () => {
    const { rpc, supabase } = setup({ avatar_url: null });
    const response = await POST(createContext(supabase, uploadForm()));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('set_reader_avatar_url', {
      p_avatar_url: `${userId}/avatar.jpeg`,
    });
  });

  it('entfernt das Bild ohne Profilzeile ohne RPC', async () => {
    const { rpc, supabase } = setup(null);
    const form = new FormData();
    form.set('action', 'remove');
    const response = await POST(createContext(supabase, form));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ avatarUrl: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('setzt den Pfad mit bestehender Profilzeile über die RPC auf null', async () => {
    const { rpc, supabase } = setup({
      avatar_url: `${userId}/avatar.webp`,
    });
    const form = new FormData();
    form.set('action', 'remove');
    const response = await POST(createContext(supabase, form));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('set_reader_avatar_url');
  });
});
