/**
 * Trade Finder's engine: every trade in the league worth making, found and graded by the numbers.
 *
 *   Value     every player's market value (FantasyCalc, for this league's format: see values.ts),
 *             and what they score a week (Sleeper's projections in the league's scoring).
 *   Lineups   each team's best lineup from its roster, by the league's own starting slots: what a
 *             trade does to the points a team puts on the field each week.
 *   Search    one for one, two for one, two for two between every pair of teams, and three team
 *             rotations; kept when every side comes out ahead, in points a week or in value. Nobody
 *             is labelled contending or rebuilding: the feed's filters ask for one or the other.
 *   Fairness  how even the value is, after the star premium (one great player is worth more than
 *             the sum of two good ones), as a letter grade.
 *
 * The result is a pool, hundreds to thousands of trades, that the feed (./feed) draws from.
 * Pure: no fetching, no clock. The same rosters and values always give the same pool.
 */

export interface TFPlayer {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
  /** Market value (FantasyCalc's scale, 0 to about 11,000). */
  value: number;
  /** Projected points a week, in the league's scoring. */
  ppw: number;
}

export interface TFTeam {
  rosterId: number;
  players: TFPlayer[];
}

export interface PoolSide {
  rosterId: number;
  gives: string[];
  gets: string[];
  /** Change in the team's best lineup, points a week. */
  lineupDelta: number;
  /** Change in the team's value, after the star premium (adjusted units). */
  valueDelta: number;
}

export interface PoolTrade {
  id: string;
  kind: 'two' | 'three';
  /** 0 to 1: the least share of what a side gives that it gets back. */
  balance: number;
  /** How good it is for everyone: what the worst-off side gains, plus fairness. */
  score: number;
  sides: PoolSide[];
}

const TRADEABLE = new Set(['QB', 'RB', 'WR', 'TE']);
/** A side has to gain at least this much, in points a week or adjusted value. */
export const MIN_POINTS = 0.3;
export const MIN_VALUE = 0.5;
const MIN_BALANCE = 0.55;

/** The star premium: value counts for more the more of it one player holds. */
export const adjusted = (v: number) => Math.pow(Math.max(0, v) / 1000, 1.35);
/** Back from the star premium: the one player's value a group of them is worth. */
export const equivalent = (a: number) => 1000 * Math.pow(Math.max(0, a), 1 / 1.35);

const FITS: Record<string, (p: string) => boolean> = {
  QB: p => p === 'QB', RB: p => p === 'RB', WR: p => p === 'WR', TE: p => p === 'TE', K: p => p === 'K', DEF: p => p === 'DEF',
  FLEX: p => p === 'RB' || p === 'WR' || p === 'TE',
  REC_FLEX: p => p === 'WR' || p === 'TE',
  WRRB_FLEX: p => p === 'WR' || p === 'RB',
  SUPER_FLEX: p => p === 'QB' || p === 'RB' || p === 'WR' || p === 'TE',
};

/** The starting slots in filling order: fixed positions first, flex slots last. */
const slotOrder = (slots: string[]) =>
  [...slots.filter(s => FITS[s] && !s.includes('FLEX')), ...slots.filter(s => s.includes('FLEX') && FITS[s])];

/** The best lineup's points a week, from players already sorted best first. */
function fill(sorted: TFPlayer[], order: string[]): number {
  const used = new Set<string>();
  let total = 0;
  for (const slot of order) {
    const p = sorted.find(x => !used.has(x.id) && FITS[slot](x.position));
    if (p) { used.add(p.id); total += p.ppw; }
  }
  return total;
}

export function lineupPoints(players: TFPlayer[], slots: string[]): number {
  return fill([...players].sort((a, b) => b.ppw - a.ppw), slotOrder(slots));
}

/** A letter for how even a trade is: the least share of value any side gets back for what it gives. */
export function fairnessGrade(balance: number): string {
  const bands: [number, string][] = [[0.95, 'A+'], [0.9, 'A'], [0.86, 'A-'], [0.82, 'B+'], [0.77, 'B'], [0.72, 'B-'], [0.67, 'C+'], [0.6, 'C'], [0.5, 'D']];
  return bands.find(([b]) => balance >= b)?.[1] ?? 'F';
}

/** What a side gets out of it: points a week, or value at a little under half the weight. */
export const gainOf = (s: PoolSide) => Math.max(s.lineupDelta, 0.4 * s.valueDelta);
const sideWants = (s: PoolSide) => s.lineupDelta > MIN_POINTS || s.valueDelta > MIN_VALUE;

