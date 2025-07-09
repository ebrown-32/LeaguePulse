'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { 
  getAllLeagueSeasons, 
  getLeagueInfo, 
  getAllLinkedLeagueIds,
  generateComprehensiveHistoricalRecords,
  generateComprehensiveLeagueHistory
} from '@/lib/api';
import { 
  TrophyIcon, 
  FireIcon,
  BoltIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  StarIcon,
  HeartIcon,
} from '@heroicons/react/24/outline';
import { getCurrentLeagueId } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage } from '@/components/ui/LoadingSpinner';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { getDefaultSeason, formatPoints, formatRecord } from '@/lib/utils';
import { motion } from 'framer-motion';

interface HistoryViewProps {
  currentWeek: number;
}

interface UserStats {
  userId: string;
  username: string;
  avatar: string;
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  totalPoints: number;
  championships: number;
  playoffAppearances: number;
  winPercentage: number;
  averagePointsPerGame: number;
  seasonsPlayed?: number;
  highestScore?: number;
  lowestScore?: number;
  longestWinStreak?: number;
  longestLossStreak?: number;
  bestFinish?: number;
  worstFinish?: number;
}

interface HistoricalRecord {
  type: 'championship' | 'playoff' | 'highScore' | 'lowScore' | 'winStreak' | 'lossStreak' | 'blowout' | 'closeGame' | 'consistency' | 'explosiveness' | 'seasonHigh' | 'seasonLow' | 'playoffAppearance' | 'regularSeasonChamp';
  season: string;
  week?: number;
  userId: string;
  username: string;
  avatar: string;
  value: number;
  description: string;
  details?: any;
  isAllTime?: boolean;
  isPlayoff?: boolean;
}

