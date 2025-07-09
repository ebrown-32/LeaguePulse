'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { PageLayout } from '@/components/layout/PageLayout';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getNFLState, getAllLeagueSeasons, getAllLinkedLeagueIds } from '@/lib/api';
import { 
  TrophyIcon, 
  ChartBarIcon, 
  UserGroupIcon,
  CalendarIcon,
  CogIcon,
  UserIcon,
  HomeIcon,
} from '@heroicons/react/24/outline';
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage, LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { getDefaultSeason, getDefaultValue, formatPoints, calculateWinPercentage, formatRecord } from '@/lib/utils';
import { motion } from 'framer-motion';

function formatRosterPositions(positions: string[]): string {
  if (!positions?.length) return 'Standard';
  const counts = positions.reduce((acc: { [key: string]: number }, pos) => {
    acc[pos] = (acc[pos] || 0) + 1;
    return acc;
  }, {});
  
  return Object.entries(counts)
    .map(([pos, count]) => `${pos}${count > 1 ? ` x${count}` : ''}`)
    .join(', ');
}

function getEffectiveLeagueStatus(league: any, nflState: any): string {
  // If the league status is already in_season, post_season, or complete, use that
  if (['in_season', 'post_season', 'complete'].includes(league.status)) {
    return league.status;
  }
  
  // If the league status is drafting, use that
  if (league.status === 'drafting') {
    return 'drafting';
  }
  
  // If the league status is pre_draft but we have a draft_id and NFL week is 0 or preseason
  if (league.status === 'pre_draft' && league.draft_id && nflState?.week === 0) {
    return 'preseason';
  }
  
  // If the league status is pre_draft but we have a draft_id and NFL week is 1 or higher
  if (league.status === 'pre_draft' && league.draft_id && nflState?.week && nflState.week >= 1) {
    return 'in_season';
  }
  
  // Default to pre_draft
  return 'pre_draft';
}

function formatLeagueStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'pre_draft': 'Pre-Draft',
    'drafting': 'Drafting',
    'preseason': 'Preseason',
    'in_season': 'In Season',
    'post_season': 'Postseason',
    'complete': 'Complete',
  };
  return statusMap[status] || 'Unknown';
}

function formatDraftDate(draftId: string | null): string {
  if (!draftId) return 'Not set';
  try {
    const date = new Date(Number(draftId));
    return !isNaN(date.getTime()) ? date.toLocaleDateString() : 'Not set';
  } catch {
    return 'Not set';
  }
}

