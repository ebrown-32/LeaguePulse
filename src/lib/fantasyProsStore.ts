/**
 * Cached FantasyPros snapshot.
 *
 * The free tier allows 50 requests a day, so exactly one snapshot is written
 * per day by the scheduled refresh and every reader is served from here. The
 * snapshot records when it was taken so the UI can be honest about staleness
 * rather than implying the numbers are live.
 */
import { readJson, writeJson } from './jsonStore';
import type { EcrBoard, RankedPosition, RankingMode } from './fantasypros';

const KEY = 'lp_fp_snapshot';
const FILE = 'fantasypros.json';

export interface EcrSnapshot {
  season: string;
  week: number;
  scoring: 'PPR' | 'HALF' | 'STD';
  /** When we pulled it. */
  fetchedAt: string;
  /** Boards keyed by mode, then position. */
  boards: Partial<Record<RankingMode, Partial<Record<RankedPosition, EcrBoard>>>>;
  /** Positions that failed, so a partial refresh is visible rather than silent. */
  failures?: string[];
}

export async function getSnapshot(): Promise<EcrSnapshot | null> {
  return readJson<EcrSnapshot | null>(KEY, FILE, null);
}

export async function saveSnapshot(snapshot: EcrSnapshot): Promise<void> {
  await writeJson(KEY, FILE, snapshot);
}
