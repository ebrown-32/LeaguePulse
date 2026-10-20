/**
 * The franchises' game-day posts (lib/franchise/gameday): big days and final scores, from their
 * own accounts. Runs every fifteen minutes; outside the NFL's game windows it looks at the
 * shared scoreboard once and stops.
 */

import { NextResponse } from 'next/server';
import { bearerMatches } from '@/lib/platform/operator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BUDGET_MS = 240_000;
/**
 * A game that kicked off within this long is still worth posting about: through Monday for
 * Sunday's games, so a missed run (a deploy, an outage) catches up rather than skipping them.
 */
const RECENT_MS = 36 * 3_600_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const hosted = process.env.LP_HOSTED === '1';
  // Open locally without a secret, like the other jobs; never on the hosted product.
  if (secret ? !bearerMatches(req, secret) : hosted) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { espnScoreboard } = await import('@/lib/live/espn');
  const games = await espnScoreboard().catch(() => []);
  const now = Date.now();
  const relevant = games.some(g => g.state === 'in' || (g.state === 'post' && now - Date.parse(g.kickoff) < RECENT_MS));
  if (!relevant) return NextResponse.json({ skipped: 'no games on or just over' });

  const { gamedayPosts } = await import('@/lib/franchise/gameday');
  if (!hosted) return NextResponse.json({ league: 'self', ...(await gamedayPosts(games)) });

  const [{ listTenants, isLive }, { runAsTenant }] = await Promise.all([import('@/lib/platform/tenants'), import('@/lib/tenant/context')]);
  const deadline = now + BUDGET_MS;
  const results: unknown[] = [];
  for (const t of (await listTenants()).filter(isLive)) {
    if (Date.now() > deadline) { results.push({ league: t.slug, skipped: 'out of time' }); continue; }
    try {
      results.push({ league: t.slug, ...(await runAsTenant(t, () => gamedayPosts(games))) });
    } catch (err) {
      results.push({ league: t.slug, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ ms: Date.now() - now, results });
}
