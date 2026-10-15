import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, playerIds, providerOf, seasonRows, type SeasonData } from '../src/lib/archive/normalize.ts';

const col = <K extends keyof typeof COLUMNS>(table: K, row: unknown[], name: (typeof COLUMNS)[K][number]) =>
  row[(COLUMNS[table] as readonly string[]).indexOf(name)];

const SEASON: SeasonData = {
  league: { league_id: 'L1', season: '2024', name: 'Test League', status: 'complete', total_rosters: 2, previous_league_id: 'L0', settings: { playoff_week_start: 15 }, scoring_settings: { rec: 1 }, roster_positions: ['QB', 'BN'] },
  users: [{ user_id: 'u1', display_name: 'Ann', avatar: 'abc', metadata: { team_name: 'Ann Team' } }, { user_id: 'u2', display_name: 'Bo' }],
  rosters: [
    { roster_id: 1, owner_id: 'u1', settings: { wins: 10, losses: 4, ties: 0, fpts: 1500, fpts_decimal: 25, fpts_against: 1400, fpts_against_decimal: 5 } },
    { roster_id: 2, owner_id: 'u2', settings: { wins: 4, losses: 10, ties: 0, fpts: 1300, fpts_decimal: 0 } },
  ],
  weeks: { 1: [{ roster_id: 1, matchup_id: 1, points: 120.5, starters: ['p1'], players: ['p1', 'p2'] }, { roster_id: 2, matchup_id: 1, points: 99, starters: ['p3'], players: ['p3'] }] },
  transactions: [
    { transaction_id: 't1', type: 'trade', status: 'complete', leg: 3, created: 1700000000000, roster_ids: [1, 2], adds: { p2: 1, p3: 2 }, drops: { p2: 2, p3: 1 } },
    { transaction_id: 't1', type: 'trade', status: 'complete', leg: 3 },
    { transaction_id: 'manual-x', type: 'free_agent', status: 'complete', leg: 4, adds: { p9: 1 } },
  ],
  drafts: [{ draft_id: 'd1', type: 'snake', status: 'complete', settings: { rounds: 1 } }],
  picks: { d1: [{ pick_no: 1, round: 1, draft_slot: 1, roster_id: 1, player_id: 'p1', picked_by: 'u1', metadata: { first_name: 'Josh', last_name: 'Allen', position: 'QB', team: 'BUF' } }] },
};

test('provider comes from the season id', () => {
  assert.equal(providerOf('1180208789911158784'), 'sleeper');
  assert.equal(providerOf('espn-1252101-2024'), 'espn');
  assert.equal(providerOf('manual-2012'), 'manual');
});

test('a season becomes one row per table entry, tagged with its site', () => {
  const r = seasonRows('woodward', 'L1', SEASON, new Date(0));
  assert.equal(r.seasons.length, 1);
  assert.equal(col('seasons', r.seasons[0], 'final'), true);
  assert.equal(col('seasons', r.seasons[0], 'season'), 2024);
  assert.ok([...r.teams, ...r.matchups, ...r.transactions, ...r.draft_picks].every(row => row[0] === 'woodward'));
});

test('points join Sleeper\'s whole and hundredths parts', () => {
  const [ann, bo] = seasonRows('s', 'L1', SEASON).teams;
  assert.equal(col('teams', ann, 'points_for'), 1500.25);
  assert.equal(col('teams', ann, 'points_against'), 1400.05);
  assert.equal(col('teams', bo, 'points_against'), 0);
  assert.equal(col('teams', ann, 'team_name'), 'Ann Team');
});

test('a transaction listed twice is kept once, and hand-entered ones are marked', () => {
  const t = seasonRows('s', 'L1', SEASON).transactions;
  assert.equal(t.length, 2);
  assert.equal(col('transactions', t[0], 'source'), 'provider');
  assert.equal(col('transactions', t[1], 'source'), 'manual');
  assert.deepEqual(col('transactions', t[0], 'created_at'), new Date(1700000000000));
});

test('draft picks keep the player\'s name', () => {
  const [p] = seasonRows('s', 'L1', SEASON).draft_picks;
  assert.equal(col('draft_picks', p, 'player_name'), 'Josh Allen');
  assert.equal(col('draft_picks', p, 'nfl_team'), 'BUF');
});

