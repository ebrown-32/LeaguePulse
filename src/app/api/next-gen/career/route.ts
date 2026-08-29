import { NextResponse } from 'next/server';
import { buildCareerReport } from '@/lib/metrics/careerReport';
import { INITIAL_LEAGUE_ID } from '@/config/league';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Career metrics across every season the league has played.
 *
 * Fetched by the Next Gen page after its first paint rather than rendered with
 * it: this walks every week of every linked season computing optimal lineups,
 * and holding the page blank for that would be a bad trade for a section that
 * sits below the fold. Cached hard, since a completed season never changes.
 */
export async function GET() {
  if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }
  try {
    const report = await buildCareerReport(INITIAL_LEAGUE_ID);
    return NextResponse.json(
      { report },
      { headers: { 'Cache-Control': 'public, max-age=1800, stale-while-revalidate=86400' } },
    );
  } catch (err) {
    console.error('[api/next-gen/career]', err);
    return NextResponse.json({ error: 'Could not build career metrics' }, { status: 500 });
  }
}
