/** Games played: one matchup is one game, median results are not games. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonGamesPlayed } from '../src/lib/games.ts';

const team = (wins: number, losses: number, ties = 0) => ({ settings: { wins, losses, ties } });

test('records add up to twice the games', () => {
  // 4 teams, 3 weeks: 6 games.
  assert.equal(seasonGamesPlayed([team(3, 0), team(2, 1), team(1, 2), team(0, 3)], { settings: {} }), 6);
});

test('a median league counts each week once, not twice', () => {
  // Same 6 games, plus a median result for every team every week.
  assert.equal(seasonGamesPlayed([team(6, 0), team(4, 2), team(2, 4), team(0, 6)], { settings: { league_average_match: 1 } }), 6);
});

test('nothing played is no games', () => {
  assert.equal(seasonGamesPlayed([], null), 0);
});
