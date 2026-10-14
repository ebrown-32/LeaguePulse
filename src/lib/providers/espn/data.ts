/**
 * An ESPN league's data, translated and kept, so pages never wait on ESPN.
 *
 * Every piece (a season's base, one week's matchups, one week's moves) is
 * stored once translated, with the time it was fetched. A page is answered
 * from that copy:
 *
 *   fresh          served as is.
 *   stale          served as is, and refreshed after the response is sent.
 *   missing        fetched now, once, however many requests ask at the same
 *                  moment.
 *   ESPN failing   the last good copy keeps being served, and the failure is
 *                  recorded so the league's admin and the operator can see it
 *                  (expired cookies are the usual cause).
 *
 * How long a piece stays fresh depends on whether it can still change: a
 * finished season never does and is fetched once; this week's scores change
 * by the minute on a Sunday.
 *
 * Storage goes through getRedis(), so on the hosted product every piece sits
 * under its own league's prefix. Without Redis (a self-hosted copy that has
 * none) it is kept in memory instead.
 */

import { after } from 'next/server';
import { getRedis } from '@/lib/redisClient';
import { getPlayersDirectory } from '@/lib/playerStats';
import { EspnError, fetchSeason, fetchWeek, fetchTransactions, fetchSeasonPlayers, fetchTrades, fetchWeekEnds } from './client';
import { getEspnCredentials } from './credentials';
import { translateBase, translateWeek, translateTransactions, translateTrades, periodOfWeek, type TranslatedBase } from './translate';
import { buildPlayerMap, playerIdFn } from './players';

const MIN = 60_000, HOUR = 60 * MIN;

// ── Storage with stale-while-revalidate ─────────────────────────────────────

interface Entry<T> { at: number; data: T }
const memory = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

async function readEntry<T>(key: string): Promise<Entry<T> | null> {
  const r = getRedis().client;
  if (!r) return (memory.get(key) as Entry<T>) ?? null;
  const raw = await r.get(key).catch(() => null);
  return raw ? (JSON.parse(raw) as Entry<T>) : null;
}

async function writeEntry<T>(key: string, entry: Entry<T>, ttlSeconds?: number): Promise<void> {
  const r = getRedis().client;
  if (!r) { memory.set(key, entry); return; }
  await r.set(key, JSON.stringify(entry), ttlSeconds).catch(err => console.error('[espn] could not store', key, err));
}

function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = load().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Run after the response when inside a request; otherwise just start it. */
function later(fn: () => Promise<unknown>) {
  try { after(fn); } catch { void fn().catch(() => {}); }
}

interface CacheOpts<T> {
  /** How long a stored copy counts as fresh, given what it holds. */
  maxAge: (data: T) => number;
  /** Fetch now even when fresh (the sync job). */
  force?: boolean;
  /** Called with the outcome of every ESPN fetch, for the health record. */
  report?: (err: unknown) => void;
}

async function cached<T>(key: string, load: () => Promise<T>, opts: CacheOpts<T>): Promise<Entry<T>> {
  const entry = await readEntry<T>(key);
  const refresh = () => once(key, async () => {
    try {
      const data = await load();
      const next = { at: Date.now(), data };
      await writeEntry(key, next);
      opts.report?.(null);
      return next;
    } catch (err) {
      opts.report?.(err);
      throw err;
    }
  });

  if (entry && !opts.force) {
    if (Date.now() - entry.at < opts.maxAge(entry.data)) return entry;
    later(refresh);
    return entry;
  }
  try {
    return await refresh();
  } catch (err) {
    if (entry) return entry; // forced refresh failed: keep the last good copy
    throw err;
  }
}

// ── Health: is this league's ESPN connection working? ───────────────────────

export interface EspnHealth {
  ok: boolean;
  kind?: 'auth' | 'not_found' | 'unavailable';
  message?: string;
  at: number;
  lastOkAt?: number;
}

/** A platform key (see redisClient's shared prefixes): the operator reads every league's. */
const HEALTH = (espnLeagueId: string) => `lp_espn_creds_health:${espnLeagueId}`;
const healthMemo = new Map<string, EspnHealth>();

