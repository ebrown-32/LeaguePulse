import { getLeagueInfo, getLeagueMatchups, getLeagueRosters, getLeagueUsers, getNFLState } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { getPlayersDirectory } from '@/lib/playerStats';
import { optimalLineup, coachingEfficiency, type LineupPlayer } from './optimalLineup';
import { simulatePlayoffOdds, type SimFixture, type SimTeam, type OddsResult } from './playoffOdds';

/**
 * The weekly metrics report.
 *
 * A TypeScript reimplementation, over the Sleeper API, of the metrics popularised
 * by the Fantasy Football Metrics Weekly Report
 * (github.com/uberfastman/fantasy-football-metrics-weekly-report) by uberfastman,
 * which is a Python tool that emails a PDF. The metric definitions are credited
 * to that project; the code here is independent, because that project is
 * GPL-3.0 and LeaguePulse is not, so nothing may be copied from it.
 *
 * Metrics that project computes from scraped third-party sources (player arrest
 * records, NFL fine totals) are deliberately absent: LeaguePulse only states
 * things it can verify from Sleeper, and a scraped arrest record attributed to
 * a named real person is the last thing this app should get wrong.
 */

export interface PositionPoints { position: string; points: number }

export interface TeamWeek {
  week: number;
  actual: number;
  optimal: number;
  /** Percent of available points started, or null on a bye. */
  efficiency: number | null;
  opponent: string | null;
  opponentScore: number | null;
  won: boolean | null;
  /** Record if this team had played every other team this week. */
  allPlayWins: number;
  allPlayLosses: number;
  /** Whether the score cleared the league median that week. */
  aboveMedian: boolean;
  bestStarter: { name: string; position: string; points: number } | null;
  worstStarter: { name: string; position: string; points: number } | null;
}

export interface TeamReport {
  rosterId: number;
  teamName: string;
  manager: string;
  weeks: TeamWeek[];

  /** Season totals. */
  pointsFor: number;
  pointsAgainst: number;
  wins: number;
  losses: number;
  ties: number;

  /** Averages across played weeks. */
  averageScore: number;
  averageOptimal: number;
  /** Season coaching efficiency: total actual over total optimal. */
  efficiency: number | null;
  /** Points left on the bench across the season. */
  pointsLeftOnBench: number;

  /** Record against the whole league every week. */
  allPlayWins: number;
  allPlayLosses: number;
  allPlayPct: number;
  /** Record measured against the weekly league median. */
  medianWins: number;
  medianLosses: number;

  /** How far this team's average week sits from the league average, in
   *  league-wide standard deviations. Positive is above the field. */
  zScore: number;
  /** Spread of this team's own weekly scores, which drives its odds range. */
  scoreSd: number;
  /** Actual wins minus all-play expected wins. Positive means fortunate. */
  luck: number;

  pointsByPosition: PositionPoints[];
  /** Combined listed weight of the whole roster, in pounds. */
  beefLbs: number;

  /** 1 is best. */
  scoreRank: number;
  efficiencyRank: number;
  luckRank: number;
  /** Mean of the three ranks above; lower is better. */
  powerScore: number;
  powerRank: number;
}

export interface WeeklyReport {
  season: string;
  /** Last completed week included in the report. */
  throughWeek: number;
  leagueName: string;
  teams: TeamReport[];
  /** League median score for each week covered. */
  medians: { week: number; median: number }[];
  weeklyHighs: { week: number; teamName: string; points: number }[];
  weeklyLows: { week: number; teamName: string; points: number }[];
  bestEfficiency: { week: number; teamName: string; efficiency: number }[];
  /** Null once the regular season is over, or before the schedule is known. */
  odds: OddsResult | null;
  playoffTeams: number;
}

