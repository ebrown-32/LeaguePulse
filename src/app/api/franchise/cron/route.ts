/**
 * Every fifteen minutes, for every league: the media desk's coverage of new trades, all year
 * (lib/ai/tradeWatch), and around the games, the franchises' game-day posts from their own
 * accounts (lib/franchise/gameday): big days and final scores.
 */

import { withCron } from '@/lib/ops/monitor';
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

async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const hosted = process.env.LP_HOSTED === '1';
  // Open locally without a secret, like the other jobs; never on the hosted product.
  if (secret ? !bearerMatches(req, secret) : hosted) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { espnScoreboard } = await import('@/lib/live/espn');
  const games = await espnScoreboard().catch(() => []);
  const now = Date.now();
  // Game-day posts only around the games; trades are covered all year (lib/ai/tradeWatch).
  const relevant = games.some(g => g.state === 'in' || (g.state === 'post' && now - Date.parse(g.kickoff) < RECENT_MS));

  const [{ gamedayPosts }, { coverNewTrades }] = await Promise.all([import('@/lib/franchise/gameday'), import('@/lib/ai/tradeWatch')]);
  const oneLeague = async () => {
    const trades = await coverNewTrades().catch(err => ({ graded: 0, error: err instanceof Error ? err.message : String(err) }));
    const gameday = relevant ? await gamedayPosts(games) : { skipped: 'no games on or just over' };
    return { trades, gameday };
  };
  if (!hosted) return NextResponse.json({ league: 'self', ...(await oneLeague()) });

  const [{ listTenants, isLive }, { runAsTenant }] = await Promise.all([import('@/lib/platform/tenants'), import('@/lib/tenant/context')]);
  const deadline = now + BUDGET_MS;
  const results: unknown[] = [];
  for (const t of (await listTenants()).filter(isLive)) {
    if (Date.now() > deadline) { results.push({ league: t.slug, skipped: 'out of time' }); continue; }
    try {
      results.push({ league: t.slug, ...(await runAsTenant(t, oneLeague)) });
    } catch (err) {
      results.push({ league: t.slug, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ ms: Date.now() - now, results });
}

/** Each run recorded for the back office (lib/ops/monitor). */
export const GET = withCron('franchise', run);
