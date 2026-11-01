/**
 * The live strip's scores (components/layout/LiveStrip): every matchup in the league this week,
 * while the week's NFL games are being played, and nothing otherwise.
 *
 *   GET [?demo=1]  →  { live: false } | { live: true, week, games: [{ id, a, b }] }
 *
 * Live is the schedule's answer (lib/nflSchedule weekPhase): from the first kickoff to the last
 * final whistle. Polled by every open page while live, so the CDN holds an answer for twenty
 * seconds per league address. `demo=1` makes up a live week for development; refused in production.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentLeagueId, leagueConfigured } from '@/config/league';
import { getLeagueMatchups, getLeagueRosters, getLeagueUsers, getNFLState } from '@/lib/api';
import { weekPhase } from '@/lib/nflSchedule';
import { teamAvatar } from '@/lib/teamAvatar';

export const dynamic = 'force-dynamic';

export interface StripSide { userId: string; team: string; avatar: string; pts: number }
export interface StripGame { id: number; a: StripSide; b: StripSide }

/** A fresh response each time: a body can only be sent once. */
const off = () => NextResponse.json({ live: false }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } });

export async function GET(req: NextRequest) {
  if (!(await leagueConfigured())) return off();
  const demo = req.nextUrl.searchParams.get('demo') === '1';
  if (demo && process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not available' }, { status: 404 });
  try {
    const nfl = await getNFLState();
    const week = Number(nfl.week);
    if (!demo && (nfl.season_type !== 'regular' || !week || (await weekPhase(nfl.season, week)) !== 'live')) return off();

    const leagueId = await getCurrentLeagueId();
    const [matchups, rosters, users] = await Promise.all([
      getLeagueMatchups(leagueId, Math.max(1, week)), getLeagueRosters(leagueId), getLeagueUsers(leagueId),
    ]);
    const ownerOf = new Map(rosters.map((r: { roster_id: number; owner_id: string }) => [r.roster_id, r.owner_id]));
    const side = (m: { roster_id: number; points?: number }): StripSide => {
      const u = users.find(x => x.user_id === ownerOf.get(m.roster_id));
      return { userId: u?.user_id ?? '', team: u?.metadata?.team_name || u?.display_name || 'A team', avatar: teamAvatar(u), pts: Number(m.points ?? 0) };
    };
    const byId = new Map<number, typeof matchups>();
    for (const m of matchups) if (m.matchup_id != null) byId.set(m.matchup_id, [...(byId.get(m.matchup_id) ?? []), m]);
    let games: StripGame[] = [...byId].filter(([, pair]) => pair.length === 2).map(([id, [x, y]]) => ({ id, a: side(x), b: side(y) }));
    // Made up for development: scores that move, so the strip can be seen on a quiet day.
    if (demo) games = games.map(g => {
      const t = Date.now() / 20000;
      const wob = (n: number) => Math.round((60 + 40 * Math.abs(Math.sin(t + n))) * 100) / 100;
      return { ...g, a: { ...g.a, pts: wob(g.id) }, b: { ...g.b, pts: wob(g.id * 2.7) } };
    });
    return NextResponse.json({ live: true, week, games }, {
      headers: { 'Cache-Control': demo ? 'no-store' : 'public, s-maxage=20, stale-while-revalidate=20' },
    });
  } catch (err) {
    console.error('[api/live/strip]', err instanceof Error ? err.message : err);
    return off();
  }
}
