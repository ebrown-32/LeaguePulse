import { NextResponse } from 'next/server';
import { getAllLinkedLeagueIds, generateComprehensiveLeagueHistory } from '@/lib/api';

export const dynamic = 'force-dynamic';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeamStat {
  userId: string;
  username: string;
  avatar: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  gamesPlayed: number;
  totalPoints: number;
  ppg: number;
  high: number;
  low: number;
  stdDev: number;
  weeklyScores: number[];
  weeklyScoresBySeason: Record<string, number[]>;
  consistency: number;   // 0-100
  explosiveness: number; // 0-100
  clutch: number;        // 0-100
  luckRating: number;    // actual - expected wins
  scheduleStrength: number;
  closeWins: number;
  closeLosses: number;
  explosiveGames: number;
  championships: number;
  playoffAppearances: number;
  seasonsPlayed: number;
  longestWinStreak: number;
  bestFinish: number;
}

export interface H2HRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface GameRecord {
  season: string;
  week: number;
  userId: string;
  username: string;
  avatar: string;
  value: number;
  detail: string;
  opponentUsername?: string;
  opponentScore?: number;
}

export interface SeasonSummary {
  season: string;
  champion: { userId: string; username: string; avatar: string; teamName: string; record: string; score: number } | null;
  avgScore: number;
  highScore: number;
  highScorer: { username: string; avatar: string } | null;
  totalTeams: number;
}

