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
import { type WeekPhase } from '@/lib/nflSchedule';
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
    // One shared builder for the whole week, then the fixture these two are in.
    const all = await weekForecasts(leagueId, season, week, true).catch(() => null);
    const fixture = all?.fixtures.find(f =>
      (f.a.userId === a && f.b.userId === b) || (f.a.userId === b && f.b.userId === a));
    const live: MatchupLive | null = fixture && all
      ? {
          season: all.season,
          week: all.week,
          phase: all.phase,
          // Orient the forecast to the requested order, since the caller's `a`
          // is not necessarily the fixture's first side.
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
        }
      : null;

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
