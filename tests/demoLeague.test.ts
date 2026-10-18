import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playSeason, type SeasonInput, type WeekData } from '../src/lib/demo/league.ts';
import { LAST_WEEK, REGULAR_WEEKS, TEAMS, pointsFor } from '../src/lib/demo/settings.ts';

/** A made-up player pool and seventeen weeks of made-up games, enough to play a season. */
function input(o: { final: number; live?: number | null }): SeasonInput {
  const directory: SeasonInput['directory'] = {};
  const prior: SeasonInput['prior'] = {}, current: SeasonInput['current'] = {};
  const counts: Record<string, number> = { QB: 24, RB: 60, WR: 70, TE: 24, K: 20, DEF: 20 };
  let n = 0;
  for (const [pos, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) {
      const id = pos === 'DEF' ? `T${i}` : String(1000 + n++);
      directory[id] = { position: pos, first_name: 'Player', last_name: `${pos}${i}`, team: 'KC', injury_status: null };
      prior[id] = { pts: 300 - i * (250 / count), gp: 16 };
      current[id] = { pts: 280 - i * (200 / count), gp: 16 };
    }
  }
  const weeks: Record<number, WeekData> = {};
  for (let w = 1; w <= Math.min(LAST_WEEK, o.live ?? o.final); w++) {
    const pts: Record<string, number> = {};
    for (const id of Object.keys(directory)) pts[id] = ((Number(id.replace(/\D/g, '')) * 7 + w * 13) % 29) + 1;
    weeks[w] = { pts, played: Object.keys(directory) };
  }
  return { season: 2024, prior, current, weeks, live: o.live ?? null, final: o.final, directory };
}

test('a finished season: everyone drafted, every week played, one champion', () => {
  const s = playSeason(input({ final: LAST_WEEK }));
  assert.equal(s.users.length, TEAMS);
  assert.equal(s.rosters.length, TEAMS);
  assert.equal(s.league.status, 'complete');
  assert.equal(s.picks.length, TEAMS * 15);
  assert.equal(new Set(s.picks.map(p => p.player_id)).size, s.picks.length, 'nobody is drafted twice');
  // Each team's record is its regular season: fourteen games.
  for (const r of s.rosters) assert.equal(r.settings.wins + r.settings.losses + r.settings.ties, REGULAR_WEEKS);
  // A matchup's points are its starters' points.
  for (const m of s.matchups[3]) assert.ok(Math.abs(m.points - m.starters_points.reduce((a: number, b: number) => a + b, 0)) < 0.01);
  const final = s.winners_bracket.find(b => b.p === 1);
  assert.ok(final?.w, 'the title game has a winner');
  // Nobody is on two rosters in any week.
  for (let w = 1; w <= LAST_WEEK; w++) {
    const all = s.matchups[w].flatMap(m => m.players);
    assert.equal(new Set(all).size, all.length, `week ${w}`);
  }
});

test('the same inputs play the same season', () => {
  assert.deepEqual(playSeason(input({ final: LAST_WEEK })), playSeason(input({ final: LAST_WEEK })));
});

test('a season under way: the live week scores, the weeks after it wait', () => {
  const s = playSeason(input({ final: 5, live: 6 }));
  assert.equal(s.league.status, 'in_season');
  assert.ok(s.matchups[6].some(m => m.points > 0));
  assert.ok(s.matchups[7].every(m => m.points === 0));
  assert.equal(s.winners_bracket.length, 0);
});

test('points come from the scoring settings', () => {
  assert.equal(pointsFor({ rec: 5, rec_yd: 72, rec_td: 1 }), 18.2);
  assert.equal(pointsFor({ pass_yd: 250, pass_td: 2, pass_int: 1 }), 17);
  assert.equal(pointsFor(undefined), 0);
});
