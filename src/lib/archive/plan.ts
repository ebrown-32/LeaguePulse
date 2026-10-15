/**
 * What an archive run reads for a season, which is what keeps the archive
 * cheap enough to run for every league, every hour, inside Sleeper's limit.
 *
 * A season's weeks settle: once a week is two NFL weeks in the past, its
 * scores have had their stat corrections and its moves are done. The archive
 * reads a week until it settles and never again. A finished season settles
 * all at once, and a season the archive has never seen is read whole.
 *
 * Pure.
 */

export const MAX_WEEK = 18;

/** How long after a week it is taken as final: its own week, then one more for corrections. */
export const SETTLE_LAG = 2;

export interface WeekPlan {
  /** Weeks to read and replace. */
  weeks: number[];
  /** The settled week to record once they are written. */
  settleTo: number;
}

export function planWeeks(o: { final: boolean; season: number; nflSeason: number; nflWeek: number; settled: number }): WeekPlan {
  // A finished season, or one before the NFL's current one (a league that
  // never marked itself complete), is read in full and settles in full.
  if (o.final || o.season < o.nflSeason) {
    return { weeks: range(o.settled + 1, MAX_WEEK), settleTo: MAX_WEEK };
  }
  // Next season's league, set up before its first game: nothing to read yet.
  if (o.season > o.nflSeason) return { weeks: [], settleTo: 0 };
  const current = Math.min(MAX_WEEK, Math.max(1, o.nflWeek || 1));
  return {
    weeks: range(o.settled + 1, current),
    settleTo: Math.max(o.settled, current - SETTLE_LAG),
  };
}

/**
 * The last week of a season that can no longer change, given the NFL's
 * current season and week. Used by the archive (above) and by the store of
 * settled weeks pages read from (src/lib/bundles/settled.ts).
 */
export function settledWeek(o: { season: number; complete: boolean; nflSeason: number; nflWeek: number }): number {
  if (o.complete || o.season < o.nflSeason) return MAX_WEEK;
  if (o.season > o.nflSeason) return 0;
  return Math.max(0, Math.min(MAX_WEEK, o.nflWeek - SETTLE_LAG));
}

function range(from: number, to: number): number[] {
  return to < from ? [] : Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * Sleeper calls a season read will make: the league, its users, rosters and
 * drafts, each draft's picks while the draft can still change, and a
 * matchups and a transactions call per week.
 */
export function sleeperCalls(weeks: number, openDrafts: number): number {
  return 4 + openDrafts + weeks * 2;
}
