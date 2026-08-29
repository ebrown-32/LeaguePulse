import { NextResponse } from 'next/server';
import {
  buildWeeklyReport, buildWeeklyReportFor, availableSeasons, playedWeeks,
} from '@/lib/metrics/weeklyReport';

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
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const season = params.get('season');
    const week = Number(params.get('week') ?? 0);

    // Every season the league has played, so the page can offer them without a
    // second round trip.
    const seasons = await availableSeasons();

    // A past report is exact rather than reconstructed. Sleeper stores the
    // roster, the starters and every player's points per week and never
    // rewrites them, so the optimal lineup for a week in 2024 computed today
    // is the same one that would have been computed that Sunday. Verified
    // against week 1 of 2025, whose stored roster differs from the current one
    // by ten players.
    let report;
    if (season) {
      const match = seasons.find(s => s.season === season);
      if (!match) {
        return NextResponse.json({ error: `No season ${season} in this league.` }, { status: 404 });
      }
      report = await buildWeeklyReportFor(match.leagueId, week || undefined);
    } else {
      report = await buildWeeklyReport();
    }
    if (!report) {
      return NextResponse.json(
        { report: null, seasons: seasons.map(s => s.season), weeks: [],
          reason: 'No games have been played this season yet.' },
        { headers: { 'Cache-Control': 'public, max-age=300' } },
      );
    }
    const weeks = season && report ? await playedWeeks(
      seasons.find(s => s.season === season)!.leagueId) : [];

    return NextResponse.json(
      { report, seasons: seasons.map(s => s.season), weeks },
      // A completed season never changes, so it can be cached far harder than
      // the live one.
      { headers: { 'Cache-Control': season
        ? 'public, max-age=86400, stale-while-revalidate=604800'
        : 'public, max-age=900, stale-while-revalidate=3600' } },
    );
  } catch (err) {
    console.error('[api/report]', err);
    return NextResponse.json({ error: 'Could not build the report' }, { status: 500 });
  }
}
