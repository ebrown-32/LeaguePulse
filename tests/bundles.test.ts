/**
 * Season bundles: which requests they answer, when a season counts as
 * finished, and that leagueFetch answers from a bundle without touching the
 * network while everything else goes out exactly as before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleRefOf, leagueKeys, seasonFinal, lookup, type SeasonBundle } from '../src/lib/bundles/paths.ts';
import { leagueFetch } from '../src/lib/providers/leagueFetch.ts';

const V1 = 'https://api.sleeper.app/v1';
const SLEEPER = '1180208789911158784';

test('requests a bundle answers', () => {
  assert.deepEqual(bundleRefOf(`${V1}/league/${SLEEPER}`), { kind: 'league', id: SLEEPER, key: '' });
  assert.deepEqual(bundleRefOf(`${V1}/league/${SLEEPER}/users`), { kind: 'league', id: SLEEPER, key: 'users' });
  assert.deepEqual(bundleRefOf(`${V1}/league/${SLEEPER}/2024/rosters`), { kind: 'league', id: SLEEPER, key: 'rosters' });
  assert.deepEqual(bundleRefOf(`${V1}/league/${SLEEPER}/matchups/03`), { kind: 'league', id: SLEEPER, key: 'matchups/3' });
  assert.deepEqual(bundleRefOf(`${V1}/league/espn-1252101-2019/transactions/12`), { kind: 'league', id: 'espn-1252101-2019', key: 'transactions/12' });
  assert.deepEqual(bundleRefOf(`${V1}/draft/${SLEEPER}/picks`), { kind: 'draft', id: SLEEPER, key: 'picks' });
});

test('requests a bundle leaves alone', () => {
  for (const u of [
    `${V1}/players/nfl`, `${V1}/state/nfl`, `${V1}/user/123/leagues/nfl/2025`,
    `${V1}/league/${SLEEPER}/matchups/3?x=1`, `${V1}/league/${SLEEPER}/playoffs`, 'https://example.com/v1/league/1180208789911158784',
  ]) assert.equal(bundleRefOf(u), null, u);
});

test('a bundle covers every week of a season', () => {
  const keys = leagueKeys();
  assert.ok(keys.includes('matchups/18') && keys.includes('transactions/1') && keys.includes('drafts'));
});

test('a season is final from the March after it', () => {
  const at = (y: number, m: number) => new Date(y, m, 15);
  assert.equal(seasonFinal(2025, at(2026, 0)), false); // January: playoffs
  assert.equal(seasonFinal(2025, at(2026, 1)), false); // February: Super Bowl, corrections
  assert.equal(seasonFinal(2025, at(2026, 2)), true);
  assert.equal(seasonFinal(2026, at(2026, 9)), false); // the season being played
  assert.equal(seasonFinal(2019, at(2026, 9)), true);
});

const BUNDLE: SeasonBundle = {
  v: 5, leagueId: SLEEPER, season: 2024, builtAt: 0,
  league: {
    '': { status: 200, body: { league_id: SLEEPER, season: '2024' } },
    'matchups/3': { status: 200, body: [{ roster_id: 1, points: 101.5 }] },
    'winners_bracket': { status: 404, body: null },
  },
  drafts: { '1180208789911158785': { picks: { status: 200, body: [{ pick_no: 1 }] } } },
};

test('leagueFetch answers a finished season from its bundle, without the network', async () => {
  const real = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (u: string) => { seen.push(u); return new Response('"live"'); }) as typeof fetch;
  globalThis.__lpBundleLookup = async ref => {
    if (ref.kind === 'league' && ref.id === SLEEPER) return lookup(BUNDLE, ref);
    if (ref.kind === 'draft' && ref.id === '1180208789911158785') return BUNDLE.drafts['1180208789911158785'][ref.key];
    return undefined;
  };
  try {
    const m = await leagueFetch(`${V1}/league/${SLEEPER}/matchups/3`);
    assert.deepEqual(await m.json(), [{ roster_id: 1, points: 101.5 }]);
    const missing = await leagueFetch(`${V1}/league/${SLEEPER}/winners_bracket`);
    assert.equal(missing.status, 404, 'a recorded 404 stays a 404');
    assert.deepEqual(await (await leagueFetch(`${V1}/draft/1180208789911158785/picks`)).json(), [{ pick_no: 1 }]);
    assert.deepEqual(seen, [], 'nothing went to the network');

    // Not in the bundle (a live season, or anything bundles do not cover): straight through.
    await leagueFetch(`${V1}/league/2222222222222222222/matchups/3`);
    await leagueFetch(`${V1}/players/nfl`);
    assert.deepEqual(seen, [`${V1}/league/2222222222222222222/matchups/3`, `${V1}/players/nfl`]);
  } finally {
    globalThis.fetch = real;
    globalThis.__lpBundleLookup = undefined;
  }
});

test('the kill switch turns bundles off', async () => {
  const real = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (u: string) => { seen.push(u); return new Response('[]'); }) as typeof fetch;
  globalThis.__lpBundleLookup = async ref => lookup(BUNDLE, ref);
  process.env.NEXT_PUBLIC_LP_BUNDLES = '0';
  try {
    await leagueFetch(`${V1}/league/${SLEEPER}/matchups/3`);
    assert.deepEqual(seen, [`${V1}/league/${SLEEPER}/matchups/3`]);
  } finally {
    globalThis.fetch = real;
    globalThis.__lpBundleLookup = undefined;
    delete process.env.NEXT_PUBLIC_LP_BUNDLES;
  }
});
