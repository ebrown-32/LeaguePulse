import { getAllLinkedLeagueIds, getLeagueInfo, getLeagueMatchups, getLeagueRosters, getLeagueUsers } from '@/lib/api';
import { getPlayersDirectory } from '@/lib/playerStats';
import { optimalLineup, coachingEfficiency, type LineupPlayer } from './optimalLineup';
import { teamAvatar } from '@/lib/teamAvatar';

/**
 * Career metrics: the weekly report's measures, run over every season the
 * league has ever played.
 *
 * A single season's coaching efficiency is mostly noise, because one
 * catastrophic bench decision moves it several points. Across four years it becomes a real
 * statement about a manager, which is the only version worth putting in a
 * record book.
 *
 * Managers are keyed by Sleeper user id, which is stable across seasons, so a
 * team that renames itself every August still accumulates one history.
 *
 * Metric definitions credited to the Fantasy Football Metrics Weekly Report
 * (github.com/uberfastman/fantasy-football-metrics-weekly-report). Independent
 * implementation; that project is GPL-3.0 and none of its code is used.
 */

export interface SeasonSlice {
  season: string;
  weeks: number;
  actual: number;
  optimal: number;
  efficiency: number | null;
  benchPoints: number;
  allPlayWins: number;
  allPlayLosses: number;
  medianWins: number;
  medianLosses: number;
  averageScore: number;
}

export interface ManagedWeek {
  season: string;
  week: number;
  userId: string;
  username: string;
  actual: number;
  optimal: number;
  efficiency: number;
}

export interface CareerMetrics {
  userId: string;
  username: string;
  avatar: string;

  seasons: SeasonSlice[];
  weeksPlayed: number;

  /** Career totals. */
  actual: number;
  optimal: number;
  /** Career coaching efficiency: every point started over every point available. */
  efficiency: number | null;
  benchPoints: number;
  /** Bench points per week, which compares fairly across managers who joined later. */
  benchPerWeek: number;

  allPlayWins: number;
  allPlayLosses: number;
  allPlayPct: number;
  medianWins: number;
  medianLosses: number;

  pointsByPosition: { position: string; points: number; share: number }[];

  /** Best and worst weeks of lineup management in this manager's history. */
  bestManaged: ManagedWeek | null;
  worstManaged: ManagedWeek | null;

  /** 1 is best, across everyone with enough history to rank. */
  efficiencyRank: number;
}

