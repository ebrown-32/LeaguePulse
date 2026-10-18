import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeOf } from '../src/lib/live/place.ts';
import type { LiveGame } from '../src/lib/live/espn.ts';

const game = (o: Partial<LiveGame>): LiveGame => ({
  id: '1', away: { abbr: 'KC', score: 7, id: '12' }, home: { abbr: 'BUF', score: 10, id: '2' }, state: 'in', detail: 'Q2 4:12',
  kickoff: '2026-10-18T17:00Z', period: 2, clock: '4:12', possession: 'KC', downDistance: '2nd & 7 at BUF 34', yardsToEndzone: 34,
  redZone: false, lastPlay: null, lastPlayId: null, broadcast: null, ...o,
});

test('a skill player whose team has the ball is driving, at the real spot', () => {
  const p = placeOf('WR', 'KC', game({}), true, false);
  assert.equal(p.state, 'driving');
  assert.equal(p.yardsToEndzone, 34);
  assert.equal(p.downDistance, '2nd & 7 at BUF 34');
});

test('the other side of the ball: offense sits, a team defense takes the field', () => {
  assert.equal(placeOf('RB', 'BUF', game({}), true, false).state, 'sideline');
  const d = placeOf('DEF', 'BUF', game({}), true, false);
  assert.equal(d.state, 'defending');
  assert.equal(d.yardsToEndzone, 34);
});

test('a kicker comes out only in range', () => {
  assert.equal(placeOf('K', 'KC', game({ yardsToEndzone: 60 }), true, false).state, 'sideline');
  assert.equal(placeOf('K', 'KC', game({ yardsToEndzone: 22 }), true, false).state, 'driving');
});

test('before kickoff, after the final whistle, on a bye, and in another week', () => {
  assert.equal(placeOf('QB', 'KC', game({ state: 'pre' }), true, false).state, 'pregame');
  assert.equal(placeOf('QB', 'KC', game({ state: 'post' }), true, false).state, 'final');
  assert.equal(placeOf('QB', 'MIA', undefined, true, false).state, 'bye');
  assert.equal(placeOf('QB', 'KC', game({}), false, true).state, 'final');
  assert.equal(placeOf('QB', 'KC', game({}), false, false).state, 'pregame');
});
