import { isIP } from 'node:net';

export function authTransport(
  url: string,
  publicKey: string,
  address: string | undefined,
  secret: string | undefined,
  production: boolean,
  fetcher: typeof fetch = fetch,
): typeof fetch {
  const authOrigin = new URL(url).origin;
  return async (input, init) => {
    const target = new URL(
      input instanceof Request ? input.url : String(input),
    );
    if (
      target.origin !== authOrigin ||
      !target.pathname.startsWith('/auth/v1/')
    )
      return fetcher(input, init);
    if (
      !secret ||
      !address ||
      !isIP(address) ||
      !secret.startsWith('sb_secret_')
    ) {
      if (production)
        throw new Error('Auth-IP-Weiterleitung ist nicht konfiguriert.');
      return fetcher(input, init);
    }
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('apikey', secret);
    headers.set('Sb-Forwarded-For', address);
    if (
      !headers.has('Authorization') ||
      headers.get('Authorization') === `Bearer ${publicKey}`
    )
      headers.set('Authorization', `Bearer ${secret}`);
    return fetcher(input, { ...init, headers });
  };
}
