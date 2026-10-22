/**
 * How the platform is doing, for the back office (/operator): every call the server makes to
 * another service, the server's own errors, and the scheduled jobs.
 *
 *   Calls    every fetch from the server, wrapped once at start-up (instrumentation): counted by
 *            provider (Sleeper, ESPN, Anthropic, FantasyCalc...) with errors, rate-limit answers
 *            (429) and time taken, in hourly buckets kept for a week. Sleeper's busiest minute in
 *            each hour too, against its 1,000 a minute.
 *   Errors   what Next reports through onRequestError: a count each hour and the last fifty.
 *   Jobs     each cron's last run: when, how long, and whether it worked (withCron).
 *
 * Counts are kept in memory and written about every thirty seconds, a handful of Redis commands
 * however busy the server is; the watching should never be what the bill is made of. Redis's own
 * traffic is never counted (counting it would count itself). Platform-wide: the keys are shared
 * (lp_ops), not one league's.
 *
 * Server only.
 */

export type Provider = 'sleeper' | 'espn' | 'anthropic' | 'fantasycalc' | 'dynastyprocess' | 'fantasypros' | 'stripe' | 'clerk' | 'images' | 'other';

export const PROVIDERS: { id: Provider; label: string; limit?: string }[] = [
  { id: 'sleeper', label: 'Sleeper', limit: '1,000 calls a minute' },
  { id: 'espn', label: 'ESPN', limit: 'No published limit' },
  { id: 'anthropic', label: 'Anthropic (AI)', limit: 'Your account’s rate limits' },
  { id: 'fantasycalc', label: 'FantasyCalc', limit: 'Refresh at most every 3 hours; 1,000 monthly users free' },
  { id: 'dynastyprocess', label: 'DynastyProcess', limit: 'GitHub raw files' },
  { id: 'fantasypros', label: 'FantasyPros', limit: 'Free tier' },
  { id: 'stripe', label: 'Stripe', limit: '100 requests a second' },
  { id: 'clerk', label: 'Clerk', limit: 'Plan limits' },
  { id: 'images', label: 'Image CDNs', limit: 'None' },
  { id: 'other', label: 'Everything else' },
];

/** Which provider a URL's host belongs to; null for what isn't counted (this site, Redis). */
export function providerOf(host: string): Provider | null {
  const h = host.toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h === '127.0.0.1') return null;
  if (REDIS_HOST && h === REDIS_HOST) return null;
  if (OWN_HOSTS.some(o => h === o || h.endsWith(`.${o}`))) return null;
  if (h === 'sleepercdn.com' || h.endsWith('.sleepercdn.com')) return 'images';
  if (h.endsWith('sleeper.app') || h.endsWith('sleeper.com')) return 'sleeper';
  if (h.endsWith('espncdn.com')) return 'images';
  if (h.endsWith('espn.com')) return 'espn';
  if (h.endsWith('anthropic.com')) return 'anthropic';
  if (h.endsWith('fantasycalc.com')) return 'fantasycalc';
  if (h === 'raw.githubusercontent.com') return 'dynastyprocess';
  if (h.endsWith('fantasypros.com')) return 'fantasypros';
  if (h.endsWith('stripe.com')) return 'stripe';
  if (h.endsWith('clerk.com') || h.endsWith('clerk.accounts.dev')) return 'clerk';
  return 'other';
}

