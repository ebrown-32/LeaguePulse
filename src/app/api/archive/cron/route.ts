/**
 * Keeps every league's archive current (see src/lib/archive). Runs hourly.
 *
 * Each run takes the leagues that are due, oldest first: never archived,
 * archived more than LP_ARCHIVE_EVERY_HOURS ago (20 by default, so each
 * league is updated once a day, spread across the day rather than all at
 * once), or left unfinished last time because Sleeper's limit had no room.
 *
 * A run reads only what can still change (see src/lib/archive/plan.ts), about
 * eight Sleeper calls for a league mid-season, and waits for room under the
 * platform's share of Sleeper's limit (src/lib/providers/sleeperBudget.ts)
 * before each batch. At 600 calls a minute for jobs, one four-minute run can
 * update a few hundred leagues, and twenty-four runs a day several thousand.
 *
 * Without DATABASE_URL (a self-hosted copy that never set one up) it does nothing.
 */

import { withCron } from '@/lib/ops/monitor';
import { NextResponse } from 'next/server';
import { bearerMatches } from '@/lib/platform/operator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BUDGET_MS = 240_000;
const EVERY_HOURS = Number(process.env.LP_ARCHIVE_EVERY_HOURS) || 20;

async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const hosted = process.env.LP_HOSTED === '1';
  // Open locally without a secret, like the other jobs; never on the hosted product.
  if (secret ? !bearerMatches(req, secret) : hosted) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ skipped: 'The archive is not set up' });

  const started = Date.now();
  const deadline = started + BUDGET_MS;
  const [{ archiveLeague }, { ensureArchive, T }] = await Promise.all([import('@/lib/archive/ingest'), import('@/lib/archive/db')]);
  const db = (await ensureArchive())!;
  const summary = (r: Awaited<ReturnType<typeof archiveLeague>>) => ({
    complete: r.complete,
    read: r.seasons.filter(s => s.counts).map(s => `${s.season}${s.weeks?.length ? ` weeks ${s.weeks[0]}-${s.weeks[s.weeks.length - 1]}` : ''}`),
    kept: r.seasons.filter(s => s.kept && !s.kept.startsWith('Finished')).map(s => `${s.seasonId}: ${s.kept}`),
    ms: r.ms,
  });

  // When each league last finished a complete run.
  const last = new Map<string, number>((await db.query(
    `SELECT site, max(started_at) AS at FROM ${T('archive_runs')}
     WHERE error IS NULL AND finished_at IS NOT NULL AND coalesce((summary->>'complete')::boolean, true)
     GROUP BY site`,
  )).rows.map(r => [r.site as string, new Date(r.at).getTime()]));
  const due = (site: string) => (last.get(site) ?? 0) < started - EVERY_HOURS * 3_600_000;

  if (!hosted) {
    if (!due('self')) return NextResponse.json({ league: 'self', skipped: 'not due' });
    try { return NextResponse.json({ league: 'self', ...summary(await archiveLeague({ deadline })) }); }
    catch (err) { return NextResponse.json({ league: 'self', error: err instanceof Error ? err.message : String(err) }, { status: 502 }); }
  }

  const [{ listTenants, isLive }, { runAsTenant }] = await Promise.all([import('@/lib/platform/tenants'), import('@/lib/tenant/context')]);
  const leagues = (await listTenants()).filter(t => isLive(t) && due(t.slug))
    .sort((a, b) => (last.get(a.slug) ?? 0) - (last.get(b.slug) ?? 0));

  const results: unknown[] = [];
  for (const t of leagues) {
    if (Date.now() > deadline) { results.push({ league: t.slug, skipped: 'out of time; first in line next run' }); continue; }
    try {
      results.push({ league: t.slug, ...summary(await runAsTenant(t, () => archiveLeague({ deadline }))) });
    } catch (err) {
      results.push({ league: t.slug, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ due: leagues.length, ms: Date.now() - started, results });
}

/** Each run recorded for the back office (lib/ops/monitor). */
export const GET = withCron('archive', run);
