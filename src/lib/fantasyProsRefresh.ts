/**
 * A league's FantasyPros rankings: its key, its settings, and the refresh that
 * pulls a snapshot (lib/fantasyProsStore) for every reader to share.
 *
 *   The key        Hosted: the league's own, set by its admin (tenant/secrets).
 *                  Self-hosted: FANTASY_PROS in the environment.
 *   Settings       which boards to keep (this week's, dynasty), the scoring
 *                  to rank for (read off the league unless the admin picks),
 *                  and whether the daily refresh runs.
 *   A refresh      one request per position per board, spaced out, since the
 *                  free tier allows 50 requests a day and limits bursts. A
 *                  board that fails keeps its previous copy.
 *
 * Server only. Nothing here runs on a page view.
 */

import { readJson, writeJson } from './jsonStore';
import {
  fetchConsensusRankings, requestsFor, RANKED_POSITIONS, RANKING_MODES,
  type EcrBoard, type RankedPosition, type RankingMode,
} from './fantasypros';
import { getSnapshot, saveSnapshot, type EcrSnapshot } from './fantasyProsStore';

export type Scoring = 'PPR' | 'HALF' | 'STD';
export interface RankingsSettings {
  /** `auto`: read off the league's scoring. */
  scoring: 'auto' | Scoring;
  boards: RankingMode[];
  /** Whether the daily refresh runs. */
  daily: boolean;
}
export const DEFAULT_SETTINGS: RankingsSettings = { scoring: 'auto', boards: [...RANKING_MODES], daily: true };

export interface RefreshRun {
  at: string;
  by: 'schedule' | 'admin';
  ok: boolean;
  requests: number;
  error?: string;
  failures?: string[];
}

const SETTINGS = 'lp_fp_settings';
const LAST_RUN = 'lp_fp_last_run';

export async function rankingsSettings(): Promise<RankingsSettings> {
  const s = await readJson<Partial<RankingsSettings>>(SETTINGS, 'fantasypros-settings.json', {});
  const boards = (s.boards ?? DEFAULT_SETTINGS.boards).filter(b => (RANKING_MODES as readonly string[]).includes(b));
  return {
    scoring: s.scoring && ['auto', 'PPR', 'HALF', 'STD'].includes(s.scoring) ? s.scoring : 'auto',
    boards: boards.length ? boards : DEFAULT_SETTINGS.boards,
    daily: s.daily ?? true,
  };
}

export async function saveRankingsSettings(next: RankingsSettings): Promise<void> {
  await writeJson(SETTINGS, 'fantasypros-settings.json', next);
}

export async function lastRefresh(): Promise<RefreshRun | null> {
  return readJson<RefreshRun | null>(LAST_RUN, 'fantasypros-last-run.json', null);
}

const hosted = () => process.env.LP_HOSTED === '1';

/** The key rankings run on, and where it comes from; null when there is none. */
export async function fantasyProsKey(): Promise<{ key: string; from: 'league' | 'environment' } | null> {
  if (hosted()) {
    const { tenantFantasyProsKey } = await import('./tenant/secrets');
    const key = await tenantFantasyProsKey().catch(() => null);
    return key ? { key, from: 'league' } : null;
  }
  const key = process.env.FANTASY_PROS?.trim();
  return key ? { key, from: 'environment' } : null;
}

export async function isFantasyProsConfigured(): Promise<boolean> {
  return Boolean(await fantasyProsKey());
}

/**
 * Whether the league's rankings are connected, for showing them at all (the
 * nav link, the page). Reads only that a key exists, so it is cheap on every page.
 */
export async function rankingsConnected(): Promise<boolean> {
  if (!hosted()) return Boolean(process.env.FANTASY_PROS?.trim());
  const { hasTenantFantasyProsKey } = await import('./tenant/secrets');
  return hasTenantFantasyProsKey().catch(() => false);
}

/** PPR, half or standard changes the board materially, so it is read off the league. */
export function scoringOf(league: { scoring_settings?: Record<string, number> } | null | undefined): Scoring {
  const rec = Number(league?.scoring_settings?.rec ?? 0);
  if (rec >= 1) return 'PPR';
  if (rec > 0) return 'HALF';
  return 'STD';
}

/** Gap between calls, to stay under the undocumented burst limit. */
const SPACING_MS = 1500;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** One retry on 429, since the burst limit clears in seconds. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!/429|Too Many Requests/i.test(err instanceof Error ? err.message : String(err))) throw err;
    await sleep(4000);
    return fn();
  }
}

export type RefreshResult =
  | { ok: true; season: string; week: number; scoring: Scoring; refreshed: string[]; requests: number; failures?: string[] }
  | { ok: false; skipped?: string; error?: string; requests: number; failures?: string[] };

/** Pulls a snapshot of the league's boards and keeps it. */
export async function refreshRankings(by: RefreshRun['by']): Promise<RefreshResult> {
  const found = await fantasyProsKey();
  if (!found) return { ok: false, skipped: 'no-key', requests: 0 };
  const settings = await rankingsSettings();
  if (by === 'schedule' && !settings.daily) return { ok: false, skipped: 'paused', requests: 0 };

  const [{ getLeagueInfo, getNFLState }, { getCurrentLeagueId }] = await Promise.all([import('./api'), import('@/config/league')]);
  const leagueId = await getCurrentLeagueId();
  const [league, nflState] = await Promise.all([getLeagueInfo(leagueId), getNFLState()]);
  const season = nflState?.season ?? String(new Date().getFullYear());
  // Outside the regular season there is no meaningful week: week 0 asks for the preseason board.
  const week = nflState?.season_type === 'regular' ? Number(nflState?.week ?? 0) : 0;
  const scoring = settings.scoring === 'auto' ? scoringOf(league) : settings.scoring;

  // Start from the previous snapshot so a board that fails this run keeps its last
  // copy, but only for the boards the league still wants.
  const previous = await getSnapshot();
  const boards: Partial<Record<RankingMode, Partial<Record<RankedPosition, EcrBoard>>>> = {};
  for (const mode of settings.boards) if (previous?.boards[mode]) boards[mode] = structuredClone(previous.boards[mode]);
  const failures: string[] = [];
  const refreshed: string[] = [];
  const requests = requestsFor(settings.boards);

  // Sequential and spaced: FantasyPros limits bursts on top of the daily quota.
  for (const mode of settings.boards) {
    for (const position of RANKED_POSITIONS) {
      try {
        (boards[mode] ??= {})[position] = await withRetry(() => fetchConsensusRankings({ key: found.key, season, week, position, mode, scoring }));
        refreshed.push(`${mode}/${position}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[fantasypros] ${mode}/${position} failed:`, msg);
        failures.push(`${mode}/${position}: ${msg}`);
      }
      await sleep(SPACING_MS);
    }
  }

  const record = (run: Omit<RefreshRun, 'at' | 'by' | 'requests'>) =>
    writeJson(LAST_RUN, 'fantasypros-last-run.json', { at: new Date().toISOString(), by, requests, ...run } satisfies RefreshRun).catch(() => {});

  if (!refreshed.length) {
    const error = failures[0] ?? 'No boards came back';
    await record({ ok: false, error, failures });
    return { ok: false, error, failures, requests };
  }
  const snapshot: EcrSnapshot = {
    season, week, scoring, fetchedAt: new Date().toISOString(), boards,
    ...(failures.length ? { failures } : {}),
  };
  await saveSnapshot(snapshot);
  await record({ ok: true, ...(failures.length ? { failures } : {}) });
  return { ok: true, season, week, scoring, refreshed, requests, ...(failures.length ? { failures } : {}) };
}