const hostOf = (u: string | undefined) => { try { return u ? new URL(u).host.toLowerCase() : ''; } catch { return ''; } };
const REDIS_HOST = hostOf((process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim());
const OWN_HOSTS = [process.env.NEXT_PUBLIC_LP_ROOT_DOMAIN, process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .map(h => (h ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);

const FIELDS = ['calls', 'err', 'r429', 'ms'] as const;
type Field = (typeof FIELDS)[number];
const KEEP_S = 8 * 86_400;
export const hourOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 13); // 2026-10-21T14
const key = (hour: string, provider: string, field: string) => `lp_ops:${hour}:${provider}:${field}`;

// Counted here, written in batches.
const pending = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
const bump = (k: string, n: number) => { pending.set(k, (pending.get(k) ?? 0) + n); timer ??= setTimeout(flush, 30_000); };

async function flush() {
  timer = null;
  if (!pending.size) return;
  const batch = [...pending.entries()];
  pending.clear();
  const { getRedis } = await import('@/lib/redisClient');
  const r = getRedis().client;
  if (!r) return;
  await Promise.all(batch.map(async ([k, n]) => {
    if (k.startsWith('peak:')) {
      // The busiest minute this hour: kept if higher than what's there.
      const pk = k.slice(5), was = Number(await r.get(pk).catch(() => 0)) || 0;
      if (n > was) await r.set(pk, String(n), KEEP_S).catch(() => {});
      return;
    }
    const total = await r.incrby(k, Math.round(n)).catch(() => 0);
    if (total === Math.round(n)) await r.expire(k, KEEP_S).catch(() => {});
  }));
}

/** One call to another service, as it finished. */
export function noteCall(provider: Provider, ok: boolean, status: number, ms: number) {
  const h = hourOf();
  bump(key(h, provider, 'calls'), 1);
  bump(key(h, provider, 'ms'), ms);
  if (!ok) bump(key(h, provider, 'err'), 1);
  if (status === 429) bump(key(h, provider, 'r429'), 1);
}

/** Sleeper's count for the minute so far (from sleeperBudget), for the hour's busiest minute. */
export function noteSleeperMinute(total: number) {
  const k = `peak:lp_ops_peak:${hourOf()}:sleeper`;
  if (total > (pending.get(k) ?? 0)) { pending.set(k, total); timer ??= setTimeout(flush, 30_000); }
}

declare global { var __lpFetchWatched: boolean | undefined } // eslint-disable-line no-var

/** Wrap the server's fetch, once: every call out is counted by provider. */
export function watchFetch() {
  if (globalThis.__lpFetchWatched) return;
  globalThis.__lpFetchWatched = true;
  const original = globalThis.fetch;
  const watched = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const provider = providerOf(hostOf(url));
    if (!provider) return original(input, init);
    const t0 = Date.now();
    try {
      const res = await original(input, init);
      noteCall(provider, res.ok || res.status === 304, res.status, Date.now() - t0);
      return res;
    } catch (err) {
      noteCall(provider, false, 0, Date.now() - t0);
      throw err;
    }
  };
  globalThis.fetch = Object.assign(watched, original) as typeof fetch;
}

export interface ServerError { at: string; message: string; path: string; route: string; kind: string; digest?: string }

/** A server error Next reported (instrumentation's onRequestError). */
export async function noteError(e: Omit<ServerError, 'at'>) {
  bump(key(hourOf(), 'app', 'err'), 1);
  const { getRedis } = await import('@/lib/redisClient');
  const r = getRedis().client;
  if (!r) return;
  await r.lpush('lp_ops_errors', JSON.stringify({ at: new Date().toISOString(), ...e, message: e.message.slice(0, 500) })).catch(() => {});
  await r.ltrim('lp_ops_errors', 0, 49).catch(() => {});
}

export interface CronRun { at: string; ms: number; status: number; ok: boolean }

/** A cron handler, with its runs recorded: when, how long, whether it answered 2xx. */
export function withCron(name: string, handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    const t0 = Date.now();
    let status = 500;
    try {
      const res = await handler(req);
      status = res.status;
      return res;
    } finally {
      // A call without the cron's secret isn't a run.
      if (status !== 401 && status !== 403) {
        const run: CronRun = { at: new Date(t0).toISOString(), ms: Date.now() - t0, status, ok: status < 400 };
        const { getRedis } = await import('@/lib/redisClient');
        const r = getRedis().client;
        await r?.set(`lp_ops_cron:${name}`, JSON.stringify(run), KEEP_S).catch(() => {});
        if (!run.ok) await r?.set(`lp_ops_cron_fail:${name}`, JSON.stringify(run), KEEP_S).catch(() => {});
      }
    }
  };
}

export const CRONS = [
  { id: 'franchise', label: 'Franchise posts and trade coverage', every: 15 },
  { id: 'espn-sync', label: 'ESPN league sync', every: 5 },
  { id: 'archive', label: 'League archive', every: 60 },
  { id: 'ai', label: 'AI desk', every: 24 * 60 },
  { id: 'fantasypros', label: 'FantasyPros rankings', every: 24 * 60 },
];

