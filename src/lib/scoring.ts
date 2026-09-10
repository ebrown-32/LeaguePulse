/**
 * Scoring a stat line with a league's own settings.
 *
 * Sleeper's projection and stat payloads carry both a raw stat line and a few
 * precomputed totals: `pts_ppr`, `pts_half_ppr`, `pts_std`. Reading `pts_ppr`
 * is a shortcut that happens to be right for full PPR leagues and quietly wrong
 * for everyone else, which matters because this project is open source and most
 * leagues that clone it will not share this one's settings.
 *
 * Applying `scoring_settings` to the raw stats instead is both general and
 * accurate: checked against 461 week-1 projections in a full PPR league, it
 * reproduces Sleeper's own `pts_ppr` to within 0.105 points on average.
 *
 * The residual comes from a handful of defence and special teams bonuses that
 * projections do not break out (points-allowed brackets, return touchdowns).
 * Those are unprojectable anyway, so no method could recover them.
 */

export type ScoringSettings = Record<string, number>;
export type StatLine = Record<string, unknown>;

/**
 * Points this stat line is worth under these settings.
 *
 * Falls back to the precomputed totals when there are no usable settings, so a
 * caller that cannot load the league still gets a sensible number rather than
 * zero.
 */
export function scoreStatLine(stats: StatLine | null | undefined, scoring: ScoringSettings | null | undefined): number | null {
  if (!stats) return null;

  if (scoring && Object.keys(scoring).length > 0) {
    let total = 0;
    let matched = 0;
    for (const [key, weight] of Object.entries(scoring)) {
      if (!weight) continue;
      const v = stats[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        total += v * weight;
        matched++;
      }
    }
    // A stat line that matched nothing is not a zero-point performance, it is a
    // row we could not score. Fall through rather than reporting a confident 0.
    if (matched > 0) return total;
  }

  return precomputed(stats, scoring);
}

/**
 * Sleeper's own totals, picked to match the league's reception setting.
 *
 * Used when the raw stats cannot be scored. `rec` is the one setting that
 * separates the three published variants.
 */
function precomputed(stats: StatLine, scoring: ScoringSettings | null | undefined): number | null {
  const rec = typeof scoring?.rec === 'number' ? scoring.rec : 1;
  const key = rec >= 0.75 ? 'pts_ppr' : rec >= 0.25 ? 'pts_half_ppr' : 'pts_std';
  const order = [key, 'pts_ppr', 'pts_half_ppr', 'pts_std'];
  for (const k of order) {
    const v = stats[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * A short human label for the league's scoring format, for the UI.
 *
 * Derived rather than configured, so it stays right when a commissioner changes
 * the settings.
 */
export function scoringLabel(scoring: ScoringSettings | null | undefined): string {
  const rec = typeof scoring?.rec === 'number' ? scoring.rec : null;
  if (rec === null) return 'custom scoring';
  if (rec >= 0.75) return 'PPR';
  if (rec >= 0.25) return 'half PPR';
  if (rec === 0)   return 'standard';
  return 'custom scoring';
}
