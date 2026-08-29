import { NextResponse } from 'next/server';
import { buildWeatherReport } from '@/lib/weather';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Kickoff weather for the week's slate.
 *
 * Cached for half an hour: forecasts move slowly, and the route fans out to
 * one geocode and one forecast call per outdoor venue, which is rude to two
 * services that charge nothing for this.
 */
export async function GET() {
  try {
    const report = await buildWeatherReport();
    if (!report) {
      return NextResponse.json({ report: null, reason: 'No NFL week is in progress.' });
    }
    return NextResponse.json(
      { report },
      { headers: { 'Cache-Control': 'public, max-age=1800, stale-while-revalidate=7200' } },
    );
  } catch (err) {
    console.error('[api/weather]', err);
    return NextResponse.json({ error: 'Could not load the forecast' }, { status: 500 });
  }
}
