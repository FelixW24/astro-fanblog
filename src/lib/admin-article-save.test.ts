import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { emptyArticle } from './admin';
import { saveArticleFromRequest } from './admin-article-save';
import { formatBerlinDateTimeLocal } from './date-time';
import type { Database } from './database.types';

const testOrigin =
  process.env.SITE_ORIGIN ||
  import.meta.env.SITE_ORIGIN ||
  'https://blog.example';

function validForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const values = {
    slug: 'mein-beitrag',
    title: 'Ein gültiger Titel',
    excerpt: 'Ein ausreichend langer Teaser für diesen Beitrag.',
    content: 'Ein ausreichend langer Inhalt für diesen Beitrag.',
    category: 'news',
    status: 'draft',
    author: 'Astro Fanblog Redaktion',
    read_minutes: '5',
    published_at: '',
    tags: '',
    seo_title: '',
    seo_description: '',
    cover_image_url: '',
    cover_image_alt: '',
    source_urls: '',
    ...overrides,
  };
  Object.entries(values).forEach(([key, value]) => form.set(key, value));
  return form;
}

function postRequest(form = validForm(), origin = testOrigin) {
  return new Request(`${testOrigin}/admin/beitraege/neu`, {
    method: 'POST',
    headers: { origin },
    body: form,
  });
}

function asClient(from: ReturnType<typeof vi.fn>) {
  return { from } as unknown as SupabaseClient<Database>;
}

describe('saveArticleFromRequest', () => {
  it('erhält einen vorhandenen Aufmacherwert ohne ihn aus dem Formular zu übernehmen', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const result = await saveArticleFromRequest({
      request: postRequest(),
      supabase: asClient(vi.fn(() => ({ update }))),
      mode: 'edit',
      articleId: 42,
      initialValues: { ...emptyArticle, is_featured: true },
    });
    expect(result.values.is_featured).toBe(true);
    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ is_featured: expect.anything() }),
    );
  });
  it('legt einen validen Beitrag an und liefert das Redirect-Ziel', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));

    const result = await saveArticleFromRequest({
      request: postRequest(),
      supabase: asClient(from),
      mode: 'create',
      initialValues: emptyArticle,
    });

    expect(from).toHaveBeenCalledWith('articles');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'mein-beitrag', status: 'draft' }),
    );
    expect(result).toMatchObject({
      error: null,
      redirectTo: '/admin?saved=created',
    });
  });

  it('aktualisiert genau den angeforderten Beitrag', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));

    const result = await saveArticleFromRequest({
      request: postRequest(),
      supabase: asClient(from),
      mode: 'edit',
      articleId: 42,
      initialValues: emptyArticle,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'mein-beitrag' }),
    );
    expect(eq).toHaveBeenCalledWith('id', 42);
    expect(result.redirectTo).toBe('/admin?saved=updated');
  });

  it('führt bei ungültigen Formulardaten keine Datenbankabfrage aus', async () => {
    const from = vi.fn();

    const result = await saveArticleFromRequest({
      request: postRequest(validForm({ title: 'Kurz' })),
      supabase: asClient(from),
      mode: 'create',
      initialValues: emptyArticle,
    });

    expect(result.error).toContain('Titel');
    expect(from).not.toHaveBeenCalled();
  });

  it('weist fremde Origins vor dem Parsen und Speichern zurück', async () => {
    const from = vi.fn();

    const result = await saveArticleFromRequest({
      request: postRequest(validForm(), 'https://example.org'),
      supabase: asClient(from),
      mode: 'create',
      initialValues: emptyArticle,
    });

    expect(result).toMatchObject({ status: 403, values: emptyArticle });
    expect(from).not.toHaveBeenCalled();
  });

  it('übersetzt einen doppelten Slug in eine verständliche Meldung', async () => {
    const insert = vi.fn().mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value' },
    });
    const from = vi.fn(() => ({ insert }));

    const result = await saveArticleFromRequest({
      request: postRequest(),
      supabase: asClient(from),
      mode: 'create',
      initialValues: emptyArticle,
    });

    expect(result.error).toBe('Dieser URL-Slug wird bereits verwendet.');
    expect(result.redirectTo).toBeUndefined();
  });

  it('markiert einen direkt veröffentlichten neuen Beitrag als publishedSlug', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));

    const result = await saveArticleFromRequest({
      request: postRequest(validForm({ status: 'published' })),
      supabase: asClient(from),
      mode: 'create',
      initialValues: emptyArticle,
    });

    expect(result.publishedSlug).toBe('mein-beitrag');
  });

  it('markiert Entwürfe nicht als publishedSlug', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));

    const result = await saveArticleFromRequest({
      request: postRequest(validForm({ status: 'draft' })),
      supabase: asClient(from),
      mode: 'create',
      initialValues: emptyArticle,
    });

    expect(result.publishedSlug).toBeUndefined();
  });

  it('markiert terminierte Beiträge nicht als publishedSlug', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const future = formatBerlinDateTimeLocal(Date.now() + 3_600_000);

    const result = await saveArticleFromRequest({
      request: postRequest(
        validForm({ status: 'published', published_at: future }),
      ),
      supabase: asClient(from),
      mode: 'create',
      initialValues: emptyArticle,
    });

    expect(result.publishedSlug).toBeUndefined();
  });

  it('markiert beim Editieren nur den Übergang nach published, nicht Inhaltsänderungen', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));

    const draftToPublished = await saveArticleFromRequest({
      request: postRequest(validForm({ status: 'published' })),
      supabase: asClient(from),
      mode: 'edit',
      articleId: 42,
      initialValues: { ...emptyArticle, status: 'draft' },
    });
    expect(draftToPublished.publishedSlug).toBe('mein-beitrag');

    const alreadyPublished = await saveArticleFromRequest({
      request: postRequest(validForm({ status: 'published' })),
      supabase: asClient(from),
      mode: 'edit',
      articleId: 42,
      initialValues: { ...emptyArticle, status: 'published' },
    });
    expect(alreadyPublished.publishedSlug).toBeUndefined();
  });
});