export interface NextGenPayload {
  teams: TeamStat[];
  h2h: Record<string, Record<string, H2HRecord>>;
  records: {
    highScores: GameRecord[];
    lowScores: GameRecord[];
    blowouts: GameRecord[];
    closeGames: GameRecord[];
  };
  seasonSummaries: SeasonSummary[];
  seasons: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stdDev(scores: number[]): number {
  if (scores.length === 0) return 0;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  return Math.sqrt(scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length);
}

function expectedWins(teamScores: number[], allScores: number[]): number {
  if (teamScores.length === 0 || allScores.length === 0) return 0;
  return teamScores.reduce((sum, s) => sum + allScores.filter(x => s > x).length / allScores.length, 0);
}

// Process matchup data from seasonAnalyses to compute H2H, weekly scores,
// close games, schedule strength, and record highlights. All in one pass.
function processMatchupData(seasonAnalyses: any[]) {
  const userWeeklyScores = new Map<string, number[]>();
  const userWeeklyScoresBySeason = new Map<string, Record<string, number[]>>();
  const userOpponentScores = new Map<string, number[]>();
  const userCloseWins = new Map<string, number>();
  const userCloseLosses = new Map<string, number>();
  const h2hMap = new Map<string, Map<string, H2HRecord>>();

  interface Highlight { season: string; week: number; scoreA: number; scoreB: number; userIdA: string; userIdB: string; usernameA: string; usernameB: string; avatarA: string; avatarB: string }
  const highlights: Highlight[] = [];

  for (const sa of seasonAnalyses) {
    const { matchups, rosters, users, league } = sa;
    if (!matchups || !rosters || !users || !league) continue;

    const rosterToUserId = new Map<number, string>(rosters.map((r: any) => [r.roster_id as number, r.owner_id as string]));
    const userById = new Map<string, any>(users.map((u: any) => [u.user_id as string, u]));

    // Initialise per-season score buckets
    users.forEach((u: any) => {
      if (!userWeeklyScoresBySeason.has(u.user_id)) userWeeklyScoresBySeason.set(u.user_id, {});
      const bySeason = userWeeklyScoresBySeason.get(u.user_id)!;
      if (!bySeason[league.season]) bySeason[league.season] = [];
    });

    const regularSeasonWeeks = (league.settings?.playoff_week_start ?? 14) - 1;

    for (let wi = 0; wi < matchups.length; wi++) {
      const isRegularSeason = wi < regularSeasonWeeks;
      const week: any[] = matchups[wi] ?? [];
      const groups = new Map<number, any[]>();
      week.forEach((m: any) => {
        if (!groups.has(m.matchup_id)) groups.set(m.matchup_id, []);
        groups.get(m.matchup_id)!.push(m);
      });

      groups.forEach(group => {
        if (group.length !== 2) return;
        const [a, b] = group;
        if (!a.points || !b.points || a.points === 0 && b.points === 0) return;

        const userA = rosterToUserId.get(a.roster_id as number);
        const userB = rosterToUserId.get(b.roster_id as number);
        if (!userA || !userB) return;

        const uA = userById.get(userA);
        const uB = userById.get(userB);

        if (isRegularSeason) {
          // Weekly scores and H2H only count regular season
          if (!userWeeklyScores.has(userA)) userWeeklyScores.set(userA, []);
          if (!userWeeklyScores.has(userB)) userWeeklyScores.set(userB, []);
          userWeeklyScores.get(userA)!.push(a.points);
          userWeeklyScores.get(userB)!.push(b.points);
          userWeeklyScoresBySeason.get(userA)?.[league.season]?.push(a.points);
          userWeeklyScoresBySeason.get(userB)?.[league.season]?.push(b.points);
        }

        if (isRegularSeason) {
          // Schedule strength, H2H, and clutch only count regular season
          if (!userOpponentScores.has(userA)) userOpponentScores.set(userA, []);
          if (!userOpponentScores.has(userB)) userOpponentScores.set(userB, []);
          userOpponentScores.get(userA)!.push(b.points);
          userOpponentScores.get(userB)!.push(a.points);

          if (!h2hMap.has(userA)) h2hMap.set(userA, new Map());
          if (!h2hMap.has(userB)) h2hMap.set(userB, new Map());
          const recAB = h2hMap.get(userA)!.get(userB) ?? { wins: 0, losses: 0, ties: 0 };
          const recBA = h2hMap.get(userB)!.get(userA) ?? { wins: 0, losses: 0, ties: 0 };

          const margin = Math.abs(a.points - b.points);
          const isClose = margin < 10;

          if (a.points > b.points) {
            recAB.wins++; recBA.losses++;
            if (isClose) { userCloseWins.set(userA, (userCloseWins.get(userA) ?? 0) + 1); userCloseLosses.set(userB, (userCloseLosses.get(userB) ?? 0) + 1); }
          } else if (b.points > a.points) {
            recBA.wins++; recAB.losses++;
            if (isClose) { userCloseWins.set(userB, (userCloseWins.get(userB) ?? 0) + 1); userCloseLosses.set(userA, (userCloseLosses.get(userA) ?? 0) + 1); }
          } else {
            recAB.ties++; recBA.ties++;
          }

          h2hMap.get(userA)!.set(userB, recAB);
          h2hMap.get(userB)!.set(userA, recBA);
        }

        // Highlights include all weeks (playoffs + regular season) for high/low score records
        highlights.push({
          season: league.season, week: wi + 1,
          scoreA: a.points, scoreB: b.points,
          userIdA: userA, userIdB: userB,
          usernameA: uA?.display_name ?? '', usernameB: uB?.display_name ?? '',
          avatarA: uA?.avatar ?? '', avatarB: uB?.avatar ?? '',
        });
      });
    }
  }

  // Convert h2h to plain objects
  const h2h: Record<string, Record<string, H2HRecord>> = {};
  h2hMap.forEach((opponents, userId) => {
    h2h[userId] = {};
    opponents.forEach((rec, opponentId) => { h2h[userId][opponentId] = rec; });
  });

  // Build records
  const allScores = highlights.flatMap(h => [
    { userId: h.userIdA, username: h.usernameA, avatar: h.avatarA, score: h.scoreA, opponentUsername: h.usernameB, opponentScore: h.scoreB, margin: Math.abs(h.scoreA - h.scoreB), season: h.season, week: h.week },
    { userId: h.userIdB, username: h.usernameB, avatar: h.avatarB, score: h.scoreB, opponentUsername: h.usernameA, opponentScore: h.scoreA, margin: Math.abs(h.scoreA - h.scoreB), season: h.season, week: h.week },
  ]);

  const toRecord = (s: typeof allScores[0], value: number, detail: string): GameRecord => ({
    season: s.season, week: s.week, userId: s.userId, username: s.username, avatar: s.avatar,
    value, detail, opponentUsername: s.opponentUsername, opponentScore: s.opponentScore,
  });

  // Deduplicate blowouts / close games (keep winning team's entry)
  const deduped = highlights.map(h => {
    const winner = h.scoreA >= h.scoreB ? { userId: h.userIdA, username: h.usernameA, avatar: h.avatarA, score: h.scoreA, opponentUsername: h.usernameB, opponentScore: h.scoreB }
      : { userId: h.userIdB, username: h.usernameB, avatar: h.avatarB, score: h.scoreB, opponentUsername: h.usernameA, opponentScore: h.scoreA };
    return { ...winner, margin: Math.abs(h.scoreA - h.scoreB), season: h.season, week: h.week };
  });

  const highScores = [...allScores].sort((a, b) => b.score - a.score).slice(0, 5)
    .map(s => toRecord(s, s.score, `${s.score.toFixed(2)} pts vs ${s.opponentUsername} (Wk ${s.week} '${s.season.slice(2)})`));

  const lowScores = [...allScores].sort((a, b) => a.score - b.score).slice(0, 5)
    .map(s => toRecord(s, s.score, `${s.score.toFixed(2)} pts vs ${s.opponentUsername} (Wk ${s.week} '${s.season.slice(2)})`));

  const blowouts = [...deduped].sort((a, b) => b.margin - a.margin).slice(0, 5)
    .map(s => ({ season: s.season, week: s.week, userId: s.userId, username: s.username, avatar: s.avatar, value: s.margin, detail: `Won by ${s.margin.toFixed(2)} vs ${s.opponentUsername} (Wk ${s.week} '${s.season.slice(2)})`, opponentUsername: s.opponentUsername, opponentScore: s.opponentScore }));

  const closeGames = [...deduped].sort((a, b) => a.margin - b.margin).slice(0, 5)
    .map(s => ({ season: s.season, week: s.week, userId: s.userId, username: s.username, avatar: s.avatar, value: s.margin, detail: `Won by ${s.margin.toFixed(2)} vs ${s.opponentUsername} (Wk ${s.week} '${s.season.slice(2)})`, opponentUsername: s.opponentUsername, opponentScore: s.opponentScore }));

  return { userWeeklyScores, userWeeklyScoresBySeason, userOpponentScores, userCloseWins, userCloseLosses, h2h, records: { highScores, lowScores, blowouts, closeGames } };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const initialId = process.env.NEXT_PUBLIC_LEAGUE_ID;
  if (!initialId) return NextResponse.json({ error: 'No league configured' }, { status: 400 });

  try {
    const allLeagueIds = await getAllLinkedLeagueIds(initialId);

    const { seasonAnalyses, userAllTimeStats } = await generateComprehensiveLeagueHistory(allLeagueIds);

    const { userWeeklyScores, userWeeklyScoresBySeason, userOpponentScores, userCloseWins, userCloseLosses, h2h, records } = processMatchupData(seasonAnalyses);

    // All weekly scores for computing league-wide average (for explosiveness threshold)
    const allWeeklyScores = Array.from(userWeeklyScores.values()).flat();
    const globalAvg = allWeeklyScores.length > 0 ? allWeeklyScores.reduce((s, v) => s + v, 0) / allWeeklyScores.length : 0;
    const explosiveThreshold = globalAvg * 1.2;

    // Build teams array
    const teams: TeamStat[] = Object.entries(userAllTimeStats).map(([userId, s]: [string, any]) => {
      const scores = userWeeklyScores.get(userId) ?? [];
      const oppScores = userOpponentScores.get(userId) ?? [];
      const closeWins = userCloseWins.get(userId) ?? 0;
      const closeLosses = userCloseLosses.get(userId) ?? 0;
      const totalCloseGames = closeWins + closeLosses;
      const mean = scores.length > 0 ? scores.reduce((a: number, v: number) => a + v, 0) / scores.length : 0;
      const sd = stdDev(scores);
      const cv = mean > 0 ? sd / mean : 0;
      const explosiveGames = scores.filter((sc: number) => sc > explosiveThreshold).length;
      const expWins = expectedWins(scores, allWeeklyScores);
      const luckRating = s.totalWins - expWins;
      const scheduleStrength = oppScores.length > 0 ? oppScores.reduce((a: number, v: number) => a + v, 0) / oppScores.length : 0;

      return {
        userId,
        username: s.username,
        avatar: s.avatar,
        teamName: s.username, // will be overridden below
        wins: s.totalWins,
        losses: s.totalLosses,
        ties: s.totalTies,
        winPct: s.winPercentage,
        gamesPlayed: s.totalWins + s.totalLosses + s.totalTies,
        totalPoints: s.totalPoints,
        ppg: s.averagePointsPerGame,
        high: s.highestScore,
        low: s.lowestScore,
        stdDev: sd,
        weeklyScores: scores,
        weeklyScoresBySeason: userWeeklyScoresBySeason.get(userId) ?? {},
        consistency: Math.max(0, Math.min(100, 100 - cv * 100)),
        explosiveness: scores.length > 0 ? (explosiveGames / scores.length) * 100 : 0,
        clutch: totalCloseGames > 0 ? (closeWins / totalCloseGames) * 100 : 50,
        luckRating,
        scheduleStrength,
        closeWins,
        closeLosses,
        explosiveGames,
        championships: s.championships,
        playoffAppearances: s.playoffAppearances,
        seasonsPlayed: s.seasonsPlayed,
        longestWinStreak: s.longestWinStreak,
        bestFinish: s.bestFinish === Infinity ? 0 : s.bestFinish,
      };
    });

    // Resolve teamName from most recent season
    for (const sa of [...seasonAnalyses].reverse()) {
      const { users } = sa;
      if (!users) continue;
      users.forEach((u: any) => {
        const team = teams.find(t => t.userId === u.user_id);
        if (team && team.teamName === team.username) {
          team.teamName = u.metadata?.team_name || u.display_name;
        }
      });
    }

    teams.sort((a, b) => b.winPct - a.winPct);

    // Season summaries from seasonAnalyses
    const seasonSummaries: SeasonSummary[] = seasonAnalyses.map(sa => {
      const { league, users, rosters, champions, seasonStats } = sa;
      if (!league) return null;

      const champion = champions?.[0];
      const championUser = champion?.user ?? null;
      const championRoster = champion ?? null;

      const allSeasonScores = Object.values(sa.userSeasonStats ?? {}).flatMap((us: any) => us.weeklyScores ?? []);
      const highScore = allSeasonScores.length > 0 ? Math.max(...allSeasonScores) : 0;
      const highScorerEntry = Object.entries(sa.userSeasonStats ?? {}).find(([, us]: [string, any]) => us.weeklyScores?.includes(highScore));
      const highScorerUser = highScorerEntry ? users?.find((u: any) => u.user_id === highScorerEntry[0]) : null;

      return {
        season: league.season,
        champion: championUser ? {
          userId: championUser.user_id,
          username: championUser.display_name,
          avatar: championUser.avatar,
          teamName: championUser.metadata?.team_name || championUser.display_name,
          record: `${championRoster?.settings?.wins ?? 0}-${championRoster?.settings?.losses ?? 0}`,
          score: seasonStats?.highestScore ?? 0,
        } : null,
        avgScore: seasonStats?.averageScore ?? 0,
        highScore,
        highScorer: highScorerUser ? { username: highScorerUser.display_name, avatar: highScorerUser.avatar } : null,
        totalTeams: rosters?.length ?? 0,
      };
    }).filter(Boolean).sort((a: any, b: any) => parseInt(b.season) - parseInt(a.season)) as SeasonSummary[];

    const seasons = seasonSummaries.map(s => s.season);

    return NextResponse.json({ teams, h2h, records, seasonSummaries, seasons } satisfies NextGenPayload);
  } catch (err) {
    console.error('[api/next-gen]', err);
    return NextResponse.json({ error: 'Failed to compute next-gen stats' }, { status: 500 });
  }
}
