import type { User } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import { categories, type Article } from './content';
import { formatBerlinDateTimeLocal, berlinDateTimeToIso } from './date-time';
import { createAdminAuthClient, createRequestClient } from './supabase';
import {
  hasSecondFactor,
  TRUSTED_DEVICE_COOKIE,
  validTrustedDeviceCookie,
} from './auth-security';

export type RequestContext = { request: Request; cookies: AstroCookies };

export type ArticleFormValues = Pick<
  Article,
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'content'
  | 'category'
  | 'status'
  | 'author'
  | 'read_minutes'
  | 'is_featured'
  | 'tags'
  | 'source_urls'
  | 'cover_disabled'
> & {
  published_at: string;
  seo_title: string;
  seo_description: string;
  cover_image_url: string;
  cover_image_alt: string;
};

export const emptyArticle: ArticleFormValues = {
  slug: '',
  title: '',
  excerpt: '',
  content: '',
  category: 'news',
  status: 'draft',
  author: 'Astro Fanblog Redaktion',
  read_minutes: 5,
  is_featured: false,
  published_at: '',
  tags: [],
  seo_title: '',
  seo_description: '',
  cover_image_url: '',
  cover_image_alt: '',
  source_urls: [],
  cover_disabled: false,
};

export function isAdmin(user: User | null): user is User {
  return user?.app_metadata.is_editor === true;
}

// Die Benutzerverwaltung (/admin/benutzer) ist eine eigene Berechtigungsstufe
// neben der Redaktion: Nur Konten mit serverseitig verwaltetem
// app_metadata.is_admin duerfen sie nutzen. Ein is_editor-JWT allein genuegt
// nicht. getUser() liest app_metadata live vom Auth-Server (nicht aus den
// JWT-Claims), damit Rollenwechsel sofort wirksam werden und veraltete
// Sitzungen keine Admin-Aktionen ermoeglichen.
export function isSiteAdmin(user: User | null): user is User {
  return user?.app_metadata.is_admin === true;
}

/**
 * Entwicklungs-Bypass für den Redaktionsbereich: greift nur, wenn der
 * Astro-Dev-Server läuft (import.meta.env.DEV ist im Produktions-Build
 * statisch false und wird damit eliminiert) UND in .env.local
 * EDITOR_AUTH_BYPASS=development gesetzt ist. In Produktion kann der Bypass
 * also auch mit gesetzter Variable nicht aktiv werden.
 */
export function editorAuthBypassEnabled(): boolean {
  // Zweite Verteidigungslinie: selbst im Dev-Server nie aktiv, wenn der
  // Prozess explizit als Produktion läuft.
  if (process.env.NODE_ENV === 'production') return false;
  const flag =
    process.env.EDITOR_AUTH_BYPASS ?? import.meta.env.EDITOR_AUTH_BYPASS;
  return import.meta.env.DEV === true && flag === 'development';
}

/** Synthetischer Editor für den lokalen Dev-Bypass (nie echt einloggen). */
const devBypassUser = {
  id: 'dev-editor-bypass',
  email: 'dev-editor@localhost',
  app_metadata: { is_editor: true, is_admin: true },
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '1970-01-01T00:00:00Z',
} as unknown as User;

export async function getAdmin(context: RequestContext) {
  if (editorAuthBypassEnabled()) {
    // Service-Client, damit Schreibzugriffe nicht an der Editor-RLS scheitern;
    // nur im Dev-Server mit explizitem Flag erreichbar (siehe oben).
    console.warn('[DEV-BYPASS] Redaktion ohne Authentifizierung offen!');
    return { supabase: createAdminAuthClient(), user: devBypassUser };
  }
  const supabase = createRequestClient(context);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ein für 24 Stunden vertrautes Gerät ersetzt die erneute
  // Zweitfaktor-Prüfung (AAL2) im Redaktionsbereich.
  const trustedDevice = validTrustedDeviceCookie(
    context.cookies.get(TRUSTED_DEVICE_COOKIE)?.value,
    user?.id ?? '',
  );
  return {
    supabase,
    user:
      isAdmin(user) && (trustedDevice || (await hasSecondFactor(supabase)))
        ? user
        : null,
  };
}

// Admin-Pruefung fuer die Benutzerverwaltung: Redaktionszugang (is_editor
// plus MFA oder vertrautes Geraet) UND is_admin. Liefert null, wenn eine der
// beiden Stufen fehlt.
export async function getSiteAdmin(context: RequestContext) {
  const { supabase, user } = await getAdmin(context);
  return {
    supabase,
    user: user && isSiteAdmin(user) ? user : null,
  };
}

export function isSameOrigin(request: Request) {
  const configuredOrigin =
    process.env.SITE_ORIGIN || import.meta.env.SITE_ORIGIN;
  const expectedOrigin = configuredOrigin
    ? new URL(configuredOrigin).origin
    : new URL(request.url).origin;
  return request.headers.get('origin') === expectedOrigin;
}

