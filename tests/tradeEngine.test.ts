import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjusted, fairnessGrade, lineupPoints, searchTrades, type TFPlayer, type TFTeam } from '../src/lib/trades/engine.ts';
import { feedOrder, type FeedFilters, type FeedTrade } from '../src/lib/trades/feed.ts';

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN'];
const p = (id: string, position: string, value: number, ppw: number): TFPlayer => ({ id, name: id, position, nflTeam: 'KC', value, ppw });
const ANY: FeedFilters = { teams: [], positions: [], goal: 'any', fair: false, three: false };

// A has a good running back on the bench and a weak receiver starting; B the other way round.
const A: TFTeam = { rosterId: 1, players: [
  p('aq', 'QB', 6000, 20), p('ar1', 'RB', 7000, 17), p('ar2', 'RB', 6500, 16), p('ar3', 'RB', 6000, 15), p('ar4', 'RB', 5500, 14), p('aw1', 'WR', 5000, 13), p('aw2', 'WR', 1000, 5), p('at', 'TE', 3000, 8),
] };
const B: TFTeam = { rosterId: 2, players: [
  p('bq', 'QB', 6000, 20), p('br1', 'RB', 5000, 13), p('br2', 'RB', 1000, 5), p('bw1', 'WR', 7000, 17), p('bw2', 'WR', 6500, 16), p('bw3', 'WR', 6000, 15), p('bw4', 'WR', 5500, 14), p('bt', 'TE', 3000, 8),
] };

test('the best lineup fills the fixed slots first, then the flex', () => {
  const players = [p('q', 'QB', 5000, 20), p('r1', 'RB', 5000, 15), p('r2', 'RB', 4000, 12), p('r3', 'RB', 3000, 11), p('w1', 'WR', 5000, 14), p('w2', 'WR', 4000, 10), p('t', 'TE', 3000, 8)];
  assert.equal(lineupPoints(players, SLOTS), 20 + 15 + 12 + 14 + 10 + 8 + 11);
});

test('fairness grades run from even to lopsided', () => {
  assert.equal(fairnessGrade(1), 'A+');
  assert.equal(fairnessGrade(0.88), 'A-');
  assert.equal(fairnessGrade(0.62), 'C');
  assert.equal(fairnessGrade(0.3), 'F');
  // One great player is worth more than two players adding up to the same value.
  assert.ok(adjusted(8000) > adjusted(4000) * 2);
});

test('two teams with matching needs trade, and both come out ahead', () => {
  const trades = searchTrades([A, B], { slots: SLOTS });
  assert.ok(trades.length > 0, 'a trade is found');
  const best = trades[0];
  for (const s of best.sides) assert.ok(s.lineupDelta > 0.3 || s.valueDelta > 0.5, `side ${s.rosterId} gains`);
  assert.ok(best.sides.find(s => s.rosterId === 1)!.gives.some(id => id.startsWith('ar')));
  assert.ok(best.sides.find(s => s.rosterId === 2)!.gives.some(id => id.startsWith('bw')));
  assert.ok(best.balance >= 0.55);
});

test('the same rosters always give the same pool', () => {
  assert.deepEqual(searchTrades([A, B], { slots: SLOTS }).map(t => t.id), searchTrades([A, B], { slots: SLOTS }).map(t => t.id));
});

test('three teams trade round a circle when no pair of them can', () => {
  // A has a spare running back and wants a receiver; B a spare receiver, wants a tight end; C a spare tight end, wants a running back.
  const base = (r: number, extra: TFPlayer[]): TFTeam => ({ rosterId: r, players: [
    p(`${r}q`, 'QB', 6000, 20), p(`${r}r1`, 'RB', 6000, 15), p(`${r}w1`, 'WR', 6000, 15), ...extra,
  ] });
  const a = base(1, [p('ar2', 'RB', 5000, 14), p('ar3', 'RB', 4800, 13.5), p('aw2', 'WR', 500, 3), p('at', 'TE', 4000, 10)]);
  const b = base(2, [p('bw2', 'WR', 5000, 14), p('bw3', 'WR', 4800, 13.5), p('br2', 'RB', 4500, 12), p('bt', 'TE', 500, 3)]);
  const c = base(3, [p('ct', 'TE', 5000, 12), p('ct2', 'TE', 4800, 11.5), p('cw2', 'WR', 4500, 12), p('cr2', 'RB', 500, 3)]);
  const trades = searchTrades([a, b, c], { slots: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'BN', 'BN'] });
  assert.ok(trades.some(t => t.kind === 'three'), 'a three team trade is found');
});

const pool: FeedTrade[] = searchTrades([A, B], { slots: SLOTS }).map(t => ({ ...t, born: 0 }));
const positionOf = (id: string) => [...A.players, ...B.players].find(x => x.id === id)?.position;

test('the feed deals every matching trade once, in an order the seed decides', () => {
  const one = feedOrder(pool, ANY, 1, positionOf, 0).map(t => t.id);
  assert.deepEqual([...one].sort(), pool.map(t => t.id).sort());
  assert.deepEqual(feedOrder(pool, ANY, 1, positionOf, 0).map(t => t.id), one, 'same seed, same order');
  const seeds = new Set([1, 2, 3, 4, 5].map(s => feedOrder(pool, ANY, s, positionOf, 0)[0].id));
  assert.ok(pool.length < 2 || seeds.size > 1, 'different seeds lead with different trades');
});

test('filters narrow the feed to what was asked for', () => {
  const fair = feedOrder(pool, { ...ANY, fair: true }, 1, positionOf, 0);
  assert.ok(fair.every(t => t.balance >= 0.72));
  // Team 1 getting a receiver.
  const wr = feedOrder(pool, { ...ANY, teams: [1], positions: ['WR'] }, 1, positionOf, 0);
  assert.ok(wr.length > 0 && wr.every(t => t.sides.find(s => s.rosterId === 1)!.gets.some(id => positionOf(id) === 'WR')));
  const now = feedOrder(pool, { ...ANY, teams: [2], goal: 'now' }, 1, positionOf, 0);
  assert.ok(now.every(t => t.sides.find(s => s.rosterId === 2)!.lineupDelta > 0.3));
});
