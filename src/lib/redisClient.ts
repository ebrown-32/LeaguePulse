/**
 * One Redis abstraction for the whole app.
 *
 * Two transports are supported, because Upstash hands out both and which one
 * you get depends on how you connected it:
 *
 *   REST  - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN. Preferred on
 *           Vercel: it is plain HTTPS, so there is no socket to open, time out,
 *           or leak across serverless invocations.
 *   TCP   - REDIS_URL (rediss://…). Works anywhere, including local Redis.
 *
 * REST wins when both are present. Four modules used to keep their own copy of
 * this setup, each with its own subtly different failure behaviour.
 */

export type RedisBackend = 'upstash-rest' | 'tcp' | 'none';

export interface RedisLike {
  get(key: string): Promise<string | null>;
  /** With ttlSeconds, the key expires on its own after that long. */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /**
   * List operations, for collections that are appended to concurrently.
   *
   * Holding a growing collection in one JSON string means every append is a
   * read, a modify and a write, and two of those overlapping lose one of the
   * writes outright. Measured against the real store, eight concurrent appends
   * to a single key kept one. A list makes the append a single atomic command,
   * and Redis never parses the members, so the stored JSON is returned exactly
   * as it was written.
   */
  lpush(key: string, value: string): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  lrem(key: string, count: number, value: string): Promise<number>;
  llen(key: string): Promise<number>;
  /** Atomic counters, for values many readers change at once. Same reasoning
   *  as the list operations: a read-modify-write would drop concurrent taps. */
  incrby(key: string, by: number): Promise<number>;
  /** Expire a key after `seconds`, leaving its value alone (unlike set with a ttl). */
  expire(key: string, seconds: number): Promise<void>;
  mget(keys: string[]): Promise<(string | null)[]>;
}

export interface RedisResolution {
  client: RedisLike | null;
  backend: RedisBackend;
  /** Why there is no client, when there isn't one. */
  reason?: string;
}

function restConfig(): { url: string; token: string } | null {
  // The KV_ names are what Upstash sets when installed from the Vercel
  // Marketplace; the UPSTASH_ names are what its own console hands out.
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim();
  if (!url || !token) return null;
  return { url, token };
}

function tcpUrl(): string | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url || url.includes('your-redis')) return null;
  return url;
}

let cached: RedisResolution | null = null;
let scoped: RedisResolution | null = null;

/**
 * Keys every league shares, never prefixed.
 *
 * The platform's own records (which league lives where), and data that is the
 * same whichever league asks: player id links, expert rankings, and caches
 * already keyed by league id. Everything else belongs to one league.
 */
const SHARED_PREFIXES = [
  'lp_tenant', 'lp_slug_hold', 'lp_storage_probe',
  'lp_espn_xwalk', 'lp_espn_creds', 'lp_fp_snapshot', 'lp_calib_v', 'lp_gotw_v',
  // One count of Sleeper calls for the whole platform (src/lib/providers/sleeperBudget.ts).
  'lp_sleeper_rpm',
  // The live NFL slate, one for every league (src/lib/live/espn.ts).
  'lp_live_',
  // The demo league's scored weeks, from the real NFL games (src/lib/demo/data.ts).
  'lp_demo_',
  // Trade market values, one copy a league format (src/lib/trades/values.ts).
  'lp_fc_values',
];

/**
 * Prefix a key with its league, in hosted mode.
 *
 * This is the one place leagues are kept apart in storage, so no caller can
 * forget to: a league's posts, cast, theme, likes and settings all land under
 * `t:<slug>:`. A shared key returns before the league is looked up at all,
 * which is also what stops the registry lookup recursing into itself.
 */
async function scopeKey(key: string): Promise<string> {
  // A namespace over everything, shared keys included, for running the hosted
  // product locally against a database that also serves a real site: local
  // leagues, the platform registry and their caches all sit under it. Set by
  // `npm run dev:hosted`; never set in production.
  const ns = process.env.LP_REDIS_NAMESPACE?.trim() ?? '';
  if (SHARED_PREFIXES.some(p => key.startsWith(p))) return ns + key;
  const { currentTenant } = await import('@/lib/tenant/context');
  const t = await currentTenant();
  return ns + (t ? `t:${t.slug}:${key}` : key);
}

