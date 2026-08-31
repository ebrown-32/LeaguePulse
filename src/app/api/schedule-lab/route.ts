import { NextResponse } from 'next/server';
import { getAllLinkedLeagueIds } from '@/lib/api';
import { teamAvatar } from '@/lib/teamAvatar';

export const dynamic = 'force-dynamic';

const BASE = 'https://api.sleeper.app/v1';

let responseCache: { data: ScheduleLabResponse; ts: number } | null = null;
const RESPONSE_TTL_MS = 900_000; // 15 min

/** Transient Sleeper failures shouldn't silently zero out a season's schedule data. */
async function fetchJson<T>(url: string, opts: RequestInit, fallback: T, tries = 3): Promise<T> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return await r.json();
      if (r.status === 404) return fallback;
    } catch { /* retry */ }
    if (i < tries - 1) await new Promise(res => setTimeout(res, 300 * (i + 1)));
  }
  return fallback;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface ScheduleTeam {
  rosterId: number;
  userId: string;
  teamName: string;
  avatar: string;
}

export interface WeeklyResult {
  week: number;
  opponentRosterId: number;
  opponentTeamName: string;
  myScore: number;
  oppScore: number;
  result: 'W' | 'L' | 'T';
  /** True when the borrowed schedule's opponent that week is the team itself,
   *  we fall back to the real result since you can't play yourself. */
  borrowedFromSelf: boolean;
  /** Fraction of the full league field the opponent outscored that specific week
   *  (0-1). Field-relative and computed independently per week, so it's immune
   *  to an uneven round-robin, unlike a season-long win% average. */
  oppPercentile: number;
}

export interface MatrixCell {
  scheduleOwnerRosterId: number;
  isActual: boolean;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  gamesPlayed: number;
  weeks: WeeklyResult[];
}

export interface TeamScheduleSummary {
  rosterId: number;
  actualWins: number;
  actualLosses: number;
  actualTies: number;
  actualPointsFor: number;
  actualPointsAgainst: number;
  gamesPlayed: number;
  /** Sleeper's own standings record, straight from roster settings. Differs from
   *  actualWins/Losses/Ties when the league awards a bonus win/loss against the
   *  weekly league-average score, this includes those, actualWins does not. */
  officialWins: number;
  officialLosses: number;
  officialTies: number;
  /** Average, week by week, of the opponent's percentile finish in the full
   *  league field that week (0-1). Not a season win%, computed independently
   *  per week so an uneven round-robin schedule can't skew it. */
  opponentStrengthAvg: number;
  avgWinsAcrossSchedules: number;
  minWinsAcrossSchedules: number;
  maxWinsAcrossSchedules: number;
  /** actualWins - avgWinsAcrossSchedules: positive = your real schedule was kinder than average */
  scheduleLuck: number;
  /** 1 = toughest schedule in the league that season */
  difficultyRank: number;
}

export interface SeasonScheduleData {
  season: string;
  isLive: boolean;
  regularSeasonWeeks: number;
  weeksPlayed: number;
  teams: ScheduleTeam[];
  /** True when this league awards a bonus win/loss against the weekly league-average
   *  score (Sleeper's "median game" setting). Those bonus results have no real
   *  opponent to swap, so they're excluded everywhere in this tool. */
  hasMedianGames: boolean;
  /** matrix[rosterId] = one cell per possible schedule owner, including self (diagonal = actual) */
  matrix: Record<string, MatrixCell[]>;
  summaries: Record<string, TeamScheduleSummary>;
}

export interface ScheduleLabResponse {
  seasons: string[];
  bySeason: Record<string, SeasonScheduleData>;
}

// ── Season loading ───────────────────────────────────────────────────────────

interface RawWeekGame {
  week: number;
  rosterId: number;
  opponentRosterId: number;
  myScore: number;
  oppScore: number;
}

