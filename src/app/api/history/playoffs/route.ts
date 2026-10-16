/** Every season's playoffs for this league (lib/playoffs), newest first. */

import { NextResponse } from 'next/server';
import { getCurrentLeagueId, leagueConfigured } from '@/config/league';
import { playoffHistory } from '@/lib/playoffs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  if (!(await leagueConfigured())) return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  try {
    const seasons = await playoffHistory(await getCurrentLeagueId());
    return NextResponse.json({ seasons }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } });
  } catch (err) {
    console.error('[api/history/playoffs]', err);
    return NextResponse.json({ error: 'Could not read the playoffs' }, { status: 500 });
  }
}
