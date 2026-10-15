/**
 * The league's FantasyPros rankings, for its admin (lib/fantasyProsRefresh).
 *
 *   GET     where things stand: whether a key is set (its fingerprint only,
 *           never the key), the settings, the snapshot on hand, the last run
 *   PUT     { key } hosted only: tested with one request, then stored encrypted
 *   DELETE  hosted only: forgets the key
 *   PATCH   { scoring?, boards?, daily? } the settings
 *   POST    refreshes now (one request per position per board)
 *
 * Self-hosted, the key lives in FANTASY_PROS in the environment, as secrets do there.
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { DAILY_REQUESTS, RANKED_POSITIONS, RANKING_MODES, requestsFor, testFantasyProsKey, type RankingMode } from '@/lib/fantasypros';
import {
  fantasyProsKey, lastRefresh, rankingsSettings, refreshRankings, saveRankingsSettings, scoringOf, type RankingsSettings,
} from '@/lib/fantasyProsRefresh';
import { getSnapshot } from '@/lib/fantasyProsStore';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const hosted = () => process.env.LP_HOSTED === '1';
const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

async function status() {
  const [{ fingerprint }, found, settings, snapshot, last] = await Promise.all([
    import('@/lib/tenant/secrets'), fantasyProsKey(), rankingsSettings(), getSnapshot(), lastRefresh(),
  ]);
  // The league's own scoring, for "Match the league".
  let leagueScoring: string | null = null;
  try {
    const [{ getLeagueInfo }, { getCurrentLeagueId }] = await Promise.all([import('@/lib/api'), import('@/config/league')]);
    leagueScoring = scoringOf(await getLeagueInfo(await getCurrentLeagueId()));
  } catch { /* unknown */ }
  return {
    mode: hosted() ? 'hosted' : 'self-hosted',
    key: found ? { from: found.from, fingerprint: fingerprint(found.key) } : null,
    settings,
    leagueScoring,
    budget: { perRefresh: requestsFor(settings.boards), daily: DAILY_REQUESTS, positions: RANKED_POSITIONS.length },
    snapshot: snapshot && {
      fetchedAt: snapshot.fetchedAt, season: snapshot.season, week: snapshot.week, scoring: snapshot.scoring,
      boards: Object.fromEntries(Object.entries(snapshot.boards).map(([mode, byPos]) => [mode,
        Object.fromEntries(Object.entries(byPos ?? {}).map(([pos, b]) => [pos, { returned: b!.returned, totalRanked: b!.totalRanked, experts: b!.experts }]))])),
      failures: snapshot.failures ?? [],
    },
    lastRun: last,
  };
}

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return unauthorized();
  return NextResponse.json(await status());
}

export async function PUT(req: Request) {
  if (!(await isAdminRequest(req))) return unauthorized();
  if (!hosted()) return NextResponse.json({ error: 'Set FANTASY_PROS in the deployment environment.' }, { status: 400 });
  const key = String((await req.json().catch(() => ({})))?.key ?? '').trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) return NextResponse.json({ error: 'That does not look like a FantasyPros API key. Paste the whole key.' }, { status: 400 });
  const { getNFLState } = await import('@/lib/api');
  const season = (await getNFLState().catch(() => null))?.season ?? String(new Date().getFullYear());
  const check = await testFantasyProsKey(key, season);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  const { setTenantFantasyProsKey } = await import('@/lib/tenant/secrets');
  await setTenantFantasyProsKey(key);
  return NextResponse.json(await status());
}

export async function DELETE(req: Request) {
  if (!(await isAdminRequest(req))) return unauthorized();
  if (!hosted()) return NextResponse.json({ error: 'Remove FANTASY_PROS from the environment instead.' }, { status: 400 });
  const { setTenantFantasyProsKey } = await import('@/lib/tenant/secrets');
  await setTenantFantasyProsKey(null);
  return NextResponse.json(await status());
}

export async function PATCH(req: Request) {
  if (!(await isAdminRequest(req))) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as Partial<RankingsSettings>;
  const current = await rankingsSettings();
  const next: RankingsSettings = { ...current };
  if (body.scoring !== undefined) {
    if (!['auto', 'PPR', 'HALF', 'STD'].includes(body.scoring)) return NextResponse.json({ error: 'Pick a scoring format.' }, { status: 400 });
    next.scoring = body.scoring;
  }
  if (body.boards !== undefined) {
    const boards = Array.isArray(body.boards) ? RANKING_MODES.filter(m => (body.boards as RankingMode[]).includes(m)) : [];
    if (!boards.length) return NextResponse.json({ error: 'Keep at least one board.' }, { status: 400 });
    next.boards = [...boards];
  }
  if (body.daily !== undefined) next.daily = Boolean(body.daily);
  await saveRankingsSettings(next);
  return NextResponse.json(await status());
}

export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return unauthorized();
  const result = await refreshRankings('admin');
  return NextResponse.json({ result, ...(await status()) }, { status: result.ok ? 200 : 400 });
}
