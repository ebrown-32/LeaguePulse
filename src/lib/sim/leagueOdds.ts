/**
 * Playoff odds, computed once for the whole site.
 *
 * The Weekly Report and the Simulator both read from here. They used to run
 * separate Monte Carlos with different score models, which would have shown two
 * different playoff odds for the same league the moment a week was scored, and
 * the report's bracket treated the championship as a single week when this
 * league plays it over two.
 *
 * The report shows the summary; the Simulator is where you pin results, adjust
 * a matchup, or look at a team's cone. Same numbers underneath.
 */

import { buildSimLeague } from './buildLeague';
import { simulateSeason } from './engine';

export interface TeamOdds {
  rosterId: number;
  teamName: string;
  /** Percent of simulations where this team made the playoff field. */
  playoffOdds: number;
  /** Percent where they took the top seed. */
  topSeedOdds: number;
  /** Percent where they won the championship. */
  titleOdds: number;
  /** Mean final regular season wins across simulations. */
  projectedWins: number;
  /** Already mathematically decided, either way. */
  clinched: boolean;
  eliminated: boolean;
}

export interface OddsResult {
  teams: TeamOdds[];
  simulations: number;
  /** Fixtures that were simulated; zero means the season is already decided. */
  remainingGames: number;
}

const ITERATIONS = 10_000;
/** Fixed, so the odds do not shuffle by half a point on every reload. */
const SEED = 20260908;

/**
 * Odds for the league's current season.
 *
 * Returns null when there is nothing meaningful to simulate, which is either a
 * league that could not be built or a regular season with no games left. A
 * finished season has no odds, only results.
 */
export async function currentSeasonOdds(): Promise<OddsResult | null> {
  let built;
  try {
    built = await buildSimLeague();
  } catch {
    return null;
  }
  const { league } = built;
  if (league.remaining.length === 0) return null;

  const result = simulateSeason({
    league, pins: [], iterations: ITERATIONS, seed: SEED,
  });

  const nameOf = new Map(league.teams.map(t => [t.rosterId, t.teamName]));
  const pct = (n: number) => Number((n * 100).toFixed(1));

  return {
    simulations: result.iterations,
    remainingGames: league.remaining.length,
    teams: result.teams.map(t => ({
      rosterId: t.rosterId,
      teamName: nameOf.get(t.rosterId) ?? `Team ${t.rosterId}`,
      playoffOdds: pct(t.playoffOdds),
      topSeedOdds: pct(t.topSeedOdds),
      titleOdds:   pct(t.titleOdds),
      projectedWins: Number(t.avgWins.toFixed(1)),
      // Decided in every single run, which is what "clinched" and "eliminated"
      // actually mean at ten thousand samples.
      clinched:   t.playoffOdds >= 1,
      eliminated: t.playoffOdds <= 0,
    })),
  };
}
