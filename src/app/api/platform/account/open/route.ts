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
import { mintAdminPass } from '@/lib/platform/adminPass';
import { PLATFORM } from '@/lib/platform/config';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!accountsEnabled()) return NextResponse.redirect(new URL('/', url));
  const me = await signedInAccount();
  if (!me) return NextResponse.redirect(new URL(`/sign-in?redirect_url=${encodeURIComponent('/account')}`, url));
  const slug = url.searchParams.get('slug') ?? '';
  if (!slug || !(await roleOf(slug, me.userId))) return NextResponse.redirect(new URL('/account', url));

  // Locally that is whatever localhost port this runs on; anywhere else it
  // is always the configured root domain, never a host taken from headers.
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(url.host);
  const base = local ? `http://${slug}.localhost${url.port ? `:${url.port}` : ''}` : `https://${slug}.${PLATFORM.rootDomain}`;
  // From sign-up: straight into the admin's setup guide.
  const setup = url.searchParams.get('setup') === '1' ? '?setup=1' : '';
  return NextResponse.redirect(`${base}/admin${setup}#lpt=${mintAdminPass(slug, me.userId)}`);
}
