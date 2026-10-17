/**
 * Open one of your leagues' admin pages, signed in (with ?setup=1, on its
 * setup guide: the way in straight after sign-up).
 *
 * Redirects to the league's own address with a short-lived pass in the URL
 * fragment (never sent to a server or logged), which the admin page swaps
 * for its session. See lib/platform/adminPass.
 */

import { NextResponse } from 'next/server';
import { accountsEnabled, signedInAccount } from '@/lib/platform/account';
import { roleOf } from '@/lib/platform/members';
import { leagueAdminUrl, mintAdminPass } from '@/lib/platform/adminPass';
import { PLATFORM } from '@/lib/platform/config';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!accountsEnabled()) return NextResponse.redirect(new URL('/', url));
  const me = await signedInAccount();
  if (!me) return NextResponse.redirect(new URL(`/sign-in?redirect_url=${encodeURIComponent('/account')}`, url));
  const slug = url.searchParams.get('slug') ?? '';
  if (!slug || !(await roleOf(slug, me.userId))) return NextResponse.redirect(new URL('/account', url));

  // From sign-up: straight into the admin's setup guide.
  const setup = url.searchParams.get('setup') === '1' ? '?setup=1' : '';
  return NextResponse.redirect(`${leagueAdminUrl(slug, url, PLATFORM.rootDomain)}${setup}#lpt=${mintAdminPass(slug, me.userId)}`);
}
