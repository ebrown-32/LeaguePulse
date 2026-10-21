/**
 * A franchise's roster as it stands, for its stadium's sideline (Stadium3D's `sideline`): every
 * player, starters first in lineup order, then the bench by points, each with their points this
 * season in the league's own scoring (Sleeper's season stats, scored with lib/scoring).
 *
 *   GET   { players: { playerId, name, position, nflTeam, points, starter }[] }
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const franchiseId = decodeURIComponent((await params).id);
    const [api, { getCurrentLeagueId }, stats, { scoreStatLine }] = await Promise.all([
      import('@/lib/api'), import('@/config/league'), import('@/lib/playerStats'), import('@/lib/scoring'),
    ]);
    const leagueId = await getCurrentLeagueId();
    const [league, rosters, directory] = await Promise.all([
      api.getLeagueInfo(leagueId), api.getLeagueRosters(leagueId), stats.getPlayersDirectory(),
    ]);
    const roster = (rosters as any[]).find(r => String(r.owner_id) === franchiseId);
    if (!roster) return NextResponse.json({ players: [] });
    const season = await stats.resolveStatsSeason(String(league?.season ?? new Date().getFullYear()));
    const seasonStats = await stats.getSeasonStats(season).catch(() => ({} as Record<string, any>));
    const starters: string[] = (roster.starters ?? []).filter((id: string) => id && id !== '0');
    const players = (roster.players ?? []).map((id: string) => {
      const d = directory[id] ?? {};
      const points = scoreStatLine(seasonStats[id], league?.scoring_settings);
      return {
        playerId: String(id),
        name: d.full_name || [d.first_name, d.last_name].filter(Boolean).join(' ') || (d.position === 'DEF' ? `${id} Defense` : id),
        position: d.position ?? '',
        nflTeam: d.team ?? (d.position === 'DEF' ? id : 'FA'),
        points: points != null ? Math.round(points * 10) / 10 : null,
        starter: starters.includes(id),
      };
    });
    players.sort((a: any, b: any) => {
      if (a.starter !== b.starter) return a.starter ? -1 : 1;
      if (a.starter) return starters.indexOf(a.playerId) - starters.indexOf(b.playerId);
      return (b.points ?? -1) - (a.points ?? -1);
    });
    return NextResponse.json({ players }, { headers: { 'cache-control': 'public, max-age=600' } });
  } catch (err) {
    console.error('[api/franchises/id/roster]', err);
    return NextResponse.json({ players: [] });
  }
}
