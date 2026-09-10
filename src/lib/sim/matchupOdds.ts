/**
 * Live win probability for a single head to head.
 *
 * Splits each roster into players whose games have finished and players who
 * have not taken the field, then treats the settled points as fact and only the
 * rest as uncertain. That is what makes the number move sensibly through a
 * Sunday: a twenty point lead with nine players left is nothing, and the same
 * lead with one player left is nearly over.
 *
 * ── Calibrated per league, not hardcoded ─────────────────────────────────────
 *
 * The coefficients arrive as a `Calibration`, fitted from whichever league this
 * is running in (see `lib/sim/calibration`). They are format dependent: an
 * intercept of two points means something different in standard scoring than in
 * full PPR, so baking in one league's numbers would quietly mis-serve every
 * other league that clones this project.
 *
 * The shipped defaults come from 1,119 real starter-weeks of a full PPR league
 * and stand in only until a league has a completed season of its own.
 *
 * Two findings shaped the model, and both appear to hold generally:
 *
 *   1. Projections are compressed. A 20 point projection really means about 18,
 *      a 5 point projection really means about 6. Hence the regression rather
 *      than using the projection as-is.
 *
 *   2. Spread is NOT proportional to the projection, which is the obvious
 *      assumption and the wrong one. Measured sd/projection falls from 1.01 for
 *      low projections to 0.42 for high ones, while absolute sd rises only
 *      modestly, from 5.8 to 10.1. A constant coefficient of variation would
 *      overstate the risk on stars and understate it on everyone else.
 *
 * The independence check came out well on the reference league: ten average
 * starters at the fitted per-player spread imply a team sd of 24.6, against
 * 25.9 actually measured. The shortfall is same-game correlation, which the
 * calibration's `inflation` term restores, measured the same way per league.
 */

import { DEFAULT_CALIBRATION, type Calibration } from './calibration';

/** Floor, so a lineup with one player left never reads as a certainty. */
const MIN_TEAM_SD = 1.5;

export type PlayerPhase = 'played' | 'upcoming' | 'bye';

export interface StarterLine {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  /** Sleeper's weekly projection, before calibration. */
  projected: number | null;
  /** Points already banked. Null when the player has not played. */
  actual: number | null;
  phase: PlayerPhase;
}

export interface SideForecast {
  /** Points already settled. */
  pointsSoFar: number;
  /** Starters whose games have not finished. */
  startersLeft: number;
  /** Calibrated expectation for those remaining starters. */
  projectedRemaining: number;
  /** `pointsSoFar + projectedRemaining`. */
  projectedFinal: number;
  /** Spread of the final total. Zero once everyone has played. */
  sd: number;
}

export interface MatchupForecast {
  a: SideForecast;
  b: SideForecast;
  /** What the numbers were fitted on, surfaced so the UI can say. */
  calibration: Calibration;
  /** Probability side A finishes ahead. */
  aWinProb: number;
  /** Expected absolute margin. */
  expectedMargin: number;
  /** True once nothing is left to play and the result is settled. */
  settled: boolean;
}

/** Calibrated expectation for one player still to play. */
export function expectedPoints(projection: number, c: Calibration): number {
  return Math.max(0, c.intercept + c.slope * projection);
}

/** Fitted spread for one player still to play. */
export function playerSd(projection: number, c: Calibration): number {
  return c.sdBase + c.sdSlope * Math.max(0, projection);
}

export function forecastSide(starters: StarterLine[], c: Calibration): SideForecast {
  let pointsSoFar = 0;
  let mean = 0;
  let variance = 0;
  let startersLeft = 0;

  for (const s of starters) {
    if (s.phase === 'played') {
      pointsSoFar += s.actual ?? 0;
      continue;
    }
    // A player on a bye contributes nothing and carries no uncertainty: the
    // manager simply started an empty slot.
    if (s.phase === 'bye' || s.projected === null) continue;

    startersLeft++;
    mean += expectedPoints(s.projected, c);
    variance += playerSd(s.projected, c) ** 2;
  }

  const sd = startersLeft > 0
    ? Math.max(MIN_TEAM_SD, Math.sqrt(variance * c.inflation))
    : 0;

  return {
    pointsSoFar: round1(pointsSoFar),
    startersLeft,
    projectedRemaining: round1(mean),
    projectedFinal: round1(pointsSoFar + mean),
    sd: round1(sd),
  };
}

/**
 * Probability side A beats side B.
 *
 * The difference of two sums of ten-odd independent players is close enough to
 * normal for this, so it is computed in closed form rather than simulated: no
 * worker, no sampling noise, and the same answer every time.
 */
export function forecastMatchup(
  aStarters: StarterLine[],
  bStarters: StarterLine[],
  c: Calibration = DEFAULT_CALIBRATION,
): MatchupForecast {
  const a = forecastSide(aStarters, c);
  const b = forecastSide(bStarters, c);

  const diffMean = a.projectedFinal - b.projectedFinal;
  const diffSd = Math.sqrt(a.sd ** 2 + b.sd ** 2);
  const settled = a.startersLeft === 0 && b.startersLeft === 0;

  const aWinProb = settled
    ? (diffMean > 0 ? 1 : diffMean < 0 ? 0 : 0.5)
    : normalCdf(diffMean / diffSd);

  // Expected absolute margin of a normal difference, the folded normal mean.
  const expectedMargin = settled
    ? Math.abs(diffMean)
    : diffSd * Math.sqrt(2 / Math.PI) * Math.exp(-(diffMean ** 2) / (2 * diffSd ** 2))
      + Math.abs(diffMean) * (2 * normalCdf(Math.abs(diffMean) / diffSd) - 1);

  return { a, b, aWinProb, expectedMargin: round1(expectedMargin), settled, calibration: c };
}

/** Abramowitz and Stegun 7.1.26, accurate to about 1e-7. Plenty here. */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t * t * Math.exp(-x * x) - 0.254829592 * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function round1(n: number) { return Math.round(n * 10) / 10; }

/**
 * Score distribution for one side, for drawing a curve.
 *
 * Returns density at each point across a shared axis so two sides can be drawn
 * on the same chart.
 */
export function densityCurve(
  side: SideForecast, lo: number, hi: number, bins: number,
): number[] {
  if (side.sd <= 0) {
    // Settled: a spike at the final score.
    const out = new Array(bins).fill(0);
    const i = Math.round(((side.projectedFinal - lo) / (hi - lo)) * (bins - 1));
    if (i >= 0 && i < bins) out[i] = 1;
    return out;
  }
  const step = (hi - lo) / (bins - 1);
  return Array.from({ length: bins }, (_, i) => {
    const x = lo + i * step;
    const z = (x - side.projectedFinal) / side.sd;
    return Math.exp(-0.5 * z * z);
  });
}
