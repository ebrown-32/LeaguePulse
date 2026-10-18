import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseHost, coinFlip, gameDay, recordAt, type HostInput, type TeamGame } from '../src/lib/franchise/venue.ts';

const g = (season: string, week: number, score: number, opponentScore: number, stage: TeamGame['stage'] = 'regular'): TeamGame => ({ season, week, score, opponentScore, stage });
const input = (o: Partial<HostInput> & { games?: Record<string, TeamGame[]> } = {}): HostInput => ({
  a: 'alice', b: 'bob', season: '2026', week: 8, playoff: false, meetings: [],
  gamesOf: id => o.games?.[id] ?? [], ...o,
});

test('ESPN’s own home team stands', () => {
  assert.deepEqual(chooseHost(input({ providerHome: 'bob' })), { host: 'bob', guest: 'alice', reason: 'espn' });
});

test('a first meeting is a coin flip: random, but the same for the pair every time, in either order', () => {
  const first = coinFlip('alice', 'bob');
  assert.ok(first === 'alice' || first === 'bob');
  assert.equal(coinFlip('bob', 'alice'), first);
  // Records don't decide it.
  const games = { alice: [g('2026', 1, 100, 90), g('2026', 2, 80, 120)], bob: [g('2026', 1, 110, 90), g('2026', 2, 130, 100)] };
  assert.equal(chooseHost(input({ games })).host, first);
  assert.equal(chooseHost(input({ games })).reason, 'first-meeting');
  // Across many pairs, both sides win the flip.
  const hosts = Array.from({ length: 200 }, (_, i) => coinFlip(`a${i}`, `b${i}`).startsWith('a'));
  const share = hosts.filter(Boolean).length / hosts.length;
  assert.ok(share > 0.35 && share < 0.65, `first team hosted ${share}`);
});

test('regular-season meetings alternate from the coin flip, home and home', () => {
  const first = coinFlip('alice', 'bob'), other = first === 'alice' ? 'bob' : 'alice';
  const one = [{ season: '2025', week: 3, stage: 'regular' as const }];
  assert.equal(chooseHost(input({ meetings: one })).host, other);
  const two = [...one, { season: '2025', week: 11, stage: 'regular' as const }];
  assert.equal(chooseHost(input({ meetings: two })).host, first);
  // Playoff meetings and this week's game don't count towards the alternation.
  const extra = [...two, { season: '2025', week: 15, stage: 'playoff' as const }, { season: '2026', week: 8, stage: 'regular' as const }];
  assert.equal(chooseHost(input({ meetings: extra })).host, first);
});

test('in the playoffs the higher seed hosts', () => {
  const games = { alice: [g('2026', 1, 100, 90), g('2026', 2, 100, 90), g('2026', 15, 50, 200, 'playoff')], bob: [g('2026', 1, 100, 90), g('2026', 2, 80, 90)] };
  assert.deepEqual(chooseHost(input({ games, playoff: true, week: 16 })), { host: 'alice', guest: 'bob', reason: 'seed' });
  // Playoff results never change a seed.
  assert.deepEqual(recordAt(games.alice, '2026', 99), { wins: 2, losses: 0, ties: 0, pointsFor: 200 });
});

test('a tie on everything still has a host, the same every time', () => {
  assert.equal(chooseHost(input()).host, chooseHost(input()).host);
});

test('game day: lots first, then the stands, to the real crowd', () => {
  const k = Date.UTC(2026, 9, 22, 0, 15), at = (h: number) => k - h * 3_600_000;
  const days = gameDay(at(100), k, 'upcoming', 0.86), eve = gameDay(at(30), k, 'upcoming', 0.86);
  const morning = gameDay(at(5), k, 'upcoming', 0.86), gates = gameDay(at(2), k, 'upcoming', 0.86), kick = gameDay(at(0.01), k, 'upcoming', 0.86);
  assert.equal(days.stands, 0); assert.equal(days.stage, 'quiet');
  assert.ok(eve.lots > days.lots && eve.stands === 0);
  assert.equal(morning.stage, 'tailgating'); assert.ok(morning.lots > 0.5 && morning.stands === 0);
  assert.equal(gates.stage, 'gates'); assert.ok(gates.stands > 0 && gates.stands < 0.86 * 0.3 + 1e-9);
  assert.ok(kick.stands > 0.85 && kick.stands <= 0.86);
  assert.deepEqual(gameDay(at(-1), k, 'upcoming', 0.86).stands, 0.86);
  assert.equal(gameDay(at(-30), k, 'live', 0.86).stage, 'live');
  assert.ok(gameDay(at(-90), k, 'final', 0.86).stands < 0.1);
  // It only ever fills as kickoff nears.
  let last = -1;
  for (let h = 120; h >= 0; h -= 0.25) { const d = gameDay(at(h), k, 'upcoming', 0.9); assert.ok(d.stands + d.lots >= last - 1e-9); last = d.stands + d.lots; }
});

test('the week’s first kickoff, in New York time', async () => {
  const { firstKickoff } = await import('../src/lib/franchise/venue.ts');
  // Thursday 22 October 2026, 8:15 pm EDT is 00:15 UTC the next day.
  assert.equal(new Date(firstKickoff(['2026-10-25', '2026-10-22', '2026-10-26'])!).toISOString(), '2026-10-23T00:15:00.000Z');
  // Sunday 8 November 2026, after the clocks change: 1:00 pm EST is 18:00 UTC.
  assert.equal(new Date(firstKickoff(['2026-11-08'])!).toISOString(), '2026-11-08T18:00:00.000Z');
  assert.equal(firstKickoff([]), null);
});