function round(n: number, dp = 2): number {
  return Number(n.toFixed(dp));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Rank descending, 1 is best. Ties share the better rank. */
function rankBy<T>(items: T[], value: (t: T) => number): Map<T, number> {
  const sorted = [...items].sort((a, b) => value(b) - value(a));
  const out = new Map<T, number>();
  sorted.forEach((item, i) => {
    if (i > 0 && value(sorted[i - 1]) === value(item)) out.set(item, out.get(sorted[i - 1])!);
    else out.set(item, i + 1);
  });
  return out;
}

/**
 * Build the report for the current season, through the last completed week.
 *
 * Weeks are treated as played only when somebody in the league scored, so a
 * week already on the schedule but not yet played never lands in the averages
 * as a pile of zeroes.
 */
export async function buildWeeklyReport(): Promise<WeeklyReport | null> {
  return buildWeeklyReportFor(await getCurrentLeagueId());
}

/**
 * The report for one specific league.
 *
 * `weekOverride` exists so the whole engine can be exercised against a season
 * that has actually been played. Out of season the live path correctly returns
 * null, which would otherwise leave every metric here unverifiable.
 */
export async function buildWeeklyReportFor(
  leagueId: string,
  weekOverride?: number,
): Promise<WeeklyReport | null> {
  const [league, rosters, users, nflState, players] = await Promise.all([
    getLeagueInfo(leagueId),
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
    getNFLState(),
    getPlayersDirectory().catch(() => ({} as Record<string, any>)),
  ]);

  const rosterPositions: string[] = (league as any)?.roster_positions ?? [];
  const currentWeek = Number(nflState?.week ?? 0);
  const seasonType = String(nflState?.season_type ?? '');
  // In the preseason Sleeper's week counts preseason weeks, which are not
  // fantasy weeks; nothing has been played, so there is no report to build.
  const lastWeek = weekOverride ?? (seasonType === 'pre' ? 0 : Math.min(currentWeek, 18));
  if (lastWeek < 1) return null;

  const userById = new Map(users.map(u => [u.user_id, u]));
  const meta = new Map<number, { teamName: string; manager: string }>();
  for (const r of rosters as any[]) {
    const u = userById.get(r.owner_id);
    meta.set(Number(r.roster_id), {
      teamName: u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`,
      manager: u?.display_name || 'Unknown',
    });
  }

  const weekly = await Promise.all(
    Array.from({ length: lastWeek }, (_, i) =>
      getLeagueMatchups(leagueId, i + 1).catch(() => [] as any[])),
  );

  const reports = new Map<number, TeamReport>();
  for (const [rosterId, m] of meta) {
    reports.set(rosterId, {
      rosterId, teamName: m.teamName, manager: m.manager, weeks: [],
      pointsFor: 0, pointsAgainst: 0, wins: 0, losses: 0, ties: 0,
      averageScore: 0, averageOptimal: 0, efficiency: null, pointsLeftOnBench: 0,
      allPlayWins: 0, allPlayLosses: 0, allPlayPct: 0, medianWins: 0, medianLosses: 0,
      zScore: 0, scoreSd: 0, luck: 0, pointsByPosition: [], beefLbs: 0,
      scoreRank: 0, efficiencyRank: 0, luckRank: 0, powerScore: 0, powerRank: 0,
    });
  }

  const medians: WeeklyReport['medians'] = [];
  const weeklyHighs: WeeklyReport['weeklyHighs'] = [];
  const weeklyLows: WeeklyReport['weeklyLows'] = [];
  const bestEfficiency: WeeklyReport['bestEfficiency'] = [];
  const positionTotals = new Map<number, Map<string, number>>();
  let playedWeeks = 0;

  for (let w = 0; w < weekly.length; w++) {
    const raw = weekly[w] as any[];
    if (!Array.isArray(raw) || !raw.length) continue;
    // A scheduled but unplayed week is all zeroes; counting it would drag every
    // average toward nothing and invent losses in the all-play record.
    if (!raw.some(m => Number(m.points ?? 0) > 0)) continue;
    playedWeeks++;
    const week = w + 1;

    const scores = raw.map(m => Number(m.points ?? 0));
    const med = median(scores);
    medians.push({ week, median: round(med) });

    const byMatchup = new Map<number, any[]>();
    for (const m of raw) {
      const id = Number(m.matchup_id);
      if (!Number.isFinite(id)) continue;
      if (!byMatchup.has(id)) byMatchup.set(id, []);
      byMatchup.get(id)!.push(m);
    }

    let high = { teamName: '', points: -Infinity };
    let low = { teamName: '', points: Infinity };
    let bestCe = { teamName: '', efficiency: -Infinity };

    for (const m of raw) {
      const rosterId = Number(m.roster_id);
      const report = reports.get(rosterId);
      if (!report) continue;

      const actual = Number(m.points ?? 0);
      const pts: Record<string, number> = m.players_points ?? {};
      const roster: string[] = Array.isArray(m.players) ? m.players : [];
      const starters: string[] = Array.isArray(m.starters) ? m.starters : [];

      const candidates: LineupPlayer[] = roster
        .filter(id => id && id !== '0')
        .map(id => ({
          playerId: id,
          points: Number(pts[id] ?? 0),
          positions: players[id]?.fantasy_positions ?? [players[id]?.position].filter(Boolean),
        }));
      const opt = optimalLineup(candidates, rosterPositions);

      // Points by position, from who was actually started.
      const posMap = positionTotals.get(rosterId) ?? new Map<string, number>();
      const startersDetail = starters
        .filter(id => id && id !== '0')
        .map(id => ({
          name: players[id]?.full_name
            ?? [players[id]?.first_name, players[id]?.last_name].filter(Boolean).join(' ')
            ?? id,
          position: players[id]?.position ?? '?',
          points: Number(pts[id] ?? 0),
        }));
      for (const s of startersDetail) {
        posMap.set(s.position, round((posMap.get(s.position) ?? 0) + s.points));
      }
      positionTotals.set(rosterId, posMap);

      const opponentEntry = (byMatchup.get(Number(m.matchup_id)) ?? [])
        .find(x => Number(x.roster_id) !== rosterId);
      const opponentScore = opponentEntry ? Number(opponentEntry.points ?? 0) : null;
      const opponentName = opponentEntry
        ? meta.get(Number(opponentEntry.roster_id))?.teamName ?? null : null;

      const allPlayWins = scores.filter(s => actual > s).length;
      const allPlayLosses = scores.filter(s => actual < s).length;
      const ce = coachingEfficiency(actual, opt.total);
      const ranked = [...startersDetail].sort((a, b) => b.points - a.points);

      report.weeks.push({
        week, actual: round(actual), optimal: opt.total, efficiency: ce,
        opponent: opponentName, opponentScore: opponentScore === null ? null : round(opponentScore),
        won: opponentScore === null ? null : actual > opponentScore,
        allPlayWins, allPlayLosses,
        aboveMedian: actual > med,
        bestStarter: ranked[0] ?? null,
        worstStarter: ranked.length > 1 ? ranked[ranked.length - 1] : null,
      });

      report.pointsFor = round(report.pointsFor + actual);
      report.averageOptimal = round(report.averageOptimal + opt.total);
      report.pointsLeftOnBench = round(report.pointsLeftOnBench + Math.max(0, opt.total - actual));
      report.allPlayWins += allPlayWins;
      report.allPlayLosses += allPlayLosses;
      if (actual > med) report.medianWins++; else report.medianLosses++;
      if (opponentScore !== null) {
        report.pointsAgainst = round(report.pointsAgainst + opponentScore);
        if (actual > opponentScore) report.wins++;
        else if (actual < opponentScore) report.losses++;
        else report.ties++;
      }

      if (actual > high.points) high = { teamName: report.teamName, points: round(actual) };
      if (actual < low.points) low = { teamName: report.teamName, points: round(actual) };
      if (ce !== null && ce > bestCe.efficiency) bestCe = { teamName: report.teamName, efficiency: ce };
    }

    if (high.teamName) weeklyHighs.push({ week, ...high });
    if (low.teamName) weeklyLows.push({ week, ...low });
    if (bestCe.teamName) bestEfficiency.push({ week, ...bestCe });
  }

  if (!playedWeeks) return null;

  // Roster weight, from the current roster rather than any single week.
  const beef = new Map<number, number>();
  for (const r of rosters as any[]) {
    const ids: string[] = Array.isArray(r.players) ? r.players : [];
    beef.set(Number(r.roster_id), ids.reduce(
      (sum, id) => sum + (Number(players[id]?.weight) || 0), 0));
  }

  const teams = [...reports.values()].filter(t => t.weeks.length);

  // The league-wide distribution of individual weekly scores, which every
  // team's z-score is measured against.
  const allScores = teams.flatMap(t => t.weeks.map(w => w.actual));
  const leagueMean = allScores.reduce((s, v) => s + v, 0) / (allScores.length || 1);
  const leagueSd = Math.sqrt(
    allScores.reduce((s, v) => s + (v - leagueMean) ** 2, 0) / (allScores.length || 1));

  for (const t of teams) {
    const n = t.weeks.length;
    t.averageScore = round(t.pointsFor / n);
    t.averageOptimal = round(t.averageOptimal / n);
    const totalOptimal = t.weeks.reduce((s, w) => s + w.optimal, 0);
    t.efficiency = coachingEfficiency(t.pointsFor, totalOptimal);

    const allPlayGames = t.allPlayWins + t.allPlayLosses;
    t.allPlayPct = allPlayGames ? round((t.allPlayWins / allPlayGames) * 100) : 0;
    // Expected wins from the all-play rate, against actual wins. A team that
    // wins more than its scoring deserves has been lucky with the schedule.
    t.luck = round(t.wins - (allPlayGames ? (t.allPlayWins / allPlayGames) * n : 0));

    // Z-score is computed against the LEAGUE's distribution of weekly scores,
    // not the team's own. Standardising a team against itself would put every
    // team near zero and rank noise; against the field it says how far above or
    // below the league a team actually plays.
    t.zScore = leagueSd ? round((t.pointsFor / n - leagueMean) / leagueSd) : 0;
    // The team's own spread, which the playoff simulation samples from.
    const teamMean = t.pointsFor / n;
    t.scoreSd = round(Math.sqrt(
      t.weeks.reduce((s, w) => s + (w.actual - teamMean) ** 2, 0) / n));

    t.pointsByPosition = [...(positionTotals.get(t.rosterId) ?? new Map())]
      .map(([position, points]) => ({ position, points: round(points) }))
      .sort((a, b) => b.points - a.points);
    t.beefLbs = beef.get(t.rosterId) ?? 0;
  }

  const scoreRanks = rankBy(teams, t => t.pointsFor);
  const effRanks   = rankBy(teams, t => t.efficiency ?? 0);
  const luckRanks  = rankBy(teams, t => t.luck);
  for (const t of teams) {
    t.scoreRank = scoreRanks.get(t)!;
    t.efficiencyRank = effRanks.get(t)!;
    t.luckRank = luckRanks.get(t)!;
    // The source report's power ranking: the mean of the three component ranks.
    t.powerScore = round((t.scoreRank + t.efficiencyRank + t.luckRank) / 3);
  }
  const powerOrder = [...teams].sort((a, b) => a.powerScore - b.powerScore);
  powerOrder.forEach((t, i) => {
    t.powerRank = i > 0 && powerOrder[i - 1].powerScore === t.powerScore
      ? powerOrder[i - 1].powerRank : i + 1;
  });

  const throughWeek = medians.length ? medians[medians.length - 1].week : 0;
  const playoffTeams = Number((league as any)?.settings?.playoff_teams ?? 0);
  const playoffWeekStart = Number((league as any)?.settings?.playoff_week_start ?? 15);

  // Fixtures still to be played, read from Sleeper's published schedule rather
  // than assumed to be round robin. Only regular season weeks count: the
  // playoff bracket is simulated separately from the seeds it produces.
  const fixtures: SimFixture[] = [];
  for (let week = throughWeek + 1; week < playoffWeekStart; week++) {
    const raw = await getLeagueMatchups(leagueId, week).catch(() => [] as any[]);
    if (!Array.isArray(raw)) continue;
    const pairs = new Map<number, number[]>();
    for (const m of raw) {
      const id = Number(m.matchup_id);
      if (!Number.isFinite(id)) continue;
      if (!pairs.has(id)) pairs.set(id, []);
      pairs.get(id)!.push(Number(m.roster_id));
    }
    for (const ids of pairs.values()) {
      if (ids.length === 2) fixtures.push({ week, a: ids[0], b: ids[1] });
    }
  }

  const simTeams: SimTeam[] = teams.map(t => ({
    rosterId: t.rosterId, teamName: t.teamName,
    wins: t.wins, losses: t.losses, ties: t.ties,
    pointsFor: t.pointsFor,
    mean: t.weeks.length ? t.pointsFor / t.weeks.length : 0,
    sd: t.scoreSd,
  }));

  // Seeded on the season and week so the odds are stable until a game is
  // played, rather than drifting every time someone reloads the page.
  const odds = playoffTeams
    ? simulatePlayoffOdds(simTeams, fixtures, playoffTeams, {
        seed: Number(`${league?.season ?? 0}`.slice(-4)) * 100 + throughWeek,
      })
    : null;

  return {
    season: String(league?.season ?? nflState?.season ?? ''),
    throughWeek,
    leagueName: String((league as any)?.name ?? 'League'),
    teams: powerOrder,
    medians, weeklyHighs, weeklyLows, bestEfficiency,
    odds, playoffTeams,
  };
}