function formatWeekDisplay(status: string, week: number | null): string {
  switch (status) {
    case 'drafting':
      return 'Draft Week';
    case 'preseason':
      return 'Preseason';
    case 'in_season':
    case 'post_season':
      return `Week ${getDefaultValue(week, 0)}`;
    default:
      return '-';
  }
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [rosters, setRosters] = useState<any[]>([]);
  const [nflState, setNFLState] = useState<any>(null);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [seasonRosters, setSeasonRosters] = useState<any[]>([]);
  const [loadingSeasonData, setLoadingSeasonData] = useState(false);

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
        setError('Please set your Sleeper league ID in the .env.local file.');
        setLoading(false);
        return;
      }

      try {
        const leagueId = await getCurrentLeagueId();
        
        // First, get the league info and seasons
        const [leagueData, allSeasons] = await Promise.all([
          getLeagueInfo(leagueId),
          getAllLeagueSeasons(leagueId),
        ]);

        // Get the default season based on league data
        const defaultSeason = getDefaultSeason(
          allSeasons,
          leagueData.draft_id
        );

        // Then fetch the rest of the data
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
        setSeasonRosters(rostersData); // Initialize with current rosters
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch league data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Fetch rosters when season changes
  useEffect(() => {
    const fetchSeasonRosters = async () => {
      if (!selectedSeason || !league) return;
      
      setLoadingSeasonData(true);
      try {
        // Get all linked league IDs
        const linkedLeagues = await getAllLinkedLeagueIds(league.league_id);
        
        // Find the league ID for the selected season
        const seasonLeagueId = await (async () => {
          for (const leagueId of linkedLeagues) {
            const leagueInfo = await getLeagueInfo(leagueId);
            if (leagueInfo.season === selectedSeason) {
              return leagueId;
            }
          }
          return league.league_id; // Fallback to current league
        })();

        // Fetch rosters for the correct league
        const seasonRostersData = await getLeagueRosters(seasonLeagueId);
        setSeasonRosters(seasonRostersData);
      } catch (error) {
        console.error('Failed to fetch season rosters:', error);
        // Fallback to current rosters if fetch fails
        setSeasonRosters(rosters);
      } finally {
        setLoadingSeasonData(false);
      }
    };

    fetchSeasonRosters();
  }, [selectedSeason, league, rosters]);

  if (loading) return <LoadingPage />;
  if (error) return <ErrorMessage title="Error" message={error} />;
  if (!league || !users.length || !rosters.length) return null;

  // Find commissioner
  const commissioner = users.find(user => user.is_owner);

  // Sort rosters by wins, then points
  const sortedRosters = [...seasonRosters].sort((a, b) => {
    if (getDefaultValue(b.settings?.wins, 0) !== getDefaultValue(a.settings?.wins, 0)) {
      return getDefaultValue(b.settings?.wins, 0) - getDefaultValue(a.settings?.wins, 0);
    }
    const bPoints = getDefaultValue(b.settings?.fpts, 0) + getDefaultValue(b.settings?.fpts_decimal, 0) / 100;
    const aPoints = getDefaultValue(a.settings?.fpts, 0) + getDefaultValue(a.settings?.fpts_decimal, 0) / 100;
    return bPoints - aPoints;
  });

  return (
    <PageLayout
      title={league.name}
      subtitle={`Season ${nflState?.season} • ${new Date().toLocaleDateString()}`}
      icon={<HomeIcon className="h-6 w-6" />}
      action={commissioner && (
        <div className="hidden md:flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/50 px-3 py-2 rounded-lg">
          <UserIcon className="h-4 w-4" />
          <span>Commissioner: {commissioner.display_name}</span>
        </div>
      )}
    >
      <div className="space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="col-span-full md:col-span-1 relative"
          >
            <Card className="group hover:ring-2 hover:ring-blue-500/50 transition-all duration-300 h-full">
              <CardContent className="relative overflow-hidden p-4 md:pt-6 h-full flex flex-col justify-center min-h-[100px]">
                <div className="flex items-center space-x-3">
                  <div className="rounded-xl bg-blue-100 dark:bg-blue-500/10 p-2.5 md:p-3 group-hover:scale-110 transition-transform duration-300">
                    <TrophyIcon className="h-5 w-5 md:h-6 md:w-6 text-blue-600 dark:text-blue-500" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Status</p>
                    <div>
                      {(() => {
                        const effectiveStatus = getEffectiveLeagueStatus(league, nflState);
                        return (
                          <>
                            <p className="text-lg md:text-2xl font-bold tracking-tight">{formatLeagueStatus(effectiveStatus)}</p>
                            {effectiveStatus === 'pre_draft' && !league.draft_id && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Draft not scheduled</p>
                            )}
                            {effectiveStatus === 'pre_draft' && league.draft_id && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Draft: {formatDraftDate(league.draft_id)}
                              </p>
                            )}
                            {effectiveStatus === 'preseason' && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Season starting soon</p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-blue-100/80 dark:bg-blue-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="col-span-full md:col-span-1 relative -mt-4 md:mt-0"
          >
            <Card className="group hover:ring-2 hover:ring-purple-500/50 transition-all duration-300 h-full">
              <CardContent className="relative overflow-hidden p-4 md:pt-6 h-full flex flex-col justify-center min-h-[100px]">
                <div className="flex items-center space-x-3">
                  <div className="rounded-xl bg-purple-100 dark:bg-purple-500/10 p-2.5 md:p-3 group-hover:scale-110 transition-transform duration-300">
                    <UserGroupIcon className="h-5 w-5 md:h-6 md:w-6 text-purple-600 dark:text-purple-500" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Teams</p>
                    <p className="text-lg md:text-2xl font-bold tracking-tight">{getDefaultValue(league.total_rosters, 0)}</p>
                  </div>
                </div>
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-purple-100/80 dark:bg-purple-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="col-span-full md:col-span-1 relative -mt-4 md:mt-0"
          >
            <Card className="group hover:ring-2 hover:ring-green-500/50 transition-all duration-300 h-full">
              <CardContent className="relative overflow-hidden p-4 md:pt-6 h-full flex flex-col justify-center min-h-[100px]">
                <div className="flex items-center space-x-3">
                  <div className="rounded-xl bg-green-100 dark:bg-green-500/10 p-2.5 md:p-3 group-hover:scale-110 transition-transform duration-300">
                    <ChartBarIcon className="h-5 w-5 md:h-6 md:w-6 text-green-600 dark:text-green-500" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Week</p>
                    <p className="text-lg md:text-2xl font-bold tracking-tight">
                      {formatWeekDisplay(getEffectiveLeagueStatus(league, nflState), nflState?.week)}
                    </p>
                  </div>
                </div>
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-green-100/80 dark:bg-green-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="col-span-full md:col-span-1 relative -mt-4 md:mt-0"
          >
            <Card className="group hover:ring-2 hover:ring-orange-500/50 transition-all duration-300 h-full">
              <CardContent className="relative overflow-hidden p-4 md:pt-6 h-full flex flex-col justify-center min-h-[100px]">
                <div className="flex items-center space-x-3">
                  <div className="rounded-xl bg-orange-100 dark:bg-orange-500/10 p-2.5 md:p-3 group-hover:scale-110 transition-transform duration-300">
                    <CalendarIcon className="h-5 w-5 md:h-6 md:w-6 text-orange-600 dark:text-orange-500" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Playoff Teams</p>
                    <p className="text-lg md:text-2xl font-bold tracking-tight">{getDefaultValue(league.settings?.playoff_teams, 6)}</p>
                  </div>
                </div>
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-orange-100/80 dark:bg-orange-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* League Settings */}
        <Card>
          <CardHeader className="pb-2 md:pb-4">
            <div className="flex items-center space-x-2">
              <CogIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:gap-6 md:grid-cols-2">
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/5">
                <h3 className="font-medium mb-2 text-sm md:text-base">Roster Positions</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                  {formatRosterPositions(league.roster_positions)}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/5">
                <h3 className="font-medium mb-2 text-sm md:text-base">Scoring Type</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm capitalize">
                  {league.scoring_settings?.rec ? 'PPR' : 'Standard'}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/5">
                <h3 className="font-medium mb-2 text-sm md:text-base">Playoff Weeks</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Weeks {getDefaultValue(league.settings?.playoff_week_start, 15)} - {getDefaultValue(league.settings?.playoff_week_start, 15) + getDefaultValue(league.settings?.playoff_teams, 6) - 2}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/5">
                <h3 className="font-medium mb-2 text-sm md:text-base">Trade Deadline</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Week {league.settings?.trade_deadline || 'None'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Standings */}
        <Card>
          <CardHeader className="pb-2 md:pb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-8">
              <div className="flex items-center space-x-2">
                <TrophyIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Standings</h2>
              </div>
              <div className="flex items-center space-x-4">
                <SeasonSelect
                  seasons={seasons}
                  selectedSeason={selectedSeason}
                  onSeasonChange={setSelectedSeason}
                  className="w-[140px]"
                />
                {(() => {
                  const effectiveStatus = getEffectiveLeagueStatus(league, nflState);
                  return (effectiveStatus === 'in_season' || effectiveStatus === 'preseason') && selectedSeason === league.season && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 px-4 py-2 rounded-lg">
                      {loadingSeasonData ? (
                        <span className="animate-pulse">Loading...</span>
                      ) : (
                        formatWeekDisplay(effectiveStatus, nflState?.week)
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </CardHeader>
          <CardContent className="md:pt-2">
            {loadingSeasonData ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : (
              <>
                {/* Table Header */}
                <div className="hidden md:grid md:grid-cols-[3rem_1fr_8rem_5rem_6rem_6rem] gap-2 px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                  <div>Rank</div>
                  <div>Team</div>
                  <div className="text-center">Record</div>
                  <div className="text-center">Win%</div>
                  <div className="text-center">PF</div>
                  <div className="text-center">PA</div>
                </div>
                
                <div className="space-y-2 md:space-y-3">
                  {sortedRosters.map((roster, index) => {
                    const user = users.find(u => u.user_id === roster.owner_id);
                    if (!user) return null;

                    const wins = getDefaultValue(roster.settings?.wins, 0);
                    const losses = getDefaultValue(roster.settings?.losses, 0);
                    const ties = getDefaultValue(roster.settings?.ties, 0);
                    const fpts = getDefaultValue(roster.settings?.fpts, 0) + getDefaultValue(roster.settings?.fpts_decimal, 0) / 100;
                    const fptsAgainst = getDefaultValue(roster.settings?.fpts_against, 0) + getDefaultValue(roster.settings?.fpts_against_decimal, 0) / 100;
                    const winPct = calculateWinPercentage(wins, losses, ties);
                    
                    // Determine playoff status
                    const isInPlayoffs = index < getDefaultValue(league.settings?.playoff_teams, 6);
                    const isOnBubble = index === getDefaultValue(league.settings?.playoff_teams, 6);

                    return (
                      <div
                        key={roster.roster_id}
                        className={`
                          relative overflow-hidden rounded-xl transition-all
                          ${isInPlayoffs ? 'bg-blue-50 hover:bg-blue-100/80 dark:bg-blue-500/10 dark:hover:bg-blue-500/20' : 
                            isOnBubble ? 'bg-orange-50 hover:bg-orange-100/80 dark:bg-orange-500/10 dark:hover:bg-orange-500/20' : 
                            'bg-gray-50 hover:bg-gray-100/80 dark:bg-white/5 dark:hover:bg-white/10'}
                        `}
                      >
                        {/* Mobile Layout */}
                        <div className="md:hidden p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`
                                w-7 h-7 flex items-center justify-center rounded-lg text-sm font-bold
                                ${isInPlayoffs ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 
                                  isOnBubble ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400' : 
                                  'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400'}
                              `}>
                                {index + 1}
                              </div>
                              <Avatar avatarId={user.avatar} size={32} className="rounded-lg" />
                              <div>
                                <p className="font-medium tracking-tight text-sm">{user.metadata?.team_name || user.display_name}</p>
                                <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                                  <span>{formatRecord(wins, losses, ties)}</span>
                                  <span>•</span>
                                  <span>{winPct.toFixed(1)}%</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs bg-white dark:bg-white/5 rounded-lg p-2">
                            <div className="flex flex-col items-center">
                              <p className="text-gray-500 dark:text-gray-400 mb-0.5">Points For</p>
                              <p className="font-medium">{formatPoints(fpts)}</p>
                            </div>
                            <div className="flex flex-col items-center">
                              <p className="text-gray-500 dark:text-gray-400 mb-0.5">Points Against</p>
                              <p className="font-medium">{formatPoints(fptsAgainst)}</p>
                            </div>
                          </div>
                        </div>

                        {/* Desktop Layout */}
                        <div className="hidden md:grid md:grid-cols-[3rem_1fr_8rem_5rem_6rem_6rem] gap-2 items-center px-4 py-3">
                          <div className={`
                            w-7 h-7 flex items-center justify-center rounded-lg text-sm font-bold
                            ${isInPlayoffs ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 
                              isOnBubble ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400' : 
                              'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400'}
                          `}>
                            {index + 1}
                          </div>
                          <div className="flex items-center space-x-3 min-w-0">
                            <Avatar avatarId={user.avatar} size={36} className="rounded-lg flex-shrink-0" />
                            <span className="font-medium tracking-tight truncate">{user.metadata?.team_name || user.display_name}</span>
                          </div>
                          <div className="text-center whitespace-nowrap font-medium">
                            {formatRecord(wins, losses, ties)}
                          </div>
                          <div className="text-center font-medium">{winPct.toFixed(1)}%</div>
                          <div className="text-center font-medium">{formatPoints(fpts)}</div>
                          <div className="text-center font-medium">{formatPoints(fptsAgainst)}</div>
                        </div>

                        {/* Playoff Indicator */}
                        {isInPlayoffs && (
                          <div className="absolute top-0 right-0 px-2 py-1 text-[10px] font-bold text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-500/20 rounded-bl-lg">
                            PLAYOFF SPOT
                          </div>
                        )}
                        {isOnBubble && (
                          <div className="absolute top-0 right-0 px-2 py-1 text-[10px] font-bold text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-500/20 rounded-bl-lg">
                            BUBBLE
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
