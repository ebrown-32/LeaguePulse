import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundLabels, seedsAgreeWithByes, standingsSeeds } from '../src/lib/playoffsCore.ts';

test('rounds are named from the last one back', () => {
  assert.deepEqual(roundLabels(2), ['Semifinals', 'Championship']);
  assert.deepEqual(roundLabels(4), ['Round 1', 'Quarterfinals', 'Semifinals', 'Championship']);
});

const r = (roster_id: number, wins: number, losses: number, fpts: number, rank?: number) =>
  ({ roster_id, settings: { wins, losses, ties: 0, fpts, fpts_decimal: 0, ...(rank ? { rank } : {}) } });

test('seeds follow record, then points for', () => {
  const { seeds, fromProvider } = standingsSeeds([r(1, 9, 5, 1500), r(2, 10, 4, 1400), r(3, 9, 5, 1600)]);
  assert.equal(fromProvider, false);
  assert.deepEqual([...seeds], [[2, 1], [3, 2], [1, 3]]);
});

test('the provider’s own seeds win when every team has one', () => {
  // ESPN's playoff seed can put a division winner above a better record.
  const { seeds, fromProvider } = standingsSeeds([r(1, 10, 4, 1500, 2), r(2, 8, 6, 1400, 1), r(3, 6, 8, 1300, 3)]);
  assert.equal(fromProvider, true);
  assert.equal(seeds.get(2), 1);
});

test('seeds that put a non-bye team above a bye team are rejected', () => {
  const seeds = new Map([[1, 1], [2, 2], [3, 3]]);
  assert.equal(seedsAgreeWithByes(seeds, [1, 2]), true);
  assert.equal(seedsAgreeWithByes(seeds, [1, 3]), false);
  assert.equal(seedsAgreeWithByes(seeds, []), true);
});