test('every player mentioned is collected for the players table', () => {
  assert.deepEqual([...playerIds(seasonRows('s', 'L1', SEASON))].sort(), ['p1', 'p2', 'p3', 'p9']);
});

test('rows line up with their columns', () => {
  const r = seasonRows('s', 'L1', SEASON);
  for (const table of Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]) {
    for (const row of r[table]) assert.equal(row.length, COLUMNS[table].length, table);
  }
});

import { buildTables, toCsv, toRecords, type ArchiveRows } from '../src/lib/archive/tables.ts';

const ROWS: ArchiveRows = {
  seasons: [{ season_id: 'L1', season: 2024, name: 'Test League', settings: { playoff_week_start: 2 } }],
  managers: [{ user_id: 'u1', display_name: 'Ann' }, { user_id: 'u2', display_name: 'Bo' }],
  teams: [
    { season_id: 'L1', roster_id: 1, owner_id: 'u1', team_name: 'Ann Team', wins: 1, losses: 1, ties: 0, points_for: '220.10', points_against: '200' },
    { season_id: 'L1', roster_id: 2, owner_id: 'u2', team_name: null, wins: 1, losses: 1, ties: 0, points_for: '200', points_against: '220.10' },
  ],
  matchups: [
    { season_id: 'L1', week: 1, roster_id: 1, matchup_id: 1, points: '120.1', starters: ['p1'], players: ['p1', 'p2'], players_points: { p1: 31.200000000000003, p2: 0 } },
    { season_id: 'L1', week: 1, roster_id: 2, matchup_id: 1, points: '100', starters: ['p3'], players: ['p3'], players_points: { p3: 100 } },
    { season_id: 'L1', week: 2, roster_id: 1, matchup_id: 1, points: '100', starters: [], players: [], players_points: {} },
    { season_id: 'L1', week: 2, roster_id: 2, matchup_id: 1, points: '100', starters: [], players: [], players_points: {} },
  ],
  transactions: [{ season_id: 'L1', week: 1, type: 'trade', status: 'complete', created_at: '2024-09-10T12:00:00Z', roster_ids: [1, 2],
    adds: { p2: 1, p3: 2 }, drops: { p2: 2, p3: 1, p4: 1 }, draft_picks: null, faab_bid: null, source: 'provider' }],
  draft_picks: [{ season_id: 'L1', round: 1, pick_no: 1, roster_id: 1, picked_by: 'u1', player_id: 'p1', player_name: 'Josh Allen', position: 'QB', nfl_team: 'BUF', is_keeper: false, amount: null }],
  players: [{ player_id: 'p1', full_name: 'Josh Allen', position: 'QB', team: 'BUF' }, { player_id: 'p2', full_name: 'Joe "Jet" Smith', position: 'WR', team: 'NYJ' }, { player_id: 'p3', full_name: 'Bo Nix', position: 'QB', team: 'DEN' }],
};

const table = (name: string) => buildTables(ROWS).find(t => t.name === name)!;

test('each game is listed once, with both teams and the winner', () => {
  const g = table('games');
  assert.equal(g.rows.length, 2); // two weeks, one game each: not one row per team
  assert.deepEqual(g.rows[0], [2024, 1, 'Regular season', 'Ann Team', 'Ann', 120.1, 'Bo', 'Bo', 100, 'Ann Team']);
  assert.equal(g.rows[1][2], 'Postseason');
  assert.equal(g.rows[1][9], 'Tie');
});

test('a team with no opponent that week played no game', () => {
  const solo = { ...ROWS, matchups: [...ROWS.matchups, { season_id: 'L1', week: 3, roster_id: 1, matchup_id: null, points: '90', starters: [], players: [], players_points: {} }] };
  assert.equal(buildTables(solo, ['games'])[0].rows.length, 2);
});

test('a team without a name goes by its manager', () => {
  assert.equal(table('standings').rows[1][1], 'Bo');
});

test('lineup points are rounded and starters marked', () => {
  const [first] = table('lineups').rows;
  assert.deepEqual(first, [2024, 1, 'Ann Team', 'Josh Allen', 'QB', 'BUF', 'Starter', 31.2]);
});

test('a trade lists who went where, and only real releases as dropped', () => {
  const [t] = table('transactions').rows;
  assert.equal(t[3], 'Trade');
  assert.equal(t[6], 'Joe "Jet" Smith to Ann Team; Bo Nix to Bo');
  assert.equal(t[7], 'p4 from Ann Team');
});