function scopeClient(c: RedisLike): RedisLike {
  return {
    get: async k => c.get(await scopeKey(k)),
    set: async (k, v, ttl) => c.set(await scopeKey(k), v, ttl),
    del: async k => c.del(await scopeKey(k)),
    lpush: async (k, v) => c.lpush(await scopeKey(k), v),
    ltrim: async (k, s, e) => c.ltrim(await scopeKey(k), s, e),
    lrange: async (k, s, e) => c.lrange(await scopeKey(k), s, e),
    lrem: async (k, n, v) => c.lrem(await scopeKey(k), n, v),
    llen: async k => c.llen(await scopeKey(k)),
    incrby: async (k, by) => c.incrby(await scopeKey(k), by),
    expire: async (k, s) => c.expire(await scopeKey(k), s),
    mget: async keys => c.mget(await Promise.all(keys.map(scopeKey))),
  };
}

/**
 * The active client. Self-hosted, exactly the client below. Hosted, the same
 * client with every key scoped to the request's league.
 */
export function getRedis(): RedisResolution {
  if (process.env.LP_HOSTED !== '1') return resolveRedis();
  if (scoped) return scoped;
  const raw = resolveRedis();
  scoped = raw.client ? { ...raw, client: scopeClient(raw.client) } : raw;
  return scoped;
}

/**
 * Resolve the active client. Cached per process: the REST client is a plain
 * HTTPS wrapper with nothing to keep alive, and the TCP client is connected
 * lazily on first use.
 */
function resolveRedis(): RedisResolution {
  if (cached) return cached;

  const rest = restConfig();
  if (rest) {
    try {
      const { Redis } = require('@upstash/redis');
      // Upstash deserializes JSON automatically, which would hand callers an
      // object where every other path returns a raw string. Turn it off so the
      // two transports behave identically.
      const c = new Redis({ ...rest, automaticDeserialization: false });
      cached = {
        backend: 'upstash-rest',
        client: {
          get: (k) => c.get(k) as Promise<string | null>,
          set: async (k, v, ttl) => { await (ttl ? c.set(k, v, { ex: ttl }) : c.set(k, v)); },
          del: async (k) => { await c.del(k); },
          lpush: (k, v) => c.lpush(k, v) as Promise<number>,
          ltrim: async (k, s, e) => { await c.ltrim(k, s, e); },
          lrange: (k, s, e) => c.lrange(k, s, e) as Promise<string[]>,
          lrem: (k, n, v) => c.lrem(k, n, v) as Promise<number>,
          llen: (k) => c.llen(k) as Promise<number>,
          incrby: (k, by) => c.incrby(k, by) as Promise<number>,
          expire: async (k, s) => { await c.expire(k, s); },
          mget: async (keys) =>
            keys.length ? (await c.mget(...keys)) as (string | null)[] : [],
        },
      };
      return cached;
    } catch (err) {
      cached = {
        client: null, backend: 'none',
        reason: `Upstash REST client failed to initialise: ${err instanceof Error ? err.message : err}`,
      };
      return cached;
    }
  }

  const url = tcpUrl();
  if (url) {
    try {
      const { createClient } = require('redis');
      const c = createClient({ url });
      // Without a handler node-redis throws on transient errors; the awaited
      // calls below surface real failures to the caller instead.
      c.on('error', () => {});
      const ready = async () => { if (!c.isOpen) await c.connect(); };
      cached = {
        backend: 'tcp',
        client: {
          get: async (k) => { await ready(); return c.get(k); },
          set: async (k, v, ttl) => { await ready(); await (ttl ? c.set(k, v, { EX: ttl }) : c.set(k, v)); },
          del: async (k) => { await ready(); await c.del(k); },
          lpush: async (k, v) => { await ready(); return c.lPush(k, v); },
          ltrim: async (k, s, e) => { await ready(); await c.lTrim(k, s, e); },
          lrange: async (k, s, e) => { await ready(); return c.lRange(k, s, e); },
          lrem: async (k, n, v) => { await ready(); return c.lRem(k, n, v); },
          llen: async (k) => { await ready(); return c.lLen(k); },
          incrby: async (k, by) => { await ready(); return c.incrBy(k, by); },
          expire: async (k, s) => { await ready(); await c.expire(k, s); },
          mget: async (keys) => {
            if (!keys.length) return [];
            await ready();
            return c.mGet(keys);
          },
        },
      };
      return cached;
    } catch (err) {
      cached = {
        client: null, backend: 'none',
        reason: `Redis client failed to initialise: ${err instanceof Error ? err.message : err}`,
      };
      return cached;
    }
  }

  cached = {
    client: null, backend: 'none',
    reason: 'No Redis configured. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or REDIS_URL.',
  };
  return cached;
}

/** Tests only: forget the memoised client so env changes take effect. */
export function resetRedis(): void {
  cached = null;
  scoped = null;
}

/** True when some Redis transport is configured, regardless of whether it works. */
export function isRedisConfigured(): boolean {
  return Boolean(restConfig() || tcpUrl());
}
