/**
 * The market: a growing sample of public Sleeper leagues, read every hour for what the field
 * does (who's rostered, started, added, bid on and traded for, by league format), so a league's
 * site can show it what leagues like it are doing (The Edge, lib/market/read).
 *
 *   Discovery   Sleeper has no list of leagues, so the sample grows the way any crawl of a social
 *               graph does: from a league, two of its managers at random, and their other leagues
 *               for the season. It starts from the platform's own leagues (and LP_MARKET_SEEDS).
 *               Managers' ids are used in the moment to find leagues, and never stored.
 *   Each run    first brings sampled leagues up to the latest final week, then adds new ones
 *               (LP_MARKET_NEW_PER_RUN, 40 by default) until the sample reaches LP_MARKET_LEAGUES
 *               (3,000 by default) or the database nears its limit (85% of LP_POSTGRES_LIMIT_MB;
 *               past 95% it writes nothing). Weekly player detail older than LP_MARKET_KEEP_SEASONS
 *               (2) is dropped.
 *   Scale       storage is mostly per player, week and format, which levels off as the sample
 *               grows (there are only so many players), about 95 MB a season at 3,000 leagues;
 *               trades grow with the sample, about 8 KB a league a season.
 *   Kept        counts per player, week and format; trades as their sides; draft positions; and
 *               each league's public id, format and settings. No names, usernames or user ids.
 *   Polite      every call counts against the platform's Sleeper budget (providers/sleeperBudget),
 *               waiting for room like the archive does, so pages always have headroom.
 *
 * Off unless LP_MARKET_CRAWL=1, and only on the hosted platform. Server only.
 */

import type { PoolClient } from 'pg';
import { ensureArchive, inTransaction, T } from '@/lib/archive/db';
import { noteSleeperCalls, waitForSleeperRoom } from '@/lib/providers/sleeperBudget';
import { countWeek, type MatchupRow, type TransactionRow, type WeekCounts } from './aggregate';
import { formatOf } from './format';

const BASE = 'https://api.sleeper.app/v1';
const BUDGET_MS = 230_000;
const PARALLEL = 4;
const FRONTIER_MAX = 20_000;
/**
 * No format may be more than this share of a sample past 100 leagues. Discovery follows
 * managers from league to league, and a cluster of look-alike public leagues (12-team half PPR
 * redraft, Sleeper's default) would otherwise crowd out the dynasty and superflex leagues.
 */
const FORMAT_SHARE_MAX = 0.35;
const env = (k: string, d: number) => Number(process.env[k]) || d;

export function marketEnabled(): boolean {
  return process.env.LP_HOSTED === '1' && process.env.LP_MARKET_CRAWL === '1';
}

class OutOfTime extends Error {}

async function sl<T>(path: string): Promise<T | null> {
  noteSleeperCalls(1);
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(12_000) }).catch(() => null);
  if (!res?.ok) return null;
  return res.json().catch(() => null) as Promise<T | null>;
}

interface SleeperLeague {
  league_id: string; season: string; sport?: string; status?: string; total_rosters?: number;
  previous_league_id?: string | null;
  settings?: { type?: number; best_ball?: number; waiver_type?: number; waiver_budget?: number; playoff_week_start?: number } | null;
  scoring_settings?: Record<string, number> | null;
  roster_positions?: string[] | null;
}

/** Scoring keys worth keeping with a league: enough to tell its scoring apart, not the whole table. */
const KEEP_SCORING = ['rec', 'pass_td', 'pass_int', 'rush_td', 'rec_td', 'bonus_rec_te', 'bonus_rec_rb', 'bonus_rec_wr', 'pass_yd', 'rush_yd', 'rec_yd', 'fum_lost', 'bonus_pass_yd_300', 'bonus_rush_yd_100', 'bonus_rec_yd_100'];

interface Row { league_id: string; season: string; fmt: string; size: number; faab_budget: number | null; ingested_week: number; drafted: boolean }

/** The latest week whose NFL games are all over, this season (0 before the season starts). */
async function finalWeek(): Promise<{ season: string; week: number } | null> {
  const nfl = await sl<{ season: string; week: number; season_type: string }>('/state/nfl');
  if (!nfl) return null;
  const season = String(nfl.season);
  if (nfl.season_type === 'off' || nfl.season_type === 'pre') return { season, week: 0 };
  const { weekPhase } = await import('@/lib/nflSchedule');
  const w = Math.min(18, Number(nfl.week) || 0);
  for (const candidate of [w, w - 1]) {
    if (candidate >= 1 && (await weekPhase(season, candidate).catch(() => 'upcoming')) === 'final') return { season, week: candidate };
  }
  return { season, week: Math.max(0, w - 2) };
}

