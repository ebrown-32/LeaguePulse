/**
 * A franchise's legends: the three players who have scored the most points for it, all time
 * (lib/archive/franchises). The statues around its stadium are their player cards, cast as
 * monuments (LegendStatues).
 *
 *   GET   { legends } (empty when the archive has nothing for the franchise)
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ currentSite }, { franchiseLegends }] = await Promise.all([import('@/lib/archive/ingest'), import('@/lib/archive/franchises')]);
    const legends = await franchiseLegends(await currentSite(), decodeURIComponent((await params).id)).catch(() => null);
    // They change a week at a time at most.
    return NextResponse.json({ legends: legends ?? [] }, { headers: { 'cache-control': 'public, max-age=3600' } });
  } catch (err) {
    console.error('[api/franchises/id/legend]', err);
    return NextResponse.json({ legends: [] });
  }
}
