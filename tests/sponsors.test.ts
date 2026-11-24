import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRANDS, SLOT, SLOTS, offersFor, offerWeek, projectDeal, sponsorValue, termsOf, tierFor, buyoutCost, type Offer } from '../src/lib/tycoon/sponsors.ts';
import { simulate, VC_PER_DOLLAR, type Decision, type GameDay } from '../src/lib/tycoon/economy.ts';

const DAY = 86_400_000, START = Date.UTC(2026, 8, 10);
const game = (i: number, o: Partial<GameDay> = {}): GameDay => ({
  key: `g${i}`, season: 2026, week: i + 1, at: START + (i * 7 + 5) * DAY, points: 120, oppPoints: 100, postseason: false,
  rank: 5, teams: 10, opponent: 'Them', oppWinPct: 0.5, home: i % 2 === 0, ...o,
});
const standing = { capacity: 24_000, interest: 60, titles: 0 };

test('every brand sells somewhere, and every slot has brands at every tier it can reach', () => {
  assert.equal(new Set(BRANDS.map(b => b.id)).size, BRANDS.length, 'ids are unique');
  for (const b of BRANDS) assert.ok(b.slots.length > 0);
  for (const s of SLOTS) assert.ok(BRANDS.some(b => b.slots.includes(s.id) && b.tier <= 2), `${s.id} has a brand a small franchise can sign`);
});

test('a bigger franchise is worth more, and bigger brands call', () => {
  assert.ok(sponsorValue({ capacity: 64_000, interest: 80, titles: 2 }) > sponsorValue(standing) * 2);
  assert.equal(tierFor({ capacity: 9_000, interest: 40, titles: 0 }), 1);
  assert.equal(tierFor({ capacity: 64_000, interest: 75, titles: 0 }), 4);
});

test('offers are the same all week, change the next, and never include a brand already signed', () => {
  const ask = (week: number, taken: string[] = []) => offersFor({ franchiseId: 'f1', slot: 'sideline', week, standing, taken, loyalty: {} });
  const a = ask(100);
  assert.equal(a.length, 3);
  assert.deepEqual(ask(100), a);
  assert.notDeepEqual(ask(101).map(o => o.id), a.map(o => o.id));
  assert.ok(!ask(100, [a[0].brand]).some(o => o.brand === a[0].brand));
  assert.equal(offerWeek(Date.UTC(2026, 10, 24, 12)), offerWeek(Date.UTC(2026, 10, 30, 12)), 'a Tuesday and the Monday after are one week');
  assert.notEqual(offerWeek(Date.UTC(2026, 10, 23, 12)), offerWeek(Date.UTC(2026, 10, 24, 12)), 'Monday and Tuesday are not');
});

const offer: Offer = { id: 'x', slot: 'sideline', brand: 'goal-line-grill', term: 4, clause: null, fee: 100_000, loyalty: 0 };

test('the structures: guaranteed is flat, incentive pays for winning', () => {
  const g = termsOf(offer, 'guaranteed'), i = termsOf(offer, 'incentive');
  assert.deepEqual([g.base, g.win], [100_000, 0]);
  assert.deepEqual([i.base, i.win, i.statement], [40_000, 45_000, 30_000]);
  assert.ok(projectDeal(i, 4, 0, 0) < projectDeal(g, 4, 0, 0), 'a team that loses out is better off guaranteed');
  assert.ok(projectDeal(i, 4, 0.75, 0) > projectDeal(g, 4, 0.75, 0), 'a team that wins is better off on incentives');
  assert.equal(termsOf({ ...offer, term: 12 }, 'guaranteed').signing, 200_000, 'a long deal pays up front');
});

const sign = (at: number, o: Partial<Extract<Decision, { kind: 'sponsor' }>> = {}): Decision =>
  ({ at, kind: 'sponsor', slot: 'sideline', brand: 'goal-line-grill', structure: 'balanced', clause: null, term: 2, base: 70_000, win: 20_000, sellout: 10_000, statement: 0, signing: 0, ...o });

test('a deal pays its fee at home, its bonus for a win anywhere, and is seen through after its home games', () => {
  const games = [game(0), game(1), game(2), game(3)]; // home, away, home, away: all wins
  const base = simulate({ games, decisions: [], start: START, now: START + 40 * DAY });
  const s = simulate({ games, decisions: [sign(START + DAY)], start: START, now: START + 40 * DAY });
  // Two home fees and three wins before the second home game ends it (the fourth game is after).
  const paid = s.games.reduce((n, g) => n + (g.revenue.partners ?? 0), 0);
  assert.equal(paid, 70_000 * 2 + 20_000 * 3 + s.games.filter((g, i) => i < 3 && g.home && g.fill >= 0.995).length * 10_000);
  assert.equal(s.deals.length, 0);
  assert.equal(s.pastDeals[0].how, 'completed');
  assert.equal(s.loyalty['goal-line-grill'], 1, 'a deal seen through earns a star');
  assert.ok(s.vc > base.vc, 'and the money is in the bank');
  assert.ok(s.story.some(e => e.kind === 'sponsor' && e.title.startsWith('Signed')));
});

test('a walk-away clause ends the deal after three straight losses', () => {
  const games = [0, 1, 2, 3, 4].map(i => game(i, { points: 80, oppPoints: 120 }));
  const s = simulate({ games, decisions: [sign(START + DAY, { clause: 'walk', term: 12 })], start: START, now: START + 60 * DAY });
  assert.equal(s.pastDeals[0]?.how, 'walked');
  assert.equal(s.pastDeals[0].losses, 3);
  assert.equal(s.loyalty['goal-line-grill'], undefined);
});

test('one deal a slot, a slot has to be built, and a buyout costs half of what is left', () => {
  const games = [game(0)];
  const s = simulate({ games, decisions: [sign(START + DAY, { term: 8 }), sign(START + 2 * DAY, { brand: 'pylon-plumbing' }), sign(START + 2 * DAY, { slot: 'naming', brand: 'first-down-federal' })], start: START, now: START + 3 * DAY });
  assert.deepEqual(s.deals.map(d => d.brand), ['goal-line-grill'], 'the second on the same slot and the one on an unbuilt slot change nothing');
  assert.equal(buyoutCost(s.deals[0]), 70_000 * 8 * 0.5);
  assert.ok(!SLOT.naming.open(s.facilities));
  const out = simulate({ games, decisions: [sign(START + DAY, { term: 8, base: 4_000, signing: 400_000 }), { at: START + 2 * DAY, kind: 'sponsor-end', slot: 'sideline' }], start: START, now: START + 3 * DAY });
  assert.equal(out.deals.length, 0);
  assert.equal(out.pastDeals[0].how, 'bought-out');
  assert.ok(VC_PER_DOLLAR > 0);
});
