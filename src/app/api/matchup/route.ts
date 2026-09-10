import { NextResponse } from 'next/server';
import { fetchRivalriesData, type GameRecord } from '@/lib/rivalries';
import { getLeagueRosters, getLeagueUsers, getNFLState } from '@/lib/api';
import { getCurrentLeagueId, INITIAL_LEAGUE_ID } from '@/config/league';
import {
  getPlayersDirectory,
  getSeasonStats,
  resolveStatsSeason,
  buildPlayerCard,
  type PlayerCard,
} from '@/lib/playerStats';
import { teamAvatar } from '@/lib/teamAvatar';
import { getLeagueMatchups } from '@/lib/api';
import { weeklyProjections, fantasyPositions } from '@/lib/sim/weeklyProjections';
import { teamGameStatus, hasPlayed, weekPhase, type WeekPhase } from '@/lib/nflSchedule';
import { forecastMatchup, type StarterLine, type MatchupForecast } from '@/lib/sim/matchupOdds';
import { leagueCalibration } from '@/lib/sim/leagueCalibration';
import { getLeagueInfo } from '@/lib/api';

export const dynamic = 'force-dynamic';

export interface MatchupSide {
  userId: string;
  teamName: string;
  manager: string;
  avatar: string;
  starters: PlayerCard[];
  bench: PlayerCard[];
}

/** Everything the prediction view needs, when the matchup is a real fixture. */
export interface MatchupLive {
  season: string;
  week: number;
  phase: WeekPhase;
  forecast: MatchupForecast;
  /** Starter-by-starter, side A then side B. */
  lines: [StarterLine[], StarterLine[]];
}

export interface MatchupDetail {
  statsSeason: string;
  /** Null when the two teams are not actually scheduled against each other. */
  live: MatchupLive | null;
  sides: [MatchupSide, MatchupSide];
  h2h: {
    aWins: number;
    bWins: number;
    /** Games actually played. Not aWins + bWins, which excludes ties. */
    meetings: number;
    aPoints: number;
    bPoints: number;
    games: GameRecord[];
    /** 0-100. How much of a real rivalry this pairing is. */
    rivalryScore: number;
    rivalryLabel: string;
  };
}

/**
 * Rivalry intensity from the actual series, not vibes.
 *
 * Four signals, each normalised to 0-1: how often they have met, how evenly
 * split it is, how close the games were, and whether any of it happened in the
 * playoffs. A 6-6 series of nail-biters scores far higher than a lopsided
 * 10-2, which is what "rivalry" should mean.
 */
function rivalryScore(games: GameRecord[], aWins: number, bWins: number): { score: number; label: string } {
  const total = games.length;
  if (!total) return { score: 0, label: 'No history' };

  const volume  = Math.min(total / 12, 1);
  const winPct  = aWins / Math.max(aWins + bWins, 1);
  const balance = 1 - Math.abs(winPct - 0.5) * 2;

  const avgMargin = games.reduce((s, g) => s + Math.abs(g.score - g.opponentScore), 0) / total;
  const closeness = 1 - Math.min(avgMargin / 40, 1);

  const playoffs = Math.min(games.filter(g => g.isPlayoff).length / 3, 1);

  const score = Math.round(100 * (0.30 * volume + 0.30 * balance + 0.25 * closeness + 0.15 * playoffs));
  const label =
    score >= 75 ? 'Blood feud' :
    score >= 55 ? 'Real rivalry' :
    score >= 35 ? 'Warming up' :
    total >= 2  ? 'Occasional' : 'First meeting';
  return { score, label };
}

/**
 * The live half of the payload: who has played, who has not, and what that
 * implies for the result.
 *
 * Returns null when these two teams are not scheduled against each other in the
 * requested week, since a forecast for a game that is not being played would be
 * a curiosity rather than information.
 */