test('only the asked-for tables are built', () => {
  assert.deepEqual(buildTables(ROWS, ['draft']).map(t => t.name), ['draft']);
});

test('CSV quotes what needs quoting, JSON keys rows by column', () => {
  const csv = toCsv(table('lineups'));
  assert.ok(csv.startsWith('﻿Season,Week'));
  assert.ok(csv.includes('"Joe ""Jet"" Smith"'));
  assert.equal(toRecords(table('draft'))[0].Player, 'Josh Allen');
});

import { planWeeks, sleeperCalls, MAX_WEEK } from '../src/lib/archive/plan.ts';

test('a season never archived is read whole; a finished one settles whole', () => {
  assert.deepEqual(planWeeks({ final: true, season: 2024, nflSeason: 2026, nflWeek: 6, settled: 0 }), { weeks: Array.from({ length: MAX_WEEK }, (_, i) => i + 1), settleTo: MAX_WEEK });
  assert.equal(planWeeks({ final: true, season: 2024, nflSeason: 2026, nflWeek: 6, settled: MAX_WEEK }).weeks.length, 0);
});

test('mid-season, only the weeks that can still change are read', () => {
  // Week 6: weeks 1 to 4 have had their corrections; 5 and 6 are still read.
  const first = planWeeks({ final: false, season: 2026, nflSeason: 2026, nflWeek: 6, settled: 0 });
  assert.deepEqual(first, { weeks: [1, 2, 3, 4, 5, 6], settleTo: 4 });
  assert.deepEqual(planWeeks({ final: false, season: 2026, nflSeason: 2026, nflWeek: 6, settled: 4 }), { weeks: [5, 6], settleTo: 4 });
  assert.deepEqual(planWeeks({ final: false, season: 2026, nflSeason: 2026, nflWeek: 7, settled: 4 }), { weeks: [5, 6, 7], settleTo: 5 });
});

test('a season left unfinished in an earlier year is read and settled whole', () => {
  assert.equal(planWeeks({ final: false, season: 2025, nflSeason: 2026, nflWeek: 3, settled: 10 }).settleTo, MAX_WEEK);
});

test('next season’s league reads no weeks before it starts', () => {
  assert.deepEqual(planWeeks({ final: false, season: 2027, nflSeason: 2026, nflWeek: 6, settled: 0 }).weeks, []);
});

test('a mid-season update costs a handful of Sleeper calls', () => {
  assert.equal(sleeperCalls(2, 0), 8);
});

import { finalRanks } from '../src/lib/archive/normalize.ts';

test('final places come from the bracket’s placement games', () => {
  const ranks = finalRanks([
    { r: 1, m: 1, t1: 1, t2: 8, w: 1, l: 8 },          // a quarterfinal: no place
    { r: 3, m: 6, t1: 1, t2: 4, w: 4, l: 1, p: 1 },    // the final
    { r: 3, m: 7, t1: 2, t2: 3, w: 3, l: 2, p: 3 },    // third place
    { r: 3, m: 8, t1: 5, t2: 6, w: null, l: null, p: 5 }, // not played yet
  ]);
  assert.deepEqual([...ranks.entries()].sort((a, b) => a[1] - b[1]), [[4, 1], [1, 2], [3, 3], [2, 4]]);
  assert.equal(finalRanks(undefined).size, 0);
});

test('the champion’s team row carries rank 1', () => {
  const r = seasonRows('s', 'L1', { ...SEASON, winnersBracket: [{ p: 1, t1: 1, t2: 2, w: 2, l: 1 }] });
  assert.equal(col('teams', r.teams[1], 'final_rank'), 1);
  assert.equal(col('teams', r.teams[0], 'final_rank'), 2);
});

test('avatars: a Sleeper id becomes its address, an address is kept as it is', () => {
  const rows = seasonRows('s', 'L1', { ...SEASON, users: [
    { user_id: 'u1', display_name: 'Ann', avatar: 'abc123' },
    { user_id: 'u2', display_name: 'Bo', metadata: { avatar: '/api/league-data/logo/1/x' } },
  ] });
  assert.equal(col('teams', rows.teams[0], 'avatar'), 'https://sleepercdn.com/avatars/abc123');
  assert.equal(col('teams', rows.teams[1], 'avatar'), '/api/league-data/logo/1/x');
});
