/**
 * Playoff odds by Monte Carlo simulation.
 *
 * The rest of the season is played out thousands of times. Each team's weekly
 * score is drawn from its own distribution so far, meaning its mean and its
 * spread, so a boom-or-bust team correctly shows a wider range of outcomes
 * than a metronome on the same average. Standings are then resolved by the league's real rules
 * and the results tallied.
 *
 * Concept credited to the Fantasy Football Metrics Weekly Report
 * (github.com/uberfastman/fantasy-football-metrics-weekly-report); this is an
 * independent implementation and shares no code with that GPL-3.0 project.
 */

export interface SimTeam {
  rosterId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  /** Mean weekly score so far. */
  mean: number;
  /** Standard deviation of weekly scores so far. */
  sd: number;
}

/** One scheduled, unplayed fixture. */
export interface SimFixture {
  week: number;
  a: number;
  b: number;
}

export interface TeamOdds {
  rosterId: number;
  teamName: string;
  /** Percent of simulations where this team made the playoff field. */
  playoffOdds: number;
  /** Percent where they took the top seed. */
  topSeedOdds: number;
  /** Percent where they won the championship. */
  titleOdds: number;
  /** Mean final regular-season wins across simulations. */
  projectedWins: number;
  /** Already mathematically decided, either way. */
  clinched: boolean;
  eliminated: boolean;
}

/**
 * Deterministic RNG.
 *
 * Seeded from the league and week so a refresh does not reshuffle everyone's
 * odds by half a point. Numbers that jitter on reload read as noise rather
 * than as a projection, however sound the maths underneath.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller. Returns a normal sample with the given mean and spread. */
function normal(rng: () => number, mean: number, sd: number): number {
  const u = Math.max(rng(), Number.EPSILON);
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  // Fantasy scores cannot go negative, and the normal tail can.
  return Math.max(0, mean + z * sd);
}

export interface OddsResult {
  teams: TeamOdds[];
  simulations: number;
  /** Fixtures that were simulated; zero means the season is already decided. */
  remainingGames: number;
}

/**
 * Run the simulation.
 *
 * `playoffTeams` is the size of the real playoff field, read from the league
 * rather than assumed: this app has already shipped a bug where six teams were
 * named in an eight-team league that takes four.
 */
export function simulatePlayoffOdds(
  teams: SimTeam[],
  fixtures: SimFixture[],
  playoffTeams: number,
  opts: { simulations?: number; seed?: number; medianMatch?: boolean } = {},
): OddsResult {
  const simulations = opts.simulations ?? 10_000;
  const field = Math.max(1, Math.min(playoffTeams || 4, teams.length));
  const rng = mulberry32(opts.seed ?? 1);

  const medianMatch = opts.medianMatch ?? false;
  const index = new Map(teams.map((t, i) => [t.rosterId, i]));

  // Fixtures grouped by week, so a week can be resolved as a whole.
  const byWeek = new Map<number, SimFixture[]>();
  for (const f of fixtures) {
    if (!byWeek.has(f.week)) byWeek.set(f.week, []);
    byWeek.get(f.week)!.push(f);
  }
  const made = new Array(teams.length).fill(0);
  const topSeed = new Array(teams.length).fill(0);
  const titles = new Array(teams.length).fill(0);
  const winTotal = new Array(teams.length).fill(0);

  // A team with no scoring history yet gets the league's average shape, so a
  // brand new season does not divide by zero or hand everyone identical odds.
  const leagueMean = teams.reduce((s, t) => s + t.mean, 0) / (teams.length || 1);
  const leagueSd = teams.reduce((s, t) => s + t.sd, 0) / (teams.length || 1);
  const shape = teams.map(t => ({
    mean: t.mean > 0 ? t.mean : leagueMean,
    sd: t.sd > 0 ? t.sd : leagueSd || 1,
  }));

  const wins = new Array(teams.length).fill(0);
  const pf = new Array(teams.length).fill(0);

  for (let s = 0; s < simulations; s++) {
    for (let i = 0; i < teams.length; i++) {
      wins[i] = teams[i].wins;
      pf[i] = teams[i].pointsFor;
    }

    // Simulated a week at a time rather than a fixture at a time, because a
    // median league scores every team against the same weekly median and that
    // number cannot be known until the whole week has been drawn.
    for (const [, week] of byWeek) {
      const drawn: { idx: number; score: number }[] = [];
      for (const f of week) {
        const ai = index.get(f.a), bi = index.get(f.b);
        if (ai === undefined || bi === undefined) continue;
        const sa = normal(rng, shape[ai].mean, shape[ai].sd);
        const sb = normal(rng, shape[bi].mean, shape[bi].sd);
        pf[ai] += sa; pf[bi] += sb;
        if (sa > sb) wins[ai]++; else if (sb > sa) wins[bi]++;
        drawn.push({ idx: ai, score: sa }, { idx: bi, score: sb });
      }

      // The second game of the week, where the league plays them. Without it a
      // simulated season is half the length of the real one and every
      // projected win total comes out short.
      if (medianMatch && drawn.length) {
        const sorted = [...drawn].map(d => d.score).sort((x, y) => x - y);
        const mid = Math.floor(sorted.length / 2);
        const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        for (const d of drawn) {
          if (d.score > med) wins[d.idx]++;
        }
      }
    }

    // Sleeper's default: record first, total points as the tiebreak.
    const order = teams
      .map((_, i) => i)
      .sort((x, y) => (wins[y] - wins[x]) || (pf[y] - pf[x]));

    for (let i = 0; i < teams.length; i++) winTotal[i] += wins[i];
    const seeded = order.slice(0, field);
    for (const i of seeded) made[i]++;
    topSeed[order[0]]++;

    // Championship bracket: standard seeding, highest against lowest, single
    // elimination, same scoring model. Byes fall out naturally when the field
    // is not a power of two, because an unpaired team advances.
    let alive = [...seeded];
    while (alive.length > 1) {
      const next: number[] = [];
      const half = Math.floor(alive.length / 2);
      if (alive.length % 2) next.push(alive[0]);
      const contenders = alive.length % 2 ? alive.slice(1) : alive;
      for (let i = 0; i < half; i++) {
        const hi = contenders[i];
        const lo = contenders[contenders.length - 1 - i];
        if (hi === undefined || lo === undefined) continue;
        const sh = normal(rng, shape[hi].mean, shape[hi].sd);
        const sl = normal(rng, shape[lo].mean, shape[lo].sd);
        next.push(sh >= sl ? hi : lo);
      }
      // Reseed so the bracket stays ordered round to round.
      alive = next.sort((x, y) => seeded.indexOf(x) - seeded.indexOf(y));
    }
    if (alive.length === 1) titles[alive[0]]++;
  }

  const pct = (n: number) => Number(((n / simulations) * 100).toFixed(1));

  return {
    simulations,
    remainingGames: fixtures.length,
    teams: teams.map((t, i) => ({
      rosterId: t.rosterId,
      teamName: t.teamName,
      playoffOdds: pct(made[i]),
      topSeedOdds: pct(topSeed[i]),
      titleOdds: pct(titles[i]),
      projectedWins: Number((winTotal[i] / simulations).toFixed(1)),
      clinched: made[i] === simulations,
      eliminated: made[i] === 0,
    })),
  };
}