async function buildLive(
  leagueId: string,
  season: string,
  week: number,
  aUserId: string,
  bUserId: string,
  rosters: any[],
  players: Record<string, any>,
): Promise<MatchupLive | null> {
  const rosterOf = (userId: string) => rosters.find((r: any) => r.owner_id === userId);
  const ra = rosterOf(aUserId), rb = rosterOf(bUserId);
  if (!ra || !rb) return null;

  const rows = await getLeagueMatchups(leagueId, week).catch(() => [] as any[]);
  const rowOf = (rosterId: number) => rows.find((m: any) => m.roster_id === rosterId);
  const ma = rowOf(ra.roster_id), mb = rowOf(rb.roster_id);
  if (!ma || !mb) return null;
  // Only forecast a fixture that exists.
  if (ma.matchup_id == null || ma.matchup_id !== mb.matchup_id) return null;

  // Scoring settings and roster slots come from the league itself, so a half
  // PPR or superflex league gets projections that mean something.
  const info: any = await getLeagueInfo(leagueId).catch(() => null);
  const scoring = info?.scoring_settings ?? null;
  const slots: string[] = info?.roster_positions ?? [];

  const [proj, status, phase, calibration] = await Promise.all([
    weeklyProjections(season, week, fantasyPositions(slots), scoring),
    teamGameStatus(season, week),
    weekPhase(season, week),
    leagueCalibration(leagueId),
  ]);

  const lineFor = (m: any): StarterLine[] => {
    const pts: Record<string, number> = m.players_points ?? {};
    return (m.starters ?? [])
      .filter((id: string) => id && id !== '0')
      .map((id: string): StarterLine => {
        const p = players?.[id];
        const nflTeam: string | null = p?.team ?? null;
        const gs = nflTeam ? status.get(nflTeam) : undefined;
        // No game at all this week means a bye, which is a real and visible
        // reason a lineup is short rather than an error.
        const playerPhase = !nflTeam || gs === undefined
          ? 'bye' as const
          : hasPlayed(gs) ? 'played' as const : 'upcoming' as const;
        const projected = proj.get(id) ?? null;
        return {
          playerId: id,
          name: p?.full_name
            || [p?.first_name, p?.last_name].filter(Boolean).join(' ')
            || id,
          position: p?.position ?? '--',
          nflTeam,
          projected,
          actual: playerPhase === 'played' ? Number(pts[id] ?? 0) : null,
          phase: playerPhase,
        };
      });
  };

  const la = lineFor(ma), lb = lineFor(mb);
  return {
    season, week, phase,
    forecast: forecastMatchup(la, lb, calibration),
    lines: [la, lb],
  };
}

export async function GET(request: Request) {
  if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const a = searchParams.get('a');
  const b = searchParams.get('b');
  const weekParam = Number(searchParams.get('week') ?? 0);
  if (!a || !b) {
    return NextResponse.json({ error: 'Both a and b user ids are required' }, { status: 400 });
  }

  try {
    const leagueId = await getCurrentLeagueId();
    const [rivalries, rosters, users, nflState] = await Promise.all([
      fetchRivalriesData(),
      getLeagueRosters(leagueId),
      getLeagueUsers(leagueId),
      getNFLState(),
    ]);

    const statsSeason = await resolveStatsSeason(nflState?.season ?? String(new Date().getFullYear()));
    const [players, stats] = await Promise.all([getPlayersDirectory(), getSeasonStats(statsSeason)]);

    const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));

    const buildSide = (userId: string): MatchupSide => {
      const u = userById.get(userId);
      const r = rosters.find((x: any) => x.owner_id === userId);
      const starterIds = (r?.starters ?? []).filter((id: string) => id && id !== '0');
      const starterSet = new Set<string>(starterIds);
      const toCard = (id: string) => buildPlayerCard(id, players, stats);
      return {
        userId,
        teamName: u?.metadata?.team_name || u?.display_name || 'Unknown',
        manager: u?.display_name ?? '',
        avatar: teamAvatar(u),
        starters: starterIds.map(toCard),
        bench: (r?.players ?? [])
          .filter((id: string) => id && !starterSet.has(id))
          .map(toCard)
          .sort((x: PlayerCard, y: PlayerCard) => (y.points ?? -1) - (x.points ?? -1)),
      };
    };

    // h2h is keyed by user id in both directions; the entry under [a][b] is
    // written from a's perspective.
    const entry = rivalries.h2h?.[a]?.[b];
    const games = entry?.games ?? [];
    const aWins = entry?.wins ?? 0;
    const bWins = entry?.losses ?? 0;
    const { score, label } = rivalryScore(games, aWins, bWins);

    // ── Live prediction ────────────────────────────────────────────────────
    const season = String(nflState?.season ?? statsSeason);
    const week = weekParam > 0 ? weekParam : Number(nflState?.week ?? 1);
    const live = await buildLive(
      leagueId, season, week, a, b, rosters, players,
    ).catch(() => null);

    const detail: MatchupDetail = {
      statsSeason,
      live,
      sides: [buildSide(a), buildSide(b)],
      h2h: {
        aWins,
        bWins,
        meetings: games.length,
        aPoints: Number((entry?.pointsFor ?? 0).toFixed(1)),
        bPoints: Number((entry?.pointsAgainst ?? 0).toFixed(1)),
        // Most recent meetings first. Capped for display; `meetings` and the
        // record above still reflect the entire series.
        games: [...games].sort((x, y) =>
          Number(y.season) - Number(x.season) || y.week - x.week).slice(0, 10),
        rivalryScore: score,
        rivalryLabel: label,
      },
    };

    return NextResponse.json(detail);
  } catch (err) {
    console.error('[api/matchup]', err);
    return NextResponse.json({ error: 'Failed to load matchup' }, { status: 500 });
  }
}
