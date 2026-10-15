/**
 * The league's franchise leaderboard: every active franchise by value, with
 * its stadium and last crowd. Public (stadiums are public; books are not).
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [{ currentSite }, { listFranchises }, { leaderboard }, { facilityStats }] = await Promise.all([
    import('@/lib/archive/ingest'), import('@/lib/archive/franchises'), import('@/lib/tycoon/service'), import('@/lib/tycoon/catalog'),
  ]);
  try {
    const site = await currentSite();
    const list = (await listFranchises(site))?.filter(f => f.active) ?? [];
    const board = await leaderboard(site, list.map(f => f.franchiseId));
    if (!board) return NextResponse.json({ available: false, franchises: [] });
    const meta = new Map(list.map(f => [f.franchiseId, f]));
    return NextResponse.json({
      available: true,
      franchises: board.map((b, i) => ({
        rank: i + 1, ...b, stadiumName: facilityStats(b.facilities).stadiumName,
        teamName: meta.get(b.franchiseId)?.teamName ?? null, manager: meta.get(b.franchiseId)?.manager ?? null,
      })),
    }, { headers: { 'cache-control': 'private, max-age=60' } });
  } catch (err) {
    console.error('[api/tycoon]', err);
    return NextResponse.json({ error: 'Could not load the leaderboard' }, { status: 500 });
  }
}