export async function getEspnHealth(espnLeagueId: string): Promise<EspnHealth | null> {
  const raw = await getRedis().client?.get(HEALTH(espnLeagueId)).catch(() => null);
  return raw ? (JSON.parse(raw) as EspnHealth) : healthMemo.get(espnLeagueId) ?? null;
}

function reporter(espnLeagueId: string) {
  return (err: unknown) => {
    // A missing season is an answer, not a broken connection.
    if (err instanceof EspnError && err.kind === 'not_found') return;
    const prev = healthMemo.get(espnLeagueId);
    const now = Date.now();
    const next: EspnHealth = err
      ? { ok: false, kind: err instanceof EspnError ? err.kind : 'unavailable',
          message: err instanceof Error ? err.message : 'ESPN request failed', at: now, lastOkAt: prev?.lastOkAt }
      : { ok: true, at: now, lastOkAt: now };
    // Successes are written at most every ten minutes; changes always.
    if (prev && prev.ok === next.ok && next.ok && now - prev.at < 10 * MIN) return;
    healthMemo.set(espnLeagueId, next);
    getRedis().client?.set(HEALTH(espnLeagueId), JSON.stringify(next)).catch(() => {});
  };
}

// ── Players ──────────────────────────────────────────────────────────────────

/** ESPN to Sleeper player ids for a season. The same for every league, so shared. */
async function playerPairs(season: number, force = false): Promise<Record<string, string>> {
  const thisYear = new Date().getFullYear();
  const entry = await cached(`lp_espn_xwalk_fantasy_v1:${season}`, async () => {
    const [espn, sleeper] = await Promise.all([fetchSeasonPlayers(season), getPlayersDirectory()]);
    const map = buildPlayerMap(espn, sleeper);
    console.log(`[espn] players ${season}: ${map.matched} matched, ${map.unmatched} not`);
    return map.pairs;
  }, { maxAge: () => (season < thisYear - 1 ? 7 * 24 * HOUR : 12 * HOUR), force });
  return entry.data;
}

// ── A league's seasons ───────────────────────────────────────────────────────

function firstSeason(): number | undefined {
  // Self-hosted only: where a league's history should start.
  const v = Number(process.env.ESPN_FIRST_SEASON);
  return process.env.LP_HOSTED !== '1' && v > 1990 ? v : undefined;
}

const k = (lid: string, season: number, part: string) => `espn:${lid}:${season}:${part}`;

/**
 * Whether a season's NFL year is over (it ends in February), whatever ESPN
 * says. A season a league abandoned partway is never marked finished on
 * ESPN, and would otherwise be refreshed forever.
 */
export function seasonOver(season: number, now = new Date()): boolean {
  const year = now.getFullYear();
  return season < year - 1 || (season === year - 1 && now.getMonth() >= 2);
}
const settled = (b: TranslatedBase) => b.final || seasonOver(b.ctx.season);

export async function seasonBase(lid: string, season: number, force = false): Promise<TranslatedBase> {
  const entry = await cached(k(lid, season, 'base'), async () => {
    const creds = await getEspnCredentials(lid);
    const [raw, pairs] = await Promise.all([fetchSeason(lid, season, creds), playerPairs(season)]);
    return translateBase(raw, playerIdFn(pairs), { firstSeason: firstSeason() });
  }, {
    maxAge: b => (settled(b) ? Infinity : 10 * MIN),
    force,
    report: reporter(lid),
  });
  return entry.data;
}

/** Whether ESPN has this season of the league. Remembered for six hours either way. */
export async function seasonExists(lid: string, season: number): Promise<boolean> {
  if (season < 2004 || season > new Date().getFullYear() + 1) return false;
  const entry = await cached(k(lid, season, 'exists'), async () => {
    try { await seasonBase(lid, season); return true; }
    catch (err) { if (err instanceof EspnError && err.kind === 'not_found') return false; throw err; }
  }, { maxAge: exists => (exists ? Infinity : 6 * HOUR) });
  return entry.data;
}

