/**
 * The fantasy provider layer: `npm test` (Node's own runner, no install).
 *
 * The first block is the promise that matters most: a Sleeper league's
 * requests are exactly what they were before ESPN existed. The rest pins the
 * ESPN translation to Sleeper's shapes, using small ESPN responses written in
 * the shape the live API returns (checked against a public ESPN league).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leagueFetch, espnPathOf } from '../src/lib/providers/leagueFetch.ts';
import { providerOf, espnLeagueKey, parseEspnLeague, espnUserKey, parseEspnUser } from '../src/lib/providers/ids.ts';
import { cleanName, translateBase, translateWeek, translateTransactions, translateTrades, rebuildTrades, weekOf, scoringSettings, teamLogo } from '../src/lib/providers/espn/translate.ts';
import { buildPlayerMap, playerIdFn } from '../src/lib/providers/espn/players.ts';

// ── Sleeper is untouched ─────────────────────────────────────────────────────

test('Sleeper URLs go to fetch exactly as given', async () => {
  const seen: [string, RequestInit | undefined][] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => { seen.push([url, init]); return new Response('[]'); }) as typeof fetch;
  try {
    const urls = [
      'https://api.sleeper.app/v1/league/1180208789911158784',
      'https://api.sleeper.app/v1/league/1180208789911158784/matchups/3',
      'https://api.sleeper.app/v1/league/1180208789911158784/2025/rosters',
      'https://api.sleeper.app/v1/user/869006528394137600/leagues/nfl/2026',
      'https://api.sleeper.app/v1/draft/1180208789911158785/picks',
      'https://api.sleeper.app/v1/players/nfl',
      'https://api.sleeper.app/v1/state/nfl',
      // A Sleeper username that happens to start with "espn-" is still Sleeper's.
      'https://api.sleeper.app/v1/user/espn-fan/leagues/nfl/2026',
    ];
    const init = { next: { revalidate: 3600 } } as RequestInit;
    for (const u of urls) await leagueFetch(u, init);
    assert.deepEqual(seen.map(s => s[0]), urls);
    assert.ok(seen.every(s => s[1] === init), 'options are passed through untouched');
  } finally {
    globalThis.fetch = real;
  }
});

test('only full ESPN ids take the ESPN path', () => {
  assert.equal(espnPathOf('https://api.sleeper.app/v1/league/espn-48153503-2019/users'), 'league/espn-48153503-2019/users');
  assert.equal(espnPathOf('https://api.sleeper.app/v1/draft/espn-48153503-2019/picks'), 'draft/espn-48153503-2019/picks');
  assert.equal(espnPathOf('https://api.sleeper.app/v1/user/espn-48153503-u-189C4665-164F/leagues/nfl/2020'), 'user/espn-48153503-u-189C4665-164F/leagues/nfl/2020');
  assert.equal(espnPathOf('https://api.sleeper.app/v1/league/espn-48153503'), null);
  assert.equal(espnPathOf('https://api.sleeper.app/v1/league/1180208789911158784'), null);
  assert.equal(espnPathOf('https://example.com/v1/league/espn-1-2019'), null);
});

test('ids', () => {
  assert.equal(providerOf('1180208789911158784'), 'sleeper');
  assert.equal(providerOf(espnLeagueKey(48153503, 2019)), 'espn');
  assert.deepEqual(parseEspnLeague('espn-48153503-2019'), { leagueId: '48153503', season: 2019 });
  assert.equal(parseEspnLeague('espn-48153503'), null);
  const u = espnUserKey('42', '{189C4665-164F-447A-AB45-D69C716D8531}');
  assert.equal(u, 'espn-42-u-189C4665-164F-447A-AB45-D69C716D8531');
  assert.deepEqual(parseEspnUser(u), { leagueId: '42', key: '189C4665-164F-447A-AB45-D69C716D8531' });
});

// ── ESPN to Sleeper ──────────────────────────────────────────────────────────

const member = (id: string, first: string, last: string, extra = {}) => ({ id, firstName: first, lastName: last, displayName: `ESPNFAN${id.length}`, ...extra });
const team = (id: number, owner: string, wins: number, pf: number, seed: number, final: number) => ({
  id, name: `Team ${id}`, logo: 'http://g.espncdn.com/logo.svg', owners: [owner], primaryOwner: owner, playoffSeed: seed,
  rankCalculatedFinal: final, waiverRank: id, divisionId: 0,
  record: { overall: { wins, losses: 3 - wins, ties: 0, pointsFor: pf, pointsAgainst: 300 } },
  transactionCounter: { acquisitions: 2, acquisitionBudgetSpent: 10 },
  roster: { entries: [{ playerId: 100 + id, lineupSlotId: 0 }, { playerId: -16000 - id, lineupSlotId: 16 }, { playerId: 200 + id, lineupSlotId: 20 }] },
});
const game = (id: number, period: number, home: number, away: number, winner: string, hp = 0, ap = 0) => ({
  id, matchupPeriodId: period, winner,
  home: { teamId: home, totalPoints: hp, pointsByScoringPeriod: { [period]: hp } },
  away: { teamId: away, totalPoints: ap, pointsByScoringPeriod: { [period]: ap } },
});

const SEASON = {
  id: 77, seasonId: 2025, scoringPeriodId: 3,
  status: { finalScoringPeriod: 3, isExpired: false, previousSeasons: [2023, 2024] },
  settings: {
    name: 'Test League',
    scheduleSettings: { matchupPeriodCount: 1, playoffTeamCount: 4, matchupPeriods: { 1: [1], 2: [2], 3: [3] } },
    rosterSettings: { lineupSlotCounts: { 0: 1, 16: 1, 20: 1 } },
    scoringSettings: { scoringItems: [{ statId: 53, points: 1 }, { statId: 8, points: 1 }, { statId: 3, points: 0.01 }, { statId: 101, points: 6, pointsOverrides: { 16: 6 } }, { statId: 102, points: 6, pointsOverrides: { 16: 6 } }] },
    draftSettings: { type: 'SNAKE', keeperCount: 0, pickOrder: [1, 2, 3, 4] },
    acquisitionSettings: {},
  },
  members: [member('{A}', 'Ann', 'Lee', { isLeagueManager: true }), member('{B}', 'Bo', 'Fox'), member('{C}', '', ''), member('{D}', 'Di', 'Ng')],
  teams: [team(1, '{A}', 3, 400.5, 1, 1), team(2, '{B}', 2, 350, 2, 2), team(3, '{C}', 1, 300.25, 3, 3), team(4, '{D}', 0, 250, 4, 4)],
  schedule: [
    game(1, 1, 1, 2, 'HOME', 120, 100), game(2, 1, 3, 4, 'HOME', 90, 80),
    game(3, 2, 1, 4, 'HOME', 110, 70), game(4, 2, 2, 3, 'HOME', 100, 95),
    game(5, 3, 1, 2, 'HOME', 130, 120), game(6, 3, 4, 3, 'AWAY', 60, 70),
  ],
  draftDetail: { drafted: true, picks: [{ roundId: 1, overallPickNumber: 1, roundPickNumber: 1, teamId: 1, playerId: 101, memberId: '{A}' }] },
};
const pid = (id: number) => (id < 0 ? `DEF${-16000 - id}` : `s${id}`);

test('league: Sleeper fields, season link, one commissioner', () => {
  const b = translateBase(SEASON, pid);
  assert.equal(b.league.league_id, 'espn-77-2025');
  assert.equal(b.league.previous_league_id, 'espn-77-2024');
  assert.equal(b.league.total_rosters, 4);
  assert.deepEqual(b.league.roster_positions, ['QB', 'DEF', 'BN']);
  assert.equal(b.league.settings.playoff_week_start, 2);
  assert.equal(b.league.status, 'complete');
  assert.equal(b.users.filter(u => u.is_owner).length, 1);
  assert.equal(b.users.find(u => u.is_owner)!.display_name, 'Ann L.');
  // No real name: the ESPN handle, not a blank.
  assert.equal(b.users.find(u => u.user_id.endsWith('-u-C'))!.display_name, 'ESPNFAN3');
});

test('a two week round listed out of order still starts at its first week; top-half bonus is a median game', () => {
  const raw = structuredClone(SEASON);
  raw.settings.scheduleSettings.matchupPeriods = { 1: [1], 2: [3, 2] } as any;
  (raw.settings.scoringSettings as any).scoringEnhancementType = 'WIN_BONUS_TOP_HALF';
  const b = translateBase(raw, pid);
  assert.equal(b.league.settings.playoff_week_start, 2);
  assert.equal(b.league.settings.league_average_match, 1);
  assert.equal(translateBase(SEASON, pid).league.settings.league_average_match, 0);
});

test('a manager who switches ESPN accounts is still one manager', () => {
  const next = structuredClone(SEASON);
  next.seasonId = 2026;
  next.members[0] = member('{NEW}', 'Ann', 'Lee');
  next.teams[0] = team(1, '{NEW}', 3, 400, 1, 1);
  const a = translateBase(SEASON, pid), b = translateBase(next, pid);
  assert.equal(a.rosters[0].owner_id, b.rosters[0].owner_id);
  assert.ok(!a.rosters[0].owner_id.toLowerCase().includes('lee'), 'no name in the id');
  // Nameless members keep their ESPN member id.
  assert.equal(a.users.find(u => u.display_name === 'ESPNFAN3')!.user_id, 'espn-77-u-C');
});

test('two accounts with one name: one person unless they run different teams', () => {
  // A second account that co-owns the same team (seen in a real league).
  const coOwn = structuredClone(SEASON);
  coOwn.members.push(member('{A2}', 'Ann', 'Lee'));
  coOwn.teams[0].owners = ['{A}', '{A2}'];
  const b1 = translateBase(coOwn, pid);
  assert.equal(b1.users.filter(u => u.display_name === 'Ann L.').length, 1);
  assert.equal(b1.rosters[0].owner_id, translateBase(SEASON, pid).rosters[0].owner_id);
  assert.deepEqual(b1.rosters[0].co_owners, []);
  // A member with no team and the same name: still the one person.
  const idle = structuredClone(SEASON);
  idle.members.push(member('{A2}', 'Ann', 'Lee'));
  assert.equal(translateBase(idle, pid).users.filter(u => u.display_name === 'Ann L.').length, 1);
  // Two teams: two people.
  const two = structuredClone(idle);
  two.teams[3] = team(4, '{A2}', 0, 250, 4, 4);
  const b2 = translateBase(two, pid);
  assert.notEqual(b2.rosters[0].owner_id, b2.rosters[3].owner_id);
});

test('a season from ESPN\'s history endpoint says what it is missing', () => {
  assert.equal(translateBase(SEASON, pid).league.metadata.coverage, undefined);
  const old = translateBase({ ...SEASON, lpSource: 'history' }, pid).league.metadata.coverage;
  assert.equal(old.lineups, false);
  assert.equal(old.trades, false);
  assert.equal(typeof old.counts.trades, 'number');
});

test('a first season limit cuts the season link', () => {
  assert.equal(translateBase(SEASON, pid, { firstSeason: 2025 }).league.previous_league_id, null);
});

test('rosters: record, points split like Sleeper, final place', () => {
  const b = translateBase(SEASON, pid);
  const r1 = b.rosters.find(r => r.roster_id === 1)!;
  assert.equal(b.users.find(u => u.user_id === r1.owner_id)!.display_name, 'Ann L.');
  assert.deepEqual(r1.starters, ['s101', 'DEF1']);
  assert.deepEqual(r1.players, ['s101', 'DEF1', 's201']);
  assert.equal(r1.settings.fpts, 400);
  assert.equal(r1.settings.fpts_decimal, 50);
  assert.equal(r1.settings.poff, 1);
  assert.equal(r1.settings.rank, 1);
  assert.equal(r1.metadata.logo, 'https://g.espncdn.com/logo.svg');
});

test('brackets follow the seeds when ESPN does not label tiers', () => {
  const b = translateBase(SEASON, pid);
  const final = b.winners_bracket.find(x => x.p === 1);
  assert.equal(final.w, 1);
  assert.equal(final.l, 2);
  assert.equal(b.losers_bracket.length, 1);
});

test('scoring: per-yard conversion, repeated items not double counted', () => {
  const s = scoringSettings(SEASON.settings.scoringSettings.scoringItems);
  assert.equal(s.rec, 1);
  assert.equal(s.pass_yd, 0.05); // 1 per 25 yards plus 0.01 per yard
  assert.equal(s.st_td, 6);
});

test('a week: one row per team, starters in slot order, points from ESPN', () => {
  const b = translateBase(SEASON, pid);
  const raw = {
    schedule: [{
      id: 1, matchupPeriodId: 1,
      home: { teamId: 1, pointsByScoringPeriod: { 1: 21.5 }, rosterForCurrentScoringPeriod: { entries: [
        { playerId: -16001, lineupSlotId: 16, playerPoolEntry: { appliedStatTotal: 9 } },
        { playerId: 101, lineupSlotId: 0, playerPoolEntry: { appliedStatTotal: 12.5 } },
        { playerId: 201, lineupSlotId: 20, playerPoolEntry: { appliedStatTotal: 4 } },
      ] } },
      away: { teamId: 2, pointsByScoringPeriod: { 1: 10 }, rosterForCurrentScoringPeriod: { entries: [] } },
    }],
  };
  const rows = translateWeek(raw, b.ctx, 1, pid);
  assert.equal(rows.length, 4);
  const t1 = rows.find(r => r.roster_id === 1)!;
  assert.equal(t1.matchup_id, 1);
  assert.equal(t1.points, 21.5);
  assert.deepEqual(t1.starters, ['s101', 'DEF1']);
  assert.deepEqual(t1.starters_points, [12.5, 9]);
  assert.equal(t1.players_points.s201, 4);
  assert.equal(rows.find(r => r.roster_id === 2)!.starters[0], '0'); // empty slot, as Sleeper marks it
  assert.equal(rows.find(r => r.roster_id === 3)!.matchup_id, null); // no game in this data
});

test('transactions: completed waivers and free agents only', () => {
  const b = translateBase(SEASON, pid);
  const tx = translateTransactions({ transactions: [
    { id: 'a', type: 'WAIVER', status: 'EXECUTED', teamId: 1, memberId: '{A}', bidAmount: 7, proposedDate: 1, processDate: 2,
      items: [{ type: 'ADD', playerId: 300, toTeamId: 1 }, { type: 'DROP', playerId: 201, fromTeamId: 1 }] },
    { id: 'b', type: 'WAIVER', status: 'CANCELED', teamId: 2, items: [{ type: 'ADD', playerId: 301, toTeamId: 2 }] },
    { id: 'c', type: 'ROSTER', status: 'EXECUTED', teamId: 2, items: [{ type: 'LINEUP', playerId: 1 }] },
  ] }, b.ctx, 2, pid);
  assert.equal(tx.length, 1);
  assert.equal(tx[0].type, 'waiver');
  assert.deepEqual(tx[0].adds, { s300: 1 });
  assert.deepEqual(tx[0].drops, { s201: 1 });
  assert.equal(tx[0].creator, b.rosters.find(r => r.roster_id === 1)!.owner_id);
  assert.equal(tx[0].settings.waiver_bid, 7);
});

test('trades from the activity feed, placed in their week', () => {
  const b = translateBase(SEASON, pid);
  const H = 3600_000;
  const ends = { 1: 10 * H, 2: 200 * H, 3: 400 * H };
  // Monday night of week 1 is still week 1; the Tuesday after is week 2.
  assert.equal(weekOf(10 * H + 2 * H, ends, 9), 1);
  assert.equal(weekOf(30 * H, ends, 9), 2);
  assert.equal(weekOf(900 * H, ends, 9), 3);
  const [t] = translateTrades([{ id: 'x', date: 30 * H, author: '{B}', messages: [
    { messageTypeId: 244, targetId: 101, from: 1, to: 2 },
    { messageTypeId: 244, targetId: 202, from: 2, to: 1 },
    { messageTypeId: 178, targetId: 999, from: null, to: 1 },
  ] }], b.ctx, ends, 1, pid);
  assert.equal(t.type, 'trade');
  assert.equal(t.leg, 2);
  assert.deepEqual(t.adds, { s101: 2, s202: 1 });
  assert.deepEqual(t.drops, { s101: 1, s202: 2 });
  assert.deepEqual(t.roster_ids.sort(), [1, 2]);
  assert.equal(t.creator, b.rosters.find(r => r.roster_id === 2)!.owner_id);
});

test('past trades rebuilt from weekly rosters, checked against ESPN\'s counts', () => {
  const ctx = translateBase(SEASON, pid).ctx;
  const H = 3600_000;
  const trades = rebuildTrades({
    rosters: {
      0: { a: 1, b: 2, j: 3, x: 4 },                 // the draft
      1: { a: 2, b: 1, j: 4, x: 4 },                 // a for b; j dropped by 3, picked up by 2, traded to 4
      2: { a: 2, b: 1, j: 4, x: 1 },                 // x moves 4 to 1 with no pickup: a stray, not a trade
    },
    pickups: { 1: [{ player: 'j', to: 2, at: 5 }], 2: [] },
    tradeCounts: { 1: 1, 2: 2, 4: 1 },
    weekEnds: { 1: 100 * H, 2: 200 * H },
    lastWeek: 2,
    ctx,
  });
  assert.equal(trades.length, 2);
  const [ab, j] = trades;
  assert.deepEqual(ab.roster_ids, [1, 2]);
  assert.deepEqual(ab.adds, { a: 2, b: 1 });
  assert.deepEqual(j.adds, { j: 4 });
  assert.deepEqual(j.drops, { j: 2 }, 'traded by the team that picked him up');
  assert.equal(ab.leg, 1);
  assert.ok(trades.every(t => t.metadata.rebuilt));
});

test('both sides of a trade, even a player who only passed through', () => {
  const ctx = translateBase(SEASON, pid).ctx;
  // As in a real league: team 2 claims h on waivers and trades him to 3 for c, the
  // same week; team 3 trades g to 4 for r, and 3 drops g straight away.
  const trades = rebuildTrades({
    rosters: { 0: { c: 3, r: 4 }, 1: { c: 3, r: 4, g: 3 }, 2: { c: 2, h: 3, r: 3 } },
    pickups: { 2: [{ player: 'h', to: 2, at: 1 }] },
    releases: { 2: [{ player: 'g', from: 4, at: 2 }] },
    tradeCounts: { 2: 1, 3: 2, 4: 1 },
    weekEnds: {}, lastWeek: 2, ctx,
  });
  const byTeams = Object.fromEntries(trades.map(t => [t.roster_ids.join('-'), t]));
  assert.deepEqual(byTeams['2-3'].adds, { c: 2, h: 3 });
  assert.deepEqual(byTeams['3-4'].adds, { r: 3, g: 4 });
});

test('a pickup is never mistaken for a trade', () => {
  const ctx = translateBase(SEASON, pid).ctx;
  const trades = rebuildTrades({
    rosters: { 0: { p: 1 }, 1: { p: 2 } },
    pickups: { 1: [{ player: 'p', to: 2, at: 1 }] },
    tradeCounts: null, weekEnds: {}, lastWeek: 1, ctx,
  });
  assert.equal(trades.length, 0);
});

test('mangled emoji left in ESPN names are dropped', () => {
  // Exactly as ESPN sends one real team's name.
  assert.equal(cleanName('ï¿½ï¿½ï¿½Â\u009fï¿½ï Ocular Patdown'), 'Ocular Patdown');
  assert.equal(cleanName('Naïve Bayes'), 'Naïve Bayes');
  assert.equal(cleanName('Fight Milk FC'), 'Fight Milk FC');
});

test('team logos only from ESPN hosts, always https', () => {
  assert.equal(teamLogo('http://g.espncdn.com/a.svg', '7'), 'https://g.espncdn.com/a.svg');
  assert.equal(teamLogo('https://evil.example.com/a.png', '7'), null);
  assert.equal(teamLogo('https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/876d5580-7794-11f0-949b-6d519c9ebbbd', '7'),
    '/api/league-data/logo/7/876d5580-7794-11f0-949b-6d519c9ebbbd');
  assert.equal(teamLogo('https://mystique-api.fantasy.espn.com/apis/v1/other/thing', '7'), null);
  assert.equal(teamLogo('', '7'), null);
});

test('players: defences by team, Sleeper espn_id, then unique name', () => {
  const sleeper = {
    '4046': { full_name: 'Patrick Mahomes', position: 'QB', team: 'KC', espn_id: 3139477 },
    '9999': { full_name: 'Josh Allen', position: 'QB', team: 'BUF' },
    '9998': { full_name: 'Josh Allen', position: 'LB', team: 'JAX' },
    '7777': { full_name: 'Chris Jones', position: 'DL', team: 'KC' },
    '7776': { full_name: 'Chris Jones', position: 'DL', team: 'FA' },
  };
  const espn = [
    { id: 3139477, fullName: 'Patrick Mahomes', defaultPositionId: 1, proTeamId: 12 },
    { id: 3918298, fullName: 'Josh Allen', defaultPositionId: 1, proTeamId: 2 },
    { id: 2, fullName: 'Chris Jones', defaultPositionId: 9, proTeamId: 0 },
    { id: -16012, fullName: 'Chiefs D/ST', defaultPositionId: 16, proTeamId: 12 },
  ];
  const m = buildPlayerMap(espn, sleeper);
  const id = playerIdFn(m.pairs);
  assert.equal(id(3139477), '4046');
  assert.equal(id(3918298), '9999');
  assert.equal(id(-16012), 'KC');
  assert.equal(id(2), 'espn_2', 'two Chris Joneses at DL and no team to tell them apart: not guessed');
});
