import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_WEIGHTS, legacyScores, rankByLegacy } from '../src/lib/legacy.ts';

const m = (userId: string, championships: number, w: number, l: number, ppg: number) =>
  ({ userId, championships, totalWins: w, totalLosses: l, totalTies: 0, averagePointsPerGame: ppg });

test('the weights add up to 100', () => {
  assert.equal(Object.values(LEGACY_WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test('titles weigh most: a champion outranks a slightly better regular-season record', () => {
  const ranked = rankByLegacy([m('steady', 0, 80, 60, 110), m('champ', 2, 76, 64, 108), m('meh', 0, 60, 80, 100)]);
  assert.deepEqual(ranked.map(r => r.userId), ['champ', 'steady', 'meh']);
});

test('one hot season does not outrank a long, winning career', () => {
  const ranked = rankByLegacy([m('veteran', 1, 84, 56, 112), m('rookie', 1, 11, 3, 125)]);
  assert.equal(ranked[0].userId, 'veteran');
});

test('scores stay within 0 to 100, far apart for far-apart careers', () => {
  const scores = legacyScores([m('best', 3, 100, 40, 130), m('worst', 0, 40, 100, 95)]);
  const best = scores.find(s => s.userId === 'best')!.score, worst = scores.find(s => s.userId === 'worst')!.score;
  assert.ok(best > 90 && best <= 100, `best ${best}`);
  assert.ok(worst >= 0 && worst < 15, `worst ${worst}`); // 40 of the leader's 100 wins still counts
});

test('a small gap stays small: two near-identical careers score close together', () => {
  const [a, b] = legacyScores([m('a', 1, 71, 69, 110), m('b', 1, 70, 70, 109.5)]);
  assert.ok(Math.abs(a.score - b.score) < 3, `${a.score} vs ${b.score}`);
});

test('wins weigh as much as win percentage: a long winning career beats a short perfect-ish one', () => {
  const ranked = rankByLegacy([m('long', 0, 100, 60, 125), m('short', 0, 30, 18, 125)]);
  assert.equal(ranked[0].userId, 'long');
});

test('nobody with a title: that part is zero, not a crash', () => {
  const scores = legacyScores([m('a', 0, 10, 4, 100), m('b', 0, 4, 10, 90)]);
  for (const s of scores) assert.equal(s.parts.championships, 0);
});
