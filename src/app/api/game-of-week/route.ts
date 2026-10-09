/**
 * This week's Game of the Week, with its live state.
 *
 * The pick and its reasons are locked for the week (see `lib/gameOfWeek`), but
 * the scoreboard under it is not: the response pairs the stored choice with a
 * fresh forecast for the same fixture, so the card can show the pre-game case
 * for watching and what is actually happening side by side.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentLeagueId, INITIAL_LEAGUE_ID } from '@/config/league';
import { getNFLState } from '@/lib/api';
import { gameOfWeek } from '@/lib/gameOfWeek';
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
    const currentSeason = String(nflState?.season ?? new Date().getFullYear());
    const currentWeek = Number(nflState?.week ?? 1);
    const season = req.nextUrl.searchParams.get('season') ?? currentSeason;
    const week = Number(req.nextUrl.searchParams.get('week') ?? 0) || currentWeek;

    // Only regular season weeks have a slate worth featuring; the playoffs
    // feature themselves.
    if (nflState?.season_type && nflState.season_type !== 'regular' && season === currentSeason) {
      return NextResponse.json({ pick: null });
    }

    const pick = await gameOfWeek(
      leagueId, season, week,
      // A past season has no "current week"; nothing in it can be chosen now.
      season === currentSeason ? currentWeek : Number.POSITIVE_INFINITY,
    );
    if (!pick) return NextResponse.json({ pick: null });

    const live = await weekForecasts(leagueId, season, week, false).catch(() => null);
    const fixture = live?.fixtures.find(f => f.matchupId === pick.matchupId) ?? null;

    return NextResponse.json({
      pick,
      live: fixture && live ? { phase: live.phase, forecast: fixture.forecast } : null,
    }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('[api/game-of-week]', err);
    return NextResponse.json({ error: 'Could not load the Game of the Week' }, { status: 500 });
  }
}
