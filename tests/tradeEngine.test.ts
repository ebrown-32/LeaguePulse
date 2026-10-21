import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjusted, fairnessGrade, lineupPoints, searchTrades, storyOf, PICK, type TFPlayer, type TFTeam } from '../src/lib/trades/engine.ts';
import { leaguePicks } from '../src/lib/trades/picks.ts';
import { leagueKind } from '../src/lib/trades/values.ts';
import { feedOrder, inventiveness, type FeedFilters, type FeedTrade } from '../src/lib/trades/feed.ts';

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN'];
const p = (id: string, position: string, value: number, ppw: number): TFPlayer => ({ id, name: id, position, nflTeam: 'KC', value, ppw });
const ANY: FeedFilters = { teams: [], positions: [], goal: 'any', fair: false, size: 0, picks: false, creativity: 0.5 };

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
  assert.ok(trades.some(t => t.kind === 'multi' && t.sides.length === 3), 'a three team trade is found');
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

test('the league says whether it is redraft, keeper or dynasty', () => {
  assert.equal(leagueKind({ settings: { type: 0 } }), 'redraft');
  assert.equal(leagueKind({ settings: { type: 1, max_keepers: 2 } }), 'keeper');
  assert.equal(leagueKind({ settings: { type: 2 } }), 'dynasty');
  // ESPN has no dynasty type: a league keeping most of its roster is one.
  assert.equal(leagueKind({ settings: { type: 1, max_keepers: 16 } }), 'dynasty');
});

const PICK_VALUES = { '2027 1st (Early)': 4600, '2027 1st (Mid)': 3000, '2027 1st (Late)': 2300, '2027 1st': 2700, '2028 1st': 2000, '2029 1st': 1800, '2027 2nd': 1500, '2028 2nd': 1270, '2029 2nd': 1160 };

test('picks belong to their teams unless traded, and next year\'s are priced by where they will land', () => {
  const picks = leaguePicks({
    seasons: ['2027', '2028', '2029'], rounds: 2, rosterIds: [1, 2, 3],
    traded: [{ season: '2028', round: 1, roster_id: 3, owner_id: 1 }],
    strength: new Map([[1, 150], [2, 120], [3, 90]]), values: PICK_VALUES,
  });
  const find = (season: string, round: number, rid: number) => picks.find(p => p.season === season && p.round === round && p.originalRosterId === rid)!;
  assert.equal(find('2027', 1, 3).tier, 'Early', 'the weakest roster picks early');
  assert.equal(find('2027', 1, 3).value, 4600);
  assert.equal(find('2027', 1, 1).tier, 'Late');
  assert.equal(find('2028', 1, 3).ownerRosterId, 1, 'a traded pick moves');
  assert.equal(find('2028', 1, 3).value, 2000);
  assert.equal(find('2027', 2, 2).value, 1500, 'no tier priced: the round\'s value');
});

test('a dynasty search puts picks in trades', () => {
  const pk = (id: string, value: number): TFPlayer => ({ id, name: id, position: PICK, nflTeam: '', value, ppw: 0 });
  const a: TFTeam = { rosterId: 1, players: [...A.players, pk('pa1', 3000), pk('pa2', 1500)] };
  const b: TFTeam = { rosterId: 2, players: [...B.players, pk('pb1', 3000), pk('pb2', 1500)] };
  const trades = searchTrades([a, b], { slots: SLOTS });
  const withPicks = trades.filter(t => t.story === 'picks');
  assert.ok(withPicks.length > 0, 'some trades move a pick');
  for (const t of withPicks) assert.ok(t.sides.some(s => s.gives.some(id => id.startsWith('pa') || id.startsWith('pb'))));
});

test('a trade\'s story says what kind of deal it is', () => {
  const pl = (id: string, position: string, value: number, trend = 0): TFPlayer => ({ id, name: id, position, nflTeam: 'KC', value, ppw: 10, trend });
  assert.equal(storyOf('multi', []), 'multi-team');
  assert.equal(storyOf('two', [{ gives: [pl('a', 'RB', 5000)], gets: [pl('b', 'WR', 5000, -1000)] }, { gives: [pl('b', 'WR', 5000, -1000)], gets: [pl('a', 'RB', 5000)] }]), 'buy-low');
  assert.equal(storyOf('two', [{ gives: [pl('a', 'RB', 3000), pl('c', 'WR', 3000)], gets: [pl('b', 'WR', 6000)] }, { gives: [pl('b', 'WR', 6000)], gets: [pl('a', 'RB', 3000), pl('c', 'WR', 3000)] }]), 'consolidate');
  assert.equal(storyOf('two', [{ gives: [pl('a', 'RB', 5000)], gets: [pl('b', 'WR', 5000)] }, { gives: [pl('b', 'WR', 5000)], gets: [pl('a', 'RB', 5000)] }]), 'swap');
});

