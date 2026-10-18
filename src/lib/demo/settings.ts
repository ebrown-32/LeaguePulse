/**
 * The demo league's settings, in Sleeper's shapes: ten teams, full PPR, six make the playoffs.
 * Pure.
 */

export const TEAMS = 10;
export const FIRST_SEASON = 2017;
/** Regular season weeks; the playoffs are the three after. */
export const REGULAR_WEEKS = 14;
export const PLAYOFF_START = 15;
export const LAST_WEEK = 17;
export const PLAYOFF_TEAMS = 6;

export const ROSTER_POSITIONS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'];
export const ROUNDS = ROSTER_POSITIONS.length;

/** Full PPR, as Sleeper sets it up. */
export const SCORING: Record<string, number> = {
  pass_yd: 0.04, pass_td: 4, pass_int: -1, pass_2pt: 2,
  rush_yd: 0.1, rush_td: 6, rush_2pt: 2,
  rec: 1, rec_yd: 0.1, rec_td: 6, rec_2pt: 2,
  fum_lost: -2, fum_rec_td: 6,
  fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3, fgm_40_49: 4, fgm_50p: 5, fgmiss: -1, xpm: 1, xpmiss: -1,
  sack: 1, int: 2, fum_rec: 2, safe: 2, ff: 1, def_td: 6, st_td: 6, def_st_td: 6, def_st_fum_rec: 1, blk_kick: 2,
  pts_allow_0: 10, pts_allow_1_6: 7, pts_allow_7_13: 4, pts_allow_14_20: 1, pts_allow_21_27: 0, pts_allow_28_34: -1, pts_allow_35p: -4,
  kr_td: 6, pr_td: 6,
};

/** A player's points for one week's (or a season's) stats line. */
export function pointsFor(stats: Record<string, number> | undefined): number {
  if (!stats) return 0;
  let s = 0;
  for (const k in stats) { const w = SCORING[k]; if (w) s += w * stats[k]; }
  return Math.round(s * 100) / 100;
}

export function leagueSettings(lastScored: number, leg: number) {
  return {
    num_teams: TEAMS, playoff_teams: PLAYOFF_TEAMS, playoff_week_start: PLAYOFF_START, playoff_round_type: 0, playoff_type: 0,
    playoff_seed_type: 0, league_average_match: 0, waiver_type: 2, waiver_budget: 100, trade_deadline: 11, start_week: 1,
    draft_rounds: ROUNDS, type: 0, best_ball: 0, divisions: 0, reserve_slots: 0, taxi_slots: 0, bench_lock: 0,
    last_scored_leg: lastScored, leg, max_keepers: 0, daily_waivers: 0, waiver_day_of_week: 2, waiver_clear_days: 1,
  };
}
