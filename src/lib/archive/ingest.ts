/**
 * Copies a league's data into the archive: every season, read the way the
 * site reads it (leagueFetch: saved season snapshots, the ESPN adapter,
 * hand-entered data), written as rows (normalize.ts).
 *
 * Runs inside the league's own context (runAsTenant), so `site` and every
 * read are that league's. Each season is replaced in one transaction: the
 * archive always holds a complete season, never half of one.
 *
 * Kept, not mirrored: a season the provider no longer returns (an ESPN season
 * that aged out, a deleted Sleeper league) keeps what the archive already has.
 * That is the point of the archive.
 *
 * Server only.
 */

import { leagueFetch } from '@/lib/providers/leagueFetch';
import { getAllLinkedLeagueIds } from '@/lib/api';
import { getRootLeagueId } from '@/config/league';
import { getPlayersDirectory } from '@/lib/playerStats';
import { ensureArchive, inTransaction, insertRows, T } from './db';
import { COLUMNS, playerIds, providerOf, seasonRows, type Rows, type SeasonData } from './normalize';
import { MAX_WEEK, planWeeks, sleeperCalls } from './plan';
import { noteSleeperCalls, waitForSleeperRoom } from '@/lib/providers/sleeperBudget';

const BASE = 'https://api.sleeper.app/v1';
/** How long a run may keep waiting for room under Sleeper's limit. */
const DEFAULT_BUDGET_MS = 240_000;

export interface SeasonResult { seasonId: string; season: number | null; kept?: string; counts?: Record<string, number>; weeks?: number[] }
export interface ArchiveResult {
  site: string; seasons: SeasonResult[]; players: number; ms: number;
  /** False when Sleeper's limit cut the run short: the next run picks it up. */
  complete: boolean;
}

export interface ArchiveOptions {
  /**
   * Re-read every season and every week. By default a finished season is
   * left alone and the current one is read from its first unsettled week
   * (see plan.ts). Edits a commissioner makes by hand can touch anything, so
   * saving them asks for a full run.
   */
  full?: boolean;
  /** Stop starting new reads after this (epoch ms). Defaults to four minutes from now. */
  deadline?: number;
}

