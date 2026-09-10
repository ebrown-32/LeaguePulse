/**
 * Fitting the forecast model to whatever league it is running in.
 *
 * The constants that turn a projection into an expected score, and into a
 * spread, are not universal. They depend on the scoring format: an intercept of
 * two points means something different in a standard league than in full PPR,
 * and a superflex league's starters project higher across the board.
 *
 * So they are measured from the league's own most recently completed season
 * rather than shipped as literals. A league with no completed season yet, which
 * is every league in its first year, falls back to the defaults below and says
 * so in the UI.
 *
 * ── What gets fitted ─────────────────────────────────────────────────────────
 *
 *   expected = intercept + slope * projection      how compressed projections are
 *   sd       = sdBase + sdSlope * projection       how wrong they tend to be
 *   inflation                                      same-game correlation, which
 *                                                  summing independent variances
 *                                                  misses
 */

import { seasonSchedule, phaseOf } from '@/lib/nflSchedule';
import { weeklyProjections, fantasyPositions } from './weeklyProjections';
import { scoreStatLine, type ScoringSettings } from '@/lib/scoring';

export interface Calibration {
  intercept: number;
  slope: number;
  sdBase: number;
  sdSlope: number;
  /** Multiplier on team variance, restoring same-game correlation. */
  inflation: number;
  /** Starter-weeks the fit rests on. Zero means the defaults are in use. */
  sample: number;
  /** Which season was measured, or null when defaulted. */
  season: string | null;
  source: 'league' | 'default';
}

/**
 * Defaults, fitted on 1,119 starter-weeks of a full PPR league.
 *
 * Deliberately conservative and only used until a league has a completed season
 * of its own. They encode two findings that hold broadly: projections are
 * compressed toward the middle, and their error grows far more slowly than the
 * projection itself, so spread is close to flat rather than proportional.
 */
export const DEFAULT_CALIBRATION: Calibration = {
  intercept: 2.035,
  slope: 0.799,
  sdBase: 4.81,
  sdSlope: 0.207,
  inflation: (25.9 / 24.6) ** 2,
  sample: 0,
  season: null,
  source: 'default',
};

/** Below this many starter-weeks a fit is noise, so the defaults stand. */
const MIN_SAMPLE = 200;

interface FitSeason {
  season: string;
  leagueId: string;
  regularSeasonWeeks: number;
  rosterSlots: string[];
  scoring: ScoringSettings;
  /** week -> matchup rows */
  weeks: Map<number, any[]>;
  /** Real weekly team totals, for the correlation check. */
  teamScores: number[];
}

/**
 * Fit from one completed season's starters.
 *
 * Each started player contributes their projection and what they actually
 * scored, both under the league's own scoring settings.
 */
export async function fitCalibration(input: FitSeason): Promise<Calibration> {
  const positions = fantasyPositions(input.rosterSlots);
  const schedule = await seasonSchedule(input.season, false);

  const pairs: { proj: number; actual: number }[] = [];

  // Weeks worth fitting, then walked with a small concurrency cap. Firing all
  // fourteen at once had Sleeper drop several of them, and because a failed
  // fetch degrades to an empty map the fit silently shrank from 1,119
  // starter-weeks to 720 without any error surfacing.
  const fitWeeks: number[] = [];
  for (let w = 1; w <= input.regularSeasonWeeks; w++) {
    if (phaseOf(schedule.filter(g => Number(g.week) === w)) !== 'final') continue;
    if (input.weeks.get(w)?.length) fitWeeks.push(w);
  }

  const queue = [...fitWeeks];
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (;;) {
        const week = queue.shift();
        if (week === undefined) return;
        const rows = input.weeks.get(week)!;

      const proj = await weeklyProjections(input.season, week, positions, input.scoring);
      for (const m of rows) {
        const pts: Record<string, number> = m.players_points ?? {};
        for (const id of (m.starters ?? []) as string[]) {
          if (!id || id === '0') continue;
          const p = proj.get(id);
          const a = pts[id];
          if (typeof p !== 'number' || p <= 0) continue;
          if (typeof a !== 'number') continue;
          pairs.push({ proj: p, actual: a });
        }
      }
      }
    }),
  );

  if (pairs.length < MIN_SAMPLE) return DEFAULT_CALIBRATION;


  // Least squares: actual = intercept + slope * projection.
  const n = pairs.length;
  const sx = pairs.reduce((s, p) => s + p.proj, 0);
  const sy = pairs.reduce((s, p) => s + p.actual, 0);
  const sxx = pairs.reduce((s, p) => s + p.proj * p.proj, 0);
  const sxy = pairs.reduce((s, p) => s + p.proj * p.actual, 0);
  const denom = n * sxx - sx * sx;
  if (!Number.isFinite(denom) || denom === 0) return DEFAULT_CALIBRATION;

  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;

  // Spread of the calibrated residual, bucketed by projection so the fit can
  // see whether it grows. Buckets rather than a raw regression on |residual|,
  // which is badly behaved.
  const buckets: [number, number][] = [[0, 4], [4, 8], [8, 12], [12, 16], [16, 22], [22, 1e9]];
  const pts: { x: number; y: number }[] = [];
  for (const [lo, hi] of buckets) {
    const b = pairs.filter(p => p.proj >= lo && p.proj < hi);
    if (b.length < 25) continue;
    const mx = b.reduce((s, p) => s + p.proj, 0) / b.length;
    const resid = b.map(p => p.actual - (intercept + slope * p.proj));
    const mr = resid.reduce((s, r) => s + r, 0) / resid.length;
    const sd = Math.sqrt(resid.reduce((s, r) => s + (r - mr) ** 2, 0) / resid.length);
    pts.push({ x: mx, y: sd });
  }

  let sdBase = DEFAULT_CALIBRATION.sdBase;
  let sdSlope = DEFAULT_CALIBRATION.sdSlope;
  if (pts.length >= 3) {
    const m = pts.length;
    const bx = pts.reduce((s, p) => s + p.x, 0);
    const by = pts.reduce((s, p) => s + p.y, 0);
    const bxx = pts.reduce((s, p) => s + p.x * p.x, 0);
    const bxy = pts.reduce((s, p) => s + p.x * p.y, 0);
    const d2 = m * bxx - bx * bx;
    if (d2 !== 0) {
      const sl = (m * bxy - bx * by) / d2;
      const ic = (by - sl * bx) / m;
      // Guard against a perverse fit on a thin sample: spread must be positive
      // and must not shrink as projections rise.
      if (ic > 0 && sl >= 0) { sdBase = ic; sdSlope = sl; }
    }
  }

  // Same-game correlation: what a lineup's spread should be under independence,
  // against how much this league's weekly team scores actually vary.
  const avgProj = sx / n;
  const startersPerTeam = input.rosterSlots.filter(
    s => s !== 'BN' && s !== 'IR' && s !== 'TAXI').length || 10;
  const modelTeamSd = Math.sqrt(startersPerTeam) * (sdBase + sdSlope * avgProj);
  const realTeamSd = stdev(input.teamScores);
  const inflation = realTeamSd > 0 && modelTeamSd > 0
    // Clamped: a wild ratio means something else is wrong, and squaring it
    // would hand the forecast absurd confidence or none at all.
    ? Math.min(2.5, Math.max(0.6, (realTeamSd / modelTeamSd) ** 2))
    : DEFAULT_CALIBRATION.inflation;

  return {
    intercept, slope, sdBase, sdSlope, inflation,
    sample: n, season: input.season, source: 'league',
  };
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
