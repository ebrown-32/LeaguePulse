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
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

export interface RedisResolution {
  client: RedisLike | null;
  backend: RedisBackend;
  /** Why there is no client, when there isn't one. */
  reason?: string;
}

function restConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

function tcpUrl(): string | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url || url.includes('your-redis')) return null;
  return url;
}

let cached: RedisResolution | null = null;

/**
 * Resolve the active client. Cached per process: the REST client is a plain
 * HTTPS wrapper with nothing to keep alive, and the TCP client is connected
 * lazily on first use.
 */
export function getRedis(): RedisResolution {
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
          set: async (k, v) => { await c.set(k, v); },
          del: async (k) => { await c.del(k); },
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
          set: async (k, v) => { await ready(); await c.set(k, v); },
          del: async (k) => { await ready(); await c.del(k); },
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
}

/** True when some Redis transport is configured, regardless of whether it works. */
export function isRedisConfigured(): boolean {
  return Boolean(restConfig() || tcpUrl());
}
