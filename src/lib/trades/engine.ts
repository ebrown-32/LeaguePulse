/**
 * Trade Finder's engine: every trade in the league worth making, found and graded by the numbers.
 *
 *   Value     every player's market value (FantasyCalc, for this league's format: see values.ts),
 *             and what they score a week (Sleeper's projections in the league's scoring).
 *   Lineups   each team's best lineup from its roster, by the league's own starting slots: what a
 *             trade does to the points a team puts on the field each week.
 *   Search    between every pair of teams: one for one, two for one, two for two, three for one
 *             (a team cashing depth in for a star), and in a dynasty league a draft pick added as a
 *             sweetener or picks for a player outright; and rotations of three to six teams, each
 *             sending one player on to the next (found as loops in a graph of who would take whom,
 *             since trying every ordering of six teams' players is out of reach). Kept when every
 *             side comes out ahead, in points a week or in value. Nobody is labelled contending or
 *             rebuilding: the feed's filters ask for one or the other.
 *   Story     what kind of deal it is, for the headline and for variety: buy low on a player whose
 *             value has slid, sell high on one whose value has climbed, consolidation, picks, a
 *             position swap, a multi-team deal, or a plain upgrade. The pool keeps a mix of them.
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
  /** Projected points a week, in the league's scoring. A draft pick's is 0. */
  ppw: number;
  /** Market value's change over thirty days, where known. */
  trend?: number | null;
}

/** A draft pick is a TFPlayer with this position and no points. */
export const PICK = 'PICK';

export type Story = 'buy-low' | 'sell-high' | 'consolidate' | 'picks' | 'swap' | 'multi-team' | 'upgrade';
export const STORIES: Story[] = ['buy-low', 'sell-high', 'consolidate', 'picks', 'swap', 'multi-team', 'upgrade'];
/** The most teams in one deal. */
export const MAX_TEAMS = 6;

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
  /** Two teams, or a rotation of three to six (as many as it has sides). */
  kind: 'two' | 'multi';
  /** 0 to 1: the least share of what a side gives that it gets back. */
  balance: number;
  /** How good it is for everyone: fairness first, then what the worst-off side gains (scoreOf). */
  score: number;
  story: Story;
  sides: PoolSide[];
}

const TRADEABLE = new Set(['QB', 'RB', 'WR', 'TE']);
/** A thirty-day move in value this big makes a buy-low or sell-high: a sixth of the player's value,
 *  and 300 at the least, so a star's ordinary wobble doesn't count. */
const moved = (p: TFPlayer, dir: 1 | -1) => {
  const t = (p.trend ?? 0) * dir;
  return t >= 300 && t >= p.value / 6;
};
/** A side has to gain at least this much, in points a week or adjusted value. */
export const MIN_POINTS = 0.3;
export const MIN_VALUE = 0.5;
/** The least share of what it gives that a side may get back: C+ and better, nothing lopsided. */
const MIN_BALANCE = 0.65;

/**
 * Fairness counts for most: a trade nobody would accept as even is a poor idea however much it
 * helps a lineup. The gain is capped, so a big swing in points can't buy a lopsided deal a place
 * at the top; between the floor and an even trade, fairness is worth four points a week.
 */
export const scoreOf = (minGain: number, balance: number) => Math.min(minGain, 4) * 0.6 + balance * 7;

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

