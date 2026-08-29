'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingBlock } from '@/components/ui/LoadingSpinner';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import StandingsTable, { type AllTimeRow } from '@/components/standings/StandingsTable';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import {
  getAllLeagueSeasons, getAllLinkedLeagueIds, getLeagueInfo,
  getLeagueRosters, getLeagueUsers, generateComprehensiveLeagueHistory,
} from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { allTimePointsAgainst } from '@/lib/allTimePointsAgainst';

/**
 * The standings, as a page.
 *
 * Same component and same data path as the home page: the record comes from
 * Sleeper's own roster totals, so median matches and any commissioner
 * adjustment are already inside them, and the two views can never disagree.
 *
 * This page previously had its own engine that rebuilt records from the weekly
 * matchup feed. It produced different numbers from the home page and a streak
 * that counted only head-to-head games while the record counted median games
 * too. It has been removed rather than fixed.
 */
export default function StandingsView() {
  const [seasons, setSeasons] = useState<string[]>([]);
  const [season, setSeason] = useState('');
  const [league, setLeague] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [rosters, setRosters] = useState<any[]>([]);
  const [allTimeStats, setAllTimeStats] = useState<any>(null);
  const [paByUser, setPaByUser] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const leagueId = await getCurrentLeagueId();
        const [info, allSeasons, leagueUsers] = await Promise.all([
          getLeagueInfo(leagueId), getAllLeagueSeasons(leagueId), getLeagueUsers(leagueId),
        ]);
        setLeague(info);
        setUsers(leagueUsers);
        setSeasons(allSeasons);
        setSeason(info.season ?? allSeasons[0] ?? '');

        // Only meaningful once there is more than one season to total up.
        if (allSeasons.length > 1) {
          const linked = await getAllLinkedLeagueIds(leagueId);
          const [comp, pa] = await Promise.all([
            generateComprehensiveLeagueHistory(linked),
            // The history aggregate has no points-against figure, so it is
            // summed from each season's roster totals instead.
            allTimePointsAgainst(leagueId),
          ]);
          setAllTimeStats(comp.userAllTimeStats);
          setPaByUser(pa);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load standings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Each season is its own league on Sleeper, so switching means resolving
  // that season's league id before reading its rosters.
  useEffect(() => {
    if (!season || !league || season === 'all-time') return;
    let cancelled = false;
    (async () => {
      setSwitching(true);
      try {
        const linked = await getAllLinkedLeagueIds(league.league_id);
        let seasonLeagueId = league.league_id;
        for (const id of linked) {
          const info = await getLeagueInfo(id);
          if (info.season === season) { seasonLeagueId = id; break; }
        }
        const next = await getLeagueRosters(seasonLeagueId);
        if (!cancelled) setRosters(next);
      } catch {
        if (!cancelled) setRosters([]);
      } finally {
        if (!cancelled) setSwitching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [season, league]);

  const sortedRosters = useMemo(() => [...rosters].sort((a: any, b: any) => {
    const bw = Number(b.settings?.wins ?? 0), aw = Number(a.settings?.wins ?? 0);
    if (bw !== aw) return bw - aw;
    // Sleeper's tiebreak is total points.
    return (Number(b.settings?.fpts ?? 0) + Number(b.settings?.fpts_decimal ?? 0) / 100)
         - (Number(a.settings?.fpts ?? 0) + Number(a.settings?.fpts_decimal ?? 0) / 100);
  }), [rosters]);

  const allTime: AllTimeRow[] = useMemo(() => {
    if (season !== 'all-time' || !allTimeStats) return [];
    return Object.entries(allTimeStats)
      .map(([userId, s]: any) => ({
        userId,
        user: users.find(u => u.user_id === userId),
        ...s,
        totalPointsAgainst: paByUser[userId],
      }))
      .filter((x: any) => x.user)
      .sort((a: any, b: any) => {
        if (Math.abs(b.winPercentage - a.winPercentage) > 0.001) return b.winPercentage - a.winPercentage;
        if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
        return b.championships - a.championships;
      });
  }, [season, allTimeStats, users, paByUser]);

  if (loading) {
    return <PageLayout title="Standings" subtitle="Loading."><LoadingBlock size={16} /></PageLayout>;
  }
  if (error) return <ErrorMessage title="Error" message={error} />;

  const playoffTeams = Number(league?.settings?.playoff_teams ?? 0);
  const subtitle = season === 'all-time'
    ? `${league?.name ?? 'League'}, every season`
    : `${league?.name ?? 'League'}, ${season} season`;

  return (
    <PageLayout title="Standings" subtitle={subtitle}>
      <div className="mb-4 flex items-center justify-end">
        <SeasonSelect
          seasons={seasons}
          selectedSeason={season}
          onSeasonChange={setSeason}
          className="w-[150px]"
          includeAllTime={seasons.length > 1}
        />
      </div>

      {switching ? (
        <LoadingBlock size={16} />
      ) : (
        <StandingsTable
          rosters={season === 'all-time' ? undefined : sortedRosters}
          users={users}
          allTime={season === 'all-time' ? allTime : undefined}
          playoffTeams={season === 'all-time' ? 0 : playoffTeams}
        />
      )}
    </PageLayout>
  );
}
