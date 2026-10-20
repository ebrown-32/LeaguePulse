/**
 * How much the media desk writes: a league admin's choice (admin/ai-desk), read by the scheduler
 * (api/ai/cron). Every post is a model call, so this is the AI bill's main dial.
 *
 *   off       the desk is quiet: no AI posts at all (franchise accounts still post; they cost nothing)
 *   light     a post and a reply a day, live takes at most every three hours
 *   standard  three posts and two replies a day, live takes every two hours
 *   full      six posts and three replies a day, live takes every ninety minutes
 *
 * A league that never chose gets `light`. Out of
 * season every choice but off drops to a post every week or few (seasonalCadence).
 */

import { getRedis } from '@/lib/redisClient';

export type DeskVolume = 'off' | 'light' | 'standard' | 'full';
export const DESK_VOLUMES: DeskVolume[] = ['off', 'light', 'standard', 'full'];
export const DEFAULT_DESK_VOLUME: DeskVolume = 'light';

export interface Cadence {
  /** Posts written per scheduled run. */
  posts: number;
  /** Replies written per scheduled run. */
  replies: number;
  /** Hours between runs: with quiet hours overnight, what decides how many runs a day. */
  rerunHours: number;
  /** Minutes between live game-day posts. */
  liveMinutes: number;
  /** At most this many posts and replies in a day (Eastern), however the runs fall. */
  postsPerDay: number;
  repliesPerDay: number;
}

export function cadenceOf(v: Exclude<DeskVolume, 'off'>): Cadence {
  switch (v) {
    // People check in about once a day for something entertaining: a few good posts, a reply now
    // and then. Light is one run a day; standard and full about three (with the night quiet),
    // capped at the day's posts and replies.
    case 'light': return { posts: 1, replies: 1, rerunHours: 20, liveMinutes: 180, postsPerDay: 1, repliesPerDay: 1 };
    case 'standard': return { posts: 1, replies: 1, rerunHours: 5, liveMinutes: 120, postsPerDay: 3, repliesPerDay: 2 };
    case 'full': return { posts: 2, replies: 1, rerunHours: 5, liveMinutes: 90, postsPerDay: 6, repliesPerDay: 3 };
  }
}

/**
 * The cadence for the time of year. Out of season there is little to say, so the desk says very
 * little: a single post every week or few and no replies once the season is over or before the draft,
 * and no more than a post a day in the preseason. In season, the league's choice as it stands.
 */
export function seasonalCadence(v: Exclude<DeskVolume, 'off'>, phase: string): Cadence {
  const c = cadenceOf(v);
  if (phase === 'offseason' || phase === 'complete') {
    // Weeks apart: once a week at full, every two weeks at standard, every three at light.
    return { ...c, posts: 1, replies: 0, rerunHours: (v === 'full' ? 7 : v === 'standard' ? 14 : 21) * 24, postsPerDay: 1, repliesPerDay: 0 };
  }
  if (phase === 'preseason') return { ...c, posts: 1, replies: Math.min(1, c.replies), rerunHours: Math.max(24, c.rerunHours), postsPerDay: 1, repliesPerDay: Math.min(1, c.repliesPerDay) };
  return c;
}

/** What each choice means, for the admin's picker. */
export const DESK_VOLUME_INFO: Record<DeskVolume, { label: string; about: string }> = {
  off: { label: 'Off', about: 'No AI posts. Franchise accounts still post scores and big days.' },
  light: { label: 'Light', about: '1 post and 1 reply a day in season, a live take every few hours on game days, and a post every three weeks in the offseason.' },
  standard: { label: 'Standard', about: '3 posts and 2 replies a day in season, live takes every two hours on game days, and a post every two weeks in the offseason.' },
  full: { label: 'Full', about: '6 posts and 3 replies a day in season, live takes every ninety minutes on game days, and a post a week in the offseason.' },
};

const KEY = 'lp_ai_desk_volume';
const isVolume = (v: unknown): v is DeskVolume => typeof v === 'string' && (DESK_VOLUMES as string[]).includes(v);

export async function getDeskVolume(): Promise<DeskVolume> {
  const raw = await getRedis().client?.get(KEY).catch(() => null);
  if (isVolume(raw)) return raw;
  const env = process.env.AI_DESK_VOLUME?.trim();
  return isVolume(env) ? env : DEFAULT_DESK_VOLUME;
}

export async function setDeskVolume(v: unknown): Promise<DeskVolume> {
  if (!isVolume(v)) throw new Error(`Pick one of: ${DESK_VOLUMES.join(', ')}`);
  const r = getRedis().client;
  if (!r) throw new Error('Storage is not configured');
  await r.set(KEY, v);
  return v;
}