/** What kind of deal it is: the first of these that fits. */
export function storyOf(kind: PoolTrade['kind'], sides: { gives: TFPlayer[]; gets: TFPlayer[] }[]): Story {
  if (kind === 'multi') return 'multi-team';
  const moving = sides.flatMap(s => s.gets).filter(p => p.position !== PICK);
  const star = [...moving].sort((a, b) => b.value - a.value)[0];
  if (sides.some(s => s.gets.some(p => p.position === PICK))) return 'picks';
  if (star && moved(star, -1)) return 'buy-low';
  if (moving.some(p => moved(p, 1))) return 'sell-high';
  if (sides.some(s => s.gets.length === 1 && s.gives.length >= 2)) return 'consolidate';
  const [a, b] = sides;
  if (a.gives.length === 1 && b.gives.length === 1 && a.gives[0].position !== b.gives[0].position) return 'swap';
  return 'upgrade';
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
  const byValue = (ps: TFPlayer[]) => ps.filter(p => p.value > 0).sort((a, b) => b.value - a.value);
  const blocks = new Map(teams.map(t => [t.rosterId, byValue(t.players.filter(p => TRADEABLE.has(p.position)))]));
  const picks = new Map(teams.map(t => [t.rosterId, byValue(t.players.filter(p => p.position === PICK)).slice(0, 5)]));
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
  const seen = new Set<string>();
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
    if (seen.has(id)) return;
    seen.add(id);
    const story = storyOf(kind, rids.map(r => ({ gives: givesOf(r), gets: getsOf(r) })));
    found.push({ id, kind, balance, score: scoreOf(Math.min(...sides.map(gainOf)), balance), story, sides });
  };

  // Two teams: one for one, two for one, two for two, three for one; with picks, a player and a
  // pick for a player, two players for a player and a pick, and picks for a player.
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
    const a = teams[i].rosterId, b = teams[j].rosterId;
    for (const [x, y] of [[a, b], [b, a]]) {
      const bx = blocks.get(x)!, by = blocks.get(y)!, px = picks.get(x)!;
      const one = (ps: TFPlayer[]) => groups(ps.slice(0, 12), 1);
      const ones = one(by);
      // Each shape once: the symmetric ones only in the first direction.
      if (x === a) {
        for (const g of one(bx)) for (const h of ones) consider('two', [[x, y, g], [y, x, h]]);
        for (const g of groups(bx.slice(0, 8), 2)) for (const h of groups(by.slice(0, 8), 2)) consider('two', [[x, y, g], [y, x, h]]);
      }
      for (const g of groups(bx.slice(0, 8), 2)) for (const h of ones) consider('two', [[x, y, g], [y, x, h]]);
      for (const g of groups(bx.slice(0, 7), 3)) for (const h of ones) consider('two', [[x, y, g], [y, x, h]]);
      for (const pk of px) {
        for (const g of bx.slice(0, 10)) for (const h of ones) consider('two', [[x, y, [g, pk]], [y, x, h]]);
        for (const h of ones) consider('two', [[x, y, [pk]], [y, x, h]]);
        for (const g of groups(by.slice(0, 7), 2)) for (const h of bx.slice(0, 10)) consider('two', [[x, y, [h, pk]], [y, x, g]]);
      }
      for (const pks of groups(px, 2)) for (const h of ones) consider('two', [[x, y, pks], [y, x, h]]);
    }
  }

  // Rotations of three to six teams: each gives one player to the next, round the circle. Seen as a
  // graph whose nodes are a team and a player it could give, with an arrow from (A, a) to (B, b)
  // when B would take a for b: every side better off, and neither side giving away far more than
  // it gets. A loop through different teams is a trade every one of them wants. Only each node's
  // best few arrows are followed, which keeps six-team loops within reach.
  type Node = { rid: number; p: TFPlayer; key: string };
  const nodes: Node[] = teams.flatMap(t => blocks.get(t.rosterId)!.slice(0, 6).map(p => ({ rid: t.rosterId, p, key: `${t.rosterId}:${p.id}` })));
  const accepts = new Map<string, number | null>();
  /** How much B gains by taking `from`'s player for its own, or null if it wouldn't. */
  const take = (from: Node, to: Node): number | null => {
    const k = `${from.key}>${to.key}`;
    if (accepts.has(k)) return accepts.get(k)!;
    const out = adjusted(to.p.value), back = adjusted(from.p.value);
    let gain: number | null = null;
    if (out > 0 && back / out >= MIN_BALANCE && out / back >= MIN_BALANCE) {
      const sd = side(to.rid, [to.p], [from.p]);
      if (sideWants(sd)) gain = gainOf(sd);
    }
    accepts.set(k, gain);
    return gain;
  };
  const next = new Map(nodes.map(n => [n.key, nodes
    .filter(m => m.rid !== n.rid)
    .map(m => ({ m, g: take(n, m) }))
    .filter((e): e is { m: Node; g: number } => e.g != null)
    .sort((x, y) => y.g - x.g).slice(0, 6).map(e => e.m)]));

  let loops = 0;
  const walk = (path: Node[]) => {
    if (loops > 40_000) return;
    const last = path[path.length - 1], start = path[0];
    // Close the loop: the first team takes the last one's player.
    if (path.length >= 3 && take(last, start) != null) {
      loops++;
      consider('multi', path.map((n, i) => [n.rid, path[(i + 1) % path.length].rid, [n.p]] as [number, number, TFPlayer[]]));
    }
    if (path.length === MAX_TEAMS) return;
    for (const m of next.get(last.key)!) {
      // Each loop once: it starts at its lowest team.
      if (m.rid <= start.rid || path.some(n => n.rid === m.rid)) continue;
      walk([...path, m]);
    }
  };
  for (const n of nodes) walk([n]);

  // The best of each kind of deal, so the plain upgrades, which score best, don't crowd out the rest.
  // Market timing stories are the commonest in season, when values move most: a smaller share.
  // Multi-team deals score lowest (their score is their worst-off side's gain, and they have more
  // sides), so their share, by size, is set aside first; the rest of the pool is filled after.
  found.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1));
  const share = (st: Story) => Math.ceil(limit * (st === 'buy-low' || st === 'sell-high' ? 0.2 : st === 'multi-team' ? 0.1 : 0.35));
  const per = new Map<string, number>();
  const fillFrom = (pool: PoolTrade[], room: number) => {
    const out: PoolTrade[] = [];
    for (const t of pool) {
      if (out.length >= room) break;
      const key = t.story === 'multi-team' ? `${t.story}${t.sides.length}` : t.story;
      const n = per.get(key) ?? 0;
      if (n >= share(t.story)) continue;
      per.set(key, n + 1);
      out.push(t);
    }
    return out;
  };
  const multi = fillFrom(found.filter(t => t.kind === 'multi'), Math.floor(limit * 0.4));
  const kept = [...multi, ...fillFrom(found.filter(t => t.kind === 'two'), limit - multi.length)]
    .sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1));
  return kept;
}
