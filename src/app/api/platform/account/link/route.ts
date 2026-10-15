/**
 * Sign in on a league's site: from its footer, here, and straight back with a
 * visitor pass (lib/platform/visitorPass) in the URL fragment, never sent to
 * a server or logged. Not signed in yet: the sign-in page first, then here again.
 *
 * `return` must be one of our league sites; anything else goes to the account
 * page, so this can never be used to send someone elsewhere.
 */

import { NextResponse } from 'next/server';
import { accountsEnabled } from '@/lib/platform/account';
import { PLATFORM } from '@/lib/platform/config';

export const dynamic = 'force-dynamic';

function leagueReturn(raw: string | null, req: URL): URL | null {
  try {
    const u = new URL(raw ?? '');
    const local = /^(localhost|127\.0\.0\.1)$/.test(req.hostname);
    const ok = local
      ? u.protocol === 'http:' && u.hostname.endsWith('.localhost')
      : u.protocol === 'https:' && u.hostname.endsWith(`.${PLATFORM.rootDomain}`) && !u.hostname.slice(0, -(PLATFORM.rootDomain.length + 1)).includes('.');
    if (!ok) return null;
    u.hash = '';
    return u;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!accountsEnabled()) return NextResponse.redirect(new URL('/', url));
  const back = leagueReturn(url.searchParams.get('return'), url);
  if (!back) return NextResponse.redirect(new URL('/account', url));

  const { currentUser } = await import('@clerk/nextjs/server');
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.redirect(new URL(`/sign-in?redirect_url=${encodeURIComponent(`${url.pathname}${url.search}`)}`, url));

  const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username
    || u.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress?.split('@')[0] || 'You';
  const { mintVisitorPass } = await import('@/lib/platform/visitorPass');
  const pass = mintVisitorPass({ userId: u.id, name, image: u.hasImage ? u.imageUrl : null });
  return NextResponse.redirect(`${back.toString()}#lpv=${pass}`);
}
