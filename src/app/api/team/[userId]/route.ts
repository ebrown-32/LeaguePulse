import { NextResponse } from 'next/server';
import {
  getAllLinkedLeagueIds, getLeagueUsers, getLeagueRosters, getAdvancedTeamMetrics,
} from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { generateEnhancedLeagueHistory, type EnhancedLeagueHistory, type EnhancedHistoricalRecord } from '@/lib/enhancedHistoryApi';

export const dynamic = 'force-dynamic';

// The full league computation is user-independent and expensive (many Sleeper
// calls across every linked season), compute it once and serve every manager's
// profile from the cache instead of redoing it per request.
let historyCache: { history: EnhancedLeagueHistory; advanced: Awaited<ReturnType<typeof getAdvancedTeamMetrics>>; identities: Map<string, IdentityInfo>; ts: number } | null = null;
const CACHE_TTL_MS = 900_000; // 15 min

interface IdentityInfo {
  userId: string;
  teamName: string;
  avatar: string;
}

async function loadShared() {
  if (historyCache && Date.now() - historyCache.ts < CACHE_TTL_MS) return historyCache;

  const leagueId = await getCurrentLeagueId();
  const [history, advanced, allLeagueIds] = await Promise.all([
    generateEnhancedLeagueHistory(leagueId),
    getAdvancedTeamMetrics(leagueId),
    getAllLinkedLeagueIds(leagueId),
  ]);

  // generateEnhancedLeagueHistory tracks Sleeper display_name, not the custom
  // team_name managers set, walk every linked season (oldest to newest) so the
  // most recent custom name wins, matching what every other page shows.
  const identities = new Map<string, IdentityInfo>();
  const seasonsAsc = [...allLeagueIds].reverse();
  for (const leagueId of seasonsAsc) {
    const [users, rosters] = await Promise.all([getLeagueUsers(leagueId), getLeagueRosters(leagueId)]);
    const userById = new Map(users.map(u => [u.user_id, u]));
    for (const r of rosters) {
      const u = userById.get(r.owner_id);
      if (!u) continue;
      identities.set(r.owner_id, {
        userId: r.owner_id,
        teamName: u.metadata?.team_name || u.display_name,
        avatar: u.avatar || '',
      });
    }
  }

  historyCache = { history, advanced, identities, ts: Date.now() };
  return historyCache;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface SeasonEntry {
  season: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  finish: number;
  playoffAppearance: boolean;
  championship: boolean;
  regularSeasonChamp: boolean;
  highlights: string[];
}

export interface RivalEntry {
  userId: string;
  teamName: string;
  avatar: string;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
}

export interface AdvancedProfile {
  consistency: number;
  explosiveness: number;
  clutch: number;
  efficiency: number;
  momentum: number;
  luck: number;
}

export interface TeamProfileResponse {
  userId: string;
  teamName: string;
  displayName: string;
  avatar: string;
  seasonsPlayed: number;
  firstSeason: string | null;
  currentSeason: string | null;

  career: {
    wins: number;
    losses: number;
    ties: number;
    winPct: number;
    pointsFor: number;
    pointsAgainst: number;
    ppg: number;
    ppgAgainst: number;
    championships: number;
    runnerUps: number;
    regularSeasonTitles: number;
    playoffAppearances: number;
    bestFinish: number;
    worstFinish: number;
    totalTrades: number;
  };

  rings: { season: string; modelPath: string }[];

  advanced: AdvancedProfile | null;

  recordsHeld: {
    type: string;
    season: string;
    week?: number;
    description: string;
    isAllTime: boolean;
  }[];

  seasons: SeasonEntry[];
  rivals: RivalEntry[];
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const initialId = process.env.NEXT_PUBLIC_LEAGUE_ID;
  if (!initialId) return NextResponse.json({ error: 'No league configured' }, { status: 400 });

  try {
    const { history, advanced, identities } = await loadShared();
    const stats = history.allTimeStats.find(u => u.userId === userId);
    if (!stats) return NextResponse.json({ error: 'Manager not found' }, { status: 404 });

    const identity = identities.get(userId);
    const teamName = identity?.teamName || stats.username;
    const avatar = identity?.avatar || stats.avatar;

    // Record descriptions are baked with the raw Sleeper display name at
    // generation time; swap in the custom team name so the profile reads as one
    // consistent voice instead of surfacing an account username.
    const myRecords: EnhancedHistoricalRecord[] = history.records
      .filter(r => r.userId === userId)
      .map(r => ({ ...r, description: r.description.split(stats.username).join(teamName) }))
      .sort((a, b) => (b.isAllTime ? 1 : 0) - (a.isAllTime ? 1 : 0) || Number(b.season) - Number(a.season));

    const seasonKeys = Object.keys(stats.seasonBySeasonStats).sort((a, b) => Number(a) - Number(b));
    const seasons: SeasonEntry[] = seasonKeys.map(season => {
      const s = stats.seasonBySeasonStats[season];
      const highlights = myRecords
        .filter(r => r.season === season && !['championship', 'runnerUp', 'regularSeasonChamp', 'playoffAppearance'].includes(r.type))
        .map(r => r.description);
      // Sleeper's poff/rank fields go unpopulated for some league configs, which
      // leaves the underlying playoffAppearance flag stuck false even in a
      // championship season. Winning it all or the regular season title can only
      // happen via the playoffs, so treat either as proof of a playoff appearance.
      const playoffAppearance = s.playoffAppearance || s.championship || s.regularSeasonChamp;
      return {
        season,
        wins: s.wins, losses: s.losses, ties: s.ties,
        pointsFor: Math.round(s.pointsFor * 10) / 10,
        pointsAgainst: Math.round(s.pointsAgainst * 10) / 10,
        finish: s.finish,
        playoffAppearance,
        championship: s.championship,
        regularSeasonChamp: s.regularSeasonChamp,
        highlights,
      };
    });

    const rings = seasons.filter(s => s.championship).map(s => ({
      season: s.season,
      modelPath: `/models/rings/ring-${s.season}.glb`,
    }));

    const runnerUps = myRecords.filter(r => r.type === 'runnerUp').length;

    const advancedEntry = advanced.find(a => a.userId === userId);
    const advancedProfile: AdvancedProfile | null = advancedEntry ? {
      consistency: Math.round(advancedEntry.consistency.score),
      explosiveness: Math.round(advancedEntry.explosiveness.score),
      clutch: Math.round(advancedEntry.clutch.score),
      efficiency: Math.round(advancedEntry.efficiency.score),
      momentum: Math.round(advancedEntry.momentum.score),
      luck: Math.round(advancedEntry.luck.score),
    } : null;

    // Rivals: every opponent faced, ranked by games played (most storied first)
    const rivals: RivalEntry[] = Object.entries(stats.headToHeadRecord)
      .map(([oppId, rec]) => {
        const oppIdentity = identities.get(oppId);
        const oppStats = history.allTimeStats.find(u => u.userId === oppId);
        return {
          userId: oppId,
          teamName: oppIdentity?.teamName || oppStats?.username || 'Unknown',
          avatar: oppIdentity?.avatar || oppStats?.avatar || '',
          wins: rec.wins, losses: rec.losses, ties: rec.ties,
          gamesPlayed: rec.wins + rec.losses + rec.ties,
        };
      })
      .filter(r => r.gamesPlayed > 0)
      .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
      .slice(0, 8);

    const payload: TeamProfileResponse = {
      userId,
      teamName,
      displayName: stats.username,
      avatar,
      seasonsPlayed: stats.seasonsPlayed,
      firstSeason: seasonKeys[0] ?? null,
      currentSeason: seasonKeys[seasonKeys.length - 1] ?? null,
      career: {
        wins: stats.totalWins,
        losses: stats.totalLosses,
        ties: stats.totalTies,
        winPct: Math.round(stats.winPercentage * 1000) / 10,
        pointsFor: Math.round(stats.totalPoints * 10) / 10,
        pointsAgainst: Math.round(stats.totalPointsAgainst * 10) / 10,
        ppg: Math.round(stats.averagePointsPerGame * 10) / 10,
        ppgAgainst: Math.round(stats.averagePointsAgainst * 10) / 10,
        championships: stats.championships,
        runnerUps,
        regularSeasonTitles: stats.regularSeasonChampionships,
        // Recomputed from the corrected per-season flags above, not the raw
        // (sometimes-broken) career counter.
        playoffAppearances: seasons.filter(s => s.playoffAppearance).length,
        bestFinish: stats.bestFinish === Infinity ? 0 : stats.bestFinish,
        worstFinish: Math.max(0, ...seasons.map(s => s.finish).filter(f => f > 0)),
        totalTrades: stats.totalTrades,
      },
      rings,
      advanced: advancedProfile,
      recordsHeld: myRecords.map(r => ({
        type: r.type, season: r.season, week: r.week, description: r.description, isAllTime: !!r.isAllTime,
      })),
      seasons,
      rivals,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[api/team]', err);
    return NextResponse.json({ error: 'Failed to build team profile' }, { status: 500 });
  }
}
