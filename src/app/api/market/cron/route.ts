/**
 * Every hour at :40 (away from the archive's :20): the market's crawl (lib/market/crawl). Brings
 * the sample of public Sleeper leagues up to the latest final week and adds a few dozen more.
 * Does nothing unless LP_MARKET_CRAWL=1.
 */

import { NextResponse } from 'next/server';
import { withCron } from '@/lib/ops/monitor';
import { bearerMatches } from '@/lib/platform/operator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  // Open locally without a secret, like the other jobs; never on the hosted product.
  if (secret ? !bearerMatches(req, secret) : process.env.LP_HOSTED === '1') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { crawlMarket } = await import('@/lib/market/crawl');
  return NextResponse.json(await crawlMarket());
}

export const GET = withCron('market', run);
