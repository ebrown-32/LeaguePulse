/**
 * The league's franchises: every manager who has played in it, across every
 * season (from the archive, src/lib/archive/franchises.ts), each with the
 * identity its manager set and whether it has one.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [{ listFranchises }, { currentSite }] = await Promise.all([import('@/lib/archive/franchises'), import('@/lib/archive/ingest')]);
  try {
    const site = await currentSite();
    const list = await listFranchises(site);
    if (!list) return NextResponse.json({ archived: false, franchises: [] });
    const identities = await franchiseIdentities(site, list.map(f => f.franchiseId));
    return NextResponse.json({
      archived: true,
      franchises: list.map(f => ({ ...f, ...(identities.get(f.franchiseId) ?? blank) })),
    }, { headers: { 'cache-control': 'private, max-age=60' } });
  } catch (err) {
    console.error('[api/franchises]', err);
    return NextResponse.json({ error: 'Could not load the franchises' }, { status: 500 });
  }
}

const blank = { color: null, motto: null, managed: false, managerName: null };

/** What each franchise's manager (or an admin) set that the list shows: its color and motto. The logo is for the franchise page only. */
async function franchiseIdentities(site: string, ids: string[]) {
  const { getFranchises } = await import('@/lib/franchise/store');
  const all = await getFranchises(site, ids).catch(() => new Map());
  return new Map([...all].map(([id, f]) => [id, {
    color: f.color, motto: f.motto,
    managed: Boolean(f.manager), managerName: f.manager?.name ?? null,
  }]));
}