export function articleToFormValues(article: Article): ArticleFormValues {
  return {
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    content: article.content,
    category: article.category,
    status: article.status,
    author: article.author,
    read_minutes: article.read_minutes,
    is_featured: article.is_featured,
    published_at: article.published_at
      ? formatBerlinDateTimeLocal(article.published_at)
      : '',
    tags: article.tags,
    seo_title: article.seo_title ?? '',
    seo_description: article.seo_description ?? '',
    cover_image_url: article.cover_image_url ?? '',
    cover_image_alt: article.cover_image_alt ?? '',
    source_urls: article.source_urls,
    cover_disabled: article.cover_disabled,
  };
}

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase('de-DE');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseArticleForm(formData: FormData): {
  values: ArticleFormValues;
  error: string | null;
} {
  const values: ArticleFormValues = {
    slug: String(formData.get('slug') ?? '')
      .trim()
      .toLowerCase(),
    title: String(formData.get('title') ?? '').trim(),
    excerpt: String(formData.get('excerpt') ?? '').trim(),
    content: String(formData.get('content') ?? '').trim(),
    category: String(formData.get('category') ?? ''),
    status: String(formData.get('status') ?? ''),
    author: String(formData.get('author') ?? '').trim(),
    read_minutes: Number(formData.get('read_minutes')),
    is_featured: formData.get('is_featured') === 'on',
    published_at: String(formData.get('published_at') ?? '').trim(),
    tags: uniqueValues(
      String(formData.get('tags') ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
    seo_title: String(formData.get('seo_title') ?? '').trim(),
    seo_description: String(formData.get('seo_description') ?? '').trim(),
    cover_image_url: String(formData.get('cover_image_url') ?? '').trim(),
    cover_image_alt: String(formData.get('cover_image_alt') ?? '').trim(),
    cover_disabled: formData.get('cover_disabled') === 'on',
    source_urls: uniqueValues(
      String(formData.get('source_urls') ?? '')
        .split(/\r?\n/)
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  };

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) {
    return {
      values,
      error:
        'Der Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.',
    };
  }
  if (values.title.length < 5 || values.title.length > 180) {
    return {
      values,
      error: 'Der Titel muss zwischen 5 und 180 Zeichen lang sein.',
    };
  }
  if (values.excerpt.length < 20 || values.excerpt.length > 360) {
    return {
      values,
      error: 'Der Teaser muss zwischen 20 und 360 Zeichen lang sein.',
    };
  }
  if (values.content.length < 20)
    return { values, error: 'Der Beitragstext ist noch zu kurz.' };
  if (!categories.some((category) => category.slug === values.category)) {
    return { values, error: 'Bitte wähle eine gültige Kategorie.' };
  }
  if (!['draft', 'published', 'archived'].includes(values.status)) {
    return { values, error: 'Bitte wähle einen gültigen Status.' };
  }
  if (!values.author || values.author.length > 120) {
    return { values, error: 'Bitte trage einen gültigen Autorennamen ein.' };
  }
  if (
    !Number.isInteger(values.read_minutes) ||
    values.read_minutes < 1 ||
    values.read_minutes > 60
  ) {
    return {
      values,
      error: 'Die Lesezeit muss zwischen 1 und 60 Minuten liegen.',
    };
  }
  if (values.published_at && !berlinDateTimeToIso(values.published_at)) {
    return {
      values,
      error:
        'Das Veröffentlichungsdatum ist ungültig oder existiert wegen der Zeitumstellung nicht.',
    };
  }
  if (values.tags.length > 10 || values.tags.some((tag) => tag.length > 40)) {
    return {
      values,
      error:
        'Verwende höchstens 10 Schlagwörter mit jeweils maximal 40 Zeichen.',
    };
  }
  if (
    values.seo_title &&
    (values.seo_title.length < 5 || values.seo_title.length > 70)
  ) {
    return {
      values,
      error: 'Der SEO-Titel muss zwischen 5 und 70 Zeichen lang sein.',
    };
  }
  if (
    values.seo_description &&
    (values.seo_description.length < 20 || values.seo_description.length > 180)
  ) {
    return {
      values,
      error: 'Die SEO-Beschreibung muss zwischen 20 und 180 Zeichen lang sein.',
    };
  }
  if (values.cover_image_url && !isHttpUrl(values.cover_image_url)) {
    return {
      values,
      error: 'Die Bild-URL muss mit http:// oder https:// beginnen.',
    };
  }
  if (Boolean(values.cover_image_url) !== Boolean(values.cover_image_alt)) {
    return {
      values,
      error: 'Zum Titelbild werden immer Bild-URL und Alternativtext benötigt.',
    };
  }
  if (
    values.cover_image_alt &&
    (values.cover_image_alt.length < 5 || values.cover_image_alt.length > 240)
  ) {
    return {
      values,
      error: 'Der Alternativtext muss zwischen 5 und 240 Zeichen lang sein.',
    };
  }
  if (
    values.source_urls.length > 10 ||
    values.source_urls.some((url) => !isHttpUrl(url))
  ) {
    return {
      values,
      error:
        'Trage höchstens 10 gültige Quellen-URLs ein, jeweils eine pro Zeile.',
    };
  }

  return { values, error: null };
}

export function articlePayload(values: ArticleFormValues) {
  return {
    slug: values.slug,
    title: values.title,
    excerpt: values.excerpt,
    content: values.content,
    category: values.category,
    status: values.status,
    author: values.author,
    read_minutes: values.read_minutes,
    is_featured: values.is_featured,
    tags: values.tags,
    seo_title: values.seo_title || null,
    seo_description: values.seo_description || null,
    cover_image_url: values.cover_image_url || null,
    cover_image_alt: values.cover_image_alt || null,
    cover_disabled: values.cover_disabled,
    source_urls: values.source_urls,
    published_at:
      values.status === 'published'
        ? values.published_at
          ? berlinDateTimeToIso(values.published_at)
          : new Date().toISOString()
        : values.published_at
          ? berlinDateTimeToIso(values.published_at)
          : null,
    updated_at: new Date().toISOString(),
  };
}
