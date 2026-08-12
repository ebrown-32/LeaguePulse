import { NextResponse } from 'next/server';
import {
  fetchConsensusRankings,
  isFantasyProsConfigured,
  RANKED_POSITIONS,
  RANKING_MODES,
  REQUESTS_PER_REFRESH,
  type EcrBoard,
  type RankedPosition,
  type RankingMode,
} from '@/lib/fantasypros';
import { getSnapshot, saveSnapshot, type EcrSnapshot } from '@/lib/fantasyProsStore';
import { getLeagueInfo, getNFLState } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Pulls one FantasyPros snapshot and caches it.
 *
 * Costs REQUESTS_PER_REFRESH of the free tier's 50 daily requests (one per
 * position per mode), leaving headroom for manual refreshes. It is
 * deliberately the ONLY thing in the app that calls FantasyPros; every reader
 * goes through the cached snapshot.
 */

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

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Vercel attaches this header to scheduled invocations automatically.
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return true;
  // Admin can trigger a refresh by hand from the back office.
  const admin = process.env.ADMIN_PASSWORD;
  if (admin && request.headers.get('x-admin-password') === admin) return true;
  // With neither configured we are running locally.
  return !secret && !admin;
}

/** PPR/half/standard changes the board materially, so read it off the league. */
function scoringOf(league: any): 'PPR' | 'HALF' | 'STD' {
  const rec = Number(league?.scoring_settings?.rec ?? 0);
  if (rec >= 1) return 'PPR';
  if (rec > 0) return 'HALF';
  return 'STD';
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isFantasyProsConfigured()) {
    return NextResponse.json({ skipped: 'fantasypros-not-configured' });
  }

  try {
    const leagueId = await getCurrentLeagueId();
    const [league, nflState] = await Promise.all([getLeagueInfo(leagueId), getNFLState()]);

    const season = nflState?.season ?? String(new Date().getFullYear());
    // Outside the regular season there is no meaningful week, so week 0 asks
    // for the preseason draft board instead of a nonexistent week's rankings.
    const week = nflState?.season_type === 'regular' ? Number(nflState?.week ?? 0) : 0;
    const scoring = scoringOf(league);

    // Start from the previous snapshot so a board that fails this run keeps
    // yesterday's copy instead of vanishing from the UI.
    const previous = await getSnapshot();
    const boards: Partial<Record<RankingMode, Partial<Record<RankedPosition, EcrBoard>>>> =
      structuredClone(previous?.boards ?? {});
    const failures: string[] = [];
    const fresh: string[] = [];

    // Sequential and spaced. FantasyPros enforces a burst limit on top of the
    // daily quota: firing ten in a row reliably 429s the last few.
    for (const mode of RANKING_MODES) {
      for (const position of RANKED_POSITIONS) {
        try {
          const board = await withRetry(() =>
            fetchConsensusRankings({ season, week, position, mode, scoring }));
          (boards[mode] ??= {})[position] = board;
          fresh.push(`${mode}/${position}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[fantasypros/refresh] ${mode}/${position} failed:`, msg);
          failures.push(`${mode}/${position}: ${msg}`);
        }
        await sleep(SPACING_MS);
      }
    }

    if (!Object.keys(boards).length) {
      return NextResponse.json(
        { error: failures[0] ?? 'no boards fetched', failures, requestsUsed: REQUESTS_PER_REFRESH },
        { status: 502 },
      );
    }

    const snapshot: EcrSnapshot = {
      season,
      week,
      scoring,
      fetchedAt: new Date().toISOString(),
      boards,
      ...(failures.length ? { failures } : {}),
    };
    await saveSnapshot(snapshot);

    return NextResponse.json({
      ok: true,
      season,
      week,
      scoring,
      refreshed: fresh,
      modes: Object.fromEntries(Object.entries(boards).map(([m, b]) => [m, Object.keys(b ?? {})])),
      requestsUsed: REQUESTS_PER_REFRESH,
      ...(failures.length ? { failures } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[fantasypros/refresh]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
