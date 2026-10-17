/**
 * Hiding the setup bar (components/layout/SetupBar) from a league's own
 * pages, for good: the same as hiding the admin's setup guide, so neither
 * comes back for any of the league's admins, on any device.
 *
 * Signed in by visitor pass (lib/platform/visitorPass), and only for the
 * league's owner and admins.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const [{ verifyVisitorPass }, { accountsEnabled }, { currentTenant }, { roleOf }] = await Promise.all([
    import('@/lib/platform/visitorPass'), import('@/lib/platform/account'), import('@/lib/tenant/context'), import('@/lib/platform/members'),
  ]);
  const me = accountsEnabled() ? verifyVisitorPass(req.headers.get('x-visitor-pass')) : null;
  const t = me ? await currentTenant() : null;
  const role = me && t ? await roleOf(t.slug, me.userId) : null;
  if (role !== 'owner' && role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { markSetup } = await import('@/lib/setupStatus');
  await markSetup({ action: 'dismissed' });
  return NextResponse.json({ ok: true });
}
