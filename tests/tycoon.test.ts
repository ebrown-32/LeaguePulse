import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, projectGame, startingState, fairPrices, franchiseValue, shop, DAY, type GameDay, type Decision } from '../src/lib/tycoon/economy.ts';
import { facilityStats, nextLevel, EMPTY_FACILITIES } from '../src/lib/tycoon/catalog.ts';

const start = Date.UTC(2026, 8, 9);
const season = (pattern: string): GameDay[] => pattern.split('').map((r, i) => ({
  key: `2026-${i + 1}`, season: 2026, week: i + 1, at: start + (i * 7 + 5) * DAY,
  points: r === 'W' ? 130 : 95, oppPoints: r === 'W' ? 100 : 120, postseason: false,
  rank: r === 'W' ? 2 : 8, teams: 10, opponent: 'X', oppWinPct: 0.5,
}));
const run = (pattern: string, decisions: Decision[] = []) =>
  simulate({ games: season(pattern), decisions, start, now: start + 120 * DAY });

/** `years` seasons of 14 weeks each, every week a win or every week a loss, from 2017. */
const history = (years: number, win: boolean): GameDay[] => Array.from({ length: years * 14 }, (_, i) => {
  const yr = 2017 + Math.floor(i / 14), wk = (i % 14) + 1, open = Date.UTC(yr, 8, 7);
  return { key: `${yr}-${wk}`, season: yr, week: wk, at: open + ((wk - 1) * 7 + 5) * DAY,
    points: win ? 130 : 95, oppPoints: win ? 100 : 120, postseason: false, rank: win ? 2 : 9, teams: 10, opponent: 'X', oppWinPct: 0.5 };
});
const replay = (games: GameDay[], decisions: Decision[] = []) =>
  simulate({ games, decisions, start: games[0].at - 5 * DAY, now: games.at(-1)!.at + 7 * DAY });

test('every franchise starts the same, on its first opening day', () => {
  assert.deepEqual(startingState(), startingState());
  assert.equal(startingState().facilities.stadium, 0);
});

test('history is played through: years of winning build a far more valuable franchise than years of losing', () => {
  const winner = replay(history(8, true)), loser = replay(history(8, false));
  assert.ok(franchiseValue(winner) > franchiseValue(loser) * 1.5, `${franchiseValue(winner)} vs ${franchiseValue(loser)}`);
  assert.ok(winner.games.length === 8 * 14);
  // A season marker for each of the eight seasons, in the log.
  assert.equal(winner.story.filter(e => e.kind === 'start').length, 8);
});

test('championships add value for good, lift the fans and go in the log', () => {
  const games = history(6, true);
  const plain = replay(games);
  const champ = simulate({ games, decisions: [], start: games[0].at - 5 * DAY, now: games.at(-1)!.at + 7 * DAY, titles: [2018, 2021] });
  assert.equal(champ.titles, 2);
  assert.ok(franchiseValue(champ) - franchiseValue(plain) >= 2 * 30_000_000);
  assert.equal(champ.story.filter(e => e.kind === 'title').length, 2);
});

test('a longer history is worth more than a shorter one, all else equal', () => {
  assert.ok(franchiseValue(replay(history(8, true))) > franchiseValue(replay(history(2, true))));
});

test('until a manager takes over, the old front office builds what it can afford', () => {
  const s = replay(history(6, true));
  assert.ok(s.invested > 0 && Object.values(s.facilities).some(v => v > 0));
  assert.ok(s.story.some(e => e.kind === 'build' && /old front office/.test(e.detail)));
});

test('a manager’s first decision stops the old front office building', () => {
  const games = history(6, true);
  const s = replay(games, [{ at: games[0].at - 4 * DAY, kind: 'prices', prices: { ticket: 30, concession: 8, parking: 12 } }]);
  assert.equal(s.managed, true);
  assert.equal(s.invested, 0);
});

test('winning raises fan interest and income; losing lowers them', () => {
  const up = run('WWWWWWWWWW'), down = run('LLLLLLLLLL');
  assert.ok(up.interest > down.interest + 20);
  assert.ok(up.vc > down.vc);
  assert.ok(up.games.at(-1)!.attendance > down.games.at(-1)!.attendance);
});

test('pricing far above fair empties seats and turns fans against you', () => {
  const s = startingState();
  const fair = fairPrices(s);
  const greedy = projectGame(s, { ...fair, ticket: fair.ticket * 2 });
  assert.ok(greedy.attendance < projectGame(s, fair).attendance * 0.5);
  const gouged = run('WLWLWLWLWL', [{ at: start, kind: 'prices', prices: { ...fair, ticket: fair.ticket * 2 } }]);
  assert.ok(gouged.interest < run('WLWLWLWLWL').interest - 5);
  assert.ok(gouged.story.some(e => e.kind === 'unrest'));
});

test('a cheaper ticket fills the stadium', () => {
  const s = startingState();
  const fair = fairPrices(s);
  assert.ok(projectGame(s, { ...fair, ticket: 25 }).fill > projectGame(s, fair).fill);
});

test('upgrades cost VC once, are built in order, and can not be bought on credit', () => {
  const games = history(3, true);
  const at = games.at(-1)!.at + DAY; // after the last game, so nothing else changes
  // A manager from day one (so the old front office spends nothing), saving for three seasons.
  const takeover: Decision = { at: games[0].at - 4 * DAY, kind: 'prices', prices: { ticket: 25, concession: 7, parking: 10 } };
  const before = replay(games, [takeover]);
  // Whatever the franchise can afford by then, bought twice.
  const track = shop(before).filter(t => t.next?.affordable).sort((a, b) => a.next!.cost - b.next!.cost)[0].track;
  const after = replay(games, [takeover, { at, kind: 'build', track }, { at, kind: 'build', track }]);
  const built = after.facilities[track] - before.facilities[track];
  assert.ok(built >= 1 && built <= 2, `built ${built}`);
  assert.equal(after.story.filter(e => e.kind === 'build' && e.at === at).length, built);
  assert.ok(after.vc < before.vc && after.vc >= 0);
  const broke = simulate({ games: [], decisions: [{ at: start, kind: 'build', track: 'stadium' }, { at: start, kind: 'build', track: 'stadium' }, { at: start, kind: 'build', track: 'stadium' }], start, now: start });
  assert.ok(broke.facilities.stadium < 3);
  assert.ok(broke.vc >= 0);
});

test('suites need a big enough stadium first', () => {
  assert.deepEqual(nextLevel(EMPTY_FACILITIES, 'suites'), { blocked: 'Needs a Modern Stadium first.' });
  assert.ok(shop(startingState()).every(t => t.next === null || t.next.cost > 0));
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
