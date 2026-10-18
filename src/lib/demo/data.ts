/**
 * The real games behind the demo league: each week's stats from Sleeper, scored with the demo's
 * settings, and each season played out from them (league.ts).
 *
 *   A finished week never changes, so it's fetched once and kept for good (a few kilobytes: just
 *   the fantasy players, their points and who played). So is a finished season, played out.
 *   The week being played is fetched at most every 20 seconds, for every visitor at once.
 *
 * Shared across every site (the lp_demo_ prefix): there is one demo league. Server only.
 */

import { getRedis } from '@/lib/redisClient';
import { getPlayersDirectory } from '@/lib/playerStats';
import { playSeason, type PlayerInfo, type Season, type SeasonInput, type WeekData } from './league';
import { FIRST_SEASON, LAST_WEEK, pointsFor } from './settings';

const STATS = 'https://api.sleeper.app/v1/stats/nfl/regular';
const FANTASY = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
const LIVE_MS = 20_000;
/** Bumped when the stats' scoring changes (the weeks) or the way a season is played (the seasons). */
const V = 'v1', PLAY_V = 'v2';

const redis = () => getRedis().client;
const memo = new Map<string, { at: number; value: Promise<unknown> }>();

/** One copy per key: kept `ms` (forever when omitted), shared by everyone asking meanwhile. */
function once<T>(key: string, load: () => Promise<T>, ms?: number): Promise<T> {
  const hit = memo.get(key);
  if (hit && (ms === undefined || Date.now() - hit.at < ms)) return hit.value as Promise<T>;
  const value = load();
  memo.set(key, { at: Date.now(), value });
  value.catch(() => memo.delete(key));
  return value;
}

/** Kept in Redis too: forever, or for `ttl` seconds. */
async function stored<T>(key: string, load: () => Promise<T>, ttl?: number): Promise<T> {
  const r = redis();
  const raw = await r?.get(key).catch(() => null);
  if (raw) { try { return JSON.parse(raw) as T; } catch { /* fetched again */ } }
  const value = await load();
  await r?.set(key, JSON.stringify(value), ttl).catch(() => {});
  return value;
}

async function fetchJson(url: string): Promise<Record<string, Record<string, number>>> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Sleeper answered ${res.status} for ${url}`);
  return res.json();
}

/** The fantasy players among the directory's, with just what the league needs. */
const directory = () => once('directory', async () => {
  const all = await getPlayersDirectory();
  const out: Record<string, PlayerInfo> = {};
  for (const [id, p] of Object.entries<any>(all)) {
    if (!FANTASY.has(p?.position)) continue;
    out[id] = { position: p.position, first_name: p.first_name, last_name: p.last_name, team: p.team ?? null, injury_status: p.injury_status ?? null };
  }
  return out;
}, 6 * 3_600_000);

// ── Where the NFL is ───────────────────────────────────────────────────────

export interface Clock { season: number; week: number; started: boolean; over: boolean }

export const nflClock = () => once('clock', async (): Promise<Clock> => {
  const s = await fetch('https://api.sleeper.app/v1/state/nfl', { cache: 'no-store' }).then(r => r.json());
  const season = Number(s.season) || new Date().getFullYear();
  const type = String(s.season_type ?? 'regular');
  return { season, week: Math.max(1, Number(s.week) || 1), started: type === 'regular' || type === 'post', over: type === 'post' || (type === 'off' && Number(s.week) > 1) };
}, 60_000);

/** The demo's seasons, oldest first: from the first through the NFL's current one. */
export async function demoSeasons(): Promise<number[]> {
  const { season } = await nflClock();
  return Array.from({ length: season - FIRST_SEASON + 1 }, (_, i) => FIRST_SEASON + i);
}

// ── The weeks ──────────────────────────────────────────────────────────────

function scoreWeek(raw: Record<string, Record<string, number>>, dir: Record<string, PlayerInfo>, finished: boolean): WeekData {
  const pts: Record<string, number> = {}, played: string[] = [];
  for (const [id, stats] of Object.entries(raw)) {
    if (!dir[id]) continue;
    const p = pointsFor(stats);
    // A finished week: who took the field. A week under way: who has a game in it.
    const on = finished ? Number(stats.gp ?? 0) > 0 || p !== 0 : true;
    if (p) pts[id] = p;
    if (on) played.push(id);
  }
  return { pts, played };
}

function week(season: number, w: number, finished: boolean): Promise<WeekData> {
  if (finished) {
    return once(`wk:${season}:${w}`, () => stored(`lp_demo_wk_${V}:${season}:${w}`, async () =>
      scoreWeek(await fetchJson(`${STATS}/${season}/${w}`), await directory(), true)));
  }
  return once(`live:${season}:${w}`, async () =>
    scoreWeek(await fetchJson(`${STATS}/${season}/${w}`), await directory(), false), LIVE_MS);
}

/** A whole season's totals per player: the next season's draft board. */
function totals(season: number): Promise<Record<string, { pts: number; gp: number }>> {
  return once(`tot:${season}`, () => stored(`lp_demo_tot_${V}:${season}`, async () => {
    const [raw, dir] = await Promise.all([fetchJson(`${STATS}/${season}`), directory()]);
    const out: Record<string, { pts: number; gp: number }> = {};
    for (const [id, stats] of Object.entries(raw)) {
      if (!dir[id]) continue;
      const gp = Number(stats.gp ?? 0);
      const pts = pointsFor(stats);
      if (gp || pts) out[id] = { pts, gp };
    }
    return out;
  }));
}

// ── The seasons ────────────────────────────────────────────────────────────

/** A season, played out through the games so far. */
export async function demoSeason(season: number): Promise<Season | null> {
  const clock = await nflClock();
  if (season < FIRST_SEASON || season > clock.season) return null;
  if (season < clock.season || clock.over) {
    return once(`season:${season}`, () => stored(`lp_demo_season_${PLAY_V}:${season}`, () => play(season, LAST_WEEK, null)));
  }
  // This season: the finished weeks and the one being played, again every 20 seconds.
  const live = clock.started ? Math.min(clock.week, LAST_WEEK) : null;
  const final = clock.started ? Math.min(clock.week - 1, LAST_WEEK) : 0;
  return once(`season:${season}:${final}:${live}`, () => play(season, final, live), LIVE_MS);
}

async function play(season: number, final: number, live: number | null): Promise<Season> {
  const weeksWanted = Array.from({ length: live ?? final }, (_, i) => i + 1);
  const [prior, dir, weekList] = await Promise.all([
    totals(season - 1),
    directory(),
    Promise.all(weeksWanted.map(w => week(season, w, w <= final))),
  ]);
  const weeks: Record<number, WeekData> = {};
  weekList.forEach((d, i) => { weeks[weeksWanted[i]] = d; });
  // This season so far, for rookies and for who's in the league: the full season once it's over.
  const current: SeasonInput['current'] = final >= LAST_WEEK ? await totals(season) : {};
  if (final < LAST_WEEK) {
    for (let w = 1; w <= final; w++) {
      for (const id of weeks[w].played) (current[id] ??= { pts: 0, gp: 0 }).gp++;
      for (const [id, p] of Object.entries(weeks[w].pts)) (current[id] ??= { pts: 0, gp: 0 }).pts += p;
    }
  }
  return playSeason({ season, prior, current, weeks, live, final, directory: dir });
}
