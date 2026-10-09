'use client';

import { useState, useEffect } from 'react';
import MatchupDetailModal, { prefetchMatchup, type MatchupTarget } from '@/components/matchup/MatchupDetailModal';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getLeagueMatchups, getNFLState, getAllLeagueSeasons, getAllLinkedLeagueIds } from '@/lib/api';
import { weekPhase, type WeekPhase } from '@/lib/nflSchedule';
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage, LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/Select';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { getDefaultSeason, cn } from '@/lib/utils';
import type { SleeperMatchup } from '@/types/sleeper';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CrownIcon, CalendarDays } from '@/components/icons';
import { teamAvatar } from '@/lib/teamAvatar';
import GameOfWeekCard from '@/components/matchup/GameOfWeekCard';
import { IconChip, StatusPill, WinBar } from '@/components/ui/kit';

/** Per roster: win chance, projected final, starters still to play. */
type Odds = Map<number, { winProb: number; projectedFinal: number; startersLeft: number }>;

interface MatchupsViewProps {
  currentWeek?: number;
}

export default function MatchupsView({ currentWeek: initialWeek }: MatchupsViewProps) {
  const [openMatchup, setOpenMatchup] = useState<MatchupTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [rosters, setRosters] = useState<any[]>([]);
  const [matchups, setMatchups] = useState<SleeperMatchup[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number>(initialWeek || 1);
  const [nflState, setNFLState] = useState<any>(null);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [seasonRosters, setSeasonRosters] = useState<any[]>([]);
  const [loadingSeasonData, setLoadingSeasonData] = useState(false);
  /**
   * Whether the selected week is finished, live, or not started.
   *
   * Read from the NFL schedule. This used to be inferred from "has anybody
   * scored", which stamps every card FINAL as soon as the Thursday night game
   * ends while fifteen games are still to kick off.
   */
  const [phase, setPhase] = useState<WeekPhase>('upcoming');
  const [odds, setOdds] = useState<Odds>(new Map());
  const [gotwId, setGotwId] = useState<number | null>(null);
  /** Whether the season being viewed played median games. Read per season:
   *  the setting can change between seasons. */
  const [seasonMedian, setSeasonMedian] = useState(false);

  // Win odds for the whole slate in one request, and kept fresh while games
  // are on. Before kickoff they carry the projections, which is the only
  // honest number to show on a card whose score is still 0.0 to 0.0.
  useEffect(() => {
    if (!selectedSeason || !selectedWeek) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setOdds(new Map());
    const load = () => fetch(`/api/matchups/odds?season=${selectedSeason}&week=${selectedWeek}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d?.fixtures) return;
        const next: Odds = new Map();
        for (const f of d.fixtures) {
          next.set(f.a.rosterId, { winProb: f.forecast.aWinProb, projectedFinal: f.forecast.a.projectedFinal, startersLeft: f.forecast.a.startersLeft });
          next.set(f.b.rosterId, { winProb: 1 - f.forecast.aWinProb, projectedFinal: f.forecast.b.projectedFinal, startersLeft: f.forecast.b.startersLeft });
        }
        setOdds(next);
        if (d.phase === 'live') timer = setTimeout(load, 60_000);
      })
      .catch(() => {});
    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [selectedSeason, selectedWeek]);

  useEffect(() => {
    const fetchData = async () => {
      if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
        setError('Please set your Sleeper league ID in the .env.local file.');
        setLoading(false);
        return;
      }

      try {
        const leagueId = await getCurrentLeagueId();

        const [leagueData, allSeasons] = await Promise.all([
          getLeagueInfo(leagueId),
          getAllLeagueSeasons(leagueId),
        ]);

        const defaultSeason = getDefaultSeason(allSeasons, leagueData.draft_id);

        const [usersData, rostersData, nflStateData] = await Promise.all([
          getLeagueUsers(leagueId),
          getLeagueRosters(leagueId),
          getNFLState(),
        ]);

        setLeague(leagueData);
        setUsers(usersData);
        setRosters(rostersData);
        setNFLState(nflStateData);
        setSeasons(allSeasons);
        setSelectedSeason(defaultSeason);
        setSeasonRosters(rostersData);

        if (!initialWeek) {
          const currentWeek = nflStateData?.season_type === 'regular'
            ? nflStateData.week
            : 1;
          setSelectedWeek(leagueData.status === 'in_season' ? currentWeek : 1);
        }

        const matchupsData = await getLeagueMatchups(leagueId, selectedWeek);
        setMatchups(matchupsData);

      } catch (error) {
        console.error('Failed to fetch data:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch league data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [initialWeek]);

  useEffect(() => {
    const fetchSeasonData = async () => {
      if (!selectedSeason || !league) return;

      setLoadingSeasonData(true);
      try {
        const linkedLeagues = await getAllLinkedLeagueIds(league.league_id);

        let median = Number(league.settings?.league_average_match ?? 0) === 1;
        const seasonLeagueId = await (async () => {
          for (const leagueId of linkedLeagues) {
            const leagueInfo = await getLeagueInfo(leagueId);
            if (leagueInfo.season === selectedSeason) {
              median = Number(leagueInfo.settings?.league_average_match ?? 0) === 1;
              return leagueId;
            }
          }
          return league.league_id;
        })();
        setSeasonMedian(median);

        const [seasonRostersData, matchupsData] = await Promise.all([
          getLeagueRosters(seasonLeagueId),
          getLeagueMatchups(seasonLeagueId, selectedWeek)
        ]);

        setSeasonRosters(seasonRostersData);
        setMatchups(matchupsData);
        setPhase(await weekPhase(
          selectedSeason, selectedWeek, selectedSeason === nflState?.season,
        ).catch(() => 'upcoming' as WeekPhase));
      } catch (error) {
        console.error('Failed to fetch season data:', error);
        setSeasonRosters(rosters);
      } finally {
        setLoadingSeasonData(false);
      }
    };

    fetchSeasonData();
  }, [selectedSeason, selectedWeek, league, rosters]);

  if (loading) return <LoadingPage />;
  if (error) return <ErrorMessage title="Error" message={error} />;
  if (!league || !users.length || !rosters.length) return null;

  const groupedMatchups = matchups.reduce((acc, matchup) => {
    if (!matchup.matchup_id) return acc;
    if (!acc[matchup.matchup_id]) acc[matchup.matchup_id] = [];
    acc[matchup.matchup_id].push(matchup);
    return acc;
  }, {} as Record<string, any[]>);

  const sortedGroupedMatchups = Object.entries(groupedMatchups)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {} as Record<string, any[]>);

  const finalGroupedMatchups = sortedGroupedMatchups;

  const getMatchupContext = () => {
    const isPlayoffs = selectedWeek >= (league?.settings?.playoff_week_start || 15);
    const isCurrentWeek = selectedWeek === nflState?.week && selectedSeason === league?.season;

    if (isPlayoffs) {
      return {
        title: `Week ${selectedWeek}: Playoffs`,
        subtitle: isCurrentWeek ? 'Championship dreams on the line' : 'Playoff battles.',
      };
    }

    return {
      title: `Week ${selectedWeek}: Regular Season`,
      subtitle: isCurrentWeek ? "This week's matchups" : 'Head-to-head battles.',
    };
  };

  const context = getMatchupContext();
  const hasMatchups = Object.keys(finalGroupedMatchups).length > 0;
  const isPlayoffWeek = selectedWeek >= (league?.settings?.playoff_week_start || 15);

  return (
    <div className="space-y-6">
      {/* Week Control Bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="lp-surface lp-edge flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between md:p-5"
      >
        <div className="flex items-center gap-3">
          <IconChip icon={CalendarDays} size="lg" />
          <div>
            <h2 className="font-display text-lg font-bold text-foreground md:text-xl">{context.title}</h2>
            <p className="text-sm text-muted-foreground">{context.subtitle}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2">
            <SeasonSelect
              seasons={seasons}
              selectedSeason={selectedSeason}
              onSeasonChange={setSelectedSeason}
              className="flex-1 sm:flex-none sm:w-[140px]"
            />
            <Select
              value={selectedWeek.toString()}
              onValueChange={(value) => setSelectedWeek(Number(value))}
            >
              <SelectTrigger className="flex-1 sm:flex-none sm:w-[160px]">
                Week {selectedWeek}
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 18 }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    Week {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
                disabled={selectedWeek <= 1}
                className="rounded-lg border border-border p-2 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSelectedWeek(Math.min(18, selectedWeek + 1))}
                disabled={selectedWeek >= 18}
                className="rounded-lg border border-border p-2 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          {hasMatchups && (
            <span className="text-xs text-muted-foreground">
              {Object.keys(groupedMatchups).length} matchups
            </span>
          )}
        </div>
      </motion.div>

      {/* The featured game, for the week being viewed, when there is one. */}
      {selectedSeason === nflState?.season && !isPlayoffWeek && (
        <GameOfWeekCard
          key={selectedWeek}
          week={selectedWeek}
          onOpen={setOpenMatchup}
          onPick={id => setGotwId(id)}
        />
      )}

      {/* Matchups Content */}
      {loadingSeasonData ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : !hasMatchups ? (
        <Card>
          <CardContent className="text-center py-16">
            <div className="text-muted-foreground">
              <h3 className="text-lg font-medium mb-2">No Matchups Available</h3>
              <p className="text-sm">Hmmm, it must be the offseason. Week {selectedWeek} in Season {selectedSeason} coming soon...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:gap-5 lg:grid-cols-2">
          {Object.values(finalGroupedMatchups).map((matchup, index) => {
            const [team1, team2] = matchup;
            if (!team1 || !team2) return null;

            const roster1 = seasonRosters.find((r) => r.roster_id === team1.roster_id);
            const roster2 = seasonRosters.find((r) => r.roster_id === team2.roster_id);
            const user1 = users.find((u) => u.user_id === roster1?.owner_id);
            const user2 = users.find((u) => u.user_id === roster2?.owner_id);
            if (!roster1 || !roster2 || !user1 || !user2) return null;

            const p1 = team1.points || 0;
            const p2 = team2.points || 0;
            const o1 = odds.get(team1.roster_id);
            const o2 = odds.get(team2.roster_id);
            const left = (o1?.startersLeft ?? 0) + (o2?.startersLeft ?? 0);
            // Settled only when every NFL game in the week has finished.
            const status = phase === 'final' ? 'final' : phase === 'live' || p1 + p2 > 0 ? 'live' : 'upcoming';
            const final = status === 'final';
            const tie = final && p1 === p2;
            // Who is ahead: the score once there is one, the odds before.
            const lead1 = final ? p1 > p2 : o1 ? o1.winProb >= 0.5 : p1 > p2;
            const isGotw = gotwId === team1.matchup_id;
            const target: MatchupTarget = {
              a: { userId: user1.user_id, teamName: user1.metadata?.team_name || user1.display_name, avatar: teamAvatar(user1) },
              b: { userId: user2.user_id, teamName: user2.metadata?.team_name || user2.display_name, avatar: teamAvatar(user2) },
              week: selectedWeek,
            };

            const row = (user: any, roster: any, points: number, o: typeof o1, lead: boolean) => {
              const games = (roster.settings?.wins || 0) + (roster.settings?.losses || 0) + (roster.settings?.ties || 0);
              // Points per WEEK. The record counts median games, two a week in
              // a median league, so dividing by it halved every average.
              const weeks = seasonMedian ? games / 2 : games;
              const avg = ((roster.settings?.fpts || 0) + (roster.settings?.fpts_decimal || 0) / 100) / Math.max(1, weeks);
              const figure = status === 'upcoming' ? (o ? o.projectedFinal : null) : points;
              return (
                <div className="flex items-center gap-3 md:gap-4">
                  <span className={cn('shrink-0 rounded-xl p-[2px]',
                    lead && !tie ? 'bg-gradient-to-br from-primary to-primary/30' : 'bg-border/80')}>
                    <Avatar avatarId={teamAvatar(user)} size={42} className="rounded-[10px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-[15px] leading-tight md:text-base',
                      lead ? 'font-bold text-foreground' : 'font-semibold text-foreground/75')}>
                      {user.metadata?.team_name || user.display_name}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {roster.settings.wins || 0}-{roster.settings.losses || 0}{roster.settings.ties > 0 ? `-${roster.settings.ties}` : ''}
                      <span className="mx-1.5 opacity-50">·</span>{avg.toFixed(1)} avg
                    </p>
                  </div>
                  <div className="text-right">
                    <div className={cn('font-display font-bold leading-none tabular-nums tracking-[-0.02em]',
                      lead ? 'text-[28px] text-foreground md:text-[32px]' : 'text-[24px] text-muted-foreground/75 md:text-[26px]')}>
                      {figure == null ? '--' : figure.toFixed(1)}
                    </div>
                    <div className={cn('mt-1 text-[10.5px] font-semibold tabular-nums',
                      lead ? 'text-primary' : 'text-muted-foreground')}>
                      {final
                        ? (tie ? 'Tie' : lead ? `Won by ${Math.abs(p1 - p2).toFixed(1)}` : 'Lost')
                        : o ? `${Math.round(o.winProb * 100)}% to win` : ''}
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <motion.button
                key={team1.matchup_id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
                // Loading starts on hover or touch, a beat before the tap.
                onPointerEnter={() => prefetchMatchup(target)}
                onTouchStart={() => prefetchMatchup(target)}
                onClick={() => setOpenMatchup(target)}
                className={cn(
                  'group lp-surface lp-lift flex w-full flex-col gap-4 rounded-2xl p-4 text-left md:p-5',
                  isGotw && 'ring-1 ring-primary/40',
                )}
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusPill
                      status={status}
                      label={status === 'upcoming' ? 'Projected' : status === 'live' ? (left ? `Live · ${left} to play` : 'Live') : tie ? 'Tie' : undefined}
                    />
                    {isPlayoffWeek && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Playoffs</span>
                    )}
                    {isGotw && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-1 pr-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                        <CrownIcon className="h-3 w-3" /> Game of the Week
                      </span>
                    )}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-muted-foreground transition-colors group-hover:text-primary">
                    Details
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>

                {row(user1, roster1, p1, o1, lead1)}
                {o1 && !final ? <WinBar p={o1.winProb} /> : (
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                      {final ? `${(p1 + p2).toFixed(1)} total` : 'vs'}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                {row(user2, roster2, p2, o2, !lead1 && !tie)}
              </motion.button>
            );
          })}
        </div>
      )}

      <MatchupDetailModal target={openMatchup} onClose={() => setOpenMatchup(null)} />
    </div>
  );
}
