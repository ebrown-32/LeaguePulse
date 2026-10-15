import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, projectGame, startingState, fairPrices, legacyScore, shop, DAY, type GameDay, type Decision } from '../src/lib/tycoon/economy.ts';
import { facilityStats, nextLevel, EMPTY_FACILITIES } from '../src/lib/tycoon/catalog.ts';

const start = Date.UTC(2026, 8, 9);
const season = (pattern: string): GameDay[] => pattern.split('').map((r, i) => ({
  key: `2026-${i + 1}`, season: 2026, week: i + 1, at: start + (i * 7 + 5) * DAY,
  points: r === 'W' ? 130 : 95, oppPoints: r === 'W' ? 100 : 120, postseason: false,
  rank: r === 'W' ? 2 : 8, teams: 10, opponent: 'X', oppWinPct: 0.5,
}));
const mid = { titles: 1, finals: 2, winPct: 0.5, seasons: 6 };
const run = (pattern: string, decisions: Decision[] = [], legacy = mid) =>
  simulate({ legacy, games: season(pattern), decisions, start, now: start + 120 * DAY });

test('history buys a head start', () => {
  const champ = startingState({ titles: 3, finals: 5, winPct: 0.6, seasons: 10 });
  const rookie = startingState({ titles: 0, finals: 0, winPct: 0.4, seasons: 1 });
  assert.ok(legacyScore({ titles: 3, finals: 5, winPct: 0.6, seasons: 10 }) > legacyScore({ titles: 0, finals: 0, winPct: 0.4, seasons: 1 }));
  assert.ok(champ.interest > rookie.interest && champ.vc > rookie.vc && champ.facilities.stadium > rookie.facilities.stadium);
});

test('winning raises fan interest and income; losing lowers them', () => {
  const up = run('WWWWWWWWWW'), down = run('LLLLLLLLLL');
  assert.ok(up.interest > down.interest + 20);
  assert.ok(up.vc > down.vc);
  assert.ok(up.games.at(-1)!.attendance > down.games.at(-1)!.attendance);
});

test('pricing far above fair empties seats and turns fans against you', () => {
  const s = startingState(mid);
  const fair = fairPrices(s);
  const greedy = projectGame(s, { ...fair, ticket: fair.ticket * 2 });
  assert.ok(greedy.attendance < projectGame(s, fair).attendance * 0.5);
  const gouged = run('WLWLWLWLWL', [{ at: start, kind: 'prices', prices: { ...fair, ticket: fair.ticket * 2 } }]);
  assert.ok(gouged.interest < run('WLWLWLWLWL').interest - 5);
  assert.ok(gouged.story.some(e => e.kind === 'unrest'));
});

test('a cheaper ticket fills the stadium', () => {
  const s = startingState(mid);
  const fair = fairPrices(s);
  assert.ok(projectGame(s, { ...fair, ticket: 25 }).fill > projectGame(s, fair).fill);
});

test('upgrades cost VC once, are built in order, and can not be bought on credit', () => {
  const s = run('WWWW', [{ at: start + 2 * DAY, kind: 'build', track: 'concessions' }, { at: start + 2 * DAY, kind: 'build', track: 'concessions' }]);
  assert.equal(s.facilities.concessions, 2);
  assert.ok(s.story.filter(e => e.kind === 'build').length === 2);
  const broke = simulate({ legacy: { titles: 0, finals: 0, winPct: 0, seasons: 0 }, games: [], decisions: [{ at: start, kind: 'build', track: 'stadium' }, { at: start, kind: 'build', track: 'stadium' }, { at: start, kind: 'build', track: 'stadium' }], start, now: start });
  assert.ok(broke.facilities.stadium < 3);
  assert.ok(broke.vc >= 0);
});

test('suites need a big enough stadium first', () => {
  assert.deepEqual(nextLevel(EMPTY_FACILITIES, 'suites'), { blocked: 'Needs a Modern Stadium first.' });
  assert.ok(shop(startingState(mid)).every(t => t.next === null || t.next.cost > 0));
});

test('more seats and parking mean more fans can come', () => {
  const small = facilityStats(EMPTY_FACILITIES), big = facilityStats({ ...EMPTY_FACILITIES, stadium: 2, seating: 2, parking: 3 });
  assert.ok(big.capacity > small.capacity * 5 && big.parking > small.parking);
});

test('the replay is deterministic', () => {
  assert.deepEqual(run('WLWWLLWL'), run('WLWWLLWL'));
});

test('until a manager sets prices, the old front office keeps them fair', () => {
  const s = run('WWWW');
  assert.equal(s.autopilot, true);
  assert.ok(s.games.every(g => g.prices.ticket === Math.max(5, Math.round(g.fairTicket / 5) * 5)));
  const managed = run('WWWW', [{ at: start, kind: 'prices', prices: { ticket: 50, concession: 8, parking: 15 } }]);
  assert.equal(managed.autopilot, false);
  assert.ok(managed.games.every(g => g.prices.ticket === 50));
});
