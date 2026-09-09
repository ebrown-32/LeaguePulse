/**
 * Counterfactual replay: rewind a trade and rerun the season.
 *
 * This is the part of the simulator that does not simulate. Every point in an
 * alternate timeline is a real point that a real player really scored in that
 * real week, recovered from `players_points` on the matchup rows. Nothing is
 * drawn from a distribution and nothing is projected. The only invention is the
 * lineup, and even that is handled by a delta (see `altScoreFor`) so a team's
 * actual start/sit decisions survive into the alternate world.
 *
 * ── What "reversing a trade" means here ──────────────────────────────────────
 *
 * For every player who changed hands, from the trade week onward, put them back
 * where they started. If a later transaction moved that player again, or they
 * were dropped, the reversal stops applying at that point rather than fighting
 * the rest of league history. The route reports any such case in `notes` so the
 * UI can say so out loud.
 *
 * Draft picks that were part of the trade are NOT unwound. Their effect lands
 * in a future season's rookie draft, which is outside the season being
 * replayed, and pretending otherwise would be fiction.
 */

import { playoffRoundWeeks } from './playoffs';

export interface ReplayWeek {
  week: number;
  /** rosterId -> real score that week. */
  actual: Map<number, number>;
  /** rosterId -> the players on that roster that week. */
  players: Map<number, string[]>;
  /** playerId -> points scored that week, merged across every roster. */
  points: Map<string, number>;
  /** matchup pairings that week. */
  pairs: [number, number][];
}

export interface ReplayInput {
  weeks: ReplayWeek[];
  regularSeasonWeeks: number;
  playoffTeams: number;
  /** Sleeper's `playoff_round_type`, deciding how many weeks each round spans. */
  playoffRoundType: number;
  hasMedianGames: boolean;
  rosterSlots: string[];
  positionOf: (playerId: string) => string | null;
  /** Players moving back to their pre-trade owner, from `fromWeek` onward. */
  reversals: { playerId: string; toRosterId: number; fromRosterId: number }[];
  fromWeek: number;
}

export interface TeamRecord {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
}

export interface Timeline {
  standings: TeamRecord[];
  /** Seeded playoff field, best first. */
  seeds: number[];
  championRosterId: number | null;
  /** Semi-final and final results, as they were replayed. */
  bracket: { round: string; a: number; b: number; aScore: number; bScore: number; winner: number }[];
}

const FLEX_OK = new Set(['RB', 'WR', 'TE']);

/**
 * Best lineup a roster could have started that week, using real points.
 *
 * Greedy by slot: dedicated positions first, then FLEX takes the best of what
 * is left. This is only ever used inside a difference (optimal-with-trade minus
 * optimal-without), so a rare greedy miss cancels out on both sides.
 */
export function optimalLineup(
  players: string[],
  points: Map<string, number>,
  positionOf: (id: string) => string | null,
  slots: string[],
): number {
  const pool = players
    .map(id => ({ id, pos: positionOf(id), pts: points.get(id) ?? 0 }))
    .filter((p): p is { id: string; pos: string; pts: number } => p.pos !== null);

  const used = new Set<string>();
  let total = 0;
  for (const slot of slots) {
    if (slot === 'BN' || slot === 'IR' || slot === 'TAXI') continue;
    const eligible = slot === 'FLEX'
      ? pool.filter(p => !used.has(p.id) && FLEX_OK.has(p.pos))
      : pool.filter(p => !used.has(p.id) && p.pos === slot);
    const best = eligible.sort((a, b) => b.pts - a.pts)[0];
    if (best) { used.add(best.id); total += best.pts; }
  }
  return total;
}

/**
 * Apply the reversal to a week's roster composition.
 *
 * Returns null for a player the reversal could not be applied to, which happens
 * when a later move already took them somewhere else. The caller records that
 * rather than forcing it.
 */
function applyReversal(
  weekPlayers: Map<number, string[]>,
  reversals: ReplayInput['reversals'],
): { players: Map<number, string[]>; skipped: string[] } {
  const next = new Map<number, string[]>();
  for (const [rid, list] of weekPlayers) next.set(rid, [...list]);
  const skipped: string[] = [];

  for (const r of reversals) {
    const holder = next.get(r.toRosterId);
    if (!holder || !holder.includes(r.playerId)) { skipped.push(r.playerId); continue; }
    next.set(r.toRosterId, holder.filter(p => p !== r.playerId));
    const dest = next.get(r.fromRosterId);
    if (dest) dest.push(r.playerId);
  }
  return { players: next, skipped };
}