function weekAge(base: TranslatedBase, week: number, current: number, live: number): number {
  if (settled(base)) return Infinity;
  if (week < base.currentWeek) return 6 * HOUR; // stat corrections
  if (week === base.currentWeek) return current;
  return live;
}

export async function seasonWeek(lid: string, season: number, week: number, force = false): Promise<any[]> {
  const base = await seasonBase(lid, season);
  const period = periodOfWeek(base.ctx, week);
  if (period === null || week > base.finalWeek) return [];
  const entry = await cached(k(lid, season, `w${week}`), async () => {
    const creds = await getEspnCredentials(lid);
    const [raw, pairs] = await Promise.all([fetchWeek(lid, season, week, period, creds), playerPairs(season)]);
    return translateWeek(raw, base.ctx, week, playerIdFn(pairs));
  }, { maxAge: () => weekAge(base, week, 90_000, HOUR), force, report: reporter(lid) });
  return entry.data;
}

export async function seasonTransactions(lid: string, season: number, week: number, force = false): Promise<any[]> {
  const base = await seasonBase(lid, season);
  if (week < 1 || week > base.finalWeek) return [];
  const [entry, trades] = await Promise.all([
    cached(k(lid, season, `tx${week}`), async () => {
      const creds = await getEspnCredentials(lid);
      const [raw, pairs] = await Promise.all([fetchTransactions(lid, season, week, creds), playerPairs(season)]);
      return translateTransactions(raw, base.ctx, week, playerIdFn(pairs));
    }, { maxAge: () => weekAge(base, week, 5 * MIN, HOUR), force, report: reporter(lid) }),
    seasonTrades(lid, season, force).catch(() => [] as any[]),
  ]);
  return [...trades.filter(t => t.leg === week), ...entry.data].sort((a, b) => b.status_updated - a.status_updated);
}

/** When each NFL week ends, for placing trades. The same for every league, so shared. */
async function weekEnds(season: number): Promise<Record<string, number>> {
  const entry = await cached(`lp_espn_xwalk_weekends_v1:${season}`, () => fetchWeekEnds(season),
    { maxAge: () => (seasonOver(season) ? Infinity : 24 * HOUR) });
  return entry.data;
}

/**
 * The season's trades. Kept once read and never dropped: ESPN deletes a
 * league's activity feed when the season ends, so the copy here is the only
 * one left. A refresh that comes back with fewer trades than are kept (the
 * feed already gone) keeps what was kept.
 */
export async function seasonTrades(lid: string, season: number, force = false): Promise<any[]> {
  const base = await seasonBase(lid, season);
  const key = k(lid, season, 'trades');
  const before = await readEntry<any[]>(key);
  const entry = await cached(key, async () => {
    const creds = await getEspnCredentials(lid);
    const [topics, pairs, ends] = await Promise.all([fetchTrades(lid, season, creds), playerPairs(season), weekEnds(season).catch(() => ({}))]);
    const fresh = translateTrades(topics, base.ctx, ends, base.currentWeek, playerIdFn(pairs));
    const kept = before?.data ?? [];
    const ids = new Set(fresh.map(t => t.transaction_id));
    return [...fresh, ...kept.filter(t => !ids.has(t.transaction_id))];
  }, { maxAge: () => (settled(base) ? Infinity : 5 * MIN), force, report: reporter(lid) });
  return entry.data;
}

/**
 * Bring a league's current season up to date: what the sync job runs, so
 * that pages are already warm when someone opens them.
 */
export async function syncLeague(lid: string, season: number): Promise<{ week: number; final: boolean }> {
  // A season that is over is never fetched again.
  if (seasonOver(season)) {
    const base = await seasonBase(lid, season);
    return { week: base.currentWeek, final: true };
  }
  const base = await seasonBase(lid, season, true);
  if (!base.final) {
    await seasonWeek(lid, season, base.currentWeek, true);
    // Also refreshes the season's trades.
    await seasonTransactions(lid, season, base.currentWeek, true);
    // The week just finished can still change (stat corrections, Monday night).
    if (base.currentWeek > 1) await seasonWeek(lid, season, base.currentWeek - 1, true);
  }
  return { week: base.currentWeek, final: base.final };
}