export interface ProviderStats {
  id: Provider; label: string; limit?: string;
  /** Oldest first, one an hour, the last 24. */
  hourly: { hour: string; calls: number; err: number; r429: number; ms: number }[];
  day: { calls: number; err: number; r429: number; avgMs: number };
  week: { calls: number; err: number; r429: number };
}

/** The last week, for the back office. */
export async function readOps() {
  await flush(); // this instance's counts so far, so the panel is current
  const { getRedis } = await import('@/lib/redisClient');
  const r = getRedis().client;
  const now = Date.now();
  const hours = Array.from({ length: 24 * 7 }, (_, i) => hourOf(now - (24 * 7 - 1 - i) * 3_600_000));
  const ids = [...PROVIDERS.map(p => p.id), 'app'];
  const keys = hours.flatMap(h => ids.flatMap(id => FIELDS.map(f => key(h, id, f))));
  const vals: number[] = [];
  // In chunks: one request each, never one enormous one.
  for (let i = 0; i < keys.length && r; i += 400) vals.push(...(await r.mget(keys.slice(i, i + 400)).catch(() => [])).map(v => Number(v ?? 0) || 0));
  const at = (hi: number, id: string, f: Field) => vals[(hi * ids.length + ids.indexOf(id)) * FIELDS.length + FIELDS.indexOf(f)] ?? 0;
  const providers: ProviderStats[] = PROVIDERS.map(p => {
    const hourly = hours.map((hour, hi) => ({ hour, calls: at(hi, p.id, 'calls'), err: at(hi, p.id, 'err'), r429: at(hi, p.id, 'r429'), ms: at(hi, p.id, 'ms') }));
    const last = hourly.slice(-24);
    const sum = (xs: typeof hourly, f: 'calls' | 'err' | 'r429' | 'ms') => xs.reduce((s, x) => s + x[f], 0);
    const dayCalls = sum(last, 'calls');
    return {
      ...p, hourly: last,
      day: { calls: dayCalls, err: sum(last, 'err'), r429: sum(last, 'r429'), avgMs: dayCalls ? Math.round(sum(last, 'ms') / dayCalls) : 0 },
      week: { calls: sum(hourly, 'calls'), err: sum(hourly, 'err'), r429: sum(hourly, 'r429') },
    };
  });
  const appErrors = hours.slice(-24).map((hour, i) => ({ hour, err: at(hours.length - 24 + i, 'app', 'err') }));

  const [errorsRaw, peaks, cronRaw, cronFailRaw, minuteNow] = await Promise.all([
    r?.lrange('lp_ops_errors', 0, 49).catch(() => []) ?? [],
    r?.mget(hours.slice(-24).map(h => `lp_ops_peak:${h}:sleeper`)).catch(() => []) ?? [],
    r?.mget(CRONS.map(c => `lp_ops_cron:${c.id}`)).catch(() => []) ?? [],
    r?.mget(CRONS.map(c => `lp_ops_cron_fail:${c.id}`)).catch(() => []) ?? [],
    import('@/lib/providers/sleeperBudget').then(m => m.sleeperCallsThisMinute()).catch(() => 0),
  ]);
  const parse = <T,>(s: string | null | undefined): T | null => { try { return s ? JSON.parse(s) as T : null; } catch { return null; } };
  const peakByHour = (peaks as (string | null)[]).map(v => Number(v ?? 0) || 0);
  return {
    providers,
    appErrors,
    errors: (errorsRaw as string[]).map(s => parse<ServerError>(s)).filter((e): e is ServerError => Boolean(e)),
    sleeper: { thisMinute: minuteNow, limit: 1000, peakMinute24h: Math.max(0, ...peakByHour), peakByHour },
    crons: CRONS.map((c, i) => ({ ...c, last: parse<CronRun>((cronRaw as (string | null)[])[i]), lastFailure: parse<CronRun>((cronFailRaw as (string | null)[])[i]) })),
  };
}
