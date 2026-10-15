/**
 * Open a franchise you manage on its league's site, on its manage page: redirects
 * there with a short-lived manager pass in the URL fragment (never sent to a
 * server or logged). See lib/franchise/managerPass.
 */

import { NextResponse } from 'next/server';
import { accountsEnabled, signedInAccount } from '@/lib/platform/account';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!accountsEnabled()) return NextResponse.redirect(new URL('/', url));
  const me = await signedInAccount();
  const back = `${url.pathname}${url.search}`;
  if (!me) return NextResponse.redirect(new URL(`/sign-in?redirect_url=${encodeURIComponent(back)}`, url));
  const slug = url.searchParams.get('slug') ?? '';
  const franchiseId = url.searchParams.get('franchise') ?? '';
  const [{ getFranchise }, { mintManagerPass }, { leagueOrigin }] = await Promise.all([
    import('@/lib/franchise/store'), import('@/lib/franchise/managerPass'), import('@/lib/franchise/links'),
  ]);
  if (!slug || !franchiseId || (await getFranchise(slug, franchiseId)).manager?.userId !== me.userId) {
    return NextResponse.redirect(new URL('/account', url));
  }
  return NextResponse.redirect(`${leagueOrigin(req, slug)}/team/${encodeURIComponent(franchiseId)}/manage#lpm=${mintManagerPass(slug, franchiseId, me.userId)}`);
}
