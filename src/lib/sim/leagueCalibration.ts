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
import { getRedis } from '@/lib/redisClient';

interface Entry { value: Calibration; at: number }

const cache = new Map<string, Entry>();
/** Six hours. A season completing mid-window costs one stale render. */
const TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Persisted fits last three days. The measured season is a completed one, so
 * the numbers cannot change; the window only bounds how long a newly completed
 * season waits to be picked up.
 */
const STORED_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const storeKey = (leagueId: string) => `lp_calib_v1:${leagueId}`;

export async function leagueCalibration(leagueId: string): Promise<Calibration> {
  const hit = cache.get(leagueId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  // Shared across server instances. The in-memory memo alone meant every cold
  // serverless instance refit a season of projections before it could answer,
  // which was 1.3 of the 2.5 seconds a matchup drilldown took to open.
  const redis = getRedis().client;
  if (redis) {
    try {
      const raw = await redis.get(storeKey(leagueId));
      if (raw) {
        const stored = JSON.parse(raw) as Entry;
        if (stored?.value && Date.now() - stored.at < STORED_TTL_MS) {
          cache.set(leagueId, stored);
          return stored.value;
        }
      }
    } catch { /* fall through to a fresh fit */ }
  }

  let value = DEFAULT_CALIBRATION;
  let fitted = false;
  try {
    value = await computeFor(leagueId);
    fitted = true;
  } catch {
    // A failed fit is not a failed page. The defaults are serviceable.
  }
  const entry = { value, at: Date.now() };
  cache.set(leagueId, entry);
  // Only persist a real fit. The defaults come back both for a league with no
  // completed season (cheap to rediscover) and for a fit starved by dropped
  // fetches, and pinning the second for three days would be a quiet regression.
  if (redis && fitted && value.source === 'league') {
    redis.set(storeKey(leagueId), JSON.stringify(entry)).catch(() => {});
  }
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
