import { NextResponse } from 'next/server';
import { generateTradeProposals } from '@/lib/tradeEngine';

export const revalidate = 3600; // cache 1 hour

export async function GET() {
  const leagueId = process.env.NEXT_PUBLIC_LEAGUE_ID;
  if (!leagueId) {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }

  try {
    const proposals = await generateTradeProposals(leagueId);
    return NextResponse.json({ proposals });
  } catch (error) {
    console.error('[trades/suggestions]', error);
    return NextResponse.json({ error: 'Failed to generate trade ideas' }, { status: 500 });
  }
}
