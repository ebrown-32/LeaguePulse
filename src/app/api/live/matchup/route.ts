/**
 * A fantasy matchup, live, for the stadium (lib/live/liveMatchup).
 *
 *   GET ?host=<userId>&guest=<userId>[&week=n][&demo=1]
 *
 * Polled by the stadium every fifteen seconds while the week is on, by everyone
 * watching, so it is built once per matchup every ten seconds however many
 * watch: the answer is the same for every viewer (nothing in it is personal),
 * so the CDN holds it for ten seconds per league address and query, and each
 * server keeps it as long, sharing one build between requests that arrive
 * together. Underneath, ESPN's scoreboard and play by play are cached for
 * every league at once (lib/live/espn).
 *
 * `demo=1` simulates a game for development; it is refused in production.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentLeagueId, leagueConfigured } from '@/config/league';
import { getLeagueInfo, getNFLState } from '@/lib/api';
import { demoize, liveMatchup } from '@/lib/live/liveMatchup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Built answers, per league and matchup, for TTL; a build in flight is shared. */
const TTL_MS = 3_000;
const built = new Map<string, { at: number; value: Promise<unknown> }>();

export async function GET(req: NextRequest) {
  if (!(await leagueConfigured())) return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  const q = req.nextUrl.searchParams;
  const host = q.get('host'), guest = q.get('guest');
  if (!host || !guest || host === guest) return NextResponse.json({ error: 'Name both teams' }, { status: 400 });
  const demo = q.get('demo') === '1';
  if (demo && process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not available' }, { status: 404 });
  try {
    const [leagueId, nfl] = await Promise.all([getCurrentLeagueId(), getNFLState().catch(() => null as any)]);
    const week = Number(q.get('week') ?? 0) || Number(nfl?.week ?? 1);
    const key = `${leagueId}|${host}|${guest}|${week}`;
    const hit = built.get(key);
    let pending = hit && Date.now() - hit.at < TTL_MS ? hit.value : null;
    if (!pending) {
      pending = (async () => {
        const info = await getLeagueInfo(leagueId).catch(() => null as any);
        return liveMatchup({ leagueId, week, host, guest, scoring: info?.scoring_settings ?? {} });
      })();
      built.set(key, { at: Date.now(), value: pending });
      // Old entries go once there are many: one per matchup being watched, at most a few hundred.
      if (built.size > 500) for (const [k, v] of built) if (Date.now() - v.at > TTL_MS) built.delete(k);
      pending.catch(() => built.delete(key));
    }
    const live = await pending as Awaited<ReturnType<typeof liveMatchup>>;
    if (!live) return NextResponse.json({ error: 'Those two teams have no matchup that week' }, { status: 404 });
    if (demo) return NextResponse.json(demoize(live), { headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json(live, { headers: { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=2' } });
  } catch (err) {
    console.error('[api/live/matchup]', err);
    return NextResponse.json({ error: 'Could not load the live matchup' }, { status: 500 });
  }
}