test('the creativity dial deals plain trades first at the bottom and inventive ones at the top', () => {
  const pk = (id: string, value: number): TFPlayer => ({ id, name: id, position: PICK, nflTeam: '', value, ppw: 0 });
  const a: TFTeam = { rosterId: 1, players: [...A.players, pk('pa1', 3000), pk('pa2', 1500)] };
  const b: TFTeam = { rosterId: 2, players: [...B.players, pk('pb1', 3000), pk('pb2', 1500)] };
  const pool: FeedTrade[] = searchTrades([a, b], { slots: SLOTS }).map(t => ({ ...t, born: 0 }));
  const top = (c: number) => {
    const ten = feedOrder(pool, { ...ANY, creativity: c }, 3, positionOf, 0).slice(0, 10);
    return ten.reduce((n, t) => n + inventiveness(t), 0) / ten.length;
  };
  assert.ok(top(1) > top(0), `wild ${top(1)} beats safe ${top(0)}`);
});

test('teams involved: two or three', () => {
  const base = (r: number, extra: TFPlayer[]): TFTeam => ({ rosterId: r, players: [
    p(`${r}q`, 'QB', 6000, 20), p(`${r}r1`, 'RB', 6000, 15), p(`${r}w1`, 'WR', 6000, 15), ...extra,
  ] });
  const pool: FeedTrade[] = searchTrades([
    base(1, [p('ar2', 'RB', 5000, 14), p('ar3', 'RB', 4800, 13.5), p('aw2', 'WR', 500, 3), p('at', 'TE', 4000, 10)]),
    base(2, [p('bw2', 'WR', 5000, 14), p('bw3', 'WR', 4800, 13.5), p('br2', 'RB', 4500, 12), p('bt', 'TE', 500, 3)]),
    base(3, [p('ct', 'TE', 5000, 12), p('ct2', 'TE', 4800, 11.5), p('cw2', 'WR', 4500, 12), p('cr2', 'RB', 500, 3)]),
  ], { slots: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'BN', 'BN'] }).map(t => ({ ...t, born: 0 }));
  const none = () => undefined;
  assert.ok(feedOrder(pool, { ...ANY, size: 3 }, 1, none, 0).every(t => t.sides.length === 3));
  assert.ok(feedOrder(pool, { ...ANY, size: 2 }, 1, none, 0).every(t => t.kind === 'two'));
});

test('four, five and six teams trade round a circle when nothing smaller works', () => {
  // A loop of n teams, each with a spare starter at one position and a hole at the next one's.
  // Positions repeat round the loop, so the hole each team has is filled only by its neighbour.
  const POS = ['RB', 'WR', 'TE', 'QB', 'RB', 'WR'];
  const SL = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'BN', 'BN', 'BN'];
  for (const n of [4, 5, 6]) {
    const teams: TFTeam[] = Array.from({ length: n }, (_, i) => {
      const spare = POS[i], hole = POS[(i + 1) % n];
      const base = [p(`${i}q`, 'QB', 6000, 20), p(`${i}r`, 'RB', 6000, 15), p(`${i}r2`, 'RB', 5800, 14.5), p(`${i}w`, 'WR', 6000, 15), p(`${i}w2`, 'WR', 5800, 14.5), p(`${i}t`, 'TE', 5000, 11)];
      // Weaken the hole: its starters drop to bench quality.
      const roster = base.map(x => (x.position === hole ? { ...x, value: 600, ppw: 3, id: `${x.id}x` } : x));
      return { rosterId: i + 1, players: [...roster, p(`${i}s`, spare, 5200, 13.5)] };
    });
    const trades = searchTrades(teams, { slots: SL });
    assert.ok(trades.some(t => t.kind === 'multi' && t.sides.length === n), `a ${n} team trade is found`);
    const big = trades.find(t => t.sides.length === n)!;
    for (const s of big.sides) assert.ok(s.lineupDelta > 0.3 || s.valueDelta > 0.5, `every side of the ${n} team trade gains`);
  }
});

test('multi-team deals keep their place when two-team deals could fill the pool', () => {
  const base = (r: number, extra: TFPlayer[]): TFTeam => ({ rosterId: r, players: [
    p(`${r}q`, 'QB', 6000, 20), p(`${r}r1`, 'RB', 6000, 15), p(`${r}w1`, 'WR', 6000, 15), ...extra,
  ] });
  const teams = [
    base(1, [p('ar2', 'RB', 5000, 14), p('ar3', 'RB', 4800, 13.5), p('aw2', 'WR', 500, 3), p('at', 'TE', 4000, 10)]),
    base(2, [p('bw2', 'WR', 5000, 14), p('bw3', 'WR', 4800, 13.5), p('br2', 'RB', 4500, 12), p('bt', 'TE', 500, 3)]),
    base(3, [p('ct', 'TE', 5000, 12), p('ct2', 'TE', 4800, 11.5), p('cw2', 'WR', 4500, 12), p('cr2', 'RB', 500, 3)]),
  ];
  const all = searchTrades(teams, { slots: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'BN', 'BN'] });
  const twos = all.filter(t => t.kind === 'two').length;
  // A pool too small for every two-team deal still has its multi-team ones.
  const small = searchTrades(teams, { slots: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'BN', 'BN'], limit: Math.max(4, Math.floor(twos / 2)) });
  assert.ok(small.some(t => t.kind === 'multi'), 'multi-team deals survive a full pool');
});
