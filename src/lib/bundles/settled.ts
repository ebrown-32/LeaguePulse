/**
 * Settled weeks of the season being played, recorded once.
 *
 * A finished season is kept whole as a bundle (store.ts). The current season
 * was read live, every week of it, on every request, though most of its
 * weeks cannot change any more either: two NFL weeks after a week is played
 * its scores have had their stat corrections and its moves are done (the
 * archive uses the same rule, see src/lib/archive/plan.ts). By week ten that
 * is sixteen of every twenty week requests a server page makes to Sleeper.
 *
 * So a settled week's matchups and transactions are recorded the first time
 * they are asked for, exactly as Sleeper answered, and served from then on:
 * in memory, then Redis (under the league's prefix, kept 200 days, by when
 * the season is a bundle). A week that has not settled is always read live.
 *
 * Server only, Sleeper leagues only (the ESPN adapter keeps its own copies).
 * Reached through store.ts's lookup.
 */

import { getRedis } from '@/lib/redisClient';
import { settledWeek } from '@/lib/archive/plan';
import { rawLeagueFetch } from '@/lib/providers/leagueFetch';
import type { BundleRef, Recorded } from './paths';

const V = 1;
const KEY = (leagueId: string, key: string) => `league_week_v${V}:${leagueId}:${key}`;
const KEEP_SECONDS = 200 * 24 * 3600;
const BASE = 'https://api.sleeper.app/v1';

const memory = new Map<string, Recorded>();
const MEMORY_MAX = 600;

/** What each league's season is, and the NFL's week: both change slowly, so asked at most every so often. */
const seasonOf = new Map<string, { at: number; season: number; complete: boolean }>();
let nfl: { at: number; season: number; week: number } | null = null;
const SEASON_MS = 6 * 3600_000, NFL_MS = 15 * 60_000;
/** A league that could not be read is asked about again after this, not on every request. */
const RETRY_MS = 10 * 60_000;

async function json(path: string): Promise<any> {
  const r = await rawLeagueFetch(`${BASE}/${path}`, { cache: 'no-store' });
  if (!r.ok) { await r.body?.cancel().catch(() => {}); return null; }
  return r.json();
}

/** Requests in flight, so a page asking for eighteen weeks at once asks about its season once. */
let nflAsk: Promise<void> | null = null;
const leagueAsk = new Map<string, Promise<void>>();

/** The last week of this league's season that can no longer change; 0 when none is (or it cannot be told). */
export async function settledThrough(leagueId: string, now = Date.now()): Promise<number> {
  if (!nfl || now - nfl.at > NFL_MS) {
    nflAsk ??= json('state/nfl')
      .then(s => { if (s?.season) nfl = { at: Date.now(), season: Number(s.season), week: Number(s.week) || 0 }; })
      .catch(() => {})
      .finally(() => { nflAsk = null; });
    await nflAsk;
  }
  const known = seasonOf.get(leagueId);
  if (!known || now - known.at > SEASON_MS) {
    let ask = leagueAsk.get(leagueId);
    if (!ask) {
      ask = json(`league/${leagueId}`)
        .then(l => l?.season ? { at: Date.now(), season: Number(l.season), complete: l.status === 'complete' } : null)
        .catch(() => null)
        // Unreadable: season 0 settles nothing, and is asked again after RETRY_MS.
        .then(v => { seasonOf.set(leagueId, v ?? { at: Date.now() - SEASON_MS + RETRY_MS, season: 0, complete: false }); })
        .finally(() => leagueAsk.delete(leagueId));
      leagueAsk.set(leagueId, ask);
    }
    await ask;
  }
  const league = seasonOf.get(leagueId);
  if (!nfl || !league?.season) return 0;
  return settledWeek({ season: league.season, complete: league.complete, nflSeason: nfl.season, nflWeek: nfl.week });
}

/** A settled week's recorded answer, recording it on first ask; undefined for anything else. */
export async function settledLookup(ref: BundleRef): Promise<Recorded | undefined> {
  if (ref.kind !== 'league' || !/^\d{8,22}$/.test(ref.id)) return undefined;
  const m = /^(matchups|transactions)\/(\d{1,2})$/.exec(ref.key);
  if (!m) return undefined;
  const week = Number(m[2]);
  if (week < 1 || week > (await settledThrough(ref.id).catch(() => 0))) return undefined;

  const k = KEY(ref.id, ref.key);
  const hit = memory.get(k);
  if (hit) return hit;
  const r = getRedis().client;
  const stored = await r?.get(k).catch(() => null);
  if (stored) {
    try { return remember(k, JSON.parse(stored) as Recorded); } catch { /* record again below */ }
  }
  // First ask: read it live, as the request would have, and keep it.
  const res = await rawLeagueFetch(`${BASE}/league/${ref.id}/${ref.key}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) { await res?.body?.cancel().catch(() => {}); return undefined; }
  const body = await res.json().catch(() => undefined);
  if (!Array.isArray(body)) return undefined;
  const rec: Recorded = { status: res.status, body };
  await r?.set(k, JSON.stringify(rec), KEEP_SECONDS).catch(() => {});
  return remember(k, rec);
}

function remember(k: string, rec: Recorded): Recorded {
  memory.delete(k);
  memory.set(k, rec);
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
  return rec;
}
