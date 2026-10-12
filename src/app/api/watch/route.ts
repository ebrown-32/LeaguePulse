/**
 * The game day watch guide: which games to have on, where the ball is, and
 * your players' plays as they happen.
 *
 * `?user=` picks whose guide it is. There is no sign-in, so the page asks
 * which team you are and remembers it in the browser; without one, games are
 * ranked by what is at stake across the whole league.
 *
 * Polled by the page every twenty seconds while games are on. The expensive
 * reads underneath (ESPN's scoreboard and play by play, the week's
 * projections) are cached on the server, so a league's worth of phones
 * polling at once costs ESPN one request per interval, not one per phone.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentLeagueId, leagueConfigured } from '@/config/league';
import { getLeagueInfo, getNFLState } from '@/lib/api';
import { watchGuide } from '@/lib/live/watchGuide';
import { playFeed } from '@/lib/live/playFeed';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await leagueConfigured())) {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }
  try {
    const [leagueId, nflState] = await Promise.all([getCurrentLeagueId(), getNFLState().catch(() => null as any)]);
    const season = String(nflState?.season ?? new Date().getFullYear());
    const week = Number(req.nextUrl.searchParams.get('week') ?? 0) || Number(nflState?.week ?? 1);
    const user = req.nextUrl.searchParams.get('user') || null;

    const [guide, info] = await Promise.all([
      watchGuide(leagueId, season, week, user),
      getLeagueInfo(leagueId).catch(() => null as any),
    ]);
    if (!guide) return NextResponse.json({ guide: null, feed: [] });

    // The feed follows both sides of your matchup: your plays, and theirs.
    const mine = guide.games.flatMap(g => g.mine.map(p => p.playerId));
    const theirs = guide.games.flatMap(g => g.theirs.map(p => p.playerId));
    const feed = guide.me
      ? await playFeed({ mine, theirs, scoring: info?.scoring_settings ?? {}, limit: 50 }).catch(() => [])
      : [];

    return NextResponse.json({ guide, feed }, { headers: { 'Cache-Control': 'private, max-age=10' } });
  } catch (err) {
    console.error('[api/watch]', err);
    return NextResponse.json({ error: 'Could not build the watch guide' }, { status: 500 });
  }
}