/** Upserts that add to what's there: one league's weeks can only ever be counted once (see ingest). */
async function addPlayerWeeks(client: PoolClient, season: string, fmt: string, weeks: [number, WeekCounts][]): Promise<void> {
  const rows: unknown[][] = [];
  for (const [week, w] of weeks) {
    // Always in the same order: two leagues adding to the same rows lock them in the same order,
    // so they queue behind each other instead of deadlocking.
    for (const [pid, p] of [...w.players].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      rows.push([season, week, fmt, pid, p.rostered, p.started, p.startPts, p.adds, p.drops, p.bids, p.bidHist, p.tradedFor]);
    }
  }
  for (let i = 0; i < rows.length; i += 1500) {
    const chunk = rows.slice(i, i + 1500);
    const params: unknown[] = [];
    const values = chunk.map(r => `(${r.map(v => { params.push(v); return `$${params.length}`; }).join(',')})`).join(',');
    await client.query(
      `INSERT INTO ${T('mkt_player_week')} AS t (season, week, fmt, player_id, rostered, started, start_pts, adds, drops, bids, bid_hist, traded_for)
       VALUES ${values}
       ON CONFLICT (season, week, fmt, player_id) DO UPDATE SET
         rostered = t.rostered + EXCLUDED.rostered, started = t.started + EXCLUDED.started,
         start_pts = t.start_pts + EXCLUDED.start_pts, adds = t.adds + EXCLUDED.adds, drops = t.drops + EXCLUDED.drops,
         bids = t.bids + EXCLUDED.bids, traded_for = t.traded_for + EXCLUDED.traded_for,
         bid_hist = ARRAY(SELECT a + b FROM unnest(t.bid_hist, EXCLUDED.bid_hist) AS x(a, b))`,
      params,
    );
  }
}

/**
 * Counts a league's weeks after the last one counted, up to `upTo`, in one transaction: the
 * counts and the league's new high-water mark land together or not at all, so a failure or an
 * overlapping run can never count a week twice.
 */
async function ingest(row: Row, upTo: number, deadline: number): Promise<number> {
  const from = row.ingested_week + 1;
  if (from > upTo) return 0;
  const weeks = Array.from({ length: upTo - from + 1 }, (_, i) => from + i);
  if (!(await waitForSleeperRoom(weeks.length * 2, deadline))) throw new OutOfTime();
  const fetched = await Promise.all(weeks.map(async w => {
    const [m, t] = await Promise.all([
      sl<MatchupRow[]>(`/league/${row.league_id}/matchups/${w}`),
      sl<TransactionRow[]>(`/league/${row.league_id}/transactions/${w}`),
    ]);
    return [w, m, t] as const;
  }));
  // A week Sleeper wouldn't give us is tried again next run, along with everything after it.
  const done: [number, WeekCounts][] = [];
  for (const [w, m, t] of fetched) {
    if (!m || !t) break;
    done.push([w, countWeek(m, t, { budget: row.faab_budget, bestBall: row.fmt.startsWith('bestball') })]);
  }
  if (!done.length) return 0;

  const db = await ensureArchive();
  if (!db) return 0;
  // A deadlock (another league's transaction holding the other rows) is worth one more try.
  for (let attempt = 0; ; attempt++) {
    try {
      await writeWeeks(db, row, done);
      return done.length;
    } catch (err) {
      if (attempt < 2 && (err as { code?: string })?.code === '40P01') { await new Promise(r => setTimeout(r, 250 + Math.random() * 500)); continue; }
      throw err;
    }
  }
}

