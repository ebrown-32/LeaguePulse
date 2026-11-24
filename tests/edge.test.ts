import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestLineup, grade, profile, quantile, replacement, startersPerTeam, type Game, type Player, type Pos } from '../src/lib/edge/metrics.ts';

const g = (w: number, pts: number, rk: number, extra: Partial<Game> = {}): Game => ({ w, tm: 'KC', opp: 'DEN', pts, rk, ...extra });
const player = (id: string, pos: Pos, pts: number[], proj: number | null = null): Player =>
  ({ id, name: id, pos, team: 'KC', owner: 1, proj, games: pts.map((x, i) => g(i + 1, x, 10)) });

test('a profile: the average, the last three, the range and the starter weeks', () => {
  const p = { pos: 'WR' as Pos, games: [g(1, 10, 30, { tgtSh: 0.2, snp: 0.8 }), g(2, 20, 8, { tgtSh: 0.3, snp: 0.9 }), g(3, 4, 60), g(4, 18, 12), g(5, 28, 2, { tgt: 9, car: 1 })] };
  const pr = profile(p);
  assert.equal(pr.gp, 5);
  assert.equal(pr.ppg, 16);
  assert.equal(Math.round(pr.last3 * 10) / 10, 16.7);
  assert.equal(pr.starterWeeks, 3, 'top 24 at receiver');
  assert.equal(pr.bustWeeks, 1, 'outside the top 48');
  assert.ok(pr.floor < pr.ppg && pr.ceiling > pr.ppg);
  assert.equal(pr.tgtSh, 0.25, 'averaged over the games that have it');
  assert.equal(pr.best, 28);
});

test('quantiles interpolate, and an empty list is zero', () => {
  assert.equal(quantile([0, 10], 0.5), 5);
  assert.equal(quantile([], 0.5), 0);
});

test('a flex is shared between backs, receivers and tight ends; a superflex is a quarterback', () => {
  const n = startersPerTeam(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DEF']);
  assert.equal(n.QB, 2);
  assert.equal(n.RB, 2.45);
  assert.equal(Math.round(n.TE * 10) / 10, 1.1);
});

test('replacement level is the first player past the league\'s starters at the position', () => {
  const qbs = [25, 22, 20, 18, 15].map((x, i) => player(`q${i}`, 'QB', [x, x, x]));
  // Two teams starting one quarterback: the third best is replacement level.
  assert.equal(replacement(qbs, 2, ['QB']).QB, 20);
});

test('the best lineup fills the fixed slots first, so a flex never takes the only tight end', () => {
  const roster = [player('te', 'TE', [], 12), player('rb1', 'RB', [], 15), player('rb2', 'RB', [], 9), player('wr', 'WR', [], 11), player('noproj', 'WR', [], null)];
  const out = bestLineup(roster, ['FLEX', 'TE', 'RB'], p => p.proj);
  assert.deepEqual(out.map(s => s.player?.id), ['wr', 'te', 'rb1']);
  assert.equal(bestLineup(roster, ['QB'], p => p.proj)[0].player, null, 'nobody to start is nobody, not a guess');
});

test('a matchup grade runs from A (gives up the most) to F', () => {
  assert.equal(grade(1)?.letter, 'A');
  assert.equal(grade(16)?.letter, 'C');
  assert.equal(grade(32)?.letter, 'F');
  assert.equal(grade(undefined), null);
});
