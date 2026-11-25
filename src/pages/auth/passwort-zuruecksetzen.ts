import type { APIRoute } from 'astro';
import { validEmailProof } from '../../lib/auth-security';

export const GET: APIRoute = async (context) => {
  const proof = {
    tokenHash: context.url.searchParams.get('token_hash') ?? '',
    expiresAt: Date.now() + 15 * 60_000,
  };
  if (!validEmailProof(proof))
    return context.redirect('/passwort-vergessen?link=ungueltig', 303);
  // Mail scanners must not consume one-time tokens on GET.
  context.session!.set('recovery', proof);
  context.session!.delete('recoveryApproval');
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/passwort-neu',
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
};
