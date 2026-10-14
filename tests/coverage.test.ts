/** What old seasons are missing, and how it is described. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonGaps } from '../src/lib/coverage.ts';

test('a league with no coverage record is complete', () => {
  assert.equal(seasonGaps({ season: '2024', metadata: {} }), null);
  assert.equal(seasonGaps(null), null);
});

test('an ESPN history season reports what it is missing, with its counts', () => {
  const g = seasonGaps({ season: '2018', metadata: { provider: 'espn', coverage: { lineups: false, moves: false, trades: false, counts: { trades: 3, moves: 41 } } } })!;
  assert.equal(g.season, '2018');
  assert.equal(g.source, 'ESPN');
  assert.deepEqual(g.counts, { trades: 3, moves: 41 });
});
