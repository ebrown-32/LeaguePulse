/**
 * The Edge for the league this site belongs to (lib/market/read): the field's view of its
 * waiver wire, the week's market and its managers' lineup calls. Public, like the rest of a
 * league's site, and the same for every visitor, so the CDN may keep it a few minutes.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const [{ getCurrentLeagueId }, { edgeFor }] = await Promise.all([import('@/config/league'), import('@/lib/market/read')]);
    const edge = await edgeFor(await getCurrentLeagueId());
    return NextResponse.json(edge, { headers: { 'cache-control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=1800' } });
  } catch (err) {
    console.error('[api/market/edge]', err);
    return NextResponse.json({ error: 'The Edge could not be read right now.' }, { status: 502 });
  }
}