async function writeWeeks(db: NonNullable<Awaited<ReturnType<typeof ensureArchive>>>, row: Row, done: [number, WeekCounts][]): Promise<void> {
  const last = done[done.length - 1][0];
  const client = await db.connect();
  try {
    await inTransaction(client, async () => {
      const cur = await client.query(`SELECT ingested_week FROM ${T('mkt_leagues')} WHERE league_id = $1 FOR UPDATE`, [row.league_id]);
      if (Number(cur.rows[0]?.ingested_week ?? -1) !== row.ingested_week) return; // someone else got here first
      await addPlayerWeeks(client, row.season, row.fmt, done);
      for (const [w, c] of done) {
        if (!c.teams && !c.players.size) continue;
        await client.query(
          `INSERT INTO ${T('mkt_fmt_week')} AS t (season, week, fmt, leagues, teams, pts_sum, pts_sq) VALUES ($1,$2,$3,1,$4,$5,$6)
           ON CONFLICT (season, week, fmt) DO UPDATE SET leagues = t.leagues + 1, teams = t.teams + EXCLUDED.teams,
             pts_sum = t.pts_sum + EXCLUDED.pts_sum, pts_sq = t.pts_sq + EXCLUDED.pts_sq`,
          [row.season, w, row.fmt, c.teams, c.ptsSum, c.ptsSq],
        );
        for (const tr of c.trades) {
          await client.query(
            `INSERT INTO ${T('mkt_trades')} (transaction_id, season, week, fmt, teams, sides, made_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
            [tr.id, row.season, w, row.fmt, tr.teams, JSON.stringify(tr.sides), tr.madeAt ? new Date(tr.madeAt) : null],
          );
        }
      }
      const sum = (f: (c: WeekCounts) => number) => done.reduce((s, [, c]) => s + f(c), 0);
      await client.query(
        `UPDATE ${T('mkt_leagues')} SET ingested_week = $2, team_weeks = team_weeks + $3, pts_sum = pts_sum + $4, pts_sq = pts_sq + $5,
           trades = trades + $6, adds = adds + $7, updated_at = now() WHERE league_id = $1`,
        [row.league_id, last, sum(c => c.teams), sum(c => c.ptsSum), sum(c => c.ptsSq), sum(c => c.trades.length), sum(c => c.adds)],
      );
    });
  } finally {
    client.release();
  }
}

/** Where every player went in the league's finished drafts, for draft position by format. */
async function ingestDrafts(row: Row, league: SleeperLeague | null, deadline: number): Promise<void> {
  if (!(await waitForSleeperRoom(2, deadline))) throw new OutOfTime();
  const drafts = await sl<{ draft_id: string; status: string; type: string; settings?: { rounds?: number } }[]>(`/league/${row.league_id}/drafts`);
  if (!drafts) return;
  const kindOf = (d: { settings?: { rounds?: number } }) => {
    if (!row.fmt.startsWith('dynasty')) return row.fmt.split('|')[0];
    // A dynasty league's first draft is its startup; after that, drafts are rookie drafts.
    return league?.previous_league_id || Number(d.settings?.rounds ?? 99) <= 6 ? 'rookie' : 'startup';
  };
  const picks: [string, number, string][] = [];
  for (const d of drafts.filter(d => d.status === 'complete' && d.type !== 'auction')) {
    const ps = await sl<{ player_id?: string; pick_no?: number }[]>(`/draft/${d.draft_id}/picks`);
    for (const p of ps ?? []) if (p.player_id && p.pick_no) picks.push([p.player_id, p.pick_no, kindOf(d)]);
  }
  const db = await ensureArchive();
  if (!db) return;
  const client = await db.connect();
  try {
    await inTransaction(client, async () => {
      const cur = await client.query(`SELECT drafted FROM ${T('mkt_leagues')} WHERE league_id = $1 FOR UPDATE`, [row.league_id]);
      if (cur.rows[0]?.drafted !== false) return;
      for (let i = 0; i < picks.length; i += 1000) {
        const params: unknown[] = [];
        const values = picks.slice(i, i + 1000).map(([pid, no, kind]) => {
          params.push(row.season, row.fmt, kind, pid, no);
          const n = params.length;
          return `($${n - 4},$${n - 3},$${n - 2},$${n - 1},1,$${n}::double precision,$${n}::double precision * $${n})`;
        }).join(',');
        await client.query(
          `INSERT INTO ${T('mkt_adp')} AS t (season, fmt, kind, player_id, picks, pick_sum, pick_sq) VALUES ${values}
           ON CONFLICT (season, fmt, kind, player_id) DO UPDATE SET picks = t.picks + 1, pick_sum = t.pick_sum + EXCLUDED.pick_sum, pick_sq = t.pick_sq + EXCLUDED.pick_sq`,
          params,
        );
      }
      await client.query(`UPDATE ${T('mkt_leagues')} SET drafted = true WHERE league_id = $1`, [row.league_id]);
    });
  } finally {
    client.release();
  }
}

/** A league's managers' other leagues this season, into the frontier: two managers, at random. */
async function expand(leagueId: string, season: string, deadline: number): Promise<number> {
  if (!(await waitForSleeperRoom(3, deadline))) return 0;
  const users = await sl<{ user_id: string }[]>(`/league/${leagueId}/users`);
  const ids = (users ?? []).map(u => u.user_id).filter(Boolean).sort(() => Math.random() - 0.5).slice(0, 2);
  const found = new Set<string>();
  for (const id of ids) {
    const leagues = await sl<{ league_id: string }[]>(`/user/${id}/leagues/nfl/${season}`);
    for (const l of leagues ?? []) if (l.league_id) found.add(l.league_id);
  }
  return addToFrontier([...found], season);
}

async function addToFrontier(ids: string[], season: string): Promise<number> {
  if (!ids.length) return 0;
  const db = await ensureArchive();
  if (!db) return 0;
  const r = await db.query(
    `INSERT INTO ${T('mkt_frontier')} (league_id, season)
     SELECT id, $2 FROM unnest($1::text[]) AS id
     WHERE NOT EXISTS (SELECT 1 FROM ${T('mkt_leagues')} l WHERE l.league_id = id)
     ON CONFLICT DO NOTHING`,
    [ids, season],
  );
  return r.rowCount ?? 0;
}

/** Starting points for discovery: the platform's own Sleeper leagues' managers, and any configured seeds. */
async function seed(season: string, deadline: number): Promise<number> {
  const { listTenants } = await import('@/lib/platform/tenants');
  const tenants = await listTenants().catch(() => []);
  const leagues = [
    ...tenants.map(t => t.leagueId).filter(id => /^\d+$/.test(id)),
    ...(process.env.LP_MARKET_SEEDS ?? '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)),
  ];
  let n = 0;
  for (const id of leagues.slice(0, 20)) n += await expand(id, season, deadline);
  return n;
}

/** Adds a league from the frontier to the sample, if it's one worth counting. */
async function adopt(leagueId: string, season: string, upTo: number, deadline: number): Promise<'added' | 'skipped'> {
  if (!(await waitForSleeperRoom(1, deadline))) throw new OutOfTime();
  const league = await sl<SleeperLeague>(`/league/${leagueId}`);
  const db = await ensureArchive();
  await db?.query(`DELETE FROM ${T('mkt_frontier')} WHERE league_id = $1`, [leagueId]);
  const size = Number(league?.total_rosters ?? 0);
  if (!league || (league.sport && league.sport !== 'nfl') || String(league.season) !== season
    || !['in_season', 'complete', 'post_season'].includes(String(league.status)) || size < 4 || size > 32) return 'skipped';

  const { fmt } = formatOf(league);
  const [{ rows: [mix] }] = await Promise.all([db!.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE fmt = $2)::int AS same FROM ${T('mkt_leagues')} WHERE season = $1`, [season, fmt])]);
  if (Number(mix?.total) >= 100 && (Number(mix.same) + 1) / (Number(mix.total) + 1) > FORMAT_SHARE_MAX) return 'skipped';
  const budget = league.settings?.waiver_type === 2 ? Number(league.settings.waiver_budget ?? 100) || 100 : null;
  const scoring = Object.fromEntries(KEEP_SCORING.filter(k => league.scoring_settings?.[k] != null).map(k => [k, league.scoring_settings![k]]));
  const inserted = await db!.query(
    `INSERT INTO ${T('mkt_leagues')} (league_id, season, fmt, size, faab_budget, scoring, roster_positions) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT DO NOTHING`,
    [leagueId, season, fmt, size, budget, JSON.stringify(scoring), JSON.stringify(league.roster_positions ?? [])],
  );
  if (!inserted.rowCount) return 'skipped';
  const row: Row = { league_id: leagueId, season, fmt, size, faab_budget: budget, ingested_week: 0, drafted: false };
  await ingestDrafts(row, league, deadline);
  await ingest(row, upTo, deadline);
  return 'added';
}

async function pool<T>(items: T[], work: (x: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (queue.length) await work(queue.shift()!);
  }));
}

export interface CrawlSummary {
  skipped?: string; season?: string; week?: number;
  caughtUp: number; weeks: number; added: number; passed: number; frontier: number; sample: number; ms: number;
}

export async function crawlMarket(): Promise<CrawlSummary> {
  const t0 = Date.now(), deadline = t0 + BUDGET_MS;
  const out: CrawlSummary = { caughtUp: 0, weeks: 0, added: 0, passed: 0, frontier: 0, sample: 0, ms: 0 };
  const done = (skipped?: string) => ({ ...out, ...(skipped ? { skipped } : {}), ms: Date.now() - t0 });
  if (!marketEnabled()) return done('off (set LP_MARKET_CRAWL=1)');
  const db = await ensureArchive();
  if (!db) return done('no database');
  const { getRedis } = await import('@/lib/redisClient');
  const redis = getRedis().client;
  if (redis && await redis.get('lp_market_lock')) return done('already running');
  await redis?.set('lp_market_lock', '1', 300);
  const run = await db.query(`INSERT INTO ${T('mkt_runs')} DEFAULT VALUES RETURNING id`);

  try {
    const state = await finalWeek();
    if (!state) return done('no NFL state');
    out.season = state.season; out.week = state.week;
    if (state.week < 1) return done('no final week yet this season');

    // Storage first. The archive shares this database, so the market never fills it: past 85% of
    // LP_POSTGRES_LIMIT_MB the sample stops growing, past 95% the market stops writing at all.
    // Weekly player detail is kept for the last LP_MARKET_KEEP_SEASONS seasons (2); leagues,
    // trades and draft positions are small and kept for good, as history to learn from.
    const keep = env('LP_MARKET_KEEP_SEASONS', 2);
    const oldest = String(Number(state.season) - keep + 1);
    await db.query(`DELETE FROM ${T('mkt_player_week')} WHERE season < $1`, [oldest]);
    await db.query(`DELETE FROM ${T('mkt_frontier')} WHERE season <> $1`, [state.season]);
    const limitBytes = (Number(process.env.LP_POSTGRES_LIMIT_MB) || 512) * 1024 * 1024;
    const used = Number((await db.query(`SELECT pg_database_size(current_database())::bigint AS b`)).rows[0]?.b ?? 0);
    if (used > limitBytes * 0.95) return done('database over 95% of its limit: the market is not writing');

    // 1. The sample, up to date: the leagues furthest behind first.
    const behind = await db.query<Row>(
      `SELECT league_id, season, fmt, size, faab_budget, ingested_week, drafted FROM ${T('mkt_leagues')}
       WHERE season = $1 AND ingested_week < $2 ORDER BY ingested_week, updated_at LIMIT 400`,
      [state.season, state.week],
    );
    await pool(behind.rows, async row => {
      if (Date.now() > deadline) return;
      try {
        const n = await ingest(row, state.week, deadline);
        if (n) { out.caughtUp++; out.weeks += n; }
      } catch (err) { if (!(err instanceof OutOfTime)) console.error('[market] catch-up failed', err instanceof Error ? err.message : err); }
    });

    // 2. New leagues, while there's room in the sample and the database.
    const { rows: [count] } = await db.query(`SELECT count(*)::int AS n FROM ${T('mkt_leagues')} WHERE season = $1`, [state.season]);
    out.sample = Number(count?.n ?? 0);
    const roomy = used < limitBytes * 0.85;
    const want = Math.min(env('LP_MARKET_NEW_PER_RUN', 40), env('LP_MARKET_LEAGUES', 3000) - out.sample);
    if (roomy && want > 0 && Date.now() < deadline) {
      let next = await db.query<{ league_id: string }>(
        `SELECT league_id FROM ${T('mkt_frontier')} WHERE season = $1 AND r >= random() ORDER BY r LIMIT $2`, [state.season, want]);
      if (!next.rows.length) {
        await seed(state.season, deadline);
        next = await db.query(`SELECT league_id FROM ${T('mkt_frontier')} WHERE season = $1 ORDER BY r LIMIT $2`, [state.season, want]);
      }
      const frontierSize = Number((await db.query(`SELECT count(*)::int AS n FROM ${T('mkt_frontier')} WHERE season = $1`, [state.season])).rows[0]?.n ?? 0);
      await pool(next.rows.map(r => r.league_id), async id => {
        if (Date.now() > deadline) return;
        try {
          const how = await adopt(id, state.season, state.week, deadline);
          if (how === 'added') {
            out.added++;
            if (frontierSize < FRONTIER_MAX) await expand(id, state.season, deadline);
          } else out.passed++;
        } catch (err) { if (!(err instanceof OutOfTime)) console.error('[market] could not add', id, err instanceof Error ? err.message : err); }
      });
    } else if (!roomy) out.skipped = 'database near its limit: not growing the sample';
    out.frontier = Number((await db.query(`SELECT count(*)::int AS n FROM ${T('mkt_frontier')} WHERE season = $1`, [state.season])).rows[0]?.n ?? 0);
    out.sample += out.added;
    return done();
  } finally {
    await db.query(`UPDATE ${T('mkt_runs')} SET finished_at = now(), summary = $2 WHERE id = $1`, [run.rows[0].id, JSON.stringify({ ...out, ms: Date.now() - t0 })]).catch(() => {});
    await redis?.del('lp_market_lock').catch(() => {});
  }
}
