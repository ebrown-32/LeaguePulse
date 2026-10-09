/**
 * Game of the Week: the most entertaining fixture on the slate.
 *
 * ── How it is chosen ─────────────────────────────────────────────────────────
 *
 * Entertaining from a fantasy point of view, which is mostly about WHO is
 * playing rather than how a forecast happens to fall. Five signals, each scored
 * 0-1 across the week's fixtures:
 *
 *   records     two good teams. Combined win percentage, median games counted,
 *               since that is the record the league actually looks at.
 *   playoffs    how much the result moves the playoff race: both teams near
 *               the cut line, or one either side of it. Grows through the
 *               season, since a week 2 game implies very little.
 *   points      two offenses that actually score. Season points for, ranked
 *               against the league, with this week's projections mixed in.
 *   rivalry     the series between the two managers.
 *   closeness   how near a coin flip the pre-game forecast is. It matters, a
 *               foregone conclusion is not entertaining, but it is one signal
 *               of five rather than the decider.
 *
 * Records and playoffs lean on the standings, which are mostly noise after one
 * or two games, so they earn their weight over the first six games played.
 *
 * Every pick comes with plain reasons, each a fact that can be checked against
 * the standings, because "Game of the Week" with no why is just a label.
 *
 * ── Why the pick is locked ───────────────────────────────────────────────────
 *
 * Scored on pre-game projections only, then stored for the week. Scored on live
 * odds, a blowout developing on Sunday would demote the game the whole league
 * was told to watch on Tuesday, and the announcement post would end up about a
 * game the page no longer features.
 */

import { getLeagueInfo, getLeagueRosters } from '@/lib/api';
import { getRedis } from '@/lib/redisClient';
import { fetchRivalriesData, finishedSeries, type Series } from '@/lib/rivalries';
import { weekPhase } from '@/lib/nflSchedule';
import { weekForecasts, type FixtureForecast } from '@/lib/sim/weekForecasts';
import { forecastMatchup, type StarterLine } from '@/lib/sim/matchupOdds';

export type GotwSignal = 'records' | 'playoffs' | 'points' | 'rivalry' | 'closeness';

export interface GotwReason {
  /** Which signal it explains, so the UI can give each its own icon. */
  kind: GotwSignal;
  text: string;
}

export interface GotwTeam {
  rosterId: number;
  userId: string;
  teamName: string;
  avatar: string;
  record: string;
  rank: number;
  /** Season points for. */
  pointsFor: number;
  /** Pre-game projection for this week. */
  projected: number;
  /** The starters projected to score the most, best first. */
  keyPlayers: { name: string; position: string; projected: number }[];
}

export interface GameOfWeek {
  season: string;
  week: number;
  matchupId: number;
  a: GotwTeam;
  b: GotwTeam;
  /** Pre-game win chance for side A, locked with the pick. */
  aWinProb: number;
  reasons: GotwReason[];
  /** 0-100, how strongly this fixture won. Diagnostic. */
  score: number;
  /** Every fixture's score and the signals behind it, so the choice can be audited. */
  field: { matchupId: number; teams: string; score: number; parts: Record<GotwSignal, number> }[];
  chosenAt: string;
}

const WEIGHTS: Record<GotwSignal, number> = {
  records: 0.25, playoffs: 0.20, points: 0.20, rivalry: 0.15, closeness: 0.20,
};

/** About a kilobyte a week, so kept rather than expired: a season is under 20KB. */
const key = (leagueId: string, season: string, week: number) =>
  `lp_gotw_v2:${leagueId}:${season}:${week}`;

