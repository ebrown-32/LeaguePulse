/**
 * Links between a league's site and the product site, for franchises: where
 * a manager goes to claim a franchise or to open it for editing. The product
 * site is where people sign in (lib/platform/account).
 *
 * Built from the configured root domain, never from a request's Host header,
 * except locally (localhost), where it is whatever port the server runs on.
 */

import { PLATFORM } from '@/lib/platform/config';

export function productOrigin(req: Request): string {
  return productOriginFor(req.headers.get('host') ?? new URL(req.url).host);
}

/** The product site, from the address a page was asked for (a server component's Host header). */
export function productOriginFor(host: string | null | undefined): string {
  const m = /^(?:[a-z0-9-]+\.)?localhost(:\d+)?$/.exec(host ?? '');
  return m ? `http://localhost${m[1] ?? ''}` : `https://${PLATFORM.rootDomain}`;
}

export function leagueOrigin(req: Request, slug: string): string {
  const u = new URL(req.url);
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.host);
  return local ? `http://${slug}.localhost${u.port ? `:${u.port}` : ''}` : `https://${slug}.${PLATFORM.rootDomain}`;
}

export const claimPath = (slug: string, franchiseId: string) =>
  `/account/claim?slug=${encodeURIComponent(slug)}&franchise=${encodeURIComponent(franchiseId)}`;
export const openPath = (slug: string, franchiseId: string) =>
  `/api/platform/franchise/open?slug=${encodeURIComponent(slug)}&franchise=${encodeURIComponent(franchiseId)}`;
