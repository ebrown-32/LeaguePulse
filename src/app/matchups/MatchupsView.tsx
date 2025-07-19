'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getLeagueMatchups, getNFLState, getAllLeagueSeasons, getAllLinkedLeagueIds } from '@/lib/api';
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage, LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/Select';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { getDefaultSeason } from '@/lib/utils';
import type { SleeperMatchup } from '@/types/sleeper';
import { motion } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon, FireIcon, TrophyIcon } from '@heroicons/react/24/outline';

interface MatchupsViewProps {
  currentWeek?: number;
}

export default function MatchupsView({ currentWeek: initialWeek }: MatchupsViewProps) {
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
        setSeasonRosters(rostersData);

        // Set initial week if not provided
        if (!initialWeek) {
          // If in season, use current week, otherwise default to week 1
          const currentWeek = nflStateData.week || 1;
          setSelectedWeek(leagueData.status === 'in_season' ? currentWeek : 1);
        }

        // Fetch matchups for the selected week
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

  // Fetch rosters and matchups when season changes
  useEffect(() => {
    const fetchSeasonData = async () => {
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

        // Fetch rosters and matchups for the correct league
        const [seasonRostersData, matchupsData] = await Promise.all([
          getLeagueRosters(seasonLeagueId),
          getLeagueMatchups(seasonLeagueId, selectedWeek)
        ]);
        
        setSeasonRosters(seasonRostersData);
        setMatchups(matchupsData);
      } catch (error) {
        console.error('Failed to fetch season data:', error);
        // Fallback to current data if fetch fails
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

  // Group matchups by matchup_id
  const groupedMatchups = matchups.reduce((acc, matchup) => {
    if (!matchup.matchup_id) return acc;
    if (!acc[matchup.matchup_id]) acc[matchup.matchup_id] = [];
    acc[matchup.matchup_id].push(matchup);
    return acc;
  }, {} as Record<string, any[]>);

  // Sort grouped matchups for better display order
  const sortedGroupedMatchups = Object.entries(groupedMatchups)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {} as Record<string, any[]>);
  
  // Update the reference
  const finalGroupedMatchups = sortedGroupedMatchups;

  // Helper functions
  const getMatchupContext = () => {
    const isPlayoffs = selectedWeek >= (league?.settings?.playoff_week_start || 15);
    const isCurrentWeek = selectedWeek === nflState?.week && selectedSeason === league?.season;
    
    if (isPlayoffs) {
      return {
        title: `Week ${selectedWeek} - Playoffs`,
        subtitle: isCurrentWeek ? 'Championship dreams on the line' : 'Playoff battles',
        color: 'from-yellow-500 to-orange-500'
      };
    }
    
    return {
      title: `Week ${selectedWeek} - Regular Season`,
      subtitle: isCurrentWeek ? 'This week&apos;s matchups' : 'Head-to-head battles',
      color: 'from-blue-500 to-purple-500'
    };
  };

  const context = getMatchupContext();
  const hasMatchups = Object.keys(finalGroupedMatchups).length > 0;
  
  return (
    <div className="space-y-8">
      {/* Enhanced Week Header */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${context.color} p-4 md:p-8 text-white`}
      >
        <div className="relative z-10">
          <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0 mb-4">
            <div className="flex items-center space-x-3 md:space-x-4">
              <div className="p-2 md:p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                {selectedWeek >= (league?.settings?.playoff_week_start || 15) ? (
                  <TrophyIcon className="h-6 w-6 md:h-8 md:w-8" />
                ) : (
                  <FireIcon className="h-6 w-6 md:h-8 md:w-8" />
                )}
              </div>
              <div>
                <h1 className="text-xl md:text-3xl font-bold leading-tight">{context.title}</h1>
                <p className="text-white/80 text-sm md:text-lg">{context.subtitle}</p>
              </div>
            </div>
            
            {/* Week Navigation */}
            <div className="flex items-center space-x-2 self-end md:self-auto">
              <button
                onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
                disabled={selectedWeek <= 1}
                className="p-2 md:p-2 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <span className="px-3 py-2 md:px-4 md:py-2 bg-white/20 rounded-lg font-medium text-sm md:text-base min-h-[44px] md:min-h-0 flex items-center">Week {selectedWeek}</span>
              <button
                onClick={() => setSelectedWeek(Math.min(18, selectedWeek + 1))}
                disabled={selectedWeek >= 18}
                className="p-2 md:p-2 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          
          {/* Season and detailed selectors */}
          <div className="flex flex-col space-y-3 md:flex-row md:flex-wrap md:items-center md:gap-4 md:space-y-0 mt-6">
            <SeasonSelect
              seasons={seasons}
              selectedSeason={selectedSeason}
              onSeasonChange={setSelectedSeason}
              className="w-full md:w-[140px] bg-white/20 border-white/30 text-white min-h-[44px]"
            />
            <Select
              value={selectedWeek.toString()}
              onValueChange={(value) => setSelectedWeek(Number(value))}
            >
              <SelectTrigger className="w-full md:w-[180px] bg-white/20 border-white/30 text-white min-h-[44px]">
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
            
            {hasMatchups && (
              <div className="text-white/80 text-sm bg-white/20 px-3 py-2 rounded-lg self-start md:self-auto">
                {Object.keys(groupedMatchups).length} matchups
              </div>
            )}
          </div>
        </div>
        
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
      </motion.div>

      {/* Matchups Content */}
      {loadingSeasonData ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : !hasMatchups ? (
        <Card>
          <CardContent className="text-center py-16">
            <div className="text-gray-500 dark:text-gray-400">
              <FireIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Matchups Available</h3>
              <p className="text-sm">There are no matchups for Week {selectedWeek} in Season {selectedSeason}.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <motion.div 
          className="grid gap-4 md:gap-6 lg:grid-cols-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {Object.values(finalGroupedMatchups).map((matchup, index) => {
            const [team1, team2] = matchup;
            if (!team1 || !team2) return null;

            const roster1 = seasonRosters.find((r) => r.roster_id === team1.roster_id);
            const roster2 = seasonRosters.find((r) => r.roster_id === team2.roster_id);
            const user1 = users.find((u) => u.user_id === roster1?.owner_id);
            const user2 = users.find((u) => u.user_id === roster2?.owner_id);

            if (!roster1 || !roster2 || !user1 || !user2) return null;

            const team1Points = team1.points || 0;
            const team2Points = team2.points || 0;
            const matchupComplete = team1.points !== null && team2.points !== null && (team1Points > 0 || team2Points > 0);
            const team1Winning = team1Points > team2Points;
            const team2Winning = team2Points > team1Points;
            const isTie = matchupComplete && team1Points === team2Points;
            const totalPoints = team1Points + team2Points;
            const pointDifference = Math.abs(team1Points - team2Points);
            const isCloseGame = matchupComplete && pointDifference < 5;
            const isHighScoring = totalPoints > 200;

            return (
              <motion.div
                key={team1.matchup_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Card className={`overflow-hidden transition-all duration-300 hover:shadow-lg ${
                  isCloseGame ? 'ring-2 ring-orange-500/50' : 
                  isHighScoring ? 'ring-2 ring-purple-500/50' : ''
                }`}>
                  <CardHeader className="relative pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                          {selectedWeek >= (league?.settings?.playoff_week_start || 15) ? 'Playoff Match' : 'Matchup'}
                        </h3>
                        {matchupComplete && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                            Final
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {isCloseGame && (
                          <div className="flex items-center space-x-1 text-orange-600 dark:text-orange-400">
                            <FireIcon className="h-4 w-4" />
                            <span className="text-xs font-medium">Close</span>
                          </div>
                        )}
                        {isHighScoring && (
                          <div className="flex items-center space-x-1 text-purple-600 dark:text-purple-400">
                            <TrophyIcon className="h-4 w-4" />
                            <span className="text-xs font-medium">High Scoring</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-0">
                    <div className="space-y-1">
                      {/* Team 1 */}
                      <motion.div
                        className={`flex items-center justify-between p-4 md:p-6 transition-all duration-300 ${
                          matchupComplete && team1Winning
                            ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-500/10 dark:to-emerald-500/10 border-l-4 border-green-500'
                            : isTie && matchupComplete
                            ? 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-500/10 dark:to-amber-500/10 border-l-4 border-yellow-500'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        }`}
                        whileHover={{ scale: 1.01 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="flex items-center space-x-3 md:space-x-4 flex-1 min-w-0">
                          <Avatar
                            avatarId={user1.avatar}
                            size={40}
                            className={`md:w-12 md:h-12 rounded-xl transition-transform duration-300 ${
                              matchupComplete && team1Winning ? 'ring-2 ring-green-500 scale-110' : 'ring-2 ring-gray-200 dark:ring-gray-700'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`font-semibold text-sm md:text-base truncate ${
                              matchupComplete && team1Winning 
                                ? 'text-green-700 dark:text-green-300' 
                                : 'text-gray-900 dark:text-white'
                            }`}>
                              {user1.metadata?.team_name || user1.display_name}
                            </p>
                            <div className="flex items-center space-x-2 md:space-x-3 text-xs md:text-sm text-gray-500 dark:text-gray-400">
                              <span>{roster1.settings.wins || 0}-{roster1.settings.losses || 0}{roster1.settings.ties > 0 ? `-${roster1.settings.ties}` : ''}</span>
                              <span className="hidden sm:inline">•</span>
                              <span className="hidden sm:inline">{(((roster1.settings?.fpts || 0) + (roster1.settings?.fpts_decimal || 0) / 100) / Math.max(1, (roster1.settings?.wins || 0) + (roster1.settings?.losses || 0) + (roster1.settings?.ties || 0))).toFixed(1)} avg</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xl md:text-3xl font-bold transition-colors duration-300 ${
                            matchupComplete && team1Winning
                              ? 'text-green-600 dark:text-green-400'
                              : isTie && matchupComplete
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-gray-900 dark:text-white'
                          }`}>
                            {team1Points?.toFixed(1) || '0.0'}
                          </div>
                          {matchupComplete && team1Winning && (
                            <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                              +{pointDifference.toFixed(1)}
                            </div>
                          )}
                        </div>
                      </motion.div>

                      {/* VS Divider */}
                      <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                        </div>
                        <div className="relative flex justify-center">
                          <span className="bg-white dark:bg-gray-900 px-3 text-sm text-gray-500 dark:text-gray-400 font-medium">
                            {matchupComplete ? (isTie ? 'TIE' : 'VS') : 'VS'}
                          </span>
                        </div>
                      </div>

                      {/* Team 2 */}
                      <motion.div
                        className={`flex items-center justify-between p-4 md:p-6 transition-all duration-300 ${
                          matchupComplete && team2Winning
                            ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-500/10 dark:to-emerald-500/10 border-l-4 border-green-500'
                            : isTie && matchupComplete
                            ? 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-500/10 dark:to-amber-500/10 border-l-4 border-yellow-500'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        }`}
                        whileHover={{ scale: 1.01 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="flex items-center space-x-3 md:space-x-4 flex-1 min-w-0">
                          <Avatar
                            avatarId={user2.avatar}
                            size={40}
                            className={`md:w-12 md:h-12 rounded-xl transition-transform duration-300 ${
                              matchupComplete && team2Winning ? 'ring-2 ring-green-500 scale-110' : 'ring-2 ring-gray-200 dark:ring-gray-700'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`font-semibold text-sm md:text-base truncate ${
                              matchupComplete && team2Winning 
                                ? 'text-green-700 dark:text-green-300' 
                                : 'text-gray-900 dark:text-white'
                            }`}>
                              {user2.metadata?.team_name || user2.display_name}
                            </p>
                            <div className="flex items-center space-x-2 md:space-x-3 text-xs md:text-sm text-gray-500 dark:text-gray-400">
                              <span>{roster2.settings.wins || 0}-{roster2.settings.losses || 0}{roster2.settings.ties > 0 ? `-${roster2.settings.ties}` : ''}</span>
                              <span className="hidden sm:inline">•</span>
                              <span className="hidden sm:inline">{(((roster2.settings?.fpts || 0) + (roster2.settings?.fpts_decimal || 0) / 100) / Math.max(1, (roster2.settings?.wins || 0) + (roster2.settings?.losses || 0) + (roster2.settings?.ties || 0))).toFixed(1)} avg</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xl md:text-3xl font-bold transition-colors duration-300 ${
                            matchupComplete && team2Winning
                              ? 'text-green-600 dark:text-green-400'
                              : isTie && matchupComplete
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-gray-900 dark:text-white'
                          }`}>
                            {team2Points?.toFixed(1) || '0.0'}
                          </div>
                          {matchupComplete && team2Winning && (
                            <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                              +{pointDifference.toFixed(1)}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    </div>
                    
                    {/* Matchup Summary */}
                    {matchupComplete && (
                      <div className="px-4 py-3 md:px-6 md:py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between text-xs md:text-sm">
                          <span className="text-gray-500 dark:text-gray-400">
                            Total: <span className="font-medium text-gray-900 dark:text-white">{totalPoints.toFixed(1)}</span>
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            Margin: <span className="font-medium text-gray-900 dark:text-white">{pointDifference.toFixed(1)}</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
} 