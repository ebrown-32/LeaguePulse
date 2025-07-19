'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { PageLayout } from '@/components/layout/PageLayout';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getNFLState, getAllLeagueSeasons, getAllLinkedLeagueIds, getLeagueMatchups, generateComprehensiveLeagueHistory } from '@/lib/api';
import { 
  TrophyIcon, 
  ChartBarIcon, 
  UserGroupIcon,
  UserIcon,
  HomeIcon,
  FireIcon,
  ClockIcon,
  StarIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage, LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { getDefaultSeason, getDefaultValue, formatPoints, calculateWinPercentage, formatRecord } from '@/lib/utils';
import { motion } from 'framer-motion';

async function calculateHistoricalInsights(seasons: string[], currentLeagueId: string) {
  try {
    const linkedLeagues = await getAllLinkedLeagueIds(currentLeagueId);
    
    // Use the comprehensive history function that gets accurate data from the API
    const historyData = await generateComprehensiveLeagueHistory(linkedLeagues);
    
    // Calculate total teams across all seasons (using actual roster counts)
    const totalTeams = historyData.seasonAnalyses.reduce((sum, season) => sum + season.rosters.length, 0);
    
    // Calculate total games from actual API data
    const totalGames = historyData.allTimeStats.totalGames;
    
    // Get unique champions
    const uniqueChampions = new Set();
    historyData.seasonAnalyses.forEach(season => {
      season.champions.forEach(champion => {
        uniqueChampions.add(champion.owner_id);
      });
    });
    
    return {
      totalSeasons: historyData.allTimeStats.totalSeasons,
      totalTeams,
      totalGames,
      champions: historyData.records.filter(r => r.type === 'championship'),
      uniqueChampionsCount: uniqueChampions.size,
      highestScore: historyData.allTimeStats.highestScore,
      lowestScore: historyData.allTimeStats.lowestScore,
      averageScore: historyData.allTimeStats.averageScore,
      totalPoints: historyData.allTimeStats.totalPoints,
      seasonAnalyses: historyData.seasonAnalyses
    };
  } catch (error) {
    console.error('Failed to calculate historical insights:', error);
    // Fallback to basic calculation
    return {
      totalSeasons: seasons.length,
      totalTeams: 0,
      totalGames: 0,
      champions: [],
      uniqueChampionsCount: 0,
      highestScore: 0,
      lowestScore: 0,
      averageScore: 0,
      totalPoints: 0,
      seasonAnalyses: []
    };
  }
}

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

function getLeagueSubtitle(league: any, nflState: any, seasons: string[], historyData: any): string {
  const currentSeason = nflState?.season || league?.season || new Date().getFullYear().toString();
  if (historyData?.totalSeasons > 1) {
    return `Season ${currentSeason} • ${historyData.totalSeasons} seasons of competition`;
  }
  return `Season ${currentSeason} • ${new Date().toLocaleDateString()}`;
}

function getSeasonContext(league: any, nflState: any): string | null {
  const effectiveStatus = getEffectiveLeagueStatus(league, nflState);
  switch (effectiveStatus) {
    case 'pre_draft':
      if (league.draft_id) {
        return `Draft: ${formatDraftDate(league.draft_id)}`;
      }
      return 'Draft not scheduled';
    case 'drafting':
      return 'Draft in progress';
    case 'preseason':
      return 'Season starting soon';
    case 'in_season':
      return 'Regular season active';
    case 'post_season':
      return 'Playoffs underway';
    case 'complete':
      return 'Season completed';
    default:
      return null;
  }
}

function getWeekContext(league: any, nflState: any): string {
  const effectiveStatus = getEffectiveLeagueStatus(league, nflState);
  const week = nflState?.week || 0;
  
  if (effectiveStatus === 'in_season' || effectiveStatus === 'post_season') {
    const playoffStart = league.settings?.playoff_week_start || 15;
    if (week >= playoffStart) {
      return 'Playoffs';
    }
    return 'Regular Season';
  }
  return '';
}

function getHighlightMatchups(matchups: any[], rosters: any[], users: any[]): any[] {
  if (!matchups || matchups.length === 0) return [];
  
  // Group matchups by matchup_id
  const groupedMatchups = matchups.reduce((acc, matchup) => {
    if (!matchup.matchup_id) return acc;
    if (!acc[matchup.matchup_id]) acc[matchup.matchup_id] = [];
    acc[matchup.matchup_id].push(matchup);
    return acc;
  }, {} as Record<string, any[]>);

  const formattedMatchups = (Object.values(groupedMatchups) as any[][]).map((matchup) => {
    const [team1, team2] = matchup;
    if (!team1 || !team2) return null;

    const roster1 = rosters.find((r) => r.roster_id === team1.roster_id);
    const roster2 = rosters.find((r) => r.roster_id === team2.roster_id);
    const user1 = users.find((u) => u.user_id === roster1?.owner_id);
    const user2 = users.find((u) => u.user_id === roster2?.owner_id);

    if (!roster1 || !roster2 || !user1 || !user2) return null;

    const team1Points = team1.points || 0;
    const team2Points = team2.points || 0;
    const totalPoints = team1Points + team2Points;
    const pointDifference = Math.abs(team1Points - team2Points);
    
    // Highlight high-scoring or close games
    const isHighlight = totalPoints > 200 || (pointDifference < 10 && totalPoints > 0);

    return {
      id: team1.matchup_id,
      team1: {
        name: user1.metadata?.team_name || user1.display_name,
        avatar: user1.avatar,
        points: team1Points
      },
      team2: {
        name: user2.metadata?.team_name || user2.display_name,
        avatar: user2.avatar,
        points: team2Points
      },
      isHighlight,
      totalPoints
    };
  }).filter(Boolean);

  // Sort by total points descending, then by highlight status
  return formattedMatchups.filter(Boolean).sort((a, b) => {
    if (!a || !b) return 0;
    if (a.isHighlight && !b.isHighlight) return -1;
    if (!a.isHighlight && b.isHighlight) return 1;
    return b.totalPoints - a.totalPoints;
  }).slice(0, 6); // Show max 6 matchups
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
  const [historyData, setHistoryData] = useState<any>(null);
  const [currentWeekMatchups, setCurrentWeekMatchups] = useState<any[]>([]);
  const [allTimeUserStats, setAllTimeUserStats] = useState<any>(null);

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
        
        // Fetch current week matchups for league activity
        let matchupsData: any[] = [];
        if (nflStateData?.week && leagueData.status === 'in_season') {
          try {
            matchupsData = await getLeagueMatchups(leagueId, nflStateData.week);
          } catch (error) {
            console.error('Failed to fetch current week matchups:', error);
          }
        }
        
        // Calculate historical insights from all seasons
        const history = await calculateHistoricalInsights(allSeasons, leagueId);
        
        setLeague(leagueData);
        setUsers(usersData);
        setRosters(rostersData);
        setNFLState(nflStateData);
        setSeasons(allSeasons);
        setSelectedSeason(defaultSeason);
        setSeasonRosters(rostersData); // Initialize with current rosters
        setCurrentWeekMatchups(matchupsData);
        setHistoryData(history);
        
        // Set all-time stats for standings
        if (history?.seasonAnalyses && history.seasonAnalyses.length > 1) {
          // Get linked leagues for comprehensive history
          const linkedLeagues = await getAllLinkedLeagueIds(leagueId);
          const comprehensiveHistory = await generateComprehensiveLeagueHistory(linkedLeagues);
          setAllTimeUserStats(comprehensiveHistory.userAllTimeStats);
        }
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

  // Sort rosters by wins, then points (only for season view)
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
      subtitle={getLeagueSubtitle(league, nflState, seasons, historyData)}
      icon={<HomeIcon className="h-6 w-6" />}
      action={commissioner && (
        <div className="hidden md:flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/50 px-3 py-2 rounded-lg">
          <UserIcon className="h-4 w-4" />
          <span>Commissioner: {commissioner.display_name}</span>
        </div>
      )}
    >
      <div className="space-y-8">

        {/* Current Season Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="group hover:ring-2 hover:ring-blue-500/50 transition-all duration-300">
              <CardContent className="relative overflow-hidden p-4 md:p-6">
                <div className="flex items-center space-x-3">
                  <div className="rounded-xl bg-blue-100 dark:bg-blue-500/10 p-2 md:p-3 group-hover:scale-110 transition-transform duration-300">
                    <ClockIcon className="h-5 w-5 md:h-6 md:w-6 text-blue-600 dark:text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Season Status</p>
                    <p className="text-lg md:text-xl font-bold truncate">{formatLeagueStatus(getEffectiveLeagueStatus(league, nflState))}</p>
                    {getSeasonContext(league, nflState) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{getSeasonContext(league, nflState)}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card className="group hover:ring-2 hover:ring-purple-500/50 transition-all duration-300">
              <CardContent className="relative overflow-hidden p-4 md:p-6">
                <div className="flex items-center space-x-3">
                  <div className="rounded-xl bg-purple-100 dark:bg-purple-500/10 p-2 md:p-3 group-hover:scale-110 transition-transform duration-300">
                    <UserGroupIcon className="h-5 w-5 md:h-6 md:w-6 text-purple-600 dark:text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">League Size</p>
                    <p className="text-lg md:text-xl font-bold">{league.total_rosters} Teams</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {league.scoring_settings?.rec ? 'PPR' : 'Standard'} Scoring
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <Card className="group hover:ring-2 hover:ring-green-500/50 transition-all duration-300">
              <CardContent className="relative overflow-hidden p-4 md:p-6">
                <div className="flex items-center space-x-3">
                  <div className="rounded-xl bg-green-100 dark:bg-green-500/10 p-2 md:p-3 group-hover:scale-110 transition-transform duration-300">
                    <ChartBarIcon className="h-5 w-5 md:h-6 md:w-6 text-green-600 dark:text-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Current Week</p>
                    <p className="text-lg md:text-xl font-bold">{formatWeekDisplay(getEffectiveLeagueStatus(league, nflState), nflState?.week)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {getWeekContext(league, nflState)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <Card className="group hover:ring-2 hover:ring-orange-500/50 transition-all duration-300">
              <CardContent className="relative overflow-hidden p-4 md:p-6">
                <div className="flex items-center space-x-3">
                  <div className="rounded-xl bg-orange-100 dark:bg-orange-500/10 p-2 md:p-3 group-hover:scale-110 transition-transform duration-300">
                    <StarIcon className="h-5 w-5 md:h-6 md:w-6 text-orange-600 dark:text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Playoff Race</p>
                    <p className="text-lg md:text-xl font-bold">{league.settings?.playoff_teams || 6} Spots</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      Week {league.settings?.playoff_week_start || 15} start
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* This Week's Action (if in season) */}
        {league.status === 'in_season' && currentWeekMatchups.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <BoltIcon className="h-5 w-5 text-yellow-500" />
                  <h2 className="text-xl font-bold">This Week's Battles</h2>
                  <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    Week {nflState?.week}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {getHighlightMatchups(currentWeekMatchups, seasonRosters, users).map((matchup, index) => (
                    <motion.div
                      key={matchup.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: 0.6 + index * 0.1 }}
                      className="relative p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border border-gray-200 dark:border-gray-700"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Avatar avatarId={matchup.team1.avatar} size={24} className="rounded-lg" />
                            <span className="font-medium text-sm">{matchup.team1.name}</span>
                          </div>
                          <span className="text-lg font-bold">{matchup.team1.points?.toFixed(1) || '0.0'}</span>
                        </div>
                        <div className="text-center text-xs text-gray-500 dark:text-gray-400">VS</div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Avatar avatarId={matchup.team2.avatar} size={24} className="rounded-lg" />
                            <span className="font-medium text-sm">{matchup.team2.name}</span>
                          </div>
                          <span className="text-lg font-bold">{matchup.team2.points?.toFixed(1) || '0.0'}</span>
                        </div>
                      </div>
                      {matchup.isHighlight && (
                        <div className="absolute top-2 right-2">
                          <FireIcon className="h-4 w-4 text-red-500" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Current Standings */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center space-x-2">
                <TrophyIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                <h2 className="text-xl font-bold">Standings</h2>
              </div>
              <div className="flex justify-end">
                {/* Season Selector */}
                <SeasonSelect
                  seasons={seasons}
                  selectedSeason={selectedSeason}
                  onSeasonChange={setSelectedSeason}
                  className="w-[140px]"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingSeasonData ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Header */}
                <div className="hidden md:grid md:grid-cols-[3rem_1fr_8rem_5rem_6rem_6rem] gap-4 px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <div>Rank</div>
                  <div>Team</div>
                  <div className="text-center">Record</div>
                  <div className="text-center">Win%</div>
                  <div className="text-center">PF</div>
                  <div className="text-center">PA</div>
                </div>
                
                {/* Season Standings */}
                {sortedRosters.map((roster, index) => {
                    const user = users.find(u => u.user_id === roster.owner_id);
                    if (!user) return null;

                    const wins = getDefaultValue(roster.settings?.wins, 0);
                    const losses = getDefaultValue(roster.settings?.losses, 0);
                    const ties = getDefaultValue(roster.settings?.ties, 0);
                    const fpts = getDefaultValue(roster.settings?.fpts, 0) + getDefaultValue(roster.settings?.fpts_decimal, 0) / 100;
                    const fptsAgainst = getDefaultValue(roster.settings?.fpts_against, 0) + getDefaultValue(roster.settings?.fpts_against_decimal, 0) / 100;
                    const winPct = calculateWinPercentage(wins, losses, ties);
                    
                    const isInPlayoffs = index < getDefaultValue(league.settings?.playoff_teams, 6);
                    const isOnBubble = index === getDefaultValue(league.settings?.playoff_teams, 6);

                    return (
                      <motion.div
                        key={roster.roster_id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: index * 0.05 }}
                        className={`
                          relative overflow-hidden rounded-xl transition-all p-3 md:p-4
                          ${isInPlayoffs ? 'bg-blue-50 hover:bg-blue-100/80 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 ring-1 ring-blue-200 dark:ring-blue-500/30' : 
                            isOnBubble ? 'bg-orange-50 hover:bg-orange-100/80 dark:bg-orange-500/10 dark:hover:bg-orange-500/20 ring-1 ring-orange-200 dark:ring-orange-500/30' : 
                            'bg-gray-50 hover:bg-gray-100/80 dark:bg-white/5 dark:hover:bg-white/10'}
                        `}
                      >
                        {/* Mobile Layout */}
                        <div className="md:hidden space-y-2">
                          <div className="flex items-center space-x-3">
                            <div className={`
                              w-6 h-6 flex items-center justify-center rounded text-xs font-bold
                              ${isInPlayoffs ? 'bg-blue-200 text-blue-700 dark:bg-blue-500/30 dark:text-blue-300' : 
                                isOnBubble ? 'bg-orange-200 text-orange-700 dark:bg-orange-500/30 dark:text-orange-300' : 
                                'bg-gray-200 text-gray-700 dark:bg-gray-500/30 dark:text-gray-300'}
                            `}>
                              {index + 1}
                            </div>
                            <Avatar avatarId={user.avatar} size={32} className="rounded-lg" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{user.metadata?.team_name || user.display_name}</p>
                              <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                                <span>{formatRecord(wins, losses, ties)}</span>
                                <span>•</span>
                                <span>{winPct.toFixed(1)}%</span>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs pl-11">
                            <div className="flex justify-between">
                              <span className="text-gray-500 dark:text-gray-400">PF:</span>
                              <span className="font-medium">{formatPoints(fpts)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 dark:text-gray-400">PA:</span>
                              <span className="font-medium">{formatPoints(fptsAgainst)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Desktop Layout */}
                        <div className="hidden md:grid md:grid-cols-[3rem_1fr_8rem_5rem_6rem_6rem] gap-4 items-center">
                          <div className={`
                            w-7 h-7 flex items-center justify-center rounded-lg text-sm font-bold
                            ${isInPlayoffs ? 'bg-blue-200 text-blue-700 dark:bg-blue-500/30 dark:text-blue-300' : 
                              isOnBubble ? 'bg-orange-200 text-orange-700 dark:bg-orange-500/30 dark:text-orange-300' : 
                              'bg-gray-200 text-gray-700 dark:bg-gray-500/30 dark:text-gray-300'}
                          `}>
                            {index + 1}
                          </div>
                          <div className="flex items-center space-x-3 min-w-0">
                            <Avatar avatarId={user.avatar} size={32} className="rounded-lg flex-shrink-0" />
                            <span className="font-medium truncate">{user.metadata?.team_name || user.display_name}</span>
                          </div>
                          <div className="text-center font-medium">{formatRecord(wins, losses, ties)}</div>
                          <div className="text-center font-medium">{winPct.toFixed(1)}%</div>
                          <div className="text-center font-medium">{formatPoints(fpts)}</div>
                          <div className="text-center font-medium">{formatPoints(fptsAgainst)}</div>
                        </div>

                        {/* Status Badges */}
                        {isInPlayoffs && (
                          <div className="absolute top-1 right-1 md:top-2 md:right-2 px-1.5 py-0.5 text-[9px] md:text-[10px] font-bold text-blue-700 bg-blue-200 dark:text-blue-300 dark:bg-blue-500/30 rounded-full">
                            PLAYOFF
                          </div>
                        )}
                        {isOnBubble && (
                          <div className="absolute top-1 right-1 md:top-2 md:right-2 px-1.5 py-0.5 text-[9px] md:text-[10px] font-bold text-orange-700 bg-orange-200 dark:text-orange-300 dark:bg-orange-500/30 rounded-full">
                            BUBBLE
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