/** Every k-sized group of xs. */
function groups<T>(xs: T[], k: number): T[][] {
  if (k === 1) return xs.map(x => [x]);
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i++) for (const rest of groups(xs.slice(i + 1), k - 1)) out.push([xs[i], ...rest]);
  return out;
}

export interface SearchOptions {
  slots: string[];
  /** The most trades to keep, best first. */
  limit?: number;
}

export function searchTrades(teams: TFTeam[], opts: SearchOptions): PoolTrade[] {
  const { slots, limit = 3000 } = opts;
  const order = slotOrder(slots);
  // Each roster sorted once, best first, with its lineup as it stands.
  const sorted = new Map(teams.map(t => [t.rosterId, [...t.players].sort((a, b) => b.ppw - a.ppw)]));
  const base = new Map(teams.map(t => [t.rosterId, fill(sorted.get(t.rosterId)!, order)]));
  const blocks = new Map(teams.map(t => [t.rosterId,
    t.players.filter(p => TRADEABLE.has(p.position) && p.value > 0).sort((a, b) => b.value - a.value)]));
  const adj = (ps: TFPlayer[]) => ps.reduce((s, p) => s + adjusted(p.value), 0);

  const side = (rid: number, gives: TFPlayer[], gets: TFPlayer[]): PoolSide => {
    const out = new Set(gives.map(p => p.id));
    const after = sorted.get(rid)!.filter(p => !out.has(p.id));
    for (const g of gets) {
      const i = after.findIndex(p => p.ppw < g.ppw);
      after.splice(i < 0 ? after.length : i, 0, g);
    }
    return {
      rosterId: rid, gives: gives.map(p => p.id), gets: gets.map(p => p.id),
      lineupDelta: fill(after, order) - base.get(rid)!,
      valueDelta: adj(gets) - adj(gives),
    };
  };

  const found: PoolTrade[] = [];
  /** legs: who gives what to whom, as [from, to, players]. */
  const consider = (kind: PoolTrade['kind'], legs: [number, number, TFPlayer[]][]) => {
    const rids = legs.map(l => l[0]);
    const givesOf = (rid: number) => legs.filter(l => l[0] === rid).flatMap(l => l[2]);
    const getsOf = (rid: number) => legs.filter(l => l[1] === rid).flatMap(l => l[2]);
    // Fairness first: it is cheap, and it rules out most of what the search tries.
    const balance = Math.min(...rids.map(r => {
      const out = adj(givesOf(r));
      return out <= 0 ? 1 : Math.min(1, adj(getsOf(r)) / out);
    }));
    if (balance < MIN_BALANCE) return;
    const sides = rids.map(r => side(r, givesOf(r), getsOf(r)));
    if (!sides.every(sideWants)) return;
    const id = sides.map(s => `${s.rosterId}:${[...s.gives].sort().join('+')}`).join('|');
    found.push({ id, kind, balance, score: Math.min(...sides.map(gainOf)) + balance * 2, sides });
  };

  // Two teams: one for one, two for one each way, two for two.
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
    const a = teams[i].rosterId, b = teams[j].rosterId;
    const ba = blocks.get(a)!, bb = blocks.get(b)!;
    const one = [groups(ba.slice(0, 12), 1), groups(bb.slice(0, 12), 1)];
    const two = [groups(ba.slice(0, 8), 2), groups(bb.slice(0, 8), 2)];
    for (const [ga, gb] of [[one[0], one[1]], [two[0], one[1]], [one[0], two[1]], [two[0], two[1]]]) {
      for (const x of ga) for (const y of gb) consider('two', [[a, b, x], [b, a, y]]);
    }
  }

  // Three teams: each gives one player to the next, round the circle, both ways round.
  const top = (rid: number) => blocks.get(rid)!.slice(0, 6);
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) for (let k = j + 1; k < teams.length; k++) {
    const [ti, tj, tk] = [teams[i].rosterId, teams[j].rosterId, teams[k].rosterId];
    for (const [a, b, c] of [[ti, tj, tk], [ti, tk, tj]]) {
      for (const pa of top(a)) for (const pb of top(b)) for (const pc of top(c)) {
        consider('three', [[a, b, [pa]], [b, c, [pb]], [c, a, [pc]]]);
      }
    }
  }

  return found.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1)).slice(0, limit);
}
