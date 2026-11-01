import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWrapped, type WrapInput } from '../src/lib/wrapped/engine.ts';

// A four-team league, two regular weeks and a final, one roster each of QB, RB and a FLEX.
const S = 's1';
const team = (rid: number, owner: string, w: number, l: number, pf: number, rank: number | null) =>
  ({ season_id: S, roster_id: rid, owner_id: owner, team_name: `Team ${owner}`, avatar: null, wins: w, losses: l, ties: 0, points_for: pf, final_rank: rank });
const m = (week: number, rid: number, mid: number, pts: number, starters: string[], players: string[], pp: Record<string, number>) =>
  ({ season_id: S, week, roster_id: rid, matchup_id: mid, points: pts, starters, players, players_points: pp });

const input: WrapInput = {
  seasons: [{ season_id: S, season: 2025, settings: { playoff_week_start: 3 }, roster_positions: ['QB', 'RB', 'FLEX', 'BN'], final: true }],
  managers: [{ user_id: 'a', display_name: 'Ann' }, { user_id: 'b', display_name: 'Bo' }, { user_id: 'c', display_name: 'Cy' }, { user_id: 'd', display_name: 'Di' }],
  teams: [team(1, 'a', 2, 0, 230, 1), team(2, 'b', 0, 2, 150, 2), team(3, 'c', 1, 1, 190, 3), team(4, 'd', 1, 1, 170, 4)],
  matchups: [
    // Week 1: Ann 120 beats Bo 60; Cy 100 beats Di 90. Ann benched her RB2 (30) for a 10-point flex.
    m(1, 1, 1, 120, ['aq', 'ar', 'af'], ['aq', 'ar', 'af', 'ab'], { aq: 60, ar: 50, af: 10, ab: 30 }),
    m(1, 2, 1, 60, ['bq', 'br', 'bf'], ['bq', 'br', 'bf'], { bq: 20, br: 20, bf: 20 }),
    m(1, 3, 2, 100, ['cq', 'cr', 'cf'], ['cq', 'cr', 'cf'], { cq: 40, cr: 30, cf: 30 }),
    m(1, 4, 2, 90, ['dq', 'dr', 'df'], ['dq', 'dr', 'df'], { dq: 30, dr: 30, df: 30 }),
    // Week 2: Ann 110 beats Cy 109.5 (a close one); Di 80 beats Bo 30.
    m(2, 1, 1, 110, ['aq', 'ar', 'ab'], ['aq', 'ar', 'af', 'ab'], { aq: 50, ar: 30, ab: 30, af: 0 }),
    m(2, 3, 1, 109.5, ['cq', 'cr', 'cf'], ['cq', 'cr', 'cf'], { cq: 50, cr: 30, cf: 29.5 }),
    m(2, 4, 2, 80, ['dq', 'dr', 'df'], ['dq', 'dr', 'df'], { dq: 30, dr: 30, df: 20 }),
    m(2, 2, 2, 30, ['bq', 'br', 'bf'], ['bq', 'br', 'bf'], { bq: 10, br: 10, bf: 10 }),
  ],
  transactions: [
    { season_id: S, week: 1, type: 'trade', status: 'complete', roster_ids: [1, 2], adds: { ab: 1, xb: 2 }, drops: { ab: 2, xb: 1 }, faab_bid: null },
    { season_id: S, week: 1, type: 'waiver', status: 'complete', roster_ids: [4], adds: { df: 4 }, drops: null, faab_bid: 7 },
  ],
  picks: [{ season_id: S, round: 1, pick_no: 1, roster_id: 1, player_id: 'aq' }, { season_id: S, round: 6, pick_no: 22, roster_id: 1, player_id: 'ar' }],
  players: [
    ...['aq', 'bq', 'cq', 'dq'].map(id => ({ player_id: id, full_name: id.toUpperCase(), position: 'QB', team: 'KC' })),
    ...['ar', 'br', 'cr', 'dr', 'ab', 'xb'].map(id => ({ player_id: id, full_name: id.toUpperCase(), position: 'RB', team: 'KC' })),
    ...['af', 'bf', 'cf', 'df'].map(id => ({ player_id: id, full_name: id.toUpperCase(), position: 'WR', team: 'KC' })),
  ],
};

const w = computeWrapped(input, 2025);
const ann = w.managers.find(x => x.ownerId === 'a')!;
const bo = w.managers.find(x => x.ownerId === 'b')!;

test('the season: record, finish, points and the champion', () => {
  assert.deepEqual(ann.record, { w: 2, l: 0, t: 0 });
  assert.equal(ann.finish, 1);
  assert.equal(ann.pfRank, 1);
  assert.equal(w.league.champions[0].name, 'Ann');
  assert.equal(ann.archetype.title, 'The Champion');
});

test('best, worst and heartbreak games', () => {
  assert.equal(ann.best!.pts, 120);
  assert.equal(ann.worst!.pts, 110);
  const cy = w.managers.find(x => x.ownerId === 'c')!;
  assert.equal(cy.closestLoss!.margin, 0.5);
  assert.equal(cy.closestLoss!.oppName, 'Ann');
  assert.equal(w.league.closest!.margin, 0.5);
  assert.equal(w.league.blowout!.margin, 60);
});

