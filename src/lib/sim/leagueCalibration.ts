/**
 * The league's own forecast calibration, loaded once and reused.
 *
 * Fitting means reading a completed season of projections and results, which is
 * a real amount of work to do on a page load. A finished season never changes,
 * so the answer is memoised for the life of the server process and refetched
 * only when a new season completes.
 *
 * A league in its first year has nothing to fit and gets the shipped defaults.
 * That is the honest outcome rather than a failure: the defaults encode the two
 * findings that generalise, and the UI reports which is in use.
 */

import { getAllLinkedLeagueIds, getLeagueInfo, getLeagueRosters, getLeagueMatchups } from '@/lib/api';
import { fitCalibration, DEFAULT_CALIBRATION, type Calibration } from './calibration';

interface Entry { value: Calibration; at: number }

const cache = new Map<string, Entry>();
/** Six hours. A season completing mid-window costs one stale render. */
const TTL_MS = 6 * 60 * 60 * 1000;

export async function leagueCalibration(leagueId: string): Promise<Calibration> {
  const hit = cache.get(leagueId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value = DEFAULT_CALIBRATION;
  try {
    value = await computeFor(leagueId);
  } catch {
    // A failed fit is not a failed page. The defaults are serviceable.
  }
  cache.set(leagueId, { value, at: Date.now() });
  return value;
}

async function computeFor(leagueId: string): Promise<Calibration> {
  const linked = await getAllLinkedLeagueIds(leagueId);

  const infos = (await Promise.all(linked.map(async id => {
    const info: any = await getLeagueInfo(id).catch(() => null);
    return info ? { id, info } : null;
  }))).filter((x): x is { id: string; info: any } => x !== null);

  // The most recent COMPLETED season. The live one cannot be fitted, since its
  // weeks are still arriving.
  const completed = infos
    .filter(x => x.info.status === 'complete')
    .sort((a, b) => Number(b.info.season) - Number(a.info.season));
  if (completed.length === 0) return DEFAULT_CALIBRATION;

  const { id, info } = completed[0];
  const regularSeasonWeeks = Math.max(1, Number(info.settings?.playoff_week_start ?? 15) - 1);

  const [rosters, weekRows] = await Promise.all([
    getLeagueRosters(id).catch(() => [] as any[]),
    Promise.all(Array.from({ length: regularSeasonWeeks }, (_, i) =>
      getLeagueMatchups(id, i + 1).catch(() => [] as any[]))),
  ]);

  const weeks = new Map<number, any[]>();
  const teamScores: number[] = [];
  weekRows.forEach((rows, i) => {
    weeks.set(i + 1, rows ?? []);
    for (const m of rows ?? []) {
      const p = Number(m?.points ?? 0);
      if (p > 0) teamScores.push(p);
    }
  });

  return fitCalibration({
    season: String(info.season),
    leagueId: id,
    regularSeasonWeeks,
    rosterSlots: info.roster_positions ?? [],
    scoring: info.scoring_settings ?? {},
    weeks,
    teamScores,
  });
}

/** Exposed for diagnostics and tests. */
export function clearCalibrationCache() { cache.clear(); }
