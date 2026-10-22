/**
 * Operator only: how the platform is doing, for the back office's monitor (/operator).
 *
 *   GET   calls to every other service (lib/ops/monitor), the server's errors, the scheduled
 *         jobs, live checks of what the platform depends on, storage used, and the AI spend of
 *         every league
 *
 * Storage is read from the stores themselves: Upstash's INFO (its own data size and plan limit, for
 * the whole database, every namespace) and Postgres's sizes, against LP_POSTGRES_LIMIT_MB (512 when
 * unset, Neon's free plan).
 *
 * The live checks cost nothing that counts: Sleeper's NFL state, ESPN's scoreboard, Anthropic's
 * list of models (no tokens), Redis's own round trip. FantasyCalc is never called from here; its
 * terms ask for at most one refresh every three hours, so its health is read from the calls made.
 *
 * Takes `Authorization: Bearer $LP_OPERATOR_SECRET`, or a signed-in operator account.
 */

import { NextResponse } from 'next/server';
import { isOperator } from '@/lib/platform/operator';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface Check { id: string; label: string; ok: boolean; ms: number | null; detail: string }

async function timed(id: string, label: string, run: () => Promise<string>): Promise<Check> {
  const t0 = Date.now();
  try {
    const detail = await run();
    return { id, label, ok: true, ms: Date.now() - t0, detail };
  } catch (err) {
    return { id, label, ok: false, ms: Date.now() - t0, detail: err instanceof Error ? err.message : 'Failed' };
  }
}

async function get(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000), ...init });
  if (!res.ok) throw new Error(`Answered ${res.status}`);
  return res;
}

