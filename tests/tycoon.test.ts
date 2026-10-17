import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, projectGame, startingState, fairPrices, franchiseValue, shop, DAY, PROMOS, PROMO_MAX, type GameDay, type Decision } from '../src/lib/tycoon/economy.ts';
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
  assert.deepEqual(nextLevel(EMPTY_FACILITIES, 'suites'), { blocked: 'Build up to the Fortress first.' });
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

test('the bank never goes below zero: the owner covers builds honored from before the rebalance', () => {
  // Three stadium builds on day one, far beyond the 150 VC every franchise starts with, all made
  // before the economy was rebalanced: they happen, and the bank sits at zero, not in the red.
  const builds: Decision[] = [0, 1, 2].map(() => ({ at: start, kind: 'build', track: 'stadium' }));
  const s = simulate({ games: [], decisions: builds, start, now: start, grandfatherBefore: start + DAY });
  assert.equal(s.facilities.stadium, 3);
  assert.equal(s.vc, 0);
  assert.ok(s.covered > 0);
  assert.equal(s.story.filter(e => e.kind === 'covered').length, 1);
});

test('the bank never goes below zero: upkeep through a long offseason', () => {
  // A big stadium honored on credit, then a whole year with no games: upkeep every day, nothing coming in.
  const builds: Decision[] = [0, 1, 2, 3].map(() => ({ at: start, kind: 'build', track: 'stadium' }));
  const s = simulate({ games: [], decisions: builds, start, now: start + 365 * DAY, grandfatherBefore: start + DAY });
  assert.ok(s.days.every(d => d.vc >= 0), `lowest ${Math.min(...s.days.map(d => d.vc))}`);
  assert.ok(s.vc >= 0);
});

test('a promotion doesn’t take the franchise over from the old front office, and only one runs a week', () => {
  const games = history(3, true);
  const auto = replay(games);
  const ran = replay(games, [{ at: games[3].at - DAY, kind: 'promo', promo: 'bobblehead', score: 2 }]);
  assert.deepEqual(ran.facilities, auto.facilities);
  assert.equal(ran.managed, false);
  const twice = replay(games, [
    { at: games[3].at - DAY, kind: 'promo', promo: 'bobblehead', score: 2 },
    { at: games[3].at - DAY + 3_600_000, kind: 'promo', promo: 'beer', score: PROMO_MAX },
  ]);
  assert.equal(twice.story.filter(e => e.kind === 'promo').length, 1);
});

test('entries from a retired feature in the log change nothing', () => {
  const games = history(2, true);
  const old = { at: games[5].at - DAY, kind: 'hype', score: 5 } as unknown as Decision;
  assert.deepEqual(replay(games, [old]), replay(games));
});

test('promotion nights: dollar beer trades the night’s food money for fans; the others cost VC up front', () => {
  const games = history(2, true);
  const g = games[18], before = g.at - DAY;
  const at = (s: ReturnType<typeof replay>) => s.games.find(x => x.key === g.key)!;
  const plain = replay(games);
  const beer = replay(games, [{ at: before, kind: 'promo', promo: 'beer', score: PROMO_MAX }]);
  assert.deepEqual(at(beer).promo, { id: 'beer', score: PROMO_MAX });
  assert.ok(at(beer).interest > at(plain).interest);
  assert.ok(at(beer).revenue.concessions < at(plain).revenue.concessions, 'food at a dollar earns less');
  assert.ok(at(beer).attendance >= at(plain).attendance);

  // Fireworks are paid for when booked; with no VC to pay, they don't happen.
  const fireworks = replay(games, [{ at: before, kind: 'promo', promo: 'fireworks', score: 3 }]);
  assert.ok(fireworks.story.some(e => e.kind === 'promo'));
  // Builds honored from before the rebalance empty the bank; fireworks booked the next day can't be paid for.
  const drained: Decision[] = [0, 1, 2].map(() => ({ at: start, kind: 'build', track: 'stadium' }));
  const broke = simulate({ games: [], decisions: [...drained, { at: start + DAY, kind: 'promo', promo: 'fireworks', score: 6 }], start, now: start + DAY, grandfatherBefore: start + DAY / 2 });
  assert.equal(broke.vc < PROMOS.fireworks.cost, true);
  assert.equal(broke.story.filter(e => e.kind === 'promo').length, 0);
});
