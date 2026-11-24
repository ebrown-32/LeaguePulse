/**
 * The Edge's research dataset for this site's league (lib/edge/research): every relevant player's
 * season in the league's scoring, usage, matchups, this week's projections, who owns whom here,
 * and the field's view where the site has a market. Public like the rest of a league's site, and
 * the same for every visitor, so the CDN may keep it a few minutes.
 */

import { NextResponse } from 'next/server';
import { leagueConfigured } from '@/config/league';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  if (!(await leagueConfigured())) return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  try {
    const [{ getCurrentLeagueId }, { researchFor }] = await Promise.all([import('@/config/league'), import('@/lib/edge/research')]);
    const data = await researchFor(await getCurrentLeagueId());
    return NextResponse.json(data, { headers: { 'cache-control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=1800' } });
  } catch (err) {
    console.error('[api/edge/research]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'The research could not be read right now.' }, { status: 502 });
  }
}
