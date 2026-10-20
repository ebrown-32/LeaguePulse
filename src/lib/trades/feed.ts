/**
 * Trade Finder's feed: the league's pool of trades (./engine) filtered and dealt out in an order
 * that is different every visit and the same for every page of one visit.
 *
 * The order is the trade's own score plus seeded noise, a lift for trades that appeared since the
 * last rebuild, and a lift for what the filters ask for: points now ("now") or value ("later"),
 * for the teams picked or for anyone. Neighbours are kept apart: the same two teams or the same
 * player don't come up twice in a row while something else could. When the pool runs out the
 * caller starts again on a new seed, so the feed never ends.
 *
 * Pure.
 */

import type { PoolSide, PoolTrade } from './engine';

export type Goal = 'any' | 'now' | 'later';

export interface FeedFilters {
  teams: number[];
  positions: string[];
  goal: Goal;
  /** B or better only. */
  fair: boolean;
  three: boolean;
}

export type FeedTrade = PoolTrade & { born: number };

/** The sides a filter is about: the teams picked, or everyone when none are. */
const focus = (t: PoolTrade, f: FeedFilters) => (f.teams.length ? t.sides.filter(s => f.teams.includes(s.rosterId)) : t.sides);

const forGoal = (s: PoolSide, goal: Goal) =>
  goal === 'now' ? s.lineupDelta > 0.3 : goal === 'later' ? s.valueDelta > 0.5 : true;

export function matches(t: PoolTrade, f: FeedFilters, positionOf: (id: string) => string | undefined): boolean {
  if (f.three && t.kind !== 'three') return false;
  if (f.fair && t.balance < 0.72) return false;
  const mine = focus(t, f);
  if (!mine.length) return false;
  if (f.positions.length && !mine.some(s => s.gets.some(id => f.positions.includes(positionOf(id) ?? '')))) return false;
  return mine.some(s => forGoal(s, f.goal));
}

/** A number in (0, 1) from the seed and an id. */
function unit(seed: number, id: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x5bd1e995) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13;
  return ((h >>> 0) + 0.5) / 4294967296;
}

export function feedOrder(pool: FeedTrade[], f: FeedFilters, seed: number, positionOf: (id: string) => string | undefined, freshSince: number): FeedTrade[] {
  const keyed = pool.filter(t => matches(t, f, positionOf)).map(t => {
    const mine = focus(t, f);
    const lift = f.goal === 'now' ? 0.5 * Math.max(...mine.map(s => s.lineupDelta))
      : f.goal === 'later' ? 0.25 * Math.max(...mine.map(s => s.valueDelta)) : 0;
    const noise = -Math.log(-Math.log(unit(seed, t.id)));
    return { t, key: t.score + lift + noise + (t.born > freshSince ? 1.2 : 0) };
  }).sort((a, b) => b.key - a.key);

  // Deal them out, holding back any that would repeat the last card's teams or a recent player.
  const out: FeedTrade[] = [], held: FeedTrade[] = [];
  const pairOf = (t: FeedTrade) => t.sides.map(s => s.rosterId).sort((a, b) => a - b).join('-');
  const playersOf = (t: FeedTrade) => t.sides.flatMap(s => s.gives);
  const fits = (t: FeedTrade) => {
    const last = out[out.length - 1];
    if (last && pairOf(last) === pairOf(t)) return false;
    const recent = new Set(out.slice(-6).flatMap(playersOf));
    return !playersOf(t).some(id => recent.has(id));
  };
  for (const { t } of keyed) {
    for (let i = 0; i < Math.min(held.length, 8); i++) {
      if (fits(held[i])) { out.push(held.splice(i, 1)[0]); i = -1; }
    }
    if (fits(t)) out.push(t); else held.push(t);
  }
  return [...out, ...held];
}