/** The same starters, as if nobody had played yet. Byes stay byes. */
function pregame(lines: StarterLine[]): StarterLine[] {
  return lines.map(l => (l.phase === 'played' || l.phase === 'playing'
    ? { ...l, phase: 'upcoming' as const, actual: null } : l));
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface Standing {
  record: string; wins: number; losses: number; ties: number;
  rank: number; pf: number; pfRank: number;
}

function standings(rosters: any[]): Map<number, Standing> {
  const rows = rosters.map((r: any) => ({
    rosterId: r.roster_id as number,
    wins: Number(r.settings?.wins ?? 0),
    losses: Number(r.settings?.losses ?? 0),
    ties: Number(r.settings?.ties ?? 0),
    pf: Number(r.settings?.fpts ?? 0) + Number(r.settings?.fpts_decimal ?? 0) / 100,
  }));
  const byPf = [...rows].sort((x, y) => y.pf - x.pf).map(r => r.rosterId);
  // Sleeper's own order: wins, then points for.
  rows.sort((x, y) => y.wins - x.wins || y.pf - x.pf);
  return new Map(rows.map((r, i) => [r.rosterId, {
    record: r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`,
    wins: r.wins, losses: r.losses, ties: r.ties, rank: i + 1, pf: r.pf,
    pfRank: byPf.indexOf(r.rosterId) + 1,
  }]));
}

const winPct = (s?: Standing) => {
  const g = s ? s.wins + s.losses + s.ties : 0;
  return g ? (s!.wins + s!.ties / 2) / g : 0.5;
};

/**
 * Score every fixture and pick one. Stores nothing, so it is safe to run for a
 * look at what would be chosen.
 */
export async function chooseGameOfWeek(
  leagueId: string, season: string, week: number,
): Promise<GameOfWeek | null> {
  const [slate, info, rosters, rivalries] = await Promise.all([
    weekForecasts(leagueId, season, week, true),
    getLeagueInfo(leagueId).catch(() => null as any),
    getLeagueRosters(leagueId).catch(() => [] as any[]),
    fetchRivalriesData().catch(() => null),
  ]);
  if (!slate?.fixtures.length) return null;

  const table = standings(rosters);
  const n = Math.max(rosters.length, 2);
  const playoffTeams = Math.min(Number(info?.settings?.playoff_teams ?? 4), n - 1);
  const regularSeasonWeeks = Math.max(1, Number(info?.settings?.playoff_week_start ?? 15) - 1);
  const gamesPlayed = Math.max(0, ...[...table.values()].map(s => s.wins + s.losses + s.ties));
  const trust = Math.min(1, gamesPlayed / 6);
  // Implications build through the season: losing in week 3 costs less than
  // losing in week 12, and the score should say so.
  const lateness = Math.min(1, Math.max(0.25, week / regularSeasonWeeks));

  /**
   * How close a team is to the cut. 1 for the teams either side of it, falling
   * off with distance; a runaway leader and a team out of it both score low.
   */
  const bubble = (s?: Standing) =>
    s ? Math.max(0, 1 - Math.abs(s.rank - (playoffTeams + 0.5)) / (n / 2)) : 0;

  type Scored = {
    f: FixtureForecast; pA: number; projA: number; projB: number;
    sA?: Standing; sB?: Standing; series: Series | null;
    parts: Record<GotwSignal, number>; total: number;
  };

  const scored: Scored[] = await Promise.all(slate.fixtures.map(async f => {
    const [la, lb] = f.lines ?? [[], []];
    const pre = forecastMatchup(pregame(la), pregame(lb), f.forecast.calibration);
    const series = rivalries
      ? await finishedSeries(rivalries, f.a.userId, f.b.userId, season, weekPhase).catch(() => null)
      : null;
    return {
      f, pA: pre.aWinProb, projA: pre.a.projectedFinal, projB: pre.b.projectedFinal,
      sA: table.get(f.a.rosterId), sB: table.get(f.b.rosterId), series,
      parts: { records: 0, playoffs: 0, points: 0, rivalry: 0, closeness: 0 }, total: 0,
    };
  }));

  const projSums = scored.map(s => s.projA + s.projB);
  const pLo = Math.min(...projSums), pHi = Math.max(...projSums);
  for (const s of scored) {
    // Points: where both offenses rank in season scoring, mixed with this
    // week's projection so a hot week for a mid team still registers.
    const pfRankScore = s.sA && s.sB
      ? 1 - ((s.sA.pfRank + s.sB.pfRank) / 2 - 1.5) / Math.max(n - 2, 1)
      : 0.5;
    const projScore = pHi > pLo ? (s.projA + s.projB - pLo) / (pHi - pLo) : 0.5;
    const rankGap = s.sA && s.sB ? Math.abs(s.sA.rank - s.sB.rank) : n - 1;

    s.parts = {
      records: trust * (winPct(s.sA) + winPct(s.sB)) / 2,
      // Both on the bubble, and close to each other in the table, is a game
      // where the loser's position genuinely changes.
      playoffs: trust * lateness * (0.7 * (bubble(s.sA) + bubble(s.sB)) / 2 + 0.3 * (1 - rankGap / (n - 1))),
      points: gamesPlayed ? 0.65 * Math.min(1, Math.max(0, pfRankScore)) + 0.35 * projScore : projScore,
      rivalry: (s.series?.rivalryScore ?? 0) / 100,
      closeness: 1 - Math.abs(2 * s.pA - 1),
    };
    s.total = (Object.keys(WEIGHTS) as GotwSignal[]).reduce((t, k) => t + WEIGHTS[k] * s.parts[k], 0);
  }

  // Ties go to the earlier fixture, so the pick is stable between runs.
  const best = [...scored].sort((x, y) => y.total - x.total || x.f.matchupId - y.f.matchupId)[0];
  const { sA, sB } = best;

  // ── Reasons: only facts, only the notable ones, strongest first ────────────
  const reasons: (GotwReason & { weight: number })[] = [];
  const add = (kind: GotwSignal, text: string) =>
    reasons.push({ kind, text, weight: WEIGHTS[kind] * best.parts[kind] });

  if (sA && sB && gamesPlayed > 0) {
    const [hiR, loR] = [sA.rank, sB.rank].sort((x, y) => x - y);
    if (sA.record === sB.record) add('records', `Both ${sA.record}`);
    else if (winPct(sA) > 0.5 && winPct(sB) > 0.5) add('records', `Two winning teams: ${sA.record} and ${sB.record}`);
    else add('records', `${sA.record} against ${sB.record}`);

    const bothIn = loR <= playoffTeams;
    const straddle = hiR <= playoffTeams && loR > playoffTeams;
    const bothOut = hiR > playoffTeams;
    add('playoffs',
      hiR === 1 && loR === 2 ? '1st against 2nd for the top seed' :
      bothIn ? `${ordinal(hiR)} against ${ordinal(loR)}, both in playoff position` :
      straddle ? `${ordinal(hiR)} against ${ordinal(loR)}, across the playoff line` :
      bothOut && hiR <= playoffTeams + 2 ? `${ordinal(hiR)} against ${ordinal(loR)}, both chasing a playoff spot` :
      `${ordinal(hiR)} against ${ordinal(loR)} in the standings`);

    const [p1, p2] = [sA.pfRank, sB.pfRank].sort((x, y) => x - y);
    if (p2 <= 3) {
      add('points', p1 === 1 && p2 === 2
        ? 'The two highest scoring teams in the league'
        : `${ordinal(p1)} and ${ordinal(p2)} in points scored this season`);
    }
  }
  if (!reasons.some(r => r.kind === 'points') && best.parts.points >= 0.6) {
    add('points', `${(best.projA + best.projB).toFixed(1)} points projected between them`);
  }

  const sr = best.series;
  if (sr && sr.games.length >= 2) {
    const lead = sr.aWins === sr.bWins
      ? `series tied ${sr.aWins}-${sr.bWins}`
      : `${sr.aWins > sr.bWins ? best.f.a.teamName : best.f.b.teamName} leads the series ${Math.max(sr.aWins, sr.bWins)}-${Math.min(sr.aWins, sr.bWins)}`;
    add('rivalry', sr.rivalryScore >= 55
      ? `${sr.rivalryLabel}: ${lead}`
      : lead.charAt(0).toUpperCase() + lead.slice(1));
  }

  const gap = Math.abs(best.projA - best.projB);
  const favPct = Math.round(Math.max(best.pA, 1 - best.pA) * 100);
  add('closeness', favPct <= 55
    ? `A coin flip: projected ${gap.toFixed(1)} points apart`
    : `${best.pA >= 0.5 ? best.f.a.teamName : best.f.b.teamName} favoured at ${favPct}%`);

  const team = (side: 'a' | 'b'): GotwTeam => {
    const t = best.f[side];
    const st = side === 'a' ? sA : sB;
    const lines = best.f.lines?.[side === 'a' ? 0 : 1] ?? [];
    return {
      ...t,
      record: st?.record ?? '0-0',
      rank: st?.rank ?? 0,
      pointsFor: Number((st?.pf ?? 0).toFixed(1)),
      projected: Number((side === 'a' ? best.projA : best.projB).toFixed(1)),
      keyPlayers: lines
        .filter(l => l.projected != null && l.phase !== 'bye')
        .sort((x, y) => (y.projected ?? 0) - (x.projected ?? 0))
        .slice(0, 3)
        .map(l => ({ name: l.name, position: l.position, projected: Number((l.projected ?? 0).toFixed(1)) })),
    };
  };

  return {
    season, week,
    matchupId: best.f.matchupId,
    a: team('a'), b: team('b'),
    aWinProb: best.pA,
    reasons: reasons.sort((x, y) => y.weight - x.weight).slice(0, 4).map(({ kind, text }) => ({ kind, text })),
    score: Math.round(best.total * 100),
    field: scored
      .map(s => ({
        matchupId: s.f.matchupId,
        teams: `${s.f.a.teamName} vs ${s.f.b.teamName}`,
        score: Math.round(s.total * 100),
        parts: Object.fromEntries(Object.entries(s.parts).map(([k, v]) => [k, Math.round(v * 100) / 100])) as Record<GotwSignal, number>,
      }))
      .sort((x, y) => y.score - x.score),
    chosenAt: new Date().toISOString(),
  };
}

/**
 * The week's pick, chosen once and then read back.
 *
 * `currentWeek` stops a past week being chosen after the fact. The standings
 * used are always today's, so picking week 4 in week 5 described a week 4 game
 * with records neither team had when it was played. A past week shows whatever
 * was locked at the time, or nothing.
 */
export async function gameOfWeek(
  leagueId: string, season: string, week: number, currentWeek: number,
): Promise<GameOfWeek | null> {
  const redis = getRedis().client;
  if (redis) {
    try {
      const raw = await redis.get(key(leagueId, season, week));
      if (raw) return JSON.parse(raw) as GameOfWeek;
    } catch { /* fall through and choose */ }
  }
  if (week < currentWeek) return null;

  const pick = await chooseGameOfWeek(leagueId, season, week);
  // Store only a pick with real projections behind it. Before lineups exist
  // every fixture projects zero and the choice would be arbitrary, and locking
  // an arbitrary choice for a week is worse than choosing again later.
  if (pick && redis && pick.a.projected + pick.b.projected > 0) {
    await redis.set(key(leagueId, season, week), JSON.stringify(pick)).catch(() => {});
  }
  return pick;
}
