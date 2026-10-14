/**
 * How many games a season had: the one count every page uses.
 *
 * A game is one head-to-head matchup. Each team's record has a result for
 * every game it played, so a season's records add up to twice its games. In
 * a league with median games (Sleeper's league median, ESPN's top-half win
 * bonus) every week adds a second result to each record, against the median,
 * which is not a game against anyone, so those records add up to four times.
 *
 * No imports: used by the home page, History and Node's own test runner.
 */

export function seasonGamesPlayed(rosters: any[] | null | undefined, league: any): number {
  const results = (rosters ?? []).reduce((n, r) => {
    const s = r?.settings ?? {};
    return n + Number(s.wins ?? 0) + Number(s.losses ?? 0) + Number(s.ties ?? 0);
  }, 0);
  const perGame = Number(league?.settings?.league_average_match ?? 0) === 1 ? 4 : 2;
  return Math.round(results / perGame);
}