export default function HistoryView({ currentWeek }: HistoryViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<any>(null);
  const [stats, setStats] = useState<UserStats[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [historicalRecords, setHistoricalRecords] = useState<HistoricalRecord[]>([]);
  const [filterType, setFilterType] = useState<'regularSeason' | 'playoffs'>('regularSeason');
  const [timeFrame, setTimeFrame] = useState<'allTime' | 'season'>('allTime');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const leagueId = await getCurrentLeagueId();
        const league = await getLeagueInfo(leagueId);
        if (!league) {
          throw new Error('League not found');
        }
        setLeague(league);

        const linkedIds = await getAllLinkedLeagueIds(leagueId);
        const seasons = await getAllLeagueSeasons(leagueId);
        setSeasons(seasons);

        if (!selectedSeason) {
          const defaultSeason = getDefaultSeason(seasons);
          setSelectedSeason(defaultSeason);
        }

        // Generate comprehensive league history
        const historyData = await generateComprehensiveLeagueHistory(linkedIds);
        console.log('Comprehensive history data:', historyData);

        // Convert to legacy format for backward compatibility
        const legacyStats = Object.entries(historyData.userAllTimeStats).map(([userId, userData]: [string, any]) => ({
          userId,
          username: userData.username,
          avatar: userData.avatar,
          totalWins: userData.totalWins,
          totalLosses: userData.totalLosses,
          totalTies: userData.totalTies,
          totalPoints: userData.totalPoints,
          championships: userData.championships,
          playoffAppearances: userData.playoffAppearances,
          winPercentage: userData.winPercentage,
          averagePointsPerGame: userData.averagePointsPerGame,
          seasonsPlayed: userData.seasonsPlayed,
          highestScore: userData.highestScore,
          lowestScore: userData.lowestScore,
          longestWinStreak: userData.longestWinStreak,
          longestLossStreak: userData.longestLossStreak,
          bestFinish: userData.bestFinish,
          worstFinish: userData.worstFinish,
        }));
        setStats(legacyStats);

        // Set historical records with playoff flag using league settings
        const recordsWithPlayoffFlag = historyData.records.map(record => {
          // Get the league info for this season to determine playoff weeks
          const seasonLeague = historyData.seasonAnalyses.find(analysis => analysis.season === record.season);
          const playoffWeekStart = seasonLeague?.league?.settings?.playoff_week_start || 15;
          
          return {
            ...record,
            isPlayoff: Boolean(
              record.type === 'championship' || 
              record.type === 'playoffAppearance' || 
              (record.week && record.week >= playoffWeekStart)
            )
          };
        });
        setHistoricalRecords(recordsWithPlayoffFlag);

      } catch (error) {
        console.error('Failed to fetch data:', error);
        setError(error instanceof Error ? error.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentWeek]);

  if (loading) return <LoadingPage />;
  if (error) return <ErrorMessage title="Error" message={error} />;
  if (!league || !stats.length) return null;

  const getFilteredRecords = () => {
    return historicalRecords.filter(record => {
      // Filter by regular season vs playoffs
      if (filterType === 'regularSeason' && record.isPlayoff) return false;
      if (filterType === 'playoffs' && !record.isPlayoff) return false;
      
      // Filter by time frame
      if (timeFrame === 'season' && record.season !== selectedSeason) return false;
      // For all-time, show all records (no additional filtering needed)
      
      return true;
    });
  };

  const recordCategories = [
    { type: 'championship', title: 'Championships', icon: TrophyIcon, color: 'yellow' },
    { type: 'highScore', title: 'Highest Scores', icon: FireIcon, color: 'red' },
    { type: 'lowScore', title: 'Lowest Scores', icon: ArrowTrendingDownIcon, color: 'gray' },
    { type: 'playoffAppearance', title: 'Playoff Appearances', icon: StarIcon, color: 'blue' },
    { type: 'winStreak', title: 'Win Streaks', icon: ArrowTrendingUpIcon, color: 'green' },
    { type: 'lossStreak', title: 'Loss Streaks', icon: ArrowTrendingDownIcon, color: 'red' },
    { type: 'blowout', title: 'Biggest Blowouts', icon: BoltIcon, color: 'orange' },
    { type: 'closeGame', title: 'Closest Games', icon: HeartIcon, color: 'pink' },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Filter Controls - Mobile Optimized */}
      <div className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-end md:space-x-4 md:space-y-0">
          {/* Regular Season vs Playoffs */}
          <div className="flex items-center space-x-1 bg-gray-100 dark:bg-white/5 rounded-lg p-1">
          <button
              onClick={() => setFilterType('regularSeason')}
              className={`flex-1 px-3 py-2 md:px-3 md:py-1 rounded-md text-sm transition-all min-h-[44px] md:min-h-0 ${
                filterType === 'regularSeason' 
                ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10'
            }`}
          >
              <span className="hidden sm:inline">Regular Season</span>
              <span className="sm:hidden">Regular</span>
          </button>
          <button
              onClick={() => setFilterType('playoffs')}
              className={`flex-1 px-3 py-2 md:px-3 md:py-1 rounded-md text-sm transition-all min-h-[44px] md:min-h-0 ${
                filterType === 'playoffs' 
                ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10'
            }`}
          >
              Playoffs
          </button>
        </div>

          {/* All-Time vs Season */}
          <div className="flex items-center space-x-1 bg-gray-100 dark:bg-white/5 rounded-lg p-1">
            <button
              onClick={() => setTimeFrame('allTime')}
              className={`flex-1 px-3 py-2 md:px-3 md:py-1 rounded-md text-sm transition-all min-h-[44px] md:min-h-0 ${
                timeFrame === 'allTime' 
                  ? 'bg-green-500 text-white' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10'
              }`}
            >
              <span className="hidden sm:inline">All-Time Records</span>
              <span className="sm:hidden">All-Time</span>
            </button>
            <button
              onClick={() => setTimeFrame('season')}
              className={`flex-1 px-3 py-2 md:px-3 md:py-1 rounded-md text-sm transition-all min-h-[44px] md:min-h-0 ${
                timeFrame === 'season' 
                  ? 'bg-green-500 text-white' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10'
              }`}
            >
              <span className="hidden sm:inline">Season Records</span>
              <span className="sm:hidden">Season</span>
            </button>
      </div>

          {timeFrame === 'season' && (
            <SeasonSelect
              seasons={seasons}
              selectedSeason={selectedSeason}
              onSeasonChange={setSelectedSeason}
              className="w-full md:w-[140px] min-h-[44px]"
            />
          )}
        </div>

      {/* Records Tables - Mobile Optimized */}
      <div className="space-y-6 md:space-y-8">
        {recordCategories.map(category => {
          const categoryRecords = getFilteredRecords().filter(r => r.type === category.type);
          
          if (categoryRecords.length === 0) return null;
          
          const sortedRecords = categoryRecords.sort((a, b) => {
            // For lowest scores, sort from least to greatest
            if (category.type === 'lowScore') {
              return a.value - b.value;
            }
            // For all other records, sort from greatest to least
            return b.value - a.value;
          }).slice(0, 10); // Show top 10 records
          
          // Use the actual number of displayed records for the count
          const displayCount = sortedRecords.length;
          
          return (
            <Card key={category.type}>
          <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <category.icon className={`h-5 w-5 md:h-6 md:w-6 text-${category.color}-500`} />
                  <span className="text-lg md:text-xl text-gray-900 dark:text-white">{category.title}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">({displayCount})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Rank</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Manager</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Record</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Season</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRecords.map((record, index) => (
                        <motion.tr
                          key={`${record.season}-${record.type}-${record.userId}-${record.week || 'season'}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                              index === 0 ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
                              index === 1 ? 'bg-gray-400/20 text-gray-600 dark:text-gray-300' :
                              index === 2 ? 'bg-amber-600/20 text-amber-600 dark:text-amber-400' :
                              'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                            }`}>
                              {index + 1}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <Avatar avatarId={record.avatar} size={32} className="rounded" />
                              <span className="font-medium text-gray-900 dark:text-white">{record.username}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-gray-900 dark:text-white">
                              {record.type === 'highScore' || record.type === 'lowScore' ? 
                                formatPoints(record.value) : 
                                record.value}
            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {record.type === 'highScore' || record.type === 'lowScore' ? 'points' : 
                               record.type === 'winStreak' || record.type === 'lossStreak' ? 'games' :
                               record.type === 'blowout' || record.type === 'closeGame' ? 'margin' : 'record'}
            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-500 dark:text-gray-400">
                            {record.season}
                            {record.week && ` • Week ${record.week}`}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-sm text-gray-600 dark:text-gray-400">{record.description}</div>
                            {record.details && (
                              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                {record.details.winnerScore && `${record.details.winnerScore.toFixed(2)} - ${record.details.loserScore.toFixed(2)}`}
                                {record.details.rank && ` • Rank: ${record.details.rank}`}
                                {record.details.record && ` • ${record.details.record}`}
            </div>
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
      </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3">
                  {sortedRecords.map((record, index) => (
                    <motion.div
                      key={`${record.season}-${record.type}-${record.userId}-${record.week || 'season'}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-200 dark:border-gray-800/50"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                            index === 0 ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
                            index === 1 ? 'bg-gray-400/20 text-gray-600 dark:text-gray-300' :
                            index === 2 ? 'bg-amber-600/20 text-amber-600 dark:text-amber-400' :
                            'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                          }`}>
                        {index + 1}
                      </span>
                          <Avatar avatarId={record.avatar} size={32} className="rounded" />
                          <span className="font-medium text-sm text-gray-900 dark:text-white">{record.username}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg text-gray-900 dark:text-white">
                            {record.type === 'highScore' || record.type === 'lowScore' ? 
                              formatPoints(record.value) : 
                              record.value}
                    </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {record.type === 'highScore' || record.type === 'lowScore' ? 'points' : 
                             record.type === 'winStreak' || record.type === 'lossStreak' ? 'games' :
                             record.type === 'blowout' || record.type === 'closeGame' ? 'margin' : 'record'}
                          </div>
                      </div>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {record.season}
                          {record.week && ` • Week ${record.week}`}
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300">{record.description}</div>
                        {record.details && (
                          <div className="text-xs text-gray-500 dark:text-gray-500">
                            {record.details.winnerScore && `${record.details.winnerScore.toFixed(2)} - ${record.details.loserScore.toFixed(2)}`}
                            {record.details.rank && ` • Rank: ${record.details.rank}`}
                            {record.details.record && ` • ${record.details.record}`}
                          </div>
                        )}
                      </div>
                    </motion.div>
                ))}
            </div>
          </CardContent>
        </Card>
          );
        })}
                      </div>

      {/* All-Time Stats Summary - Mobile Optimized */}
      {timeFrame === 'allTime' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg md:text-xl text-gray-900 dark:text-white">All-Time League Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
              <div className="bg-blue-500/10 rounded-lg p-3 md:p-4">
                <div className="text-xl md:text-2xl font-bold text-blue-600 dark:text-blue-400">{seasons.length}</div>
                <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">Total Seasons</div>
                    </div>
              <div className="bg-green-500/10 rounded-lg p-3 md:p-4">
                <div className="text-xl md:text-2xl font-bold text-green-600 dark:text-green-400">{stats.reduce((sum, user) => sum + user.championships, 0)}</div>
                <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">Total Championships</div>
                  </div>
              <div className="bg-yellow-500/10 rounded-lg p-3 md:p-4">
                <div className="text-xl md:text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.reduce((sum, user) => sum + user.totalWins + user.totalLosses + user.totalTies, 0)}</div>
                <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">Total Games</div>
                      </div>
              <div className="bg-purple-500/10 rounded-lg p-3 md:p-4">
                <div className="text-xl md:text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.length}</div>
                <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">Active Managers</div>
                      </div>
                  </div>
                </CardContent>
              </Card>
      )}
    </div>
  );
} 
