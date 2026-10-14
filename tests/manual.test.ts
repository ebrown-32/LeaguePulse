/** Commissioner-entered data: moves joining a season, and whole entered seasons. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyManual, serveManualSeason, manualManagerId, type ManualData, type ManualSeason } from '../src/lib/manual/model.ts';

const SEASON_2016: ManualSeason = {
  season: 2016, name: 'Woodward Mafia', regularWeeks: 2, playoffTeams: 2, champion: 1, runnerUp: 2, updatedAt: 0,
  teams: [
    { id: 1, managerId: 'espn-1-u-nabc', managerName: 'Eli B.', teamName: 'Fight Milk FC' },
    { id: 2, managerId: null, managerName: 'Pat Q.', teamName: 'Quiet Ones' },
    { id: 3, managerId: null, managerName: 'Sam R.' },
  ],
  games: [
    { week: 1, a: 1, b: 2, aScore: 110.5, bScore: 100 },
    { week: 2, a: 1, b: 3, aScore: 90, bScore: 95.25 },
    { week: 3, a: 1, b: 2, aScore: 120, bScore: 101 },
  ],
};
const DATA: ManualData = {
  seasons: [SEASON_2016],
  moves: [
    { id: 't1', leagueId: 'espn-1-2018', season: '2018', week: 5, type: 'trade', teams: [1, 2], adds: { '4046': 2, '6794': 1 }, drops: { '4046': 1, '6794': 2 }, createdAt: 10 },
    { id: 'p1', leagueId: 'espn-1-2018', season: '2018', week: 0, type: 'free_agent', teams: [3], adds: { '1': 3 }, drops: {}, createdAt: 5 },
  ],
};

test('no entries: every response is untouched', () => {
  const body = [{ x: 1 }];
  assert.equal(applyManual({ moves: [], seasons: [] }, 'league/1/transactions/1', body), body);
  assert.equal(applyManual(null, 'league/1', body), body);
});

test('entered moves join their season and week, marked as entered', () => {
  const week5 = applyManual(DATA, 'league/espn-1-2018/transactions/5', [{ type: 'waiver' }]) as any[];
  assert.equal(week5.length, 2);
  assert.equal(week5[1].type, 'trade');
  assert.deepEqual(week5[1].adds, { '4046': 2, '6794': 1 });
  assert.equal(week5[1].metadata.manual, true);
  // Before week 1 is shown with week 1.
  const week1 = applyManual(DATA, 'league/espn-1-2018/transactions/1', []) as any[];
  assert.equal(week1.length, 1);
  assert.equal(week1[0].leg, 1);
  assert.deepEqual(applyManual(DATA, 'league/espn-1-2019/transactions/5', []), []);
});

test('the earliest real season links back to entered seasons', () => {
  const l = applyManual(DATA, 'league/espn-1-2017', { season: '2017', previous_league_id: null }) as any;
  assert.equal(l.previous_league_id, 'manual-2016');
  const later = { season: '2018', previous_league_id: 'espn-1-2017' };
  assert.equal(applyManual(DATA, 'league/espn-1-2018', later), later);
});

test('an entered season answers like any league', () => {
  const league = serveManualSeason(DATA, 'league/manual-2016')!.body as any;
  assert.equal(league.season, '2016');
  assert.equal(league.settings.playoff_week_start, 3);
  assert.equal(league.metadata.coverage.lineups, false);

  const users = serveManualSeason(DATA, 'league/manual-2016/users')!.body as any[];
  assert.equal(users[0].user_id, 'espn-1-u-nabc', 'an existing manager keeps their id, so records join up');
  assert.equal(users[1].user_id, manualManagerId('Pat Q.'));

  const rosters = serveManualSeason(DATA, 'league/manual-2016/rosters')!.body as any[];
  const one = rosters.find(r => r.roster_id === 1);
  assert.equal(one.settings.wins, 1);
  assert.equal(one.settings.losses, 1);
  assert.equal(one.settings.fpts, 200);
  assert.equal(one.settings.fpts_decimal, 50);
  assert.equal(one.settings.poff, 1, 'the champion');

  const w3 = serveManualSeason(DATA, 'league/manual-2016/matchups/3')!.body as any[];
  assert.equal(w3.find(r => r.roster_id === 1).points, 120);
  assert.equal(w3.find(r => r.roster_id === 3).matchup_id, null);

  const bracket = serveManualSeason(DATA, 'league/manual-2016/winners_bracket')!.body as any[];
  assert.deepEqual([bracket[0].w, bracket[0].p], [1, 1]);
  assert.equal(serveManualSeason(DATA, 'league/manual-2015')!.status, 404);
  assert.equal(serveManualSeason(DATA, 'league/espn-1-2016'), undefined);
});
