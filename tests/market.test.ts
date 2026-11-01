import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparisonLadder, formatLabel, formatOf, parseFormat } from '../src/lib/market/format.ts';
import { bidAt, bidBucket, countWeek, type MatchupRow, type TransactionRow } from '../src/lib/market/aggregate.ts';

test('a league’s format: kind, scoring and quarterbacks', () => {
  assert.equal(formatOf({ settings: { type: 2 }, scoring_settings: { rec: 1 }, roster_positions: ['QB', 'RB', 'SUPER_FLEX', 'BN'] }).fmt, 'dynasty|ppr|sf');
  assert.equal(formatOf({ settings: { type: 0 }, scoring_settings: { rec: 0.5 }, roster_positions: ['QB', 'RB', 'FLEX'] }).fmt, 'redraft|half|1qb');
  assert.equal(formatOf({ settings: { type: 1 }, scoring_settings: { rec: 0 }, roster_positions: ['QB', 'QB', 'RB'] }).fmt, 'keeper|std|sf');
  assert.equal(formatOf({ settings: { type: 2, best_ball: 1 }, scoring_settings: { rec: 1 } }).fmt, 'bestball|ppr|1qb');
  assert.equal(formatOf({ scoring_settings: { rec: 0.25 } }).scoring, 'other');
  assert.equal(formatLabel(parseFormat('dynasty|ppr|sf')!), 'Dynasty, PPR, superflex');
  assert.equal(parseFormat('nonsense|ppr|sf'), null);
});

test('comparisons widen from the league’s own format to every league', () => {
  const all = ['dynasty|ppr|sf', 'dynasty|half|sf', 'dynasty|ppr|1qb', 'redraft|ppr|1qb'];
  const ladder = comparisonLadder(parseFormat('dynasty|ppr|sf')!, all);
  assert.deepEqual(ladder.map(l => l.fmts), [
    ['dynasty|ppr|sf'], ['dynasty|ppr|sf', 'dynasty|half|sf'], ['dynasty|ppr|sf', 'dynasty|half|sf'],
    ['dynasty|ppr|sf', 'dynasty|half|sf', 'dynasty|ppr|1qb'], all,
  ]);
  // A one-QB league leans on other one-QB leagues before superflex ones of its own kind.
  const oneQb = comparisonLadder(parseFormat('dynasty|half|1qb')!, all);
  assert.deepEqual(oneQb[2].fmts, ['dynasty|ppr|1qb', 'redraft|ppr|1qb']);
});

const week: MatchupRow[] = [
  { roster_id: 1, matchup_id: 1, points: 120, players: ['a', 'b', 'c'], starters: ['a', 'b'], players_points: { a: 20, b: 10, c: 30 } },
  { roster_id: 2, matchup_id: 1, points: 100, players: ['d', 'e'], starters: ['d', '0'], players_points: { d: 15 } },
  // Eliminated or on a bye: still owns its players, but played no game.
  { roster_id: 3, matchup_id: null, points: 0, players: ['f'], starters: [] },
];

test('a week is counted: rosters, lineups and the scoring environment', () => {
  const w = countWeek(week, [], { budget: 100, bestBall: false });
  assert.equal(w.teams, 2);
  assert.equal(w.ptsSum, 220);
  assert.equal(w.ptsSq, 120 * 120 + 100 * 100);
  assert.equal(w.players.get('a')!.started, 1);
  assert.equal(w.players.get('a')!.startPts, 20);
  assert.equal(w.players.get('c')!.rostered, 1);
  assert.equal(w.players.get('c')!.started, 0);
  assert.equal(w.players.get('f')!.rostered, 1);
  assert.equal(w.players.has('0'), false, 'an empty lineup slot is nobody');
});

test('best ball sets its own lineups, so nobody is counted as started', () => {
  const w = countWeek(week, [], { budget: null, bestBall: true });
  assert.equal(w.players.get('a')!.started, 0);
  assert.equal(w.players.get('a')!.rostered, 1);
});

test('waivers count adds, drops and winning bids as a share of the budget', () => {
  const txs: TransactionRow[] = [
    { transaction_id: 'w1', type: 'waiver', status: 'complete', adds: { x: 1 }, drops: { y: 1 }, settings: { waiver_bid: 12 } },
    { transaction_id: 'w2', type: 'waiver', status: 'failed', adds: { x: 2 }, settings: { waiver_bid: 40 } },
    { transaction_id: 'f1', type: 'free_agent', status: 'complete', adds: { z: 3 } },
  ];
  const w = countWeek([], txs, { budget: 100, bestBall: false });
  assert.equal(w.players.get('x')!.adds, 1, 'a failed claim is not an add');
  assert.equal(w.players.get('x')!.bids, 1);
  assert.equal(w.players.get('x')!.bidHist[5], 1, '12% falls in the 10 to 20% bucket');
  assert.equal(w.players.get('y')!.drops, 1);
  assert.equal(w.players.get('z')!.bids, 0, 'a free agent pickup is not a bid');
  assert.equal(w.adds, 2);
});

test('a trade keeps what each side got, and nothing about who', () => {
  const txs: TransactionRow[] = [{
    transaction_id: 't1', type: 'trade', status: 'complete', roster_ids: [7, 3], status_updated: 1000,
    adds: { p1: 3, p2: 7, p3: 7 },
    draft_picks: [{ season: '2027', round: 1, owner_id: 3, previous_owner_id: 7 }],
    waiver_budget: [{ sender: 3, receiver: 7, amount: 15 }],
  }];
  const w = countWeek([], txs, { budget: 100, bestBall: false });
  assert.equal(w.trades.length, 1);
  const t = w.trades[0];
  assert.equal(t.teams, 2);
  // Sides in roster order: 3 then 7.
  assert.deepEqual(t.sides[0], { players: ['p1'], picks: [{ season: '2027', round: 1 }], faab: 0 });
  assert.deepEqual(t.sides[1], { players: ['p2', 'p3'], picks: [], faab: 15 });
  assert.ok(!JSON.stringify(t).includes('"roster'), 'no roster ids are kept');
  assert.equal(w.players.get('p2')!.tradedFor, 1);
});

test('bids: buckets and the bid that wins a share of the time', () => {
  assert.equal(bidBucket(0, 100), 0);
  assert.equal(bidBucket(1, 100), 1);
  assert.equal(bidBucket(4, 100), 3);
  assert.equal(bidBucket(50, 200), 6);
  assert.equal(bidAt([0, 0, 0, 0, 0, 0, 0], 0.5), null);
  assert.equal(bidAt([0, 1, 1, 2, 0, 0, 0], 0.5), 3);
  assert.equal(bidAt([0, 1, 1, 2, 0, 0, 0], 0.75), 5);
  assert.equal(bidAt([0, 0, 0, 0, 0, 0, 3], 0.5), 20, 'the top bucket reads as over 20%');
});
