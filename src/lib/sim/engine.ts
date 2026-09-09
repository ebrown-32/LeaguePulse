/**
 * The Monte Carlo season engine.
 *
 * Pure and dependency free on purpose: it runs inside a Web Worker, so it must
 * not touch the DOM, and it must not allocate inside the hot loop. Ten thousand
 * seasons of an eight team league is roughly a million score draws, which lands
 * in the tens of milliseconds when the buffers are hoisted out of the loop.
 *
 * ── The model, stated plainly ─────────────────────────────────────────────────
 *
 * A team's scoring LEVEL is fitted from real league history blended with
 * Sleeper's weekly projections (see `fitTeamStrength` in `strength.ts`), and its
 * week-to-week movement comes from those projections, which is mostly a bye
 * week signal. `weeklyMean` carries the per-week figure; `mean` is the fallback.
 *
 * A simulated score is `mean + sd * r`, where `r` is a standardised residual
 * resampled from a real team-week somewhere in this league's history. That
 * bootstrap matters: fantasy scores are right skewed, and a Gaussian draw
 * quietly understates both the 150 point ceiling games and how often a team
 * face-plants. When there is not enough history to pool, we fall back to a
 * normal draw and the UI says so.
 */

import type {
  SimRequest, SimResult, TeamOutcome, MatchupSimRequest, MatchupSimResult,
} from './types';
import { roundLengths } from './playoffs';

// ── Randomness ───────────────────────────────────────────────────────────────

/**
 * mulberry32. Small, fast, and seeded, which is the point: identical inputs
 * must produce identical odds. A simulator whose numbers shimmer every time you
 * breathe on it reads as broken even when it is correct.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, used only when the league has too little history to bootstrap. */
