/**
 * Operator only: set up, or refresh, the demo site (src/lib/demo/seed.ts).
 *
 *   POST   build the demo league's site, archive and stadiums, and run its media desk once; safe to run again
 */

import { NextResponse } from 'next/server';
import { isOperator } from '@/lib/platform/operator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await isOperator(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { setUpDemo, DEMO_SLUG } = await import('@/lib/demo/seed');
    const setup = await setUpDemo();
    // The media desk's first takes, rather than an empty feed until the daily run.
    const secret = process.env.CRON_SECRET?.trim();
    const desk = secret
      ? await fetch(new URL(`/api/ai/cron?tenant=${DEMO_SLUG}`, req.url), { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(240_000) })
        .then(r => r.json()).catch(err => ({ error: err instanceof Error ? err.message : 'The desk did not run' }))
      : { skipped: 'CRON_SECRET is not set' };
    return NextResponse.json({ ...setup, desk });
  } catch (err) {
    console.error('[operator/demo]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not set up the demo' }, { status: 500 });
  }
}