/**
 * Score a team in the alternate world.
 *
 * Deliberately a delta rather than an absolute. Swapping in a raw optimal
 * lineup would hand every affected team the benefit of perfect hindsight and
 * flatter them by twenty points a week, which would make the trade look far
 * more decisive than it was. Taking the CHANGE in optimal lineup and applying
 * it to what the manager actually scored keeps their real start/sit record
 * intact and isolates the roster change on its own.
 */
function altScoreFor(
  actualScore: number,
  actualPlayers: string[],
  altPlayers: string[],
  points: Map<string, number>,
  positionOf: (id: string) => string | null,
  slots: string[],
): number {
  const before = optimalLineup(actualPlayers, points, positionOf, slots);
  const after  = optimalLineup(altPlayers,   points, positionOf, slots);
  return Math.max(0, actualScore + (after - before));
}

/** Build a season's records from a per-week scoring function. */
function buildStandings(
  weeks: ReplayWeek[],
  regularSeasonWeeks: number,
  hasMedianGames: boolean,
  scoreOf: (week: ReplayWeek, rosterId: number) => number,
): TeamRecord[] {
  const rec = new Map<number, TeamRecord>();
  const ensure = (rid: number) => {
    if (!rec.has(rid)) rec.set(rid, { rosterId: rid, wins: 0, losses: 0, ties: 0, pointsFor: 0 });
    return rec.get(rid)!;
  };

  for (const wk of weeks) {
    if (wk.week > regularSeasonWeeks) continue;
    const scores = new Map<number, number>();
    for (const rid of wk.actual.keys()) scores.set(rid, scoreOf(wk, rid));
    for (const [rid, s] of scores) ensure(rid).pointsFor += s;

    for (const [a, b] of wk.pairs) {
      const as = scores.get(a) ?? 0, bs = scores.get(b) ?? 0;
      if (as > bs)      { ensure(a).wins++; ensure(b).losses++; }
      else if (bs > as) { ensure(b).wins++; ensure(a).losses++; }
      else              { ensure(a).ties++; ensure(b).ties++; }
    }

    if (hasMedianGames && scores.size > 1) {
      const vals = [...scores.values()].sort((x, y) => x - y);
      const mid = vals.length % 2
        ? vals[(vals.length - 1) / 2]
        : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
      for (const [rid, s] of scores) {
        if (s > mid) ensure(rid).wins++;
        else if (s < mid) ensure(rid).losses++;
        else ensure(rid).ties++;
      }
    }
  }

  return [...rec.values()].sort((x, y) =>
    (y.wins + y.ties * 0.5) - (x.wins + x.ties * 0.5) || y.pointsFor - x.pointsFor);
}

/**
 * Replay the playoff bracket with the real scores from the playoff weeks.
 *
 * Sleeper writes a matchup row for every team in every playoff week, including
 * the ones playing consolation games, so a team that misses the real playoffs
 * but makes the alternate ones still has a genuine score to bring. That is what
 * makes an alternate champion a real answer rather than a simulated one.
 */
function replayBracket(
  weeks: ReplayWeek[],
  seeds: number[],
  roundWeeks: number[][],
  scoreOf: (week: ReplayWeek, rosterId: number) => number,
): Timeline['bracket'] {
  const byWeek = new Map(weeks.map(w => [w.week, w]));
  const bracket: Timeline['bracket'] = [];
  let field = [...seeds];
  let round = 0;

  while (field.length > 1 && round < roundWeeks.length) {
    // A round can span more than one week. This league runs a two week
    // championship, decided on the combined total of both weeks, so scoring it
    // off week 16 alone would drop half the games that actually settled it.
    const wks = roundWeeks[round].map(w => byWeek.get(w)).filter((w): w is ReplayWeek => !!w);
    if (wks.length === 0) break;

    const total = (rid: number) => wks.reduce((s, w) => s + scoreOf(w, rid), 0);
    const name = field.length === 2 ? 'Final'
      : field.length === 4 ? 'Semifinal'
      : `Round ${round + 1}`;
    const label = wks.length > 1
      ? `${name} (weeks ${wks.map(w => w.week).join(' + ')})`
      : name;

    const next: number[] = [];
    for (let k = 0; k < field.length / 2; k++) {
      const a = field[k], b = field[field.length - 1 - k];
      const as = total(a), bs = total(b);
      const winner = as >= bs ? a : b;   // better seed holds an exact tie
      bracket.push({ round: label, a, b, aScore: as, bScore: bs, winner });
      next.push(winner);
    }
    field = next;
    round++;
  }
  return bracket;
}