async function get<T>(path: string, fallback: T): Promise<T> {
  const res = await leagueFetch(`${BASE}/${path}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) {
    await res?.body?.cancel().catch(() => {});
    return fallback;
  }
  return (await res.json().catch(() => fallback)) ?? fallback;
}

/** The league site the current request belongs to: its address when hosted, `self` otherwise. */
export async function currentSite(): Promise<string> {
  if (process.env.LP_HOSTED !== '1') return 'self';
  const { currentTenant } = await import('@/lib/tenant/context');
  const t = await currentTenant();
  if (!t) throw new Error('No league for this request');
  return t.slug;
}

class OutOfRoom extends Error {}

/**
 * Before a batch of calls: wait for room under Sleeper's limit. Only Sleeper
 * seasons spend it; ESPN and hand-entered seasons never call Sleeper.
 */
async function room(seasonId: string, calls: number, deadline: number) {
  if (providerOf(seasonId) !== 'sleeper' || seasonId.startsWith('demo-')) return;
  if (!(await waitForSleeperRoom(calls, deadline))) throw new OutOfRoom();
}

interface SeasonRead { data: SeasonData; weeks: number[]; picksRead: boolean; settleTo: number }

/**
 * What this run reads of one season (see plan.ts), or why it read nothing:
 * the provider no longer has it, or Sleeper's limit left no room this run.
 */
async function readSeason(seasonId: string, nfl: { season: number; week: number }, settled: number, deadline: number): Promise<SeasonRead | string> {
  try {
    await room(seasonId, 4, deadline);
    const res = await leagueFetch(`${BASE}/league/${seasonId}`, { cache: 'no-store' }).catch(err => err as Error);
    if (res instanceof Error) return `could not be read (${res.message})`;
    if (!res.ok) return `could not be read (${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)})`;
    const league = await res.json().catch(() => null);
    if (!league?.season) return 'has no league data';
    const [users, rosters, drafts] = await Promise.all([
      get<any[]>(`league/${seasonId}/users`, []),
      get<any[]>(`league/${seasonId}/rosters`, []),
      get<any[]>(`league/${seasonId}/drafts`, []),
    ]);
    if (!rosters.length) return 'has no teams';

    const plan = planWeeks({ final: league.status === 'complete', season: Number(league.season), nflSeason: nfl.season, nflWeek: nfl.week, settled });
    // A finished draft does not change: its picks are read with the season's first read only.
    const open = drafts.filter(d => d?.draft_id && (settled === 0 || d.status !== 'complete'));
    // The bracket once the season is over: where every team finished.
    const over = plan.settleTo >= MAX_WEEK;
    await room(seasonId, sleeperCalls(plan.weeks.length, open.length) - 4 + (over ? 1 : 0), deadline);
    const [matchups, moves, picks, winnersBracket] = await Promise.all([
      Promise.all(plan.weeks.map(w => get<any[]>(`league/${seasonId}/matchups/${w}`, []))),
      Promise.all(plan.weeks.map(w => get<any[]>(`league/${seasonId}/transactions/${w}`, []))),
      Promise.all(open.map(async d => [d.draft_id, await get<any[]>(`draft/${d.draft_id}/picks`, [])] as const)),
      over ? get<any[]>(`league/${seasonId}/winners_bracket`, []) : Promise.resolve(undefined),
    ]);

    const weeks: Record<number, any[]> = {};
    // A week no one scored in was not played (a bye, or past the playoffs).
    matchups.forEach((list, i) => { if (list.some(m => Number(m?.points) > 0)) weeks[plan.weeks[i]] = list; });
    return {
      data: { league, users, rosters, weeks, transactions: moves.flat(), drafts, picks: Object.fromEntries(picks), winnersBracket },
      weeks: plan.weeks, picksRead: open.length > 0, settleTo: plan.settleTo,
    };
  } catch (err) {
    if (err instanceof OutOfRoom) return 'is waiting for room under Sleeper\u2019s limit; the next run continues it';
    throw err;
  }
}

/**
 * Writes what a run read of a season, in one transaction: the season's teams
 * and settings whole, and of its weekly data only the weeks this run read, so
 * settled weeks stay exactly as they were stored.
 */
async function writeSeason(site: string, seasonId: string, rows: Rows, read: Omit<SeasonRead, 'data'>): Promise<Record<string, number>> {
  const db = (await ensureArchive())!;
  const client = await db.connect();
  try {
    return await inTransaction(client, async () => {
      const key = [site, seasonId];
      await client.query(`DELETE FROM ${T('teams')} WHERE site = $1 AND season_id = $2`, key);
      await client.query(`DELETE FROM ${T('matchups')} WHERE site = $1 AND season_id = $2 AND week = ANY($3)`, [...key, read.weeks]);
      await client.query(`DELETE FROM ${T('transactions')} WHERE site = $1 AND season_id = $2 AND (week = ANY($3) OR ($4 AND week IS NULL))`, [...key, read.weeks, read.weeks.length === MAX_WEEK]);
      if (read.picksRead) {
        await client.query(`DELETE FROM ${T('draft_picks')} WHERE site = $1 AND season_id = $2`, key);
        await client.query(`DELETE FROM ${T('drafts')} WHERE site = $1 AND season_id = $2`, key);
      }
      const counts: Record<string, number> = {};
      await insertRows(client, 'seasons', [...COLUMNS.seasons], rows.seasons, { key: ['site', 'season_id'] });
      await client.query(`UPDATE ${T('seasons')} SET settled_week = $3 WHERE site = $1 AND season_id = $2`, [...key, read.settleTo]);
      // Newest season last, so a manager's current name and avatar win.
      await insertRows(client, 'managers', [...COLUMNS.managers], rows.managers, { key: ['site', 'user_id'] });
      counts.teams = await insertRows(client, 'teams', [...COLUMNS.teams], rows.teams);
      counts.matchups = await insertRows(client, 'matchups', [...COLUMNS.matchups], rows.matchups);
      counts.transactions = await insertRows(client, 'transactions', [...COLUMNS.transactions], rows.transactions,
        { key: ['site', 'season_id', 'transaction_id'] });
      if (read.picksRead) {
        counts.drafts = await insertRows(client, 'drafts', [...COLUMNS.drafts], rows.drafts);
        counts.draft_picks = await insertRows(client, 'draft_picks', [...COLUMNS.draft_picks], rows.draft_picks);
      }
      return counts;
    });
  } finally {
    client.release();
  }
}

/** Names for player ids the archive does not know yet: Sleeper's directory, then names carried on draft picks. */
async function writePlayers(ids: Set<string>, pickNames: Map<string, [string, string | null, string | null]>): Promise<number> {
  const db = (await ensureArchive())!;
  const known = new Set((await db.query(`SELECT player_id FROM ${T('players')} WHERE player_id = ANY($1)`, [[...ids]])).rows.map(r => r.player_id));
  const missing = [...ids].filter(id => !known.has(id));
  if (!missing.length) return 0;
  // One call, which Sleeper asks to keep to once a day; the directory stays in memory for hours.
  noteSleeperCalls(1);
  const directory = await getPlayersDirectory().catch(() => ({} as Record<string, any>));
  const now = new Date();
  const rows = missing.flatMap(id => {
    const p = directory[id];
    if (p) {
      const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.position === 'DEF' ? `${p.team ?? id} D/ST` : null);
      return [[id, name, p.position ?? null, p.team ?? null, now]];
    }
    const fromPick = pickNames.get(id);
    return fromPick ? [[id, ...fromPick, now]] : [];
  });
  const client = await db.connect();
  try {
    return await insertRows(client, 'players', ['player_id', 'full_name', 'position', 'team', 'updated_at'], rows, { key: ['player_id'] });
  } finally {
    client.release();
  }
}

/** Archives every season of the current request's league. */
export async function archiveLeague(opts: ArchiveOptions = {}): Promise<ArchiveResult> {
  const started = Date.now();
  const deadline = opts.deadline ?? started + DEFAULT_BUDGET_MS;
  const db = await ensureArchive();
  if (!db) throw new Error('The archive is not set up (DATABASE_URL is missing)');
  const site = await currentSite();
  const run = await db.query(`INSERT INTO ${T('archive_runs')} (site) VALUES ($1) RETURNING id`, [site]);
  const runId = run.rows[0].id;

  try {
    const root = await getRootLeagueId();
    // Finding the league's seasons walks back through them (finished ones come
    // from saved snapshots, not Sleeper) and asks once for next season's.
    await room(root, 4, deadline);
    const seasonIds = await getAllLinkedLeagueIds(root);
    const state = await get<{ season?: string; week?: number }>('state/nfl', {});
    const nfl = { season: Number(state.season) || new Date().getFullYear(), week: Number(state.week) || 0 };
    const seasons: SeasonResult[] = [];
    const ids = new Set<string>();
    const pickNames = new Map<string, [string, string | null, string | null]>();

    const stored = new Map<string, { final: boolean; settled: number }>((await db.query(
      `SELECT season_id, final, settled_week FROM ${T('seasons')} WHERE site = $1`, [site],
    )).rows.map(r => [r.season_id, { final: r.final, settled: Number(r.settled_week) }]));

    // Oldest first: managers' latest details are written last.
    const ordered: { id: string; read: SeasonRead | string }[] = [];
    for (const id of seasonIds) {
      const had = stored.get(id);
      if (!opts.full && had?.final && had.settled >= MAX_WEEK) { seasons.push({ seasonId: id, season: null, kept: 'Finished and already archived.' }); continue; }
      ordered.push({ id, read: await readSeason(id, nfl, opts.full ? 0 : had?.settled ?? 0, deadline) });
    }
    const seasonOf = (r: SeasonRead | string) => (typeof r === 'string' ? 0 : Number(r.data.league?.season ?? 0));
    ordered.sort((a, b) => seasonOf(a.read) - seasonOf(b.read));

    for (const { id, read } of ordered) {
      if (typeof read === 'string') {
        seasons.push({ seasonId: id, season: null, kept: `The season ${read}; kept what the archive already has.` });
        continue;
      }
      const { data } = read;
      const rows = seasonRows(site, id, data);
      for (const pid of playerIds(rows)) ids.add(pid);
      const ix = (c: string) => (COLUMNS.draft_picks as readonly string[]).indexOf(c);
      for (const p of rows.draft_picks) {
        if (p[ix('player_id')] && p[ix('player_name')]) pickNames.set(String(p[ix('player_id')]), [String(p[ix('player_name')]), p[ix('position')] as string | null, p[ix('nfl_team')] as string | null]);
      }
      seasons.push({ seasonId: id, season: Number(data.league.season), weeks: read.weeks, counts: await writeSeason(site, id, rows, read) });
    }

    // A season the commissioner entered and then deleted goes. Provider seasons
    // never do: a provider dropping one is what the archive is for.
    const gone = (await db.query(
      `SELECT season_id FROM ${T('seasons')} WHERE site = $1 AND provider = 'manual' AND NOT (season_id = ANY($2))`, [site, seasonIds],
    )).rows.map(r => r.season_id as string);
    if (gone.length) {
      const client = await db.connect();
      try {
        await inTransaction(client, async () => {
          for (const table of ['teams', 'matchups', 'transactions', 'draft_picks', 'drafts', 'seasons']) {
            await client.query(`DELETE FROM ${T(table)} WHERE site = $1 AND season_id = ANY($2)`, [site, gone]);
          }
        });
      } finally {
        client.release();
      }
      for (const id of gone) seasons.push({ seasonId: id, season: null, kept: 'Deleted by the commissioner; removed.' });
    }

    const players = await writePlayers(ids, pickNames);
    const complete = !seasons.some(x => x.kept?.includes('waiting for room'));
    const result: ArchiveResult = { site, seasons, players, ms: Date.now() - started, complete };
    await db.query(`UPDATE ${T('archive_runs')} SET finished_at = now(), summary = $2 WHERE id = $1`, [runId, JSON.stringify(result)]);
    return result;
  } catch (err) {
    await db.query(`UPDATE ${T('archive_runs')} SET finished_at = now(), error = $2 WHERE id = $1`, [runId, String(err instanceof Error ? err.message : err)]).catch(() => {});
    throw err;
  }
}

/**
 * Re-archives the current league after the response is sent: for changes a
 * commissioner makes by hand, which can touch a finished season. Does nothing
 * when the archive is not set up.
 */
export async function rearchiveSoon(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) return;
  const [{ after }, { currentTenant, runAsTenant }] = await Promise.all([import('next/server'), import('@/lib/tenant/context')]);
  const tenant = await currentTenant();
  after(() => runAsTenant(tenant, () => archiveLeague({ full: true }))
    .then(() => undefined)
    .catch(err => console.error('[archive] re-archive after an edit failed', err)));
}
