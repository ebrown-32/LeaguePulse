/**
 * Where a matchup is played this week and how full it will be (lib/franchise/venueServer).
 *
 *   GET ?a=<userId>&b=<userId>[&week=n]
 *
 * The host is decided once per game and kept, so a page never sees it change
 * mid-week; the crowd and the week's phase are fresh on every request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { leagueConfigured } from '@/config/league';
import { venueFor } from '@/lib/franchise/venueServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await leagueConfigured())) return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  const a = req.nextUrl.searchParams.get('a'), b = req.nextUrl.searchParams.get('b');
  if (!a || !b || a === b) return NextResponse.json({ error: 'Name two teams' }, { status: 400 });
  try {
    const venue = await venueFor(a, b, Number(req.nextUrl.searchParams.get('week') ?? 0) || undefined);
    return NextResponse.json(venue, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (err) {
    console.error('[api/venue]', err);
    return NextResponse.json({ error: 'Could not find the venue' }, { status: 500 });
  }
}
