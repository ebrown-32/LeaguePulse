/**
 * A starter's points as they stand right now (lib/live/liveMatchup). Pure.
 */

import type { LivePlay } from './liveTypes';

/**
 * When Sleeper's figure for a player last changed: the figure, and when this app first saw it.
 * Sleeper's live points trail the plays by minutes; the plays after that moment are what it
 * hasn't counted yet.
 */
export interface PointsAnchor { p: number; at: number }

/**
 * Points as they stand right now: Sleeper's official figure, plus the estimated points of each
 * play that came after Sleeper's figure last changed (lib/live/playFeed's estimate). Once
 * Sleeper catches up, its figure moves, the anchor moves with it, and the official number
 * stands alone again. Plays without a time or an estimate add nothing. Pure.
 */
export function catchUp(official: number | null, anchor: PointsAnchor | null, plays: Pick<LivePlay, 'points' | 'at'>[]): number | null {
  if (official == null || !anchor || anchor.p !== official) return official;
  let extra = 0;
  for (const play of plays) {
    const t = play.at ? Date.parse(play.at) : NaN;
    if (play.points != null && t > anchor.at) extra += play.points;
  }
  return extra ? Math.round((official + extra) * 100) / 100 : official;
}

