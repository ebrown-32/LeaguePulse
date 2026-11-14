import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addWeek, scoreWeek, seasonTable, weekExtremes, type Result, type TableRow } from '../src/lib/pickemScore.ts';
import { grudge } from '../src/lib/rivalryGrudge.ts';
import type { GameRecord } from '../src/lib/rivalries.ts';

// Six teams, rosters 1 to 6: games 1 (1 v 2), 2 (3 v 4), 3 (5 v 6).
const results: Result[] = [
  { matchupId: 1, rosters: [1, 2], winner: 1 },
  { matchupId: 2, rosters: [3, 4], winner: 4 },
  { matchupId: 3, rosters: [5, 6], winner: null },
];

test('a right pick is a point, the lock is two, a tie scores nobody', () => {
  const s = scoreWeek({ picks: { 2: 4, 3: 5 }, lock: 2, at: '' }, results, 1);
  assert.deepEqual(s, { points: 2, right: 1, wrong: 0, lockRight: true, made: 2, upsets: 0 });
});

test('a blown lock is worth nothing, and your own game never counts', () => {
  const s = scoreWeek({ picks: { 1: 2, 2: 3 }, lock: 2, at: '' }, results, 1);
  assert.equal(s.points, 0);
  assert.equal(s.wrong, 1);
  assert.equal(s.lockRight, false);
  assert.equal(s.made, 1, 'the pick on their own game is ignored');
});

test('a right underdog pick is an upset: +1 under 40%, +2 under 25%, nothing when it loses', () => {
  const s = scoreWeek({ picks: { 1: 1, 2: 4 }, odds: { 1: 0.3, 2: 0.2 }, at: '' }, results, null);
  assert.equal(s.points, (1 + 1) + (1 + 2));
  assert.equal(s.upsets, 2);
  const lost = scoreWeek({ picks: { 1: 2 }, odds: { 1: 0.1 }, at: '' }, results, null);
  assert.equal(lost.points, 0);
  assert.equal(scoreWeek({ picks: { 1: 1 }, odds: { 1: 0.55 }, at: '' }, results, null).upsets, 0);
});

test('a pick for a roster that is not in the game is ignored', () => {
  assert.equal(scoreWeek({ picks: { 1: 5 }, at: '' }, results, null).made, 0);
});

test('the table: points, then right picks, then the best week', () => {
  const rows = new Map<string, TableRow>();
  addWeek(rows, 'a', 1, { points: 3, right: 3, wrong: 0, lockRight: null, made: 3 });
  addWeek(rows, 'b', 1, { points: 3, right: 2, wrong: 1, lockRight: true, made: 3 });
  addWeek(rows, 'c', 1, { points: 0, right: 0, wrong: 0, lockRight: null, made: 0 });
  const t = seasonTable(rows);
  assert.deepEqual(t.map(r => r.userId), ['a', 'b'], 'a manager with no picks has no row');
  assert.equal(t[1].locksRight, 1);
});

test('best and worst predictor need a real card, and a difference', () => {
  const s = (points: number, right: number, wrong: number) => ({ points, right, wrong, lockRight: null, made: right + wrong });
  const ex = weekExtremes([{ userId: 'a', s: s(4, 3, 1) }, { userId: 'b', s: s(1, 1, 3) }, { userId: 'c', s: s(0, 0, 1) }], 4);
  assert.equal(ex?.best.userId, 'a');
  assert.equal(ex?.worst.userId, 'b', 'one pick is too few to be the worst');
  assert.equal(weekExtremes([{ userId: 'a', s: s(2, 2, 2) }, { userId: 'b', s: s(2, 2, 2) }], 4), null);
});

const g = (season: string, week: number, score: number, opp: number, isPlayoff = false): GameRecord =>
  ({ season, week, score, opponentScore: opp, isPlayoff, stage: isPlayoff ? 'playoff' : 'regular' });

test('a grudge needs three meetings', () => {
  assert.equal(grudge([g('2024', 3, 100, 90), g('2025', 4, 90, 100)], 80, 'A', 'B', '2026'), null);
});

test('a close last meeting, a recent playoff game and a streak all add to the grudge', () => {
  const games = [g('2023', 5, 80, 120), g('2024', 15, 130, 101, true), g('2025', 3, 110, 100), g('2026', 2, 104, 99.5)];
  const out = grudge(games, 50, 'Alpha', 'Bravo', '2026')!;
  assert.equal(out.score, 50 + 10 + 8 + 6);
  assert.equal(out.streak?.side, 'a');
  assert.equal(out.streak?.length, 3);
  assert.ok(out.reasons.some(r => r.includes('Alpha has won the last 3')));
  assert.equal(out.last?.week, 2);
});

test('the sim picks every game but its own, the same way every time, by the odds', async () => {
  const { simulatePicks, cupHolder } = await import('../src/lib/pickemScore.ts');
  const slate = [1, 2, 3].map(id => ({ matchupId: id, a: { rosterId: id * 2 - 1 }, b: { rosterId: id * 2 } }));
  const odds = new Map([[1, 0.99], [2, 0.01], [3, 0.5]]);
  const card = simulatePicks(slate, 5, odds, 'league:2026:4:u1', 'now');
  assert.equal(card.auto, true);
  assert.equal(card.lock, null);
  assert.deepEqual(Object.keys(card.picks), ['1', '2'], 'its own game (roster 5) is left out');
  assert.equal(card.picks['1'], 1, 'a 99% favourite is almost always taken');
  assert.equal(card.picks['2'], 4);
  assert.deepEqual(simulatePicks(slate, 5, odds, 'league:2026:4:u1', 'later').picks, card.picks);
  // Over many managers, a 70% favourite is taken about 70% of the time.
  const n = 2000, taken = Array.from({ length: n }, (_, i) => simulatePicks(slate, null, new Map([[1, 0.7]]), `s${i}`, '').picks['1'] === 1).filter(Boolean).length;
  assert.ok(Math.abs(taken / n - 0.7) < 0.04, `took the favourite ${taken / n}`);

  const row = (userId: string, weeks: number, simWeeks: number) => ({ userId, points: 0, right: 0, wrong: 0, weeks, bestWeek: 0, locksRight: 0, locksPlayed: 0, upsets: 0, simWeeks, byWeek: {} });
  assert.equal(cupHolder([row('sim', 10, 10), row('human', 10, 3)]), 'human', 'the Cup goes to someone who played');
});
