import { NextResponse } from 'next/server';
import { getLeagueRosters, getLeagueUsers, getNFLState, getAllLeagueSeasons } from '@/lib/api';
import { getCurrentLeagueId, INITIAL_LEAGUE_ID } from '@/config/league';
import {
  getPlayersDirectory,
  getSeasonStats,
  resolveStatsSeason,
  buildPlayerCard,
  type PlayerCard,
} from '@/lib/playerStats';

export const dynamic = 'force-dynamic';

export interface RosterTeam {
  rosterId:  number;
  userId:    string;
  teamName:  string;
  managerName: string;
  avatar:    string;
  record:    { wins: number; losses: number; ties: number };
  starters:  PlayerCard[];
  bench:     PlayerCard[];
}

export interface RostersResponse {
  statsSeason: string;
  seasons: string[];
  teams: RosterTeam[];
}

export async function GET(request: Request) {
  if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }

  const requested = new URL(request.url).searchParams.get('season');

  try {
    // The roster shown is always the current one — the season picker changes
    // which year's production is laid over those players, it does not travel
    // back to that year's roster.
    const leagueId = await getCurrentLeagueId();
    const [nflState, seasons] = await Promise.all([
      getNFLState(),
      getAllLeagueSeasons(leagueId),
    ]);

    const defaultSeason = await resolveStatsSeason(nflState?.season ?? String(new Date().getFullYear()));
    const statsSeason = requested && seasons.includes(requested) ? requested : defaultSeason;

    const [rosters, users, players, stats] = await Promise.all([
      getLeagueRosters(leagueId),
      getLeagueUsers(leagueId),
      getPlayersDirectory(),
      getSeasonStats(statsSeason),
    ]);

    const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));

    const teams: RosterTeam[] = rosters.map((r: any) => {
      const u = userById.get(r.owner_id);
      const starterIds = (r.starters ?? []).filter((id: string) => id && id !== '0');
      const starterSet = new Set<string>(starterIds);
      const allIds = (r.players ?? []).filter(Boolean);

      const toCard = (id: string) => buildPlayerCard(id, players, stats);
      // Sort the bench by production so the useful depth floats to the top.
      const bench = allIds
        .filter((id: string) => !starterSet.has(id))
        .map(toCard)
        .sort((a: PlayerCard, b: PlayerCard) => (b.points ?? -1) - (a.points ?? -1));

      return {
        rosterId: r.roster_id,
        userId: r.owner_id,
        teamName: u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`,
        managerName: u?.display_name ?? '',
        avatar: u?.avatar ?? '',
        record: {
          wins:   r.settings?.wins   ?? 0,
          losses: r.settings?.losses ?? 0,
          ties:   r.settings?.ties   ?? 0,
        },
        starters: starterIds.map(toCard),
        bench,
      };
    });

    return NextResponse.json({
      statsSeason,
      seasons: [...seasons].sort((a, b) => Number(b) - Number(a)),
      teams,
    } satisfies RostersResponse);
  } catch (err) {
    console.error('[api/rosters]', err);
    return NextResponse.json({ error: 'Failed to load rosters' }, { status: 500 });
  }
}
