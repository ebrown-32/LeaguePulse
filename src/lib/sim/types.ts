/**
 * Shared vocabulary for the simulator.
 *
 * Everything here crosses at least one boundary (server route to client, or
 * main thread to worker), so it stays free of classes, Dates and Maps: only
 * structured-cloneable plain data.
 */

export interface SimTeam {
  rosterId:  number;
  userId:    string;
  teamName:  string;
  managerName: string;
  avatar:    string;
  /** Wins/losses/ties already banked this season. */
  wins:      number;
  losses:    number;
  ties:      number;
  pointsFor: number;
  /**
   * Expected weekly score and its spread.
   *
   * `mean` is the season-level figure, fitted from real scoring history blended
   * with Sleeper's weekly projections. See `fitTeamStrength` for the blend and
   * `StrengthBasis` for what fed it.
   */
  mean:      number;
  sd:        number;
  /**
   * Expected score for one specific week, keyed by week number.
   *
   * The level comes from `mean`; the week-to-week movement comes from Sleeper's
   * weekly projections, which mainly encode who is on a bye. A team missing
   * three starters in week 10 should not be simulated at its season average
   * that week, and before this existed it was.
   *
   * Weeks absent from this map fall back to `mean`.
   */
  weeklyMean: Record<number, number>;
  basis:     StrengthBasis;
}

/**
 * Where a team's fitted strength actually came from, surfaced in the UI so a
 * number nobody can verify never appears without its provenance.
 */
export interface StrengthBasis {
  /** Games from the season being simulated. Most trustworthy, usually fewest. */
  currentSeasonGames: number;
  /** Games by the same manager in earlier seasons of this league. */
  priorSeasonGames:   number;
  /** Average of the roster's best-lineup total across Sleeper's weekly
   *  projections for the remaining schedule, or null if unavailable. */
  rosterProjection:   number | null;
  /** How many remaining weeks had real weekly projections behind them. */
  projectedWeeks:     number;
  /** How much each source contributed to `mean`, summing to 1. */
  weights: {
    current:    number;
    prior:      number;
    projection: number;
    leagueBase: number;
  };
}

/** One matchup still to be played. */
export interface SimGame {
  week: number;
  homeRosterId: number;
  awayRosterId: number;
}

/** A game already played, kept so the UI can draw real results behind the cone. */
export interface PlayedGame {
  week: number;
  homeRosterId: number;
  awayRosterId: number;
  homeScore: number;
  awayScore: number;
}

export interface SimLeague {
  season: string;
  /** Last week with real results. 0 at the start of a season. */
  weeksPlayed: number;
  regularSeasonWeeks: number;
  playoffTeams: number;
  /** Sleeper's `playoff_round_type`. See `lib/sim/playoffs.ts`. */
  playoffRoundType: number;
  teams: SimTeam[];
  remaining: SimGame[];
  played: PlayedGame[];
  /**
   * Pooled standardised weekly residuals, `(score - teamMean) / teamSd`, drawn
   * from every real team-week in league history.
   *
   * Sampling these instead of a Gaussian keeps the true shape of fantasy
   * scoring: the mild right skew, the occasional 40 point blowup. An empty
   * array means there was too little history, and the engine falls back to a
   * normal draw.
   */
  residuals: number[];
  /** True when the league awards a bonus win against the weekly median. */
  hasMedianGames: boolean;
  /**
   * The rookie draft these standings will set, e.g. simulating 2026 decides the
   * 2027 order. Verified against this league's real history: the 2026 order was
   * exactly the reverse of the 2025 final standings, with playoff results not
   * reordering anything.
   */
  draftSeason: string;
  /**
   * Who actually owns each roster's first round pick in that draft, as
   * `originalRosterId -> currentOwnerRosterId`.
   *
   * This matters enormously in dynasty and was missing at first: seven of this
   * league's eight 2027 firsts have already been traded, so a team's own
   * projected slot says almost nothing about where they will really pick.
   */
  pickOwnership: Record<number, number>;
}

/**
 * A forced outcome. `winnerRosterId` of null means the user pinned the game as
 * a tie, which the engine honours but the UI does not currently offer.
 */
export interface Pin {
  week: number;
  homeRosterId: number;
  awayRosterId: number;
  winnerRosterId: number | null;
}

export interface SimRequest {
  league: SimLeague;
  pins: Pin[];
  iterations: number;
  /** Fixed so repeated runs of identical inputs return identical numbers. */
  seed: number;
}

export interface TeamOutcome {
  rosterId: number;
  playoffOdds: number;
  titleOdds: number;
  /** Odds of finishing as the 1 seed. Four playoff teams means no first round
   *  bye exists, so this is bragging rights rather than a structural edge. */
  topSeedOdds: number;
  avgWins: number;
  avgPointsFor: number;
  /** Index is a win total, 0 through regularSeasonWeeks. Sums to 1. */
  winDistribution: number[];
  /** Index 0 is the 1 seed. Sums to 1. */
  seedDistribution: number[];
  /** Final win totals at the 5th and 95th percentile of all runs. */
  p5Wins: number;
  p95Wins: number;
  bestUniverse:  { wins: number; losses: number; pointsFor: number };
  worstUniverse: { wins: number; losses: number; pointsFor: number };
  /**
   * Odds this roster's OWN pick lands in each slot, index 0 being 1.01.
   * Sums to 1. This is the tanking view: where their record puts them.
   */
  draftSlotOdds: number[];
  /**
   * Odds this team OWNS the pick that lands in each slot, after trades.
   * Sums to however many first rounders they hold, which may be zero or three.
   */
  ownedSlotOdds: number[];
  /** How many first round picks this team holds in that draft. */
  ownedPickCount: number;
  /** Cumulative win totals per week at p10/p50/p90, for the cone. */
  cone: { week: number; p10: number; p50: number; p90: number }[];
  /** One sampled final win total per run, thinned for the beeswarm. */
  sampleWins: number[];
}

export interface SimResult {
  iterations: number;
  teams: TeamOutcome[];
  /** Milliseconds spent inside the engine, shown in the UI footer. */
  elapsedMs: number;
}

/** A single head to head, simulated on its own for the matchup view. */
export interface MatchupSimRequest {
  a: { mean: number; sd: number };
  b: { mean: number; sd: number };
  residuals: number[];
  iterations: number;
  seed: number;
}

export interface MatchupSimResult {
  aWinOdds: number;
  bWinOdds: number;
  tieOdds: number;
  aMedian: number;
  bMedian: number;
  /** Shared histogram bins so both curves can be drawn on one axis. */
  binStart: number;
  binWidth: number;
  aBins: number[];
  bBins: number[];
  /** Median absolute margin, the "typical" gap. */
  medianMargin: number;
}
