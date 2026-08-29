import { NextResponse } from 'next/server';
import { getAllLinkedLeagueIds, getLeagueInfo, getLeagueTransactions } from '@/lib/api';
import { INITIAL_LEAGUE_ID } from '@/config/league';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * All-time transaction counts.
 *
 * Its own route rather than part of the home page's history call: this walks
 * every week of every season Sleeper has for the league, and the dashboard
 * should paint long before it finishes. Cached hard, because a completed
 * season's transaction log never changes.
 */
export async function GET() {
  if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }
  try {
    const leagueIds = await getAllLinkedLeagueIds(INITIAL_LEAGUE_ID);
    const totals = { trade: 0, waiver: 0, free_agent: 0, total: 0 };
    const bySeason: { season: string; trades: number; total: number }[] = [];

    for (const leagueId of leagueIds) {
      const league: any = await getLeagueInfo(leagueId).catch(() => null);
      const season = String(league?.season ?? '');
      // Offseason moves land in week 1, and the playoff weeks carry moves too,
      // so this walks the whole calendar rather than the regular season only.
      const weeks = await Promise.all(
        Array.from({ length: 18 }, (_, i) =>
          getLeagueTransactions(leagueId, i + 1).catch(() => [])),
      );

      let seasonTrades = 0, seasonTotal = 0;
      for (const week of weeks) {
        for (const tx of week as any[]) {
          // Only completed moves count; a vetoed or failed waiver claim did
          // not happen and should not appear in a league's history.
          if (tx?.status && tx.status !== 'complete') continue;
          const type = String(tx?.type ?? '');
          if (type === 'trade') { totals.trade++; seasonTrades++; }
          else if (type === 'waiver') totals.waiver++;
          else if (type === 'free_agent') totals.free_agent++;
          else continue;
          totals.total++; seasonTotal++;
        }
      }
      if (season) bySeason.push({ season, trades: seasonTrades, total: seasonTotal });
    }

    bySeason.sort((a, b) => b.season.localeCompare(a.season));
    return NextResponse.json(
      { totals, bySeason },
      { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } },
    );
  } catch (err) {
    console.error('[api/league-totals]', err);
    return NextResponse.json({ error: 'Could not count transactions' }, { status: 500 });
  }
}
