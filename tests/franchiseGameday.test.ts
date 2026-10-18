import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statLine } from '../src/lib/franchise/gameday.ts';

test('a box score line reads the way a team account writes it', () => {
  assert.equal(statLine('QB', { pass_cmp: 27, pass_att: 34, pass_yd: 312, pass_td: 3, pass_int: 1 }), '27/34, 312 yds, 3 TD, 1 INT');
  assert.equal(statLine('RB', { rush_att: 22, rush_yd: 141, rush_td: 2, rec: 3, rec_yd: 24 }), '22 car, 141 yds, 2 TD, 3 rec, 24 yds');
  assert.equal(statLine('WR', { rec: 9, rec_yd: 156, rec_td: 1 }), '9 rec, 156 yds, 1 TD');
  assert.equal(statLine('DEF', { sack: 5, int: 2, def_td: 1 }), '5 sacks, 2 INT, 1 TD');
  assert.equal(statLine('WR', undefined), '');
});
