import type { APIRoute } from 'astro';

// Liefert oeffentliche Profilbilder ueber die eigene Domain aus, damit der
// Supabase-Storage nicht oeffentlich exponiert werden muss. Der Pfad ist
// derselbe, den die Datenbank speichert (uuid/avatar.<webp|jpeg|png>).

const avatarPathPattern = /^[0-9a-f-]{36}\/avatar\.(webp|jpeg|png)$/;

export const GET: APIRoute = async ({ params }) => {
  const path = params.path ?? '';
  if (!avatarPathPattern.test(path)) {
    return new Response('Not found', { status: 404 });
  }
  const baseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const apiKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !apiKey) {
    return new Response('Not found', { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${baseUrl}/storage/v1/object/public/reader-avatars/${path}`,
      { headers: { apikey: apiKey } },
    );
  } catch {
    return new Response('Not found', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response('Not found', { status: upstream.ok ? 502 : 404 });
  }

  const headers = new Headers();
  headers.set(
    'Content-Type',
    upstream.headers.get('content-type') ?? 'application/octet-stream',
  );
  // Der Pfad bleibt bei einem erneuten Upload gleich, der Inhalt aendert
  // sich; deshalb nur kurzes Caching mit Revalidierung.
  headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  const etag = upstream.headers.get('etag');
  if (etag) headers.set('ETag', etag);
  return new Response(upstream.body, { status: 200, headers });
};
