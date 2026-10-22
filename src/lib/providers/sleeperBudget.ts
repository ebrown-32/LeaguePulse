/**
 * Sleeper asks apps to stay under 1,000 API calls a minute. This keeps one
 * count of the platform's calls to Sleeper, per clock minute, shared by every
 * server instance (Redis, `lp_sleeper_rpm:<minute>`).
 *
 *   Pages        are counted, never held up: a visitor waits for nobody.
 *   Background   jobs (the archive) check before each batch of calls that
 *                the minute's count, pages included, leaves room under
 *                JOB_CEILING. Past it they wait for the next minute, or give
 *                up and leave the work for their next run.
 *
 * With the defaults jobs stop at 600 a minute, so pages keep 400 even in the
 * busiest minute the jobs could make. Counted at the network: a season served
 * from a saved snapshot, or a fetch Next answers from its cache, costs nothing
 * here (counting the latter anyway errs on the safe side).
 *
 * Page counts are batched in memory and written about once a second, so a
 * busy page costs one Redis command, not one per Sleeper call.
 *
 * Server only. Without Redis, nothing is counted and nothing waits.
 */

import { getRedis } from '@/lib/redisClient';

/** Sleeper's published limit. */
export const SLEEPER_RPM = 1000;
/** What background jobs may bring a minute up to. */
const JOB_CEILING = Math.min(SLEEPER_RPM, Number(process.env.LP_SLEEPER_JOB_RPM) || 600);

const minute = (t = Date.now()) => Math.floor(t / 60_000);
const key = (m: number) => `lp_sleeper_rpm:${m}`;

let pending = 0;
let flushing: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushing = null;
  const n = pending;
  pending = 0;
  const r = getRedis().client;
  if (!n || !r) return;
  const k = key(minute());
  r.incrby(k, n).then(total => {
    // The back office keeps each hour's busiest minute (lib/ops/monitor).
    import('@/lib/ops/monitor').then(m => m.noteSleeperMinute(total)).catch(() => {});
    if (total === n) return r.expire(k, 120);
  }).catch(() => {});
}

/** Count calls a page made. Never waits. */
export function noteSleeperCalls(n = 1): void {
  pending += n;
  flushing ??= setTimeout(flush, 1_000);
}

/** The calls counted so far this minute, across every instance. */
export async function sleeperCallsThisMinute(): Promise<number> {
  const r = getRedis().client;
  if (!r) return 0;
  return Number(await r.get(key(minute())).catch(() => 0)) || 0;
}

/**
 * For a background job about to make `n` calls: resolves true once the
 * minute's count (pages included, and this instance's calls not yet written)
 * leaves room for them under the job ceiling, or false if it still does not
 * by `deadline` (epoch ms). Waits for the next minute while this one is full.
 *
 * Nothing is reserved: the calls are counted as they are made, like a page's.
 * There is one archive job at a time, so two jobs racing for the same room
 * is not a case that needs handling.
 */
export async function waitForSleeperRoom(n: number, deadline: number): Promise<boolean> {
  if (!getRedis().client || n <= 0) return true;
  n = Math.min(n, JOB_CEILING); // a larger batch still goes, alone in an empty minute
  for (;;) {
    const m = minute();
    const used = (await sleeperCallsThisMinute()) + pending;
    if (used + n <= JOB_CEILING) return true;
    const nextMinute = (m + 1) * 60_000;
    if (nextMinute + 1_000 > deadline) return false;
    await new Promise(res => setTimeout(res, nextMinute - Date.now() + 250));
  }
}