async function checks(): Promise<Check[]> {
  const { getRedis } = await import('@/lib/redisClient');
  const r = getRedis().client;
  const key = process.env.LP_MANAGED_ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
  return Promise.all([
    timed('redis', 'Storage (Redis)', async () => {
      if (!r) throw new Error('Not configured');
      await r.set('lp_ops_ping', String(Date.now()), 60);
      if (!(await r.get('lp_ops_ping'))) throw new Error('Wrote but could not read back');
      return 'Reading and writing';
    }),
    timed('sleeper', 'Sleeper API', async () => {
      const s = await (await get('https://api.sleeper.app/v1/state/nfl')).json();
      return `${s.season} season, week ${s.week} (${s.season_type})`;
    }),
    timed('espn', 'ESPN API', async () => {
      const s = await (await get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard')).json();
      return `${s.events?.length ?? 0} games on this week's scoreboard`;
    }),
    timed('anthropic', 'Anthropic (AI)', async () => {
      if (!key) throw new Error('No platform key set (LP_MANAGED_ANTHROPIC_API_KEY)');
      await get('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
      return 'Key accepted';
    }),
  ]);
}

interface Store { used: number; limit: number | null; detail: string; parts: { label: string; bytes: number }[] }

/** Upstash's own figures; INFO isn't in RedisLike, so this asks the REST endpoint directly. */
async function redisStorage(): Promise<Store | null> {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim();
  if (!url || !token) return null;
  const res = await get(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(['INFO']) });
  const info = String((await res.json()).result ?? '');
  const field = (k: string) => { const m = new RegExp(`^${k}:(\\d+)`, 'm').exec(info); return m ? Number(m[1]) : null; };
  const used = field('total_data_size') ?? field('used_memory');
  if (used == null) return null;
  const keys = field('total_keys') ?? 0;
  return { used, limit: field('max_data_size'), detail: `${keys.toLocaleString('en-US')} keys`, parts: [] };
}

async function postgresStorage(): Promise<Store | null> {
  const { ensureArchive } = await import('@/lib/archive/db');
  const db = await ensureArchive();
  if (!db) return null;
  const [total, schemas, tables] = await Promise.all([
    db.query<{ bytes: string }>('SELECT pg_database_size(current_database())::bigint AS bytes'),
    db.query<{ schema: string; bytes: string }>(`SELECT n.nspname AS schema, SUM(pg_total_relation_size(c.oid))::bigint AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'm') AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      GROUP BY 1 ORDER BY 2 DESC`),
    db.query<{ name: string; bytes: string }>(`SELECT n.nspname || '.' || c.relname AS name, pg_total_relation_size(c.oid)::bigint AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY 2 DESC LIMIT 5`),
  ]);
  const mb = Number(process.env.LP_POSTGRES_LIMIT_MB) || 512;
  return {
    used: Number(total.rows[0]?.bytes ?? 0), limit: mb * 1024 * 1024,
    detail: schemas.rows.map(r => `${r.schema} schema ${Math.round(Number(r.bytes) / 1048576)} MB`).join(', ') || 'No tables yet',
    parts: tables.rows.map(r => ({ label: r.name, bytes: Number(r.bytes) })),
  };
}

async function storage() {
  const [redis, postgres] = await Promise.all([redisStorage().catch(() => null), postgresStorage().catch(() => null)]);
  return { redis, postgres };
}

/** What every league's AI cost this month and last, at list prices, whoever's key paid. */
async function aiSpend() {
  const [{ listTenants, aiMode }, { runAsTenant }, { monthUsage }, { PLANS }] = await Promise.all([
    import('@/lib/platform/tenants'), import('@/lib/tenant/context'), import('@/lib/ai/usage'), import('@/lib/platform/config'),
  ]);
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const tenants = await listTenants().catch(() => []);
  const rows = await Promise.all(tenants.map(t => runAsTenant(t, async () => {
    const [cur, prev] = await Promise.all([monthUsage(thisMonth).catch(() => null), monthUsage(lastMonth).catch(() => null)]);
    return {
      slug: t.slug, name: t.leagueName, mode: aiMode(t), tier: t.tier ?? 'standard',
      month: cur?.cost ?? 0, calls: cur?.calls ?? 0, tokens: (cur?.inputTokens ?? 0) + (cur?.outputTokens ?? 0), lastMonth: prev?.cost ?? 0,
    };
  })));
  // The product site, and a self-hosted league, keep their counts outside any league.
  const [rootCur, rootPrev] = await Promise.all([monthUsage(thisMonth).catch(() => null), monthUsage(lastMonth).catch(() => null)]);
  if (rootCur?.calls || rootPrev?.calls) {
    rows.push({ slug: '', name: 'Product site / self-hosted', mode: 'own' as const, tier: 'standard', month: rootCur?.cost ?? 0, calls: rootCur?.calls ?? 0, tokens: (rootCur?.inputTokens ?? 0) + (rootCur?.outputTokens ?? 0), lastMonth: rootPrev?.cost ?? 0 });
  }
  const day = now.getUTCDate(), days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const sum = (xs: typeof rows) => xs.reduce((s, x) => s + x.month, 0);
  const platform = rows.filter(x => x.mode === 'platform');
  return {
    month: thisMonth, dayOfMonth: day, daysInMonth: days,
    total: sum(rows), projected: (sum(rows) / Math.max(1, day)) * days, lastMonth: rows.reduce((s, x) => s + x.lastMonth, 0),
    calls: rows.reduce((s, x) => s + x.calls, 0), tokens: rows.reduce((s, x) => s + x.tokens, 0),
    // What we pay for: leagues whose AI runs on the platform's key, against what they pay a year.
    platform: { leagues: platform.length, month: sum(platform), projected: (sum(platform) / Math.max(1, day)) * days, pricePerYear: PLANS.ai.season },
    leagues: rows.sort((a, b) => b.month - a.month),
  };
}

export async function GET(req: Request) {
  if (!(await isOperator(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { readOps } = await import('@/lib/ops/monitor');
  const [ops, live, ai, stores] = await Promise.all([readOps(), checks(), aiSpend().catch(() => null), storage()]);
  return NextResponse.json({ at: new Date().toISOString(), ...ops, checks: live, ai, storage: stores }, { headers: { 'cache-control': 'no-store' } });
}
