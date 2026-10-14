/**
 * What a season's data does not include, so pages can say so plainly instead
 * of showing an empty space as if nothing happened.
 *
 * Sleeper keeps everything for every season. ESPN does not: for its oldest
 * seasons it keeps final scores, standings, playoffs and the draft, but not
 * lineups, waiver and free agent moves, or trades, only how many each team
 * made. The ESPN adapter records that on the league itself
 * (`metadata.coverage`, see providers/espn/translate.ts); a league with no
 * such record is complete.
 *
 * No imports: used by pages, API routes and Node's test runner alike.
 */

export interface SeasonGaps {
  season: string;
  /** Who kept the data: 'ESPN', or 'manual' for a season the commissioner entered. */
  source: string;
  lineups: boolean;
  moves: boolean;
  trades: boolean;
  /** What the source still counts, where it has a count but not the detail. */
  counts: { trades?: number; moves?: number };
}

/** A season's gaps, from its league record, or null when it is complete. */
export function seasonGaps(league: any): SeasonGaps | null {
  const c = league?.metadata?.coverage;
  if (!c || (c.lineups && c.moves && c.trades)) return null;
  return {
    season: String(league.season ?? ''),
    source: league.metadata?.provider === 'espn' ? 'ESPN' : league.metadata?.provider === 'manual' ? 'manual' : 'The platform',
    lineups: Boolean(c.lineups),
    moves: Boolean(c.moves),
    trades: Boolean(c.trades),
    counts: c.counts ?? {},
  };
}