function normal(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// ── Season simulation ────────────────────────────────────────────────────────

export function simulateSeason(req: SimRequest): SimResult {
  const t0 = Date.now();
  const { league, pins, iterations } = req;
  const rand = mulberry32(req.seed);

  const teams   = league.teams;
  const n       = teams.length;
  const playoff = league.playoffTeams;

  /**
   * Histogram width, in wins.
   *
   * Not the week count. This league runs Sleeper's median game, so every team
   * plays twice a week: once against its scheduled opponent and once against
   * the field's median score. A 14 week season therefore tops out at 28 wins,
   * and sizing these buffers by weeks alone would silently clip every good
   * team's distribution at the ceiling.
   */
  const weeks = league.regularSeasonWeeks * (league.hasMedianGames ? 2 : 1);

  // Roster id to dense index. Everything downstream is index based so the hot
  // loop can use typed arrays rather than object lookups.
  const idx = new Map<number, number>();
  teams.forEach((t, i) => idx.set(t.rosterId, i));

  const mean = new Float64Array(n);
  const sd   = new Float64Array(n);
  // Per-week expectations, where the projections gave us one. Flat lookup by
  // [teamIndex][week] so the hot loop does no object property access.
  const weeklyMean: (Record<number, number> | undefined)[] = new Array(n);
  const baseWins   = new Float64Array(n);
  const baseLosses = new Float64Array(n);
  const baseTies   = new Float64Array(n);
  const basePts    = new Float64Array(n);
  teams.forEach((t, i) => {
    mean[i] = t.mean; sd[i] = t.sd;
    weeklyMean[i] = t.weeklyMean;
    baseWins[i] = t.wins; baseLosses[i] = t.losses; baseTies[i] = t.ties;
    basePts[i] = t.pointsFor;
  });

  // Weeks per playoff round, so a two week championship is simulated as one.
  const lengths = roundLengths(playoff, league.playoffRoundType ?? 0);

  // Who ends up holding each roster's first rounder, as dense indices. In a
  // dynasty league most of these picks have been traded, so where a team's own
  // record puts them and where they actually pick are different questions.
  const ownerIdx = new Int32Array(n);
  const ownedCount = new Int32Array(n);
  teams.forEach((t, i) => {
    const ownerRoster = league.pickOwnership?.[t.rosterId] ?? t.rosterId;
    const oi = idx.get(ownerRoster);
    ownerIdx[i] = oi === undefined ? i : oi;
    ownedCount[ownerIdx[i]]++;
  });

  const res    = league.residuals;
  const resLen = res.length;
  const useBootstrap = resLen >= 40;

  // Remaining games flattened, grouped by week for the median-game rule and the
  // week-by-week cone.
  const remaining = league.remaining.filter(g => idx.has(g.homeRosterId) && idx.has(g.awayRosterId));
  const gamesByWeek = new Map<number, { h: number; a: number; pin: number | null | undefined }[]>();
  for (const g of remaining) {
    const h = idx.get(g.homeRosterId)!, a = idx.get(g.awayRosterId)!;
    const pin = pins.find(p =>
      p.week === g.week
      && ((p.homeRosterId === g.homeRosterId && p.awayRosterId === g.awayRosterId)
       || (p.homeRosterId === g.awayRosterId && p.awayRosterId === g.homeRosterId)));
    const pinIdx = pin ? (pin.winnerRosterId === null ? null : idx.get(pin.winnerRosterId)) : undefined;
    if (!gamesByWeek.has(g.week)) gamesByWeek.set(g.week, []);
    gamesByWeek.get(g.week)!.push({ h, a, pin: pinIdx });
  }
  const weekNumbers = [...gamesByWeek.keys()].sort((x, y) => x - y);

  // ── Accumulators ───────────────────────────────────────────────────────────
  const winHist  = new Int32Array(n * (weeks + 1));      // final win totals
  const seedHist = new Int32Array(n * n);                // final seeds
  const draftHist = new Int32Array(n * n);               // own pick's slot
  const ownedHist = new Int32Array(n * n);               // slots this team OWNS
  const playoffCt = new Int32Array(n);
  const titleCt   = new Int32Array(n);
  const topSeedCt = new Int32Array(n);
  const winSum    = new Float64Array(n);
  const ptsSum    = new Float64Array(n);

  // Cumulative wins per week, as a histogram per (team, week). Wins are small
  // integers, so counting beats sorting a million-element array per percentile.
  const coneWeeks = weekNumbers.length;
  const coneHist  = new Int32Array(n * coneWeeks * (weeks + 1));

  const bestW  = new Float64Array(n).fill(-1);
  const bestP  = new Float64Array(n);
  const worstW = new Float64Array(n).fill(Number.MAX_SAFE_INTEGER);
  const worstP = new Float64Array(n);

  // Thinned sample of final win totals, for the beeswarm.
  const SAMPLE_TARGET = 600;
  const sampleEvery = Math.max(1, Math.floor(iterations / SAMPLE_TARGET));
  const samples: number[][] = Array.from({ length: n }, () => []);

  // Scratch, hoisted so the loop allocates nothing.
  const wins = new Float64Array(n);
  const loss = new Float64Array(n);
  const ties = new Float64Array(n);
  const pts  = new Float64Array(n);
  const score = new Float64Array(n);
  const weekScores = new Float64Array(n);
  // Hoisted: these were being reallocated a million times between them, which
  // was most of the engine's cost.
  const ord: number[] = new Array(n);
  const medianBuf = new Float64Array(n);

  /**
   * One team's score in one week.
   *
   * `wk` of 0 means "no particular week", used for playoff games where the
   * projections do not reach. Weeks without a projection fall back to the
   * season level, so this degrades quietly rather than failing.
   */
  const draw = (i: number, wk: number): number => {
    const r = useBootstrap ? res[(rand() * resLen) | 0] : normal(rand);
    const m = (wk > 0 ? weeklyMean[i]?.[wk] : undefined) ?? mean[i];
    const v = m + sd[i] * r;
    return v < 0 ? 0 : v;
  };

  for (let it = 0; it < iterations; it++) {
    wins.set(baseWins); loss.set(baseLosses); ties.set(baseTies); pts.set(basePts);

    for (let wi = 0; wi < coneWeeks; wi++) {
      const wk = weekNumbers[wi];
      const games = gamesByWeek.get(wk)!;

      // Everyone scores, including anyone on a bye, so the median rule below
      // sees the whole field.
      for (let i = 0; i < n; i++) weekScores[i] = -1;
      for (const g of games) {
        weekScores[g.h] = draw(g.h, wk);
        weekScores[g.a] = draw(g.a, wk);
      }
      for (const g of games) {
        const hs = weekScores[g.h], as = weekScores[g.a];
        pts[g.h] += hs; pts[g.a] += as;
        let winner: number | null;
        if (g.pin !== undefined) {
          winner = g.pin;                       // forced by the user
        } else if (hs > as) winner = g.h;
        else if (as > hs) winner = g.a;
        else winner = null;

        if (winner === null) { ties[g.h]++; ties[g.a]++; }
        else if (winner === g.h) { wins[g.h]++; loss[g.a]++; }
        else { wins[g.a]++; loss[g.h]++; }
      }

      // Sleeper's "league average match": a second, opponent-less result each
      // week against the field's median score.
      if (league.hasMedianGames) {
        let m = 0;
        for (let i = 0; i < n; i++) if (weekScores[i] >= 0) medianBuf[m++] = weekScores[i];
        if (m > 1) {
          // Insertion sort: `m` is the league size, eight here. Beats a
          // comparator-driven sort at this length, and allocates nothing.
          for (let i = 1; i < m; i++) {
            const v = medianBuf[i];
            let j = i - 1;
            while (j >= 0 && medianBuf[j] > v) { medianBuf[j + 1] = medianBuf[j]; j--; }
            medianBuf[j + 1] = v;
          }
          const mid = m % 2
            ? medianBuf[(m - 1) / 2]
            : (medianBuf[m / 2 - 1] + medianBuf[m / 2]) / 2;
          for (let i = 0; i < n; i++) {
            if (weekScores[i] < 0) continue;
            if (weekScores[i] > mid) wins[i]++;
            else if (weekScores[i] < mid) loss[i]++;
            else ties[i]++;
          }
        }
      }

      for (let i = 0; i < n; i++) {
        const w = Math.min(weeks, Math.round(wins[i]));
        coneHist[(i * coneWeeks + wi) * (weeks + 1) + w]++;
      }
    }

    // ── Seed the field ───────────────────────────────────────────────────────
    // Wins first, then points for, which is the Sleeper default tiebreak.
    for (let i = 0; i < n; i++) { ord[i] = i; score[i] = wins[i] + ties[i] * 0.5; }
    ord.sort((a, b) => (score[b] - score[a]) || (pts[b] - pts[a]));

    for (let s = 0; s < n; s++) {
      const i = ord[s];
      seedHist[i * n + s]++;
      // Reverse standings: the worst overall team's pick is the 1.01. Verified
      // against this league's real 2026 draft, which was exactly that.
      const slot = n - 1 - s;
      draftHist[i * n + slot]++;
      ownedHist[ownerIdx[i] * n + slot]++;
      if (s < playoff) playoffCt[i]++;
      if (s === 0) topSeedCt[i]++;
    }

    // ── Bracket ──────────────────────────────────────────────────────────────
    // Four teams, so two rounds and no byes: 1v4 and 2v3, winners meet.
    if (playoff >= 2) {
      let field = ord.slice(0, playoff);
      let round = 0;
      while (field.length > 1) {
        // A two week round is decided on the combined total, so it takes two
        // draws. That is not a cosmetic detail: doubling the sample roughly
        // halves the relative variance, which materially favours the stronger
        // team. This league runs a two week championship.
        const weeksThisRound = lengths[Math.min(round, lengths.length - 1)];
        const next: number[] = [];
        for (let k = 0; k < field.length / 2; k++) {
          const hi = field[k], lo = field[field.length - 1 - k];
          let a = 0, b = 0;
          for (let w = 0; w < weeksThisRound; w++) { a += draw(hi, 0); b += draw(lo, 0); }
          next.push(a >= b ? hi : lo);   // the better seed holds a coin-flip tie
        }
        field = next;
        round++;
      }
      titleCt[field[0]]++;
    }

    // ── Bookkeeping ──────────────────────────────────────────────────────────
    const takeSample = it % sampleEvery === 0;
    for (let i = 0; i < n; i++) {
      const w = Math.min(weeks, Math.round(wins[i]));
      winHist[i * (weeks + 1) + w]++;
      winSum[i] += wins[i];
      ptsSum[i] += pts[i];
      if (wins[i] > bestW[i])  { bestW[i] = wins[i];  bestP[i] = pts[i]; }
      if (wins[i] < worstW[i]) { worstW[i] = wins[i]; worstP[i] = pts[i]; }
      if (takeSample) samples[i].push(wins[i]);
    }
  }

  // ── Shape the results ──────────────────────────────────────────────────────
  const pctFromHist = (hist: Int32Array, off: number, len: number, total: number, q: number) => {
    const target = total * q;
    let cum = 0;
    for (let v = 0; v < len; v++) {
      cum += hist[off + v];
      if (cum >= target) return v;
    }
    return len - 1;
  };

  const out: TeamOutcome[] = teams.map((t, i) => {
    const winDistribution = Array.from({ length: weeks + 1 },
      (_, w) => winHist[i * (weeks + 1) + w] / iterations);
    const seedDistribution = Array.from({ length: n }, (_, s) => seedHist[i * n + s] / iterations);
    const draftSlotOdds    = Array.from({ length: n }, (_, s) => draftHist[i * n + s] / iterations);
    const ownedSlotOdds    = Array.from({ length: n }, (_, s) => ownedHist[i * n + s] / iterations);

    const cone = weekNumbers.map((wk, wi) => {
      const off = (i * coneWeeks + wi) * (weeks + 1);
      return {
        week: wk,
        p10: pctFromHist(coneHist, off, weeks + 1, iterations, 0.10),
        p50: pctFromHist(coneHist, off, weeks + 1, iterations, 0.50),
        p90: pctFromHist(coneHist, off, weeks + 1, iterations, 0.90),
      };
    });

    const winOff = i * (weeks + 1);
    return {
      rosterId: t.rosterId,
      playoffOdds: playoffCt[i] / iterations,
      titleOdds:   titleCt[i] / iterations,
      topSeedOdds: topSeedCt[i] / iterations,
      avgWins:      winSum[i] / iterations,
      avgPointsFor: ptsSum[i] / iterations,
      winDistribution,
      seedDistribution,
      p5Wins:  pctFromHist(winHist, winOff, weeks + 1, iterations, 0.05),
      p95Wins: pctFromHist(winHist, winOff, weeks + 1, iterations, 0.95),
      bestUniverse:  { wins: bestW[i],  losses: weeks - bestW[i],  pointsFor: bestP[i] },
      worstUniverse: { wins: worstW[i], losses: weeks - worstW[i], pointsFor: worstP[i] },
      draftSlotOdds,
      ownedSlotOdds,
      ownedPickCount: ownedCount[i],
      cone,
      sampleWins: samples[i],
    };
  });

  return { iterations, teams: out, elapsedMs: Date.now() - t0 };
}

// ── Single matchup ───────────────────────────────────────────────────────────

/**
 * One head to head, run on its own so the matchup view can re-run on every
 * lineup toggle without touching the season sim.
 */
export function simulateMatchup(req: MatchupSimRequest): MatchupSimResult {
  const { a, b, residuals, iterations } = req;
  const rand = mulberry32(req.seed);
  const resLen = residuals.length;
  const useBootstrap = resLen >= 40;
  const drawFor = (m: number, s: number) => {
    const r = useBootstrap ? residuals[(rand() * resLen) | 0] : normal(rand);
    const v = m + s * r;
    return v < 0 ? 0 : v;
  };

  const BINS = 48;
  const lo = Math.max(0, Math.min(a.mean - 3.2 * a.sd, b.mean - 3.2 * b.sd));
  const hi = Math.max(a.mean + 3.2 * a.sd, b.mean + 3.2 * b.sd);
  const binWidth = (hi - lo) / BINS;
  const aBins = new Array(BINS).fill(0);
  const bBins = new Array(BINS).fill(0);

  let aWins = 0, bWins = 0, tie = 0;
  const aAll = new Float64Array(iterations);
  const bAll = new Float64Array(iterations);
  const margins = new Float64Array(iterations);

  for (let i = 0; i < iterations; i++) {
    const as = drawFor(a.mean, a.sd);
    const bs = drawFor(b.mean, b.sd);
    aAll[i] = as; bAll[i] = bs; margins[i] = Math.abs(as - bs);
    if (as > bs) aWins++; else if (bs > as) bWins++; else tie++;
    const ai = Math.min(BINS - 1, Math.max(0, ((as - lo) / binWidth) | 0));
    const bi = Math.min(BINS - 1, Math.max(0, ((bs - lo) / binWidth) | 0));
    aBins[ai]++; bBins[bi]++;
  }

  const median = (arr: Float64Array) => {
    const s = Array.from(arr).sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };

  return {
    aWinOdds: aWins / iterations,
    bWinOdds: bWins / iterations,
    tieOdds:  tie / iterations,
    aMedian: median(aAll),
    bMedian: median(bAll),
    binStart: lo,
    binWidth,
    aBins: aBins.map(c => c / iterations),
    bBins: bBins.map(c => c / iterations),
    medianMargin: median(margins),
  };
}
