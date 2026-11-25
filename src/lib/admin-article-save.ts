import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArticleFormValues } from './admin';
import { articlePayload, isSameOrigin, parseArticleForm } from './admin';
import { logAdminAction } from './audit-log';
import type { Database } from './database.types';

type ArticleSaveMode = 'create' | 'edit';

interface SaveArticleBaseOptions {
  request: Request;
  supabase: SupabaseClient<Database>;
  initialValues: ArticleFormValues;
  actorEmail?: string;
}

type SaveArticleOptions = SaveArticleBaseOptions &
  (
    | { mode: Extract<ArticleSaveMode, 'create'>; articleId?: never }
    | { mode: Extract<ArticleSaveMode, 'edit'>; articleId: number }
  );

export interface SaveArticleResult {
  values: ArticleFormValues;
  error: string | null;
  status?: number;
  redirectTo?: string;
  // Slug, wenn der Beitrag mit diesem Speichern sichtbar veröffentlicht wurde
  // (Übergang nach published mit published_at in der Vergangenheit). Der
  // Aufrufer löst darüber die Benachrichtigungen der Abonnenten aus.
  publishedSlug?: string;
}

// Nur der Übergang in den sichtbaren Published-Zustand benachrichtigt:
// Entwürfe, Archiv und reine Inhaltsänderungen bereits veröffentlichter
// Beiträge bleiben außen vor, ebenso terminierte Beiträge.
function publishedSlugFor(
  payload: ReturnType<typeof articlePayload>,
  mode: ArticleSaveMode,
  initialValues: ArticleFormValues,
): string | undefined {
  if (payload.status !== 'published' || !payload.published_at) return undefined;
  if (new Date(payload.published_at) > new Date()) return undefined;
  if (mode === 'edit' && initialValues.status === 'published') return undefined;
  return payload.slug;
}

function saveErrorMessage(error: { code?: string; message: string }) {
  return error.code === '23505'
    ? 'Dieser URL-Slug wird bereits verwendet.'
    : `Speichern fehlgeschlagen: ${error.message}`;
}

export async function saveArticleFromRequest({
  request,
  supabase,
  mode,
  initialValues,
  articleId,
  actorEmail,
}: SaveArticleOptions): Promise<SaveArticleResult> {
  if (!isSameOrigin(request)) {
    return {
      values: initialValues,
      error:
        'Die Anfrage konnte nicht verifiziert werden. Bitte lade die Seite neu.',
      status: 403,
    };
  }

  const parsed = parseArticleForm(await request.formData());
  // The retired control must not clear existing values or accept forged input.
  parsed.values.is_featured =
    mode === 'edit' ? initialValues.is_featured : false;
  if (parsed.error) return parsed;

  const payload = articlePayload(parsed.values);
  const updatePayload: Partial<typeof payload> = { ...payload };
  delete updatePayload.is_featured;
  const mutation =
    mode === 'create'
      ? await supabase.from('articles').insert(payload)
      : await supabase
          .from('articles')
          .update(updatePayload)
          .eq('id', articleId);

  if (mutation.error) {
    return {
      values: parsed.values,
      error: saveErrorMessage(mutation.error),
    };
  }

  logAdminAction({
    action: mode === 'create' ? 'create' : 'update',
    entity: 'article',
    entityId: mode === 'edit' ? articleId : payload.slug,
    actorEmail,
    detail: `slug=${payload.slug} status=${payload.status}`,
  });

  return {
    values: parsed.values,
    error: null,
    redirectTo: `/admin?saved=${mode === 'create' ? 'created' : 'updated'}`,
    publishedSlug: publishedSlugFor(payload, mode, initialValues),
  };
}
