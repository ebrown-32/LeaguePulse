import { NextResponse } from 'next/server';
import { generateTradeProposals } from '@/lib/tradeEngine';

// Cache the full response for 2 hours — AI call is expensive
export const revalidate = 7200;

// Vercel Pro: up to 60s. Hobby: capped at 10s — upgrade if hitting limit.
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
