/**
 * The visitor on a league's site, from their visitor pass (x-visitor-pass,
 * see lib/platform/visitorPass): who they are, what they are in this league,
 * and where their account menu leads. Never cached.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const [{ verifyVisitorPass }, links, { accountsEnabled }] = await Promise.all([
    import('@/lib/platform/visitorPass'), import('@/lib/franchise/links'), import('@/lib/platform/account'),
  ]);
  if (!accountsEnabled()) return NextResponse.json({ accounts: false });
  const product = links.productOrigin(req);
  const me = verifyVisitorPass(req.headers.get('x-visitor-pass'));
  const signIn = `${product}/api/platform/account/link?return=`;
  if (!me) return NextResponse.json({ accounts: true, signedIn: false, product, signIn }, { headers: { 'cache-control': 'no-store' } });

  const { currentTenant } = await import('@/lib/tenant/context');
  const t = await currentTenant();
  const [{ roleOf }, store] = await Promise.all([import('@/lib/platform/members'), import('@/lib/franchise/store')]);
  const [role, franchiseId] = t ? await Promise.all([roleOf(t.slug, me.userId), store.managedIn(t.slug, me.userId)]) : [null, null];
  return NextResponse.json({
    accounts: true, signedIn: true, product, signIn,
    name: me.name, image: me.image, role,
    links: {
      account: `${product}/account`,
      admin: t && role ? `${product}/api/platform/account/open?slug=${encodeURIComponent(t.slug)}` : null,
      franchise: franchiseId ? `/team/${encodeURIComponent(franchiseId)}` : null,
      editFranchise: t && franchiseId ? product + links.openPath(t.slug, franchiseId) : null,
    },
  }, { headers: { 'cache-control': 'no-store' } });
}
