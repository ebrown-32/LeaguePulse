/**
 * Per-IP allowances for the public AI endpoints.
 *
 * Every public endpoint that calls a model is a place a stranger could spend
 * the league's Anthropic credit, so each one gets its own bucket and limit.
 * Shared rather than copied: the chat route had this inline, and a second
 * copy for analytics is how one of them ends up quietly unguarded.
 */

import { getRedis } from '@/lib/redisClient';

/** In-memory fallback when Redis is not configured (local dev). */
const memoryHits = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(
  bucket: string, ip: string, limit: number, windowMs: number,
): Promise<{ ok: boolean; remaining: number }> {
  const key = `${bucket}${ip}`;
  const now = Date.now();
  const { client } = getRedis();

  if (!client) {
    const hit = memoryHits.get(key);
    if (!hit || now > hit.resetAt) {
      memoryHits.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, remaining: limit - 1 };
    }
    hit.count += 1;
    return { ok: hit.count <= limit, remaining: Math.max(limit - hit.count, 0) };
  }

  try {
    const raw = await client.get(key);
    const hit = raw ? (JSON.parse(raw) as { count: number; resetAt: number }) : null;
    if (!hit || now > hit.resetAt) {
      await client.set(key, JSON.stringify({ count: 1, resetAt: now + windowMs }));
      return { ok: true, remaining: limit - 1 };
    }
    hit.count += 1;
    await client.set(key, JSON.stringify(hit));
    return { ok: hit.count <= limit, remaining: Math.max(limit - hit.count, 0) };
  } catch {
    // Never let a rate-limiter outage take the feature down.
    return { ok: true, remaining: limit };
  }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
