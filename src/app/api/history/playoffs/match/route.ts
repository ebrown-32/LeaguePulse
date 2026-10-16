/**
 * One playoff game's lineups (lib/playoffs, playoffMatchDetail), for the
 * bracket's drilldown: ?league=<season's league id>&weeks=15,16&rosters=3,7.
 * Only this site's own seasons.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentLeagueId, leagueConfigured } from '@/config/league';
import { getAllLinkedLeagueIds } from '@/lib/api';
import { playoffMatchDetail } from '@/lib/playoffs';

export const dynamic = 'force-dynamic';

const ints = (v: string | null, max: number) => (v ?? '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= max).slice(0, 4);

export async function GET(req: NextRequest) {
  if (!(await leagueConfigured())) return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  const league = req.nextUrl.searchParams.get('league') ?? '';
  const weeks = ints(req.nextUrl.searchParams.get('weeks'), 18);
  const rosters = ints(req.nextUrl.searchParams.get('rosters'), 64);
  if (!league || !weeks.length || !rosters.length) return NextResponse.json({ error: 'Which game?' }, { status: 400 });
  const ours = await getAllLinkedLeagueIds(await getCurrentLeagueId()).catch(() => [] as string[]);
  if (!ours.includes(league)) return NextResponse.json({ error: 'Not this league' }, { status: 404 });
  try {
    return NextResponse.json(await playoffMatchDetail(league, weeks, rosters), { headers: { 'Cache-Control': 'public, s-maxage=600' } });
  } catch (err) {
    console.error('[api/history/playoffs/match]', err);
    return NextResponse.json({ error: 'Could not read the game' }, { status: 500 });
  }
}
