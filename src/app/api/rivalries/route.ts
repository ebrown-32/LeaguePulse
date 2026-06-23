import { NextResponse } from 'next/server';
import { fetchRivalriesData } from '@/lib/rivalries';
import { INITIAL_LEAGUE_ID } from '@/config/league';

export const dynamic = 'force-dynamic';

// Re-export types so existing imports from this path keep working
export type {
  Manager,
  GameRecord,
  H2HEntry,
  TradePick,
  TradeSide,
  TradeRecord,
  RivalriesResponse,
} from '@/lib/rivalries';

export async function GET() {
  if (!INITIAL_LEAGUE_ID) {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }

  try {
    const data = await fetchRivalriesData();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/rivalries]', err);
    return NextResponse.json({ error: 'Failed to load rivalry data' }, { status: 500 });
  }
}