export interface ReplayOutput {
  actual: Timeline;
  alternate: Timeline;
  /** Per week, per affected team, what the score became. */
  changes: { week: number; rosterId: number; actual: number; alternate: number }[];
  affectedRosters: number[];
  notes: string[];
}

export function runReplay(inp: ReplayInput): ReplayOutput {
  const {
    weeks, regularSeasonWeeks, playoffTeams, playoffRoundType, hasMedianGames,
    rosterSlots, positionOf, reversals, fromWeek,
  } = inp;

  const roundWeeks = playoffRoundWeeks(regularSeasonWeeks, playoffTeams, playoffRoundType);

  const affected = new Set<number>();
  for (const r of reversals) { affected.add(r.toRosterId); affected.add(r.fromRosterId); }

  // Precompute the alternate score for every affected team in every week from
  // the trade onward. Everyone else, and every earlier week, is untouched.
  const altByWeek = new Map<number, Map<number, number>>();
  const changes: ReplayOutput['changes'] = [];
  const skippedPlayers = new Set<string>();

  for (const wk of weeks) {
    if (wk.week < fromWeek) continue;
    const { players: altPlayers, skipped } = applyReversal(wk.players, reversals);
    skipped.forEach(p => skippedPlayers.add(p));

    const map = new Map<number, number>();
    for (const rid of affected) {
      const actualScore = wk.actual.get(rid);
      const actualList  = wk.players.get(rid);
      const altList     = altPlayers.get(rid);
      if (actualScore === undefined || !actualList || !altList) continue;
      const alt = altScoreFor(actualScore, actualList, altList, wk.points, positionOf, rosterSlots);
      map.set(rid, alt);
      if (Math.abs(alt - actualScore) > 0.01) {
        changes.push({ week: wk.week, rosterId: rid, actual: actualScore, alternate: alt });
      }
    }
    altByWeek.set(wk.week, map);
  }

  const actualScore = (wk: ReplayWeek, rid: number) => wk.actual.get(rid) ?? 0;
  const alternateScore = (wk: ReplayWeek, rid: number) =>
    altByWeek.get(wk.week)?.get(rid) ?? wk.actual.get(rid) ?? 0;

  const build = (scoreOf: (w: ReplayWeek, r: number) => number): Timeline => {
    const standings = buildStandings(weeks, regularSeasonWeeks, hasMedianGames, scoreOf);
    const seeds = standings.slice(0, playoffTeams).map(s => s.rosterId);
    const bracket = replayBracket(weeks, seeds, roundWeeks, scoreOf);
    const final = bracket.filter(b => b.round.startsWith('Final'));
    return {
      standings, seeds, bracket,
      championRosterId: final.length ? final[final.length - 1].winner : null,
    };
  };

  const actualTl = build(actualScore);
  const alternateTl = build(alternateScore);

  const notes: string[] = [];

  // A team that missed the real playoffs still has a score that week, because
  // Sleeper pairs everyone into consolation games. That is what lets them play
  // in an alternate bracket at all, and it is also the weakest link in the
  // chain: a manager already eliminated may not have set a serious lineup.
  const newcomers = alternateTl.seeds.filter(s => !actualTl.seeds.includes(s));
  if (newcomers.length > 0) {
    notes.push(
      `${newcomers.length === 1 ? 'One team reaches' : `${newcomers.length} teams reach`} ` +
      `the alternate playoffs without having made the real ones. Their playoff week scores ` +
      `come from the consolation games they actually played, so they may reflect a lineup ` +
      `set by an already eliminated manager.`);
  }

  if (skippedPlayers.size > 0) {
    notes.push(
      `${skippedPlayers.size} player${skippedPlayers.size === 1 ? ' was' : 's were'} moved again ` +
      `by a later transaction, so the reversal stops applying to them at that point.`);
  }
  if (reversals.length === 0) {
    notes.push('This trade moved only draft picks, so no weekly scores change.');
  }

  return {
    actual:    actualTl,
    alternate: alternateTl,
    changes,
    affectedRosters: [...affected],
    notes,
  };
}
