/**
 * One analytics table, all rows.
 *
 * Whole tables rather than query results: the browser runs the queries, so a
 * report redraws as fields are dragged without a round trip per change. The
 * largest table is about 1.4MB before compression, which the CDN caches for
 * ten minutes, the same window the server memoises the build for.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentLeagueId, INITIAL_LEAGUE_ID } from '@/config/league';
import { analyticsTables } from '@/lib/analytics/datasets';
import { datasetById } from '@/lib/analytics/schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }
  const id = req.nextUrl.searchParams.get('dataset') ?? '';
  const ds = datasetById(id);
  if (!ds) return NextResponse.json({ error: `Unknown dataset "${id}"` }, { status: 400 });

  try {
    const tables = await analyticsTables(await getCurrentLeagueId());
    return NextResponse.json(
      { dataset: ds.id, rows: tables[ds.id], seasons: tables.seasonList, builtAt: tables.builtAt },
      { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } },
    );
  } catch (err) {
    console.error('[api/analytics/data]', err);
    return NextResponse.json({ error: 'Could not build the data' }, { status: 500 });
  }
}
