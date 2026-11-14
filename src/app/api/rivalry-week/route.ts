/**
 * Rivalry week (lib/rivalryWeek).
 *
 *   GET                     this week's rivalry games and last week's results.
 *   GET ?franchise=<id>     how that franchise's stadium is dressed: for a rivalry game, and the
 *                           shame banner after losing one (the stadiums read this).
 */

import { NextRequest, NextResponse } from 'next/server';
import { leagueConfigured } from '@/config/league';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE = { 'cache-control': 'public, max-age=120, stale-while-revalidate=600' };

export async function GET(req: NextRequest) {
  if (!(await leagueConfigured())) return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  try {
    const rw = await import('@/lib/rivalryWeek');
    const franchise = req.nextUrl.searchParams.get('franchise');
    if (franchise) {
      if (!/^[\w-]{1,40}$/.test(franchise)) return NextResponse.json({ error: 'Bad franchise' }, { status: 400 });
      return NextResponse.json(await rw.dressingFor(franchise), { headers: CACHE });
    }
    return NextResponse.json(await rw.rivalryNow(), { headers: CACHE });
  } catch (err) {
    console.error('[api/rivalry-week]', err instanceof Error ? err.message : err);
    return NextResponse.json({ rivalry: null, shame: null, upcoming: null, last: null }, { status: 200 });
  }
}