test('luck is wins against what all-play expected', () => {
  // Bo scored lowest both weeks: no all-play wins, no real wins.
  assert.equal(bo.luck!.expected, 0);
  assert.equal(bo.luck!.delta, 0);
  assert.equal(ann.luck!.allPlayW, 6);
});

test('the bench: efficiency, and the worst benching', () => {
  // Week 1: best lineup 60 + 50 + 30 = 140 against 120 started.
  assert.equal(ann.bench!.worst!.week, 1);
  assert.equal(ann.bench!.worst!.benched.id, 'ab');
  assert.ok(ann.bench!.efficiency < 100 && ann.bench!.efficiency > 85);
});

test('MVP, draft steal and the best pickup', () => {
  assert.equal(ann.mvp!.player.id, 'aq');
  assert.equal(ann.mvp!.pts, 110);
  assert.equal(ann.steal!.player.id, 'ar');
  assert.equal(w.managers.find(x => x.ownerId === 'd')!.pickup!.player.id, 'df');
  assert.equal(w.managers.find(x => x.ownerId === 'd')!.pickup!.bid, 7);
});

test('a trade is judged by what each side scored afterwards', () => {
  // Ann got ab (30 started in week 2); Bo got xb, who never started.
  assert.equal(ann.bestTrade!.got[0].id, 'ab');
  assert.equal(ann.bestTrade!.net, 30);
  assert.equal(ann.moves.trades, 1);
  assert.equal(w.league.tradeOfTheYear!.name, 'Ann');
});

test('all-time covers every season, and a missing season is simply absent', () => {
  const all = computeWrapped(input, null);
  assert.equal(all.scope, 'all');
  assert.equal(all.managers.find(x => x.ownerId === 'a')!.titles, 1);
  assert.equal(computeWrapped(input, 1999).managers.length, 0);
});

test('a benching is only a swap that was on the table: a running back never takes the defense’s spot', () => {
  const S2 = 's2';
  const one: WrapInput = {
    seasons: [{ season_id: S2, season: 2024, settings: { playoff_week_start: 15 }, roster_positions: ['RB', 'FLEX', 'DEF', 'BN', 'BN'], final: true }],
    managers: [{ user_id: 'a', display_name: 'Ann' }, { user_id: 'b', display_name: 'Bo' }],
    teams: [
      { season_id: S2, roster_id: 1, owner_id: 'a', team_name: 'A', avatar: null, wins: 1, losses: 0, ties: 0, points_for: 40, final_rank: null },
      { season_id: S2, roster_id: 2, owner_id: 'b', team_name: 'B', avatar: null, wins: 0, losses: 1, ties: 0, points_for: 30, final_rank: null },
    ],
    matchups: [
      // Ann starts rb1 (20), wr (15) at FLEX and the BAL defense (1). Pollard (25) sits on the bench.
      { season_id: S2, week: 1, roster_id: 1, matchup_id: 1, points: 36, starters: ['rb1', 'wr', 'BAL'], players: ['rb1', 'wr', 'BAL', 'pollard'], players_points: { rb1: 20, wr: 15, BAL: 1, pollard: 25 } },
      { season_id: S2, week: 1, roster_id: 2, matchup_id: 1, points: 30, starters: ['x', 'y', 'NYG'], players: ['x', 'y', 'NYG'], players_points: { x: 10, y: 10, NYG: 10 } },
    ],
    transactions: [], picks: [],
    players: [
      { player_id: 'rb1', full_name: 'Back One', position: 'RB', team: 'X' },
      { player_id: 'pollard', full_name: 'Tony Pollard', position: 'RB', team: 'TEN' },
      { player_id: 'wr', full_name: 'Wide Out', position: 'WR', team: 'X' },
      { player_id: 'BAL', full_name: 'Baltimore Ravens', position: 'DEF', team: 'BAL' },
    ],
  };
  const worst = computeWrapped(one, 2024).managers.find(m => m.ownerId === 'a')!.bench!.worst!;
  assert.equal(worst.benched.id, 'pollard');
  // The swap that was possible: Pollard for the FLEX receiver (15), not for the defense (1).
  assert.equal(worst.started.id, 'wr');
  assert.equal(worst.startedPts, 15);
});

test('a box score: both lineups, slot by slot, winner first', () => {
  const b = w.league.blowout!.box!;
  assert.equal(b.winner.name, 'Ann');
  assert.equal(b.loser.name, 'Bo');
  assert.deepEqual(b.winner.lineup.map(x => x.slot), ['QB', 'RB', 'FLEX']);
  assert.deepEqual(b.winner.lineup.map(x => [x.player?.id, x.pts]), [['aq', 60], ['ar', 50], ['af', 10]]);
  assert.equal(b.winner.pts - b.loser.pts, 60);
});
