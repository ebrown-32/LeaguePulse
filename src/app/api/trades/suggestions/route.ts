import { NextResponse } from 'next/server';
import { generateTradeProposals } from '@/lib/tradeEngine';

// Never prerendered. `revalidate` made Next execute this at BUILD time, which
// fired a paid model call on every deploy and blew past the build timeout. It
// runs on request instead, so a deploy costs nothing and only a visitor to
// /trades triggers generation.
export const dynamic = 'force-dynamic';

// Vercel Pro: up to 60s. Hobby: capped at 10s. Upgrade if hitting limit.
export const maxDuration = 60;

export async function GET() {
  const leagueId = process.env.NEXT_PUBLIC_LEAGUE_ID;
  if (!leagueId) {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }

  try {
    const result = await generateTradeProposals(leagueId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[trades/suggestions]', error);
    return NextResponse.json({ error: 'Failed to generate trade ideas' }, { status: 500 });
  }
}
