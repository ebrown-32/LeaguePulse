import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBroken, whatsNew } from '../src/lib/ai/recordWatch.ts';
import type { EnhancedHistoricalRecord } from '../src/lib/enhancedHistoryApi.ts';

const rec = (type: string, value: number, season: string, week: number | undefined, userId: string, rank: number, details?: EnhancedHistoricalRecord['details']): EnhancedHistoricalRecord =>
  ({ type: type as EnhancedHistoricalRecord['type'], value, season, week, userId, username: userId, avatar: '', description: '', contextualRank: rank, details });

test('a week that tops a list breaks the record it beat', () => {
  const book = [
    rec('highScore', 210, '2026', 7, 'a', 1),
    rec('highScore', 205, '2021', 3, 'b', 2),
    rec('highScore', 190, '2026', 2, 'c', 3),
  ];
  const [b] = findBroken(book, '2026', [7], false);
  assert.equal(b.type, 'highScore');
  assert.equal(b.record.userId, 'a');
  assert.equal(b.was?.userId, 'b');
  // The same book read a week later: old news.
  assert.equal(findBroken(book, '2026', [8], false).length, 0);
});

test('the old record is the best from before the new weeks', () => {
  // Two scores in the new week both beat history: the record it broke is still the old one.
  const book = [rec('highScore', 220, '2026', 7, 'a', 1), rec('highScore', 215, '2026', 7, 'c', 2), rec('highScore', 205, '2021', 3, 'b', 3)];
  assert.equal(findBroken(book, '2026', [7], false)[0].was?.userId, 'b');
});

test('lower is the record where the book says so, and a tie breaks nothing', () => {
  const low = [rec('lowScore', 31, '2026', 5, 'a', 1), rec('lowScore', 33, '2020', 7, 'b', 2)];
  assert.equal(findBroken(low, '2026', [5], false).length, 1);
  const tie = [rec('highScore', 205, '2026', 7, 'a', 1), rec('highScore', 205, '2021', 3, 'b', 2)];
  assert.equal(findBroken(tie, '2026', [7], false).length, 0);
});

test('the league\'s first games have no record to break', () => {
  assert.equal(findBroken([rec('highScore', 150, '2026', 1, 'a', 1)], '2026', [1], false).length, 0);
});

test('a streak is news the week it passes everyone else, not after', () => {
  const streak = (len: number, to: number) => rec('gameWinStreak', len, '2026', undefined, 'a', 1, { from: '2025 Week 10', to: `2026 Week ${to}`, active: true });
  const other = rec('gameWinStreak', 9, '2019', undefined, 'b', 2, { from: '2019 Week 1', to: '2019 Week 9', active: false });
  assert.equal(findBroken([streak(10, 6), other], '2026', [6], false).length, 1);
  // Already the record last week: extending it isn't a new one.
  assert.equal(findBroken([streak(11, 7), other], '2026', [7], false).length, 0);
  // A streak that ended isn't announced.
  assert.equal(findBroken([{ ...streak(10, 6), details: { from: '2025 Week 10', to: '2026 Week 6', active: false } }, other], '2026', [6], false).length, 0);
});

test('season records wait for the season to end', () => {
  const book = [rec('seasonPoints', 1900, '2026', undefined, 'a', 1), rec('seasonPoints', 1871, '2018', undefined, 'b', 2)];
  assert.equal(findBroken(book, '2026', [14], false).length, 0);
  assert.equal(findBroken(book, '2026', [], true).length, 1);
});

test('the weeks to check are the ones final since the last look', () => {
  assert.deepEqual(whatsNew({ season: '2026', week: 5, done: false }, { season: '2026', week: 7, done: false }), { weeks: [6, 7], seasonEnded: false });
  assert.deepEqual(whatsNew({ season: '2025', week: 17, done: true }, { season: '2026', week: 2, done: false }), { weeks: [1, 2], seasonEnded: false });
  assert.deepEqual(whatsNew({ season: '2026', week: 17, done: false }, { season: '2026', week: 17, done: true }), { weeks: [], seasonEnded: true });
});
