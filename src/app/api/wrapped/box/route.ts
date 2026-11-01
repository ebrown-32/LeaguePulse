/**
 * One game's box score from the league archive (lib/wrapped): both teams and their lineups, slot
 * by slot. For the History page's Record Book. `?season=2022&week=2&owner=<manager id>`.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const season = Number(q.get('season')), week = Number(q.get('week')), owner = q.get('owner') ?? '';
  if (!season || !week || !owner || owner.length > 80) return NextResponse.json({ error: 'season, week and owner are needed' }, { status: 400 });
  const [{ currentSite }, { boxScoreFor }] = await Promise.all([import('@/lib/archive/ingest'), import('@/lib/wrapped/load')]);
  const box = await boxScoreFor(await currentSite(), season, week, owner).catch(() => null);
  return NextResponse.json({ box }, { headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' } });
}
