import { NextResponse, type NextRequest } from 'next/server';
import { tradeFeed } from '@/lib/trades/finder';
import type { Goal } from '@/lib/trades/feed';

// A page of Trade Finder's feed for the league in the request (lib/trades/finder). The pool behind
// it is kept in storage, so a page is a storage read and a sort.
//   ?seed  the visit's shuffle   ?offset&limit  the page
//   ?teams=1,4  ?pos=RB,WR  ?goal=now|later  ?fair=1  ?three=1
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const list = (v: string | null) => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : []);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const goal = q.get('goal');
  try {
    const page = await tradeFeed({
      seed: Number(q.get('seed')) >>> 0,
      offset: Math.max(0, Number(q.get('offset')) || 0),
      limit: Math.min(30, Math.max(1, Number(q.get('limit')) || 12)),
      teams: list(q.get('teams')).map(Number).filter(Number.isFinite),
      positions: list(q.get('pos')).filter(p => ['QB', 'RB', 'WR', 'TE'].includes(p)),
      goal: (goal === 'now' || goal === 'later' ? goal : 'any') as Goal,
      fair: q.get('fair') === '1',
      three: q.get('three') === '1',
    });
    if (!page) return NextResponse.json({ error: 'No trade values for this league yet' }, { status: 503 });
    return NextResponse.json(page);
  } catch (error) {
    console.error('[trades/finder]', error);
    return NextResponse.json({ error: 'Could not find trades' }, { status: 500 });
  }
}
