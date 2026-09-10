/**
 * Live win odds for every matchup in a week.
 *
 * One call for the whole slate, so a page showing four cards does not make four
 * round trips for data that is fetched once anyway. Starter lines are left out;
 * the drilldown fetches those for the one matchup it opens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentLeagueId, INITIAL_LEAGUE_ID } from '@/config/league';
import { getNFLState } from '@/lib/api';
import { weekForecasts } from '@/lib/sim/weekForecasts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }

  try {
    const [leagueId, nflState] = await Promise.all([
      getCurrentLeagueId(),
      getNFLState().catch(() => null as any),
    ]);

    const season = req.nextUrl.searchParams.get('season')
      ?? String(nflState?.season ?? new Date().getFullYear());
    const week = Number(req.nextUrl.searchParams.get('week') ?? 0)
      || Number(nflState?.week ?? 1);

    const data = await weekForecasts(leagueId, season, week, false);
    if (!data) return NextResponse.json({ week, fixtures: [] });

    return NextResponse.json(data, {
      // Short: the whole point is that these move as games finish.
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('[api/matchups/odds]', err);
    return NextResponse.json({ error: 'Could not build week odds' }, { status: 500 });
  }
}
