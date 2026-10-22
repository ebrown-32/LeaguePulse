/**
 * Keep every ESPN league's current season fresh, every five minutes.
 *
 * Pages already refresh what they show when it goes stale, so this is not
 * what keeps ESPN leagues correct; it is what keeps them fast, and what
 * notices expired cookies before a league-mate does (see the health record
 * in src/lib/providers/espn/data.ts). Sleeper leagues are never touched.
 *
 * One invocation for all of them, with a time budget: a league not reached
 * this run is first in line the next. Finished seasons are skipped.
 */

import { withCron } from '@/lib/ops/monitor';
import { NextResponse } from 'next/server';
import { bearerMatches } from '@/lib/platform/operator';
import { parseEspnLeague } from '@/lib/providers/ids';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUDGET_MS = 45_000;

/** The newest season ESPN has for this league: this year's once it exists. */
async function currentSeason(lid: string, rootSeason: number): Promise<number> {
  const { seasonExists } = await import('@/lib/providers/espn/data');
  const year = new Date().getFullYear();
  for (let y = year; y > rootSeason; y--) if (await seasonExists(lid, y)) return y;
  return rootSeason;
}

async function syncOne(lid: string, rootSeason: number) {
  const { syncLeague } = await import('@/lib/providers/espn/data');
  const season = await currentSeason(lid, rootSeason);
  return { season, ...(await syncLeague(lid, season)) };
}

async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const hosted = process.env.LP_HOSTED === '1';
  // Open locally without a secret, like the AI scheduler; never on the hosted product.
  if (secret ? !bearerMatches(req, secret) : hosted) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const started = Date.now();
  if (!hosted) {
    const espn = parseEspnLeague(process.env.NEXT_PUBLIC_LEAGUE_ID ?? '');
    if (!espn) return NextResponse.json({ skipped: 'not an ESPN league' });
    try { return NextResponse.json({ league: espn.leagueId, ...(await syncOne(espn.leagueId, espn.season)) }); }
    catch (err) { return NextResponse.json({ league: espn.leagueId, error: err instanceof Error ? err.message : String(err) }, { status: 502 }); }
  }

  const { listTenants, isLive } = await import('@/lib/platform/tenants');
  const { runAsTenant } = await import('@/lib/tenant/context');
  const { getEspnHealth } = await import('@/lib/providers/espn/data');
  const leagues = (await listTenants()).filter(isLive)
    .map(t => ({ t, espn: parseEspnLeague(t.leagueId) }))
    .filter((x): x is { t: typeof x.t; espn: NonNullable<typeof x.espn> } => Boolean(x.espn));
  // Longest since last checked goes first.
  const order = await Promise.all(leagues.map(async x => ({ ...x, at: (await getEspnHealth(x.espn.leagueId))?.at ?? 0 })));
  order.sort((a, b) => a.at - b.at);

  const results: unknown[] = [];
  for (const { t, espn } of order) {
    if (Date.now() - started > BUDGET_MS) { results.push({ league: t.slug, skipped: 'out of time' }); continue; }
    try {
      results.push({ league: t.slug, ...(await runAsTenant(t, () => syncOne(espn.leagueId, espn.season))) });
    } catch (err) {
      results.push({ league: t.slug, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ leagues: results.length, ms: Date.now() - started, results });
}

/** Each run recorded for the back office (lib/ops/monitor). */
export const GET = withCron('espn-sync', run);
