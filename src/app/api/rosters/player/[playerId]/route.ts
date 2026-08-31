import { NextResponse } from 'next/server';
import { getAllLinkedLeagueIds, getLeagueUsers, getLeagueRosters, getNFLState } from '@/lib/api';
import { getCurrentLeagueId, INITIAL_LEAGUE_ID } from '@/config/league';
import {
  getPlayersDirectory,
  getSeasonStats,
  getSeasonProjections,
  resolveStatsSeason,
  buildPlayerCard,
  statLineFor,
  type PlayerCard,
} from '@/lib/playerStats';
import { teamAvatar } from '@/lib/teamAvatar';

export const dynamic = 'force-dynamic';

const BASE = 'https://api.sleeper.app/v1';

export interface PlayerMove {
  transactionId: string;
  type:     'trade' | 'free_agent' | 'waiver';
  season:   string;
  week:     number;
  created:  number;
  /** 'add' = joined this team, 'drop' = left it. */
  direction: 'add' | 'drop';
  teamName: string;
  userId:   string;
  avatar:   string;
  waiverBid?: number;
}

/** Who the player is, beyond the scoreboard. */
export interface PlayerProfile {
  height:  number | null;
  weight:  number | null;
  college: string | null;
  status:  string | null;
  depthChartOrder:    number | null;
  depthChartPosition: string | null;
}

/** What is expected of them next, all of it published by Sleeper. */
export interface PlayerOutlook {
  season:          string;
  projectedPoints: number | null;
  /** Redraft and dynasty startup ADP, PPR. Lower is more valuable. */
  adp:             number | null;
  dynastyAdp:      number | null;
}

export interface PlayerDetailResponse {
  player:      PlayerCard;
  statsSeason: string;
  statLine:    { label: string; value: string }[];
  profile:     PlayerProfile;
  outlook:     PlayerOutlook;
  moves:       PlayerMove[];
}

const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
/** 999 is Sleeper's "unpriced", not a draft slot. */
const pricedOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n != null && n < 999 ? n : null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await params;

  if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }

  try {
    const leagueId = await getCurrentLeagueId();
    const [nflState, players, linkedIds] = await Promise.all([
      getNFLState(),
      getPlayersDirectory(),
      getAllLinkedLeagueIds(leagueId),
    ]);

    if (!players[playerId]) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const requested = new URL(request.url).searchParams.get('season');
    const statsSeason = requested && /^\d{4}$/.test(requested)
      ? requested
      : await resolveStatsSeason(nflState?.season ?? String(new Date().getFullYear()));
    const projectionSeason = nflState?.season ?? String(new Date().getFullYear());
    const [stats, projections] = await Promise.all([
      getSeasonStats(statsSeason),
      getSeasonProjections(projectionSeason),
    ]);
    const player = buildPlayerCard(playerId, players, stats);
    const statLine = statLineFor(player.position, stats[playerId] ?? {});

    const raw = players[playerId] ?? {};
    const pr  = projections[playerId] ?? {};
    const profile = {
      height:  numOrNull(raw.height) ?? (raw.height ? Number(raw.height) || null : null),
      weight:  numOrNull(raw.weight) ?? (raw.weight ? Number(raw.weight) || null : null),
      college: raw.college || null,
      status:  raw.status || null,
      depthChartOrder:    numOrNull(raw.depth_chart_order),
      depthChartPosition: raw.depth_chart_position || null,
    };
    const outlook = {
      season: projectionSeason,
      projectedPoints: numOrNull(pr.pts_ppr),
      adp: pricedOrNull(pr.adp_ppr),
      dynastyAdp: pricedOrNull(pr.adp_dynasty_ppr),
    };

    const currentNFLWeek = Math.max(1, nflState?.week ?? 1);

    // Walk every linked season for transactions naming this player. Mirrors the
    // week-by-week fan-out the transactions route uses — Sleeper has no
    // per-player transaction endpoint, so the weeks must be swept.
    const perSeason = await Promise.all(linkedIds.map(async (id: string) => {
      const [info, rosters, users] = await Promise.all([
        fetch(`${BASE}/league/${id}`, { next: { revalidate: 86400 } }).then(r => r.json()).catch(() => null),
        getLeagueRosters(id).catch(() => []),
        getLeagueUsers(id).catch(() => []),
      ]);
      if (!info) return [];

      const status = info.status as string;
      const live = status === 'in_season' || status === 'post_season' || status === 'drafting' || status === 'pre_draft';
      const maxWeek = live ? Math.max(1, currentNFLWeek) : 22;
      const opts: RequestInit = live ? { cache: 'no-store' } : { next: { revalidate: 86400 } };

      const batches = await Promise.all(
        Array.from({ length: maxWeek }, (_, i) =>
          fetch(`${BASE}/league/${id}/transactions/${i + 1}`, opts)
            .then(r => (r.ok ? r.json() : []))
            .catch(() => []),
        ),
      );

      const rosterToUser = new Map<number, string>(
        (rosters as any[]).map(r => [r.roster_id, r.owner_id]),
      );
      const userById = new Map<string, any>((users as any[]).map(u => [u.user_id, u]));

      const moves: PlayerMove[] = [];
      for (const tx of batches.flat() as any[]) {
        if (tx.status !== 'complete') continue;
        if (!['trade', 'free_agent', 'waiver'].includes(tx.type)) continue;

        for (const [direction, map] of [['add', tx.adds], ['drop', tx.drops]] as const) {
          const rosterId = map?.[playerId];
          if (rosterId == null) continue;
          const userId = rosterToUser.get(rosterId) ?? '';
          const u = userById.get(userId);
          moves.push({
            transactionId: String(tx.transaction_id ?? ''),
            type: tx.type,
            season: info.season,
            week: tx.leg ?? 0,
            created: tx.created ?? 0,
            direction,
            teamName: u?.metadata?.team_name || u?.display_name || `Roster ${rosterId}`,
            userId,
            avatar: teamAvatar(u),
            waiverBid: tx.settings?.waiver_bid ?? undefined,
          });
        }
      }
      return moves;
    }));

    const moves = perSeason.flat().sort((a, b) => b.created - a.created);

    return NextResponse.json({
      player, statsSeason, statLine, profile, outlook, moves,
    } satisfies PlayerDetailResponse);
  } catch (err) {
    console.error('[api/rosters/player]', err);
    return NextResponse.json({ error: 'Failed to load player' }, { status: 500 });
  }
}
