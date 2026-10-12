/**
 * Request routing for the two ways LeaguePulse runs.
 *
 * Platform pages (the marketing site and sign-up) are tagged with a request
 * header so the root layout can leave out the league's navbar, footer, chat
 * and splash: those belong to a league's site, not to the product's.
 *
 * In hosted mode the bare domain is the product, and every league is a
 * subdomain. A league page requested on the bare domain has no league to
 * show, so it goes to the front page instead.
 *
 * Self-hosted, nothing here changes anything except the tagging.
 */

import { NextResponse, type NextRequest } from 'next/server';

const PLATFORM_PREFIXES = ['/landing', '/start'];
const hosted = process.env.LP_HOSTED === '1';
const rootDomain = (process.env.NEXT_PUBLIC_LP_ROOT_DOMAIN ?? 'leaguepulse.app').toLowerCase();

/** The league subdomain in a host, or null on the bare domain. */
function subdomainOf(host: string): string | null {
  const h = host.toLowerCase().split(':')[0];
  // Local development: <slug>.localhost
  if (h.endsWith('.localhost')) return h.slice(0, -'.localhost'.length) || null;
  if (h === rootDomain || h === `www.${rootDomain}` || h === 'localhost') return null;
  if (h.endsWith(`.${rootDomain}`)) return h.slice(0, -(rootDomain.length + 1)) || null;
  return null;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const headers = new Headers(req.headers);
  // Only this proxy sets these. A client could send its own, and anything
  // that trusted a forged copy would show the wrong league or skip the
  // league chrome. Server code reads the league from the Host regardless.
  headers.delete('x-lp-tenant');
  headers.delete('x-lp-surface');

  if (hosted) {
    const slug = subdomainOf(req.headers.get('host') ?? '');
    if (slug) {
      headers.set('x-lp-tenant', slug);
      /**
       * Until per-league data isolation is finished (LP_TENANCY=1), a league
       * subdomain shows a holding page. Without this guard every subdomain
       * would render the single league in NEXT_PUBLIC_LEAGUE_ID, and its AI
       * posts, settings and theme, under someone else's name.
       */
      if (process.env.LP_TENANCY !== '1') {
        headers.set('x-lp-surface', 'platform');
        return NextResponse.rewrite(new URL(`/start/pending?slug=${encodeURIComponent(slug)}`, req.url), { request: { headers } });
      }
      return NextResponse.next({ request: { headers } });
    }
    // The bare domain: the front page is the product.
    if (pathname === '/') {
      headers.set('x-lp-surface', 'platform');
      return NextResponse.rewrite(new URL('/landing', req.url), { request: { headers } });
    }
    if (!PLATFORM_PREFIXES.some(p => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  if (PLATFORM_PREFIXES.some(p => pathname.startsWith(p))) {
    headers.set('x-lp-surface', 'platform');
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Pages only. API routes, Next internals and static files pass straight
  // through, so this never sits in front of a JSON request or an image.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
