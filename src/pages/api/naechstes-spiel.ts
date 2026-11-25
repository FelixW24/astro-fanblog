import type { APIRoute } from 'astro';
import { getNextMatch } from '../../lib/next-match';

export const GET: APIRoute = async () => {
  try {
    return Response.json(
      { match: await getNextMatch() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'Der Spielplan ist gerade nicht verfügbar.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
