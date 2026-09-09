/**
 * Playoff shape, straight from Sleeper's league settings.
 *
 * `playoff_round_type` decides how many real weeks each round spans, and it is
 * not cosmetic: a two week championship is decided on the combined total of
 * both weeks, which roughly halves the variance of the final and meaningfully
 * favours the better team. Treating it as a single week, as an earlier version
 * of this simulator did, quietly gives the underdog a coin flip it never had.
 *
 *   0  every round is one week
 *   1  the championship round is two weeks, earlier rounds are one
 *   2  every round is two weeks
 */
export const ROUND_TYPE_SINGLE = 0;
export const ROUND_TYPE_TWO_WEEK_FINAL = 1;
export const ROUND_TYPE_ALL_TWO_WEEK = 2;

/** Number of rounds needed to get from `playoffTeams` down to one. */
export function playoffRounds(playoffTeams: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, playoffTeams))));
}

/** How many weeks each round spans, in round order. */
export function roundLengths(playoffTeams: number, roundType: number): number[] {
  const rounds = playoffRounds(playoffTeams);
  return Array.from({ length: rounds }, (_, i) => {
    if (roundType === ROUND_TYPE_ALL_TWO_WEEK) return 2;
    if (roundType === ROUND_TYPE_TWO_WEEK_FINAL && i === rounds - 1) return 2;
    return 1;
  });
}

/**
 * The actual week numbers making up each playoff round.
 *
 * For this league (four teams, playoffs from week 15, round type 1) that is
 * `[[15], [16, 17]]`: a one week semifinal, then a championship decided on the
 * week 16 and week 17 totals combined.
 */
export function playoffRoundWeeks(
  regularSeasonWeeks: number,
  playoffTeams: number,
  roundType: number,
): number[][] {
  let week = regularSeasonWeeks + 1;
  return roundLengths(playoffTeams, roundType).map(len => {
    const weeks = Array.from({ length: len }, (_, i) => week + i);
    week += len;
    return weeks;
  });
}

/** Last week the playoffs occupy, so callers know how far to fetch. */
export function lastPlayoffWeek(
  regularSeasonWeeks: number,
  playoffTeams: number,
  roundType: number,
): number {
  const groups = playoffRoundWeeks(regularSeasonWeeks, playoffTeams, roundType);
  const flat = groups.flat();
  return flat.length ? flat[flat.length - 1] : regularSeasonWeeks;
}