async function loadSeason(leagueId: string): Promise<SeasonScheduleData | null> {
  const [info, rosters, users] = await Promise.all([
    fetchJson<any>(`${BASE}/league/${leagueId}`, { next: { revalidate: 3600 } }, null),
    fetchJson<any[]>(`${BASE}/league/${leagueId}/rosters`, { next: { revalidate: 3600 } }, []),
    fetchJson<any[]>(`${BASE}/league/${leagueId}/users`, { next: { revalidate: 3600 } }, []),
  ]);
  if (!info || rosters.length === 0) return null;

  const season = info.season as string;
  const status = info.status as string;
  const isComplete = status === 'complete';
  const isLive = !isComplete;
  const hasMedianGames = !!info.settings?.league_average_match;
  const regularSeasonWeeks = Math.max(1, (info.settings?.playoff_week_start || 14) - 1);
  const lastScored = Math.max(0, info.settings?.last_scored_leg ?? (isComplete ? regularSeasonWeeks : 0));
  const weeksPlayed = Math.min(regularSeasonWeeks, lastScored);
  if (weeksPlayed < 1) return null;

  const fetchOpts: RequestInit = isComplete
    ? { next: { revalidate: 86400 } }
    : { cache: 'no-store' };

  const matchupBatches = await Promise.all(
    Array.from({ length: weeksPlayed }, (_, i) =>
      fetchJson<any[]>(`${BASE}/league/${leagueId}/matchups/${i + 1}`, fetchOpts, [])
    )
  );

  const userById = new Map<string, any>(users.map(u => [u.user_id, u]));
  const teamNameByRoster = new Map<number, string>();
  const avatarByRoster = new Map<number, string>();
  const userIdByRoster = new Map<number, string>();
  const officialRecordByRoster = new Map<number, { wins: number; losses: number; ties: number }>();
  for (const r of rosters) {
    const u = userById.get(r.owner_id);
    teamNameByRoster.set(r.roster_id, u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`);
    avatarByRoster.set(r.roster_id, teamAvatar(u));
    userIdByRoster.set(r.roster_id, r.owner_id);
    officialRecordByRoster.set(r.roster_id, {
      wins: r.settings?.wins ?? 0,
      losses: r.settings?.losses ?? 0,
      ties: r.settings?.ties ?? 0,
    });
  }
  const rosterIds = rosters.map(r => r.roster_id as number).sort((a, b) => a - b);

  const teams: ScheduleTeam[] = rosterIds.map(rid => ({
    rosterId: rid,
    userId: userIdByRoster.get(rid) ?? '',
    teamName: teamNameByRoster.get(rid) ?? `Team ${rid}`,
    avatar: avatarByRoster.get(rid) ?? '',
  }));

  // Each roster's actual weekly games, in week order, plus the full-field score
  // for every roster each week (needed for field-relative difficulty below,
  // built straight from the raw matchup entries, independent of pairing).
  const actualSchedule = new Map<number, RawWeekGame[]>(rosterIds.map(rid => [rid, []]));
  const weekAllScores = new Map<number, Map<number, number>>();

  matchupBatches.forEach((matchups, i) => {
    const week = i + 1;
    const scoresThisWeek = new Map<number, number>();
    for (const m of matchups ?? []) {
      scoresThisWeek.set(m.roster_id, m.points ?? 0);
    }
    weekAllScores.set(week, scoresThisWeek);

    const groups = new Map<number, any[]>();
    for (const m of matchups ?? []) {
      if (!groups.has(m.matchup_id)) groups.set(m.matchup_id, []);
      groups.get(m.matchup_id)!.push(m);
    }
    for (const group of groups.values()) {
      if (group.length !== 2) continue; // bye or malformed pairing, skip
      const [a, b] = group;
      const aPts = a.points ?? 0, bPts = b.points ?? 0;
      actualSchedule.get(a.roster_id)?.push({ week, rosterId: a.roster_id, opponentRosterId: b.roster_id, myScore: aPts, oppScore: bPts });
      actualSchedule.get(b.roster_id)?.push({ week, rosterId: b.roster_id, opponentRosterId: a.roster_id, myScore: bPts, oppScore: aPts });
    }
  });

  // Fraction of the full field a roster outscored in a given week: the
  // building block for a week-by-week, round-robin-proof difficulty read.
  const weekPercentile = (week: number, rosterId: number): number => {
    const scores = weekAllScores.get(week);
    const mine = scores?.get(rosterId);
    if (!scores || mine === undefined) return 0.5;
    const others = [...scores.entries()].filter(([rid]) => rid !== rosterId).map(([, s]) => s);
    if (others.length === 0) return 0.5;
    const beaten = others.filter(s => s < mine).length;
    const tied = others.filter(s => s === mine).length;
    return (beaten + tied * 0.5) / others.length;
  };

  // Pass 1: each roster's actual season totals (for the matrix's actual/diagonal record)
  const seasonRecord = new Map<number, { wins: number; losses: number; ties: number; pointsFor: number; games: number }>();
  for (const rid of rosterIds) {
    const games = actualSchedule.get(rid) ?? [];
    let wins = 0, losses = 0, ties = 0, pointsFor = 0;
    for (const g of games) {
      pointsFor += g.myScore;
      if (g.myScore > g.oppScore) wins++;
      else if (g.myScore < g.oppScore) losses++;
      else ties++;
    }
    seasonRecord.set(rid, { wins, losses, ties, pointsFor, games: games.length });
  }

  const result = (my: number, opp: number): WeeklyResult['result'] => my > opp ? 'W' : my < opp ? 'L' : 'T';

  // Pass 2: build the N×N matrix, for each (scores-owner, schedule-owner) pair,
  // replay scores-owner's actual weekly points against schedule-owner's actual opponents.
  const matrix: Record<string, MatrixCell[]> = {};
  for (const scoresRid of rosterIds) {
    const myGames = actualSchedule.get(scoresRid) ?? [];
    const myScoreByWeek = new Map<number, number>(myGames.map(g => [g.week, g.myScore]));
    const cells: MatrixCell[] = [];

    for (const scheduleRid of rosterIds) {
      const isActual = scheduleRid === scoresRid;
      const borrowedGames = actualSchedule.get(scheduleRid) ?? [];
      const weeks: WeeklyResult[] = [];

      for (const bg of borrowedGames) {
        const myScore = myScoreByWeek.get(bg.week);
        if (myScore === undefined) continue; // scores-owner had a bye that week

        const borrowedFromSelf = bg.opponentRosterId === scoresRid;
        const oppRosterId = borrowedFromSelf ? (myGames.find(g => g.week === bg.week)?.opponentRosterId ?? bg.opponentRosterId) : bg.opponentRosterId;
        const oppScore = borrowedFromSelf ? (myGames.find(g => g.week === bg.week)?.oppScore ?? bg.oppScore) : bg.oppScore;

        weeks.push({
          week: bg.week,
          opponentRosterId: oppRosterId,
          opponentTeamName: teamNameByRoster.get(oppRosterId) ?? `Team ${oppRosterId}`,
          myScore, oppScore,
          result: result(myScore, oppScore),
          borrowedFromSelf,
          oppPercentile: weekPercentile(bg.week, oppRosterId),
        });
      }

      const wins = weeks.filter(w => w.result === 'W').length;
      const losses = weeks.filter(w => w.result === 'L').length;
      const ties = weeks.filter(w => w.result === 'T').length;
      const pointsFor = weeks.reduce((s, w) => s + w.myScore, 0);
      const pointsAgainst = weeks.reduce((s, w) => s + w.oppScore, 0);

      cells.push({
        scheduleOwnerRosterId: scheduleRid,
        isActual, wins, losses, ties,
        pointsFor: Math.round(pointsFor * 10) / 10,
        pointsAgainst: Math.round(pointsAgainst * 10) / 10,
        gamesPlayed: weeks.length,
        weeks,
      });
    }
    matrix[String(scoresRid)] = cells;
  }

  // Pass 3: summaries, SOS and luck, derived from the matrix and pass-1 records.
  // opponentStrengthAvg reuses the diagonal (actual) cell's per-week percentiles
  // rather than recomputing them, so the leaderboard and the week-by-week detail
  // views can never disagree with each other.
  const summaries: Record<string, TeamScheduleSummary> = {};
  for (const rid of rosterIds) {
    const rec = seasonRecord.get(rid)!;
    const myGames = actualSchedule.get(rid) ?? [];
    const cells = matrix[String(rid)];
    const actualWeeks = cells.find(c => c.isActual)!.weeks;
    const opponentStrengthAvg = actualWeeks.length > 0
      ? actualWeeks.reduce((a, w) => a + w.oppPercentile, 0) / actualWeeks.length
      : 0;

    const winsAcross = cells.map(c => c.wins + c.ties * 0.5);
    const avgWinsAcrossSchedules = winsAcross.reduce((a, v) => a + v, 0) / winsAcross.length;
    const pointsAgainstActual = myGames.reduce((s, g) => s + g.oppScore, 0);
    const official = officialRecordByRoster.get(rid) ?? { wins: rec.wins, losses: rec.losses, ties: rec.ties };

    summaries[String(rid)] = {
      rosterId: rid,
      actualWins: rec.wins,
      actualLosses: rec.losses,
      actualTies: rec.ties,
      actualPointsFor: Math.round(rec.pointsFor * 10) / 10,
      actualPointsAgainst: Math.round(pointsAgainstActual * 10) / 10,
      gamesPlayed: rec.games,
      officialWins: official.wins,
      officialLosses: official.losses,
      officialTies: official.ties,
      opponentStrengthAvg: Math.round(opponentStrengthAvg * 1000) / 1000,
      avgWinsAcrossSchedules: Math.round(avgWinsAcrossSchedules * 100) / 100,
      minWinsAcrossSchedules: Math.min(...winsAcross),
      maxWinsAcrossSchedules: Math.max(...winsAcross),
      scheduleLuck: Math.round(((rec.wins + rec.ties * 0.5) - avgWinsAcrossSchedules) * 100) / 100,
      difficultyRank: 0, // filled below
    };
  }
  [...rosterIds]
    .sort((a, b) => summaries[String(b)].opponentStrengthAvg - summaries[String(a)].opponentStrengthAvg)
    .forEach((rid, i) => { summaries[String(rid)].difficultyRank = i + 1; });

  return { season, isLive, regularSeasonWeeks, weeksPlayed, teams, hasMedianGames, matrix, summaries };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const initialId = process.env.NEXT_PUBLIC_LEAGUE_ID;
  if (!initialId) return NextResponse.json({ error: 'No league configured' }, { status: 400 });

  if (responseCache && Date.now() - responseCache.ts < RESPONSE_TTL_MS) {
    return NextResponse.json(responseCache.data);
  }

  try {
    const allLeagueIds = await getAllLinkedLeagueIds(initialId);
    const seasons = (await Promise.all(allLeagueIds.map(loadSeason)))
      .filter((s): s is SeasonScheduleData => s !== null)
      .sort((a, b) => Number(b.season) - Number(a.season));

    const bySeason: Record<string, SeasonScheduleData> = {};
    for (const s of seasons) bySeason[s.season] = s;

    const payload: ScheduleLabResponse = { seasons: seasons.map(s => s.season), bySeason };
    responseCache = { data: payload, ts: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[api/schedule-lab]', err);
    return NextResponse.json({ error: 'Failed to build schedule lab data' }, { status: 500 });
  }
}
