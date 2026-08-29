import { NextResponse } from 'next/server';
import { buildWeeklyReport } from '@/lib/metrics/weeklyReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The weekly metrics report.
 *
 * Read-only and derived entirely from Sleeper, so it is public like the rest of
 * the league data. It reads every played week of the season to compute optimal
 * lineups, which is a real amount of work, hence the cache header: the numbers
 * only change when a game is scored.
 */
export async function GET() {
  try {
    const report = await buildWeeklyReport();
    if (!report) {
      return NextResponse.json(
        { report: null, reason: 'No games have been played this season yet.' },
        { headers: { 'Cache-Control': 'public, max-age=300' } },
      );
    }
    return NextResponse.json(
      { report },
      { headers: { 'Cache-Control': 'public, max-age=900, stale-while-revalidate=3600' } },
    );
  } catch (err) {
    console.error('[api/report]', err);
    return NextResponse.json({ error: 'Could not build the report' }, { status: 500 });
  }
}
