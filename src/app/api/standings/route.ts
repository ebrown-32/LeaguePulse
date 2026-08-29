import { NextResponse } from 'next/server';
import {
  buildStandings, buildStandingsFor, buildAllTimeStandings, standingsSeasons,
} from '@/lib/metrics/standings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const season = new URL(request.url).searchParams.get('season') ?? 'current';
    const seasons = await standingsSeasons();

    const standings =
      season === 'all-time' ? await buildAllTimeStandings()
        : season === 'current' ? await buildStandings()
          : await (async () => {
              const match = seasons.find(s => s.season === season);
              return match ? buildStandingsFor(match.leagueId) : null;
            })();

    if (!standings) {
      return NextResponse.json({
        standings: null,
        seasons: seasons.map(s => s.season),
        reason: season === 'current'
          ? 'No games have been played this season yet.'
          : season === 'all-time'
            ? 'No completed seasons to total up yet.'
            : `No games were played in ${season}.`,
      });
    }
    return NextResponse.json(
      { standings, seasons: seasons.map(s => s.season) },
      // A finished season never changes; the live one does.
      { headers: { 'Cache-Control': season === 'current'
        ? 'public, max-age=600, stale-while-revalidate=3600'
        : 'public, max-age=86400, stale-while-revalidate=604800' } },
    );
  } catch (err) {
    console.error('[api/standings]', err);
    return NextResponse.json({ error: 'Could not load standings' }, { status: 500 });
  }
}
