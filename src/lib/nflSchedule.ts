/**
 * The NFL schedule, with real game status.
 *
 * Sleeper publishes this at `/schedule/nfl/{season_type}/{season}` and it is the
 * only authoritative answer to "has this week finished", which several features
 * were previously guessing at.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * The guess was `some roster has points > 0`. That is wrong the moment a
 * Thursday night game ends: one manager has 31 points from two starters, every
 * other game kicks off on Sunday, and the whole app concludes the week is over.
 * Matchups stamped every card FINAL in week 1, the simulator dropped the week
 * from its remaining schedule, and the weekly report folded a two-player score
 * into a team's season average.
 *
 * Nothing derived from scores can distinguish "nobody has played yet" from
 * "everybody played and scored zero", or "one game done" from "all done". The
 * schedule can.
 */

const BASE = 'https://api.sleeper.app';

/** Sleeper's own vocabulary. `canceled` is rare but real. */
export type GameStatus = 'pre_game' | 'in_game' | 'complete' | 'canceled';

export type WeekPhase =
  /** Not a single game has kicked off. */
  | 'upcoming'
  /** Some games are done, some are not. Scores are partial and will move. */
  | 'live'
  /** Every game has finished. Scores are settled. */
  | 'final';

interface ScheduleGame {
  status: GameStatus;
  date: string;
  home: string;
  away: string;
  week: number;
  game_id: string;
}

/**
 * One season's schedule.
 *
 * Cached hard for past seasons, briefly for the live one: a game flipping to
 * complete is exactly the change callers care about, so a stale hour would
 * leave a finished week showing as live.
 */
export async function seasonSchedule(
  season: string,
  isCurrentSeason = true,
): Promise<ScheduleGame[]> {
  try {
    const res = await fetch(`${BASE}/schedule/nfl/regular/${season}`, {
      next: { revalidate: isCurrentSeason ? 300 : 86400 },
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Every game in one week. */
export async function weekGames(
  season: string, week: number, isCurrentSeason = true,
): Promise<ScheduleGame[]> {
  const all = await seasonSchedule(season, isCurrentSeason);
  return all.filter(g => Number(g.week) === week);
}

/**
 * Where a week stands.
 *
 * A week with no schedule data returns 'upcoming' rather than guessing, which
 * keeps a fetch failure from silently marking a live week final.
 */
export function phaseOf(games: ScheduleGame[]): WeekPhase {
  if (games.length === 0) return 'upcoming';
  const done = games.filter(g => g.status === 'complete' || g.status === 'canceled').length;
  if (done === 0) return 'upcoming';
  return done === games.length ? 'final' : 'live';
}

export async function weekPhase(
  season: string, week: number, isCurrentSeason = true,
): Promise<WeekPhase> {
  return phaseOf(await weekGames(season, week, isCurrentSeason));
}

/**
 * Which NFL teams have finished playing in a given week.
 *
 * Keyed by team abbreviation, so a fantasy roster can be split into players
 * whose points are settled and players who have not taken the field. That split
 * is what makes a live win probability meaningful rather than decorative.
 *
 * A team on a bye simply has no entry.
 */
export async function teamGameStatus(
  season: string, week: number, isCurrentSeason = true,
): Promise<Map<string, GameStatus>> {
  const games = await weekGames(season, week, isCurrentSeason);
  const out = new Map<string, GameStatus>();
  for (const g of games) {
    if (g.home) out.set(g.home, g.status);
    if (g.away) out.set(g.away, g.status);
  }
  return out;
}

/** Convenience: has this specific team's game finished? */
export function hasPlayed(status: GameStatus | undefined): boolean {
  return status === 'complete' || status === 'canceled';
}

/**
 * The last week of a season whose games are all finished.
 *
 * This is the honest replacement for "count weeks where somebody scored". Weeks
 * are scanned in order and the run stops at the first unfinished one, so a
 * mid-season week that was postponed cannot make a later week look complete.
 */
export async function lastCompletedWeek(
  season: string, throughWeek: number, isCurrentSeason = true,
): Promise<number> {
  const all = await seasonSchedule(season, isCurrentSeason);
  if (all.length === 0) return 0;
  let last = 0;
  for (let w = 1; w <= throughWeek; w++) {
    const games = all.filter(g => Number(g.week) === w);
    if (phaseOf(games) !== 'final') break;
    last = w;
  }
  return last;
}