export interface CareerReport {
  managers: CareerMetrics[];
  seasons: string[];
  /** League-wide extremes, for the record book. */
  records: {
    bestManagedWeeks: ManagedWeek[];
    worstManagedWeeks: ManagedWeek[];
    /** Most points ever left on a bench in one week. */
    biggestBenchWaste: (ManagedWeek & { wasted: number })[];
  };
  /** Weeks counted across the whole league. */
  weeksCovered: number;
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

/** A manager needs a real sample before a career efficiency means anything. */
const MIN_WEEKS_TO_RANK = 8;

export async function buildCareerReport(initialLeagueId: string): Promise<CareerReport> {
  const leagueIds = await getAllLinkedLeagueIds(initialLeagueId);
  const players = await getPlayersDirectory().catch(() => ({} as Record<string, any>));

  const byUser = new Map<string, CareerMetrics>();
  const positionTotals = new Map<string, Map<string, number>>();
  const allManaged: (ManagedWeek & { wasted: number })[] = [];
  const seasons: string[] = [];
  let weeksCovered = 0;

  for (const leagueId of leagueIds) {
    const [league, rosters, users] = await Promise.all([
      getLeagueInfo(leagueId),
      getLeagueRosters(leagueId),
      getLeagueUsers(leagueId),
    ]);

    const season = String((league as any)?.season ?? '');
    const rosterPositions: string[] = (league as any)?.roster_positions ?? [];
    // Stop at the playoff cut so consolation games do not pad a record. Where
    // the league does not say, 18 covers a full Sleeper season.
    const lastWeek = Number((league as any)?.settings?.playoff_week_start ?? 15) - 1;
    // Recorded only once a week of it has actually been played, below.

    const userById = new Map(users.map(u => [u.user_id, u]));
    const ownerOf = new Map<number, string>();
    for (const r of rosters as any[]) {
      if (r.owner_id) ownerOf.set(Number(r.roster_id), String(r.owner_id));
    }

    const weekly = await Promise.all(
      Array.from({ length: Math.max(0, lastWeek) }, (_, i) =>
        getLeagueMatchups(leagueId, i + 1).catch(() => [] as any[])),
    );

    for (let w = 0; w < weekly.length; w++) {
      const raw = weekly[w] as any[];
      if (!Array.isArray(raw) || !raw.length) continue;
      // Unplayed weeks are all zeroes and would invent losses everywhere.
      if (!raw.some(m => Number(m.points ?? 0) > 0)) continue;
      weeksCovered++;
      if (season && !seasons.includes(season)) seasons.push(season);
      const week = w + 1;

      const scores = raw.map(m => Number(m.points ?? 0));
      const med = median(scores);

      for (const m of raw) {
        const rosterId = Number(m.roster_id);
        const userId = ownerOf.get(rosterId);
        if (!userId) continue;

        const u = userById.get(userId);
        let entry = byUser.get(userId);
        if (!entry) {
          entry = {
            userId,
            username: u?.display_name ?? 'Unknown',
            avatar: teamAvatar(u),
            seasons: [], weeksPlayed: 0,
            actual: 0, optimal: 0, efficiency: null, benchPoints: 0, benchPerWeek: 0,
            allPlayWins: 0, allPlayLosses: 0, allPlayPct: 0, medianWins: 0, medianLosses: 0,
            pointsByPosition: [], bestManaged: null, worstManaged: null, efficiencyRank: 0,
          };
          byUser.set(userId, entry);
        }
        // A manager who renamed themselves shows their current name.
        if (u?.display_name) entry.username = u.display_name;
        if (teamAvatar(u)) entry.avatar = teamAvatar(u);

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
        const eff = coachingEfficiency(actual, opt.total);

        const posMap = positionTotals.get(userId) ?? new Map<string, number>();
        for (const id of starters.filter(x => x && x !== '0')) {
          const pos = players[id]?.position ?? '?';
          posMap.set(pos, (posMap.get(pos) ?? 0) + Number(pts[id] ?? 0));
        }
        positionTotals.set(userId, posMap);

        let slice = entry.seasons.find(s => s.season === season);
        if (!slice) {
          slice = {
            season, weeks: 0, actual: 0, optimal: 0, efficiency: null, benchPoints: 0,
            allPlayWins: 0, allPlayLosses: 0, medianWins: 0, medianLosses: 0, averageScore: 0,
          };
          entry.seasons.push(slice);
        }

        const apW = scores.filter(s => actual > s).length;
        const apL = scores.filter(s => actual < s).length;
        const bench = Math.max(0, opt.total - actual);

        entry.weeksPlayed++;
        entry.actual = round(entry.actual + actual);
        entry.optimal = round(entry.optimal + opt.total);
        entry.benchPoints = round(entry.benchPoints + bench);
        entry.allPlayWins += apW;
        entry.allPlayLosses += apL;
        if (actual > med) entry.medianWins++; else entry.medianLosses++;

        slice.weeks++;
        slice.actual = round(slice.actual + actual);
        slice.optimal = round(slice.optimal + opt.total);
        slice.benchPoints = round(slice.benchPoints + bench);
        slice.allPlayWins += apW;
        slice.allPlayLosses += apL;
        if (actual > med) slice.medianWins++; else slice.medianLosses++;

        if (eff !== null) {
          const managed: ManagedWeek = {
            season, week, userId, username: entry.username, actual: round(actual),
            optimal: opt.total, efficiency: eff,
          };
          allManaged.push({ ...managed, wasted: round(bench) });
          if (!entry.bestManaged || eff > entry.bestManaged.efficiency) entry.bestManaged = managed;
          if (!entry.worstManaged || eff < entry.worstManaged.efficiency) entry.worstManaged = managed;
        }
      }
    }
  }

  const managers = [...byUser.values()];
  for (const m of managers) {
    m.efficiency = coachingEfficiency(m.actual, m.optimal);
    m.benchPerWeek = m.weeksPlayed ? round(m.benchPoints / m.weeksPlayed) : 0;
    const ap = m.allPlayWins + m.allPlayLosses;
    m.allPlayPct = ap ? round((m.allPlayWins / ap) * 100) : 0;

    for (const s of m.seasons) {
      s.efficiency = coachingEfficiency(s.actual, s.optimal);
      s.averageScore = s.weeks ? round(s.actual / s.weeks) : 0;
    }
    m.seasons.sort((a, b) => a.season.localeCompare(b.season));

    const posMap = positionTotals.get(m.userId) ?? new Map();
    const total = [...posMap.values()].reduce((s, v) => s + v, 0) || 1;
    m.pointsByPosition = [...posMap]
      .map(([position, points]) => ({
        position,
        points: round(points),
        share: round((points / total) * 100, 1),
      }))
      .sort((a, b) => b.points - a.points);
  }

  // Rank only managers with a meaningful sample; everyone else sorts last.
  const rankable = managers
    .filter(m => m.weeksPlayed >= MIN_WEEKS_TO_RANK && m.efficiency !== null)
    .sort((a, b) => (b.efficiency ?? 0) - (a.efficiency ?? 0));
  rankable.forEach((m, i) => { m.efficiencyRank = i + 1; });

  // Records captured a name at the moment the week was read, so a manager who
  // renamed themselves between seasons appeared twice under two spellings.
  // Resolve every record to the name they go by now.
  const nameNow = new Map(managers.map(m => [m.userId, m.username]));
  for (const w of allManaged) w.username = nameNow.get(w.userId) ?? w.username;

  const byEff = [...allManaged].sort((a, b) => b.efficiency - a.efficiency);
  const byWaste = [...allManaged].sort((a, b) => b.wasted - a.wasted);

  return {
    managers: managers.sort((a, b) => (b.efficiency ?? 0) - (a.efficiency ?? 0)),
    seasons: seasons.sort(),
    weeksCovered,
    records: {
      bestManagedWeeks: byEff.slice(0, 5),
      worstManagedWeeks: byEff.slice(-5).reverse(),
      biggestBenchWaste: byWaste.slice(0, 5),
    },
  };
}
