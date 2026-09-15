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
import { weekPhase, type WeekPhase } from '@/lib/nflSchedule';
import { type StarterLine, type MatchupForecast } from '@/lib/sim/matchupOdds';
import { weekForecasts } from '@/lib/sim/weekForecasts';

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

/** Rivalry history and both rosters, the slow half. */
async function loadExtras(
  leagueId: string, season: string, a: string, b: string,
): Promise<Pick<MatchupDetail, 'statsSeason' | 'sides' | 'h2h'>> {
  const [rivalries, rosters, users, statsSeason] = await Promise.all([
    fetchRivalriesData(),
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
    resolveStatsSeason(season),
  ]);
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

  // Only finished meetings count. The rivalry record is built from weeks where
  // anyone scored, so a matchup still being played showed up as a past meeting
  // with a winner and was counted in the series record.
  const liveWeeks = new Set<string>();
  const current = String(season);
  const weeksInSeason = [...new Set((entry?.games ?? [])
    .filter(g => String(g.season) === current).map(g => g.week))];
  await Promise.all(weeksInSeason.map(async w => {
    if ((await weekPhase(current, w).catch(() => 'upcoming')) !== 'final') liveWeeks.add(`${current}|${w}`);
  }));
  const games = (entry?.games ?? []).filter(g => !liveWeeks.has(`${g.season}|${g.week}`));
  const aWins = games.filter(g => g.score > g.opponentScore).length;
  const bWins = games.filter(g => g.score < g.opponentScore).length;
  const { score, label } = rivalryScore(games, aWins, bWins);

  return {
    statsSeason,
    sides: [buildSide(a), buildSide(b)],
    h2h: {
      aWins,
      bWins,
      meetings: games.length,
      aPoints: Number(games.reduce((t, g) => t + g.score, 0).toFixed(1)),
      bPoints: Number(games.reduce((t, g) => t + g.opponentScore, 0).toFixed(1)),
      // Most recent first. Capped for display; the record reflects everything.
      games: [...games].sort((x, y) =>
        Number(y.season) - Number(x.season) || y.week - x.week).slice(0, 10),
      rivalryScore: score,
      rivalryLabel: label,
    },
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

  /**
   * Which half to return.
   *
   *   forecast  the live prediction only, which is what the drilldown opens on
   *   extras    rivalry history and rosters, for the other two tabs
   *   (absent)  both, for older callers
   *
   * Split because the halves cost very different amounts. The rivalry history
   * reads every season the league has played, and making the default tab wait
   * on it was a large part of why the panel felt slow to open.
   */
  const part = searchParams.get('part');
  const wantForecast = part !== 'extras';
  const wantExtras = part !== 'forecast';

  try {
    const [leagueId, nflState] = await Promise.all([getCurrentLeagueId(), getNFLState()]);
    const season = String(nflState?.season ?? new Date().getFullYear());
    const week = weekParam > 0 ? weekParam : Number(nflState?.week ?? 1);

    // Everything below runs at once rather than one step after another.
    const [forecastAll, extras] = await Promise.all([
      wantForecast ? weekForecasts(leagueId, season, week, true).catch(() => null) : null,
      wantExtras ? loadExtras(leagueId, season, a, b) : null,
    ]);

    let live: MatchupLive | null = null;
    const fixture = forecastAll?.fixtures.find(f =>
      (f.a.userId === a && f.b.userId === b) || (f.a.userId === b && f.b.userId === a));
    if (fixture && forecastAll) {
      live = {
        season: forecastAll.season,
        week: forecastAll.week,
        phase: forecastAll.phase,
        // Orient to the requested order, since the caller's `a` is not
        // necessarily the fixture's first side.
        ...(fixture.a.userId === a
          ? { forecast: fixture.forecast, lines: fixture.lines! }
          : {
              forecast: {
                ...fixture.forecast,
                a: fixture.forecast.b,
                b: fixture.forecast.a,
                aWinProb: 1 - fixture.forecast.aWinProb,
              },
              lines: [fixture.lines![1], fixture.lines![0]] as [StarterLine[], StarterLine[]],
            }),
      };
    }

    const detail: Partial<MatchupDetail> = {
      ...(wantForecast ? { live } : {}),
      ...(extras ?? {}),
    };
    return NextResponse.json(detail, {
      // The forecast moves as games finish; history does not.
      headers: { 'Cache-Control': part === 'extras'
        ? 'public, max-age=300, stale-while-revalidate=3600'
        : 'public, max-age=30, stale-while-revalidate=120' },
    });
  } catch (err) {
    console.error('[api/matchup]', err);
    return NextResponse.json({ error: 'Failed to load matchup' }, { status: 500 });
  }
}
