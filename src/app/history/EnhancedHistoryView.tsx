'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { 
  TrophyIcon, 
  FireIcon,
  BoltIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  StarIcon,
  HeartIcon,
  ChartBarIcon,
  ClockIcon,
  GlobeAmericasIcon,
  CheckCircleIcon,
  XCircleIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { getCurrentLeagueId } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage } from '@/components/ui/LoadingSpinner';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { getDefaultSeason, formatPoints } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  generateEnhancedLeagueHistory, 
  EnhancedLeagueHistory
} from '@/lib/enhancedHistoryApi';

interface EnhancedHistoryViewProps {
  currentWeek: number;
}

export default function EnhancedHistoryView({ currentWeek }: EnhancedHistoryViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<EnhancedLeagueHistory | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [filterType, setFilterType] = useState<'regularSeason' | 'playoffs'>('regularSeason');
  const [timeFrame, setTimeFrame] = useState<'allTime' | 'season'>('allTime');
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['championships', 'highScore', 'lowScore']));

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const leagueId = await getCurrentLeagueId();
        
        // Use the enhanced history API with progress tracking
        const data = await generateEnhancedLeagueHistory(
          leagueId,
          (progress: number, message: string) => {
            setProcessingProgress(progress);
            setProcessingStatus(message);
          }
        );
        
        setHistoryData(data);
        
        // Set default season
        const seasons = Object.keys(data.seasonStats).sort();
        if (seasons.length > 0 && !selectedSeason) {
          setSelectedSeason(getDefaultSeason(seasons));
        }
        
      } catch (error) {
        console.error('Failed to fetch enhanced history data:', error);
        setError(error instanceof Error ? error.message : 'Failed to load history data');
      } finally {
        setLoading(false);
        setProcessingStatus('');
        setProcessingProgress(0);
      }
    };

    fetchData();
  }, [currentWeek, selectedSeason]);

  const toggleSection = (sectionType: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionType)) {
      newExpanded.delete(sectionType);
    } else {
      newExpanded.add(sectionType);
    }
    setExpandedSections(newExpanded);
  };

  const getFilteredRecords = () => {
    if (!historyData) return [];
    
    return historyData.records.filter(record => {
      // Filter by regular season vs playoffs
      if (filterType === 'regularSeason' && record.isPlayoff) return false;
      if (filterType === 'playoffs' && !record.isPlayoff) return false;
      
      // Filter by time frame
      if (timeFrame === 'season' && record.season !== selectedSeason) return false;
      
      return true;
    });
  };

  const recordCategories = [
    { type: 'championship', title: 'Championships', icon: TrophyIcon, color: 'yellow', description: 'League champions by season' },
    { type: 'runnerUp', title: 'Runner-Ups', icon: TrophyIcon, color: 'gray', description: 'Championship game finalists' },
    { type: 'regularSeasonChamp', title: 'Regular Season Champions', icon: ShieldCheckIcon, color: 'purple', description: 'Best regular season records' },
    { type: 'playoffAppearance', title: 'Playoff Appearances', icon: StarIcon, color: 'blue', description: 'Playoff qualifications and final rankings' },
    { type: 'highScore', title: 'Highest Scores', icon: FireIcon, color: 'red', description: 'Top weekly scoring performances' },
    { type: 'playoffHighScore', title: 'Playoff High Scores', icon: FireIcon, color: 'orange', description: 'Best playoff performances' },
    { type: 'lowScore', title: 'Lowest Scores', icon: ArrowTrendingDownIcon, color: 'gray', description: 'Rock bottom performances' },
    { type: 'playoffLowScore', title: 'Playoff Low Scores', icon: ArrowTrendingDownIcon, color: 'red', description: 'Worst playoff chokes' },
    { type: 'blowout', title: 'Biggest Blowouts', icon: BoltIcon, color: 'orange', description: 'Most dominant victories' },
    { type: 'closeGame', title: 'Closest Games', icon: HeartIcon, color: 'pink', description: 'Nail-biting finishes' },
    { type: 'winStreak', title: 'Win Streaks', icon: ArrowTrendingUpIcon, color: 'green', description: 'Longest winning streaks' },
    { type: 'lossStreak', title: 'Loss Streaks', icon: ArrowTrendingDownIcon, color: 'red', description: 'Longest losing streaks' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingPage />
        {processingStatus && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <ClockIcon className="h-5 w-5 text-blue-500 animate-spin" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Processing League History
                  </span>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {processingProgress}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${processingProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                {processingStatus}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (error) return <ErrorMessage title="Error" message={error} />;
  if (!historyData) return null;

  const seasons = Object.keys(historyData.seasonStats).sort();
  const filteredRecords = getFilteredRecords();

  return (
    <div className="space-y-6 md:space-y-8">
      {/* League Overview Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <GlobeAmericasIcon className="h-6 w-6 text-blue-500" />
            <span className="text-xl text-gray-900 dark:text-white">League Overview</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            <div className="bg-blue-500/10 rounded-lg p-3 md:p-4">
              <div className="text-lg md:text-2xl font-bold text-blue-600 dark:text-blue-400">
                {historyData.leagueMetadata.totalSeasons}
              </div>
              <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">Seasons</div>
            </div>
            <div className="bg-green-500/10 rounded-lg p-3 md:p-4">
              <div className="text-lg md:text-2xl font-bold text-green-600 dark:text-green-400">
                {historyData.leagueMetadata.totalGamesPlayed}
              </div>
              <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">Games</div>
            </div>
            <div className="bg-yellow-500/10 rounded-lg p-3 md:p-4">
              <div className="text-lg md:text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {formatPoints(historyData.leagueMetadata.allTimeHighScore)}
              </div>
              <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">High Score</div>
            </div>
            <div className="bg-red-500/10 rounded-lg p-3 md:p-4">
              <div className="text-lg md:text-2xl font-bold text-red-600 dark:text-red-400">
                {formatPoints(historyData.leagueMetadata.allTimeLowScore)}
              </div>
              <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">Low Score</div>
            </div>
            <div className="bg-purple-500/10 rounded-lg p-3 md:p-4">
              <div className="text-lg md:text-2xl font-bold text-purple-600 dark:text-purple-400">
                {historyData.leagueMetadata.mostChampionships}
              </div>
              <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">Most Titles</div>
            </div>
            <div className="bg-indigo-500/10 rounded-lg p-3 md:p-4 col-span-2 sm:col-span-1">
              <div className="text-lg md:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {formatPoints(historyData.leagueMetadata.averageLeagueScore)}
              </div>
              <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400">Avg Score</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* League Champions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrophyIcon className="h-6 w-6 text-yellow-500" />
            <span className="text-xl text-gray-900 dark:text-white">League Champions</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            // Get all championship records (independent of filters)
            const championshipRecords = historyData.records
              .filter(r => r.type === 'championship')
              .sort((a, b) => parseInt(b.season) - parseInt(a.season)); // Sort by season, newest first
            
            if (championshipRecords.length === 0) {
              return (
                <div className="text-center py-8">
                  <TrophyIcon className="h-12 w-12 mx-auto mb-4 text-gray-400 opacity-50" />
                  <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-2">No Champions Found</h3>
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    No championship data available. Check back after seasons are completed.
                  </p>
                </div>
              );
            }

            return (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {championshipRecords.map((champion, index) => (
                  <motion.div
                    key={`${champion.season}-${champion.userId}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                    className="relative overflow-hidden rounded-xl bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-500/10 dark:via-amber-500/10 dark:to-orange-500/10 border border-yellow-200 dark:border-yellow-500/30 p-6"
                  >
                    {/* Championship Badge */}
                    <div className="absolute top-4 right-4">
                      <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                        <TrophyIcon className="h-5 w-5 text-white" />
                      </div>
                    </div>
                    
                    {/* Season Year */}
                    <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mb-2">
                      {champion.season}
                    </div>
                    
                    {/* Champion Info */}
                    <div className="flex items-center space-x-3 mb-3">
                      <Avatar avatarId={champion.avatar} size={48} className="rounded-xl ring-2 ring-yellow-400" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate">
                          {champion.username}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          League Champion
                        </p>
                      </div>
                    </div>
                    
                    {/* Champion Details */}
                    {champion.details && (
                      <div className="space-y-1 text-sm">
                        {champion.details.record && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Record:</span>
                            <span className="font-medium text-gray-900 dark:text-white">{champion.details.record}</span>
                          </div>
                        )}
                        {champion.details.pointsFor && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Points For:</span>
                            <span className="font-medium text-gray-900 dark:text-white">{champion.details.pointsFor.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Decorative Elements */}
                    <div className="absolute -bottom-2 -right-2 w-16 h-16 bg-yellow-400/20 rounded-full blur-xl" />
                    <div className="absolute -top-2 -left-2 w-12 h-12 bg-amber-400/20 rounded-full blur-lg" />
                  </motion.div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Filter Controls */}
      <div className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-end md:space-x-4 md:space-y-0">
        {/* Regular Season vs Playoffs */}
        <div className="flex items-center space-x-1 bg-gray-100 dark:bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setFilterType('regularSeason')}
            className={`flex-1 px-4 py-3 md:px-3 md:py-2 rounded-md text-sm font-medium transition-all min-h-[48px] md:min-h-[36px] ${
              filterType === 'regularSeason' 
                ? 'bg-blue-500 text-white shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10'
            }`}
          >
            <span className="hidden sm:inline">Regular Season</span>
            <span className="sm:hidden">Regular</span>
          </button>
          <button
            onClick={() => setFilterType('playoffs')}
            className={`flex-1 px-4 py-3 md:px-3 md:py-2 rounded-md text-sm font-medium transition-all min-h-[48px] md:min-h-[36px] ${
              filterType === 'playoffs' 
                ? 'bg-blue-500 text-white shadow-sm' 
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
            className={`flex-1 px-4 py-3 md:px-3 md:py-2 rounded-md text-sm font-medium transition-all min-h-[48px] md:min-h-[36px] ${
              timeFrame === 'allTime' 
                ? 'bg-green-500 text-white shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10'
            }`}
          >
            <span className="hidden sm:inline">All-Time Records</span>
            <span className="sm:hidden">All-Time</span>
          </button>
          <button
            onClick={() => setTimeFrame('season')}
            className={`flex-1 px-4 py-3 md:px-3 md:py-2 rounded-md text-sm font-medium transition-all min-h-[48px] md:min-h-[36px] ${
              timeFrame === 'season' 
                ? 'bg-green-500 text-white shadow-sm' 
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
            className="w-full md:w-[140px] min-h-[48px] md:min-h-[36px]"
          />
        )}
      </div>


      {/* Records Tables */}
      <div className="space-y-6 md:space-y-8">
        {recordCategories.map(category => {
          const categoryRecords = filteredRecords.filter(r => r.type === category.type);
          const isExpanded = expandedSections.has(category.type);
          
          if (categoryRecords.length === 0) return null;
          
          const sortedRecords = categoryRecords.sort((a, b) => {
            // Use contextual ranking if available
            if (a.contextualRank && b.contextualRank) {
              return a.contextualRank - b.contextualRank;
            }
            
            // For lowest scores, sort from least to greatest
            if (category.type === 'lowScore' || category.type === 'closeGame') {
              return a.value - b.value;
            }
            // For all other records, sort from greatest to least
            return b.value - a.value;
          }).slice(0, 10); // Show top 10 records
          
          return (
            <Card key={category.type}>
              <CardHeader>
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleSection(category.type)}
                >
                  <CardTitle className="flex items-center space-x-2">
                    <category.icon className={`h-5 w-5 md:h-6 md:w-6 text-${category.color}-500`} />
                    <span className="text-lg md:text-xl text-gray-900 dark:text-white">
                      {category.title}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ({sortedRecords.length})
                    </span>
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400 hidden md:inline">
                      {category.description}
                    </span>
                    {isExpanded ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircleIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
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
                                    {record.contextualRank || index + 1}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center space-x-3">
                                    <Avatar avatarId={record.avatar} size={32} className="rounded" />
                                    <span className="font-medium text-gray-900 dark:text-white">
                                      {record.username}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="font-bold text-gray-900 dark:text-white">
                                    {record.type === 'highScore' || record.type === 'lowScore' ||
                                     record.type === 'playoffHighScore' || record.type === 'playoffLowScore' ? 
                                      formatPoints(record.value) : 
                                      record.value}
                                  </div>
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {record.type === 'highScore' || record.type === 'lowScore' || 
                                     record.type === 'playoffHighScore' || record.type === 'playoffLowScore' ? 'points' : 
                                     record.type === 'winStreak' || record.type === 'lossStreak' ? 'games' :
                                     record.type === 'blowout' || record.type === 'closeGame' ? 'margin' :
                                     record.type === 'championship' || record.type === 'runnerUp' || record.type === 'playoffAppearance' ? 'finish' : 'record'}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-gray-500 dark:text-gray-400">
                                  {record.season}
                                  {record.week && ` • Week ${record.week}`}
                                  {record.isPlayoff && (
                                    <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                                      Playoffs
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="text-sm text-gray-600 dark:text-gray-400">
                                    {record.description}
                                  </div>
                                  {record.details && (
                                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                      {record.details.winnerScore && record.details.loserScore && 
                                        `${record.details.winnerScore.toFixed(2)} - ${record.details.loserScore.toFixed(2)}`}
                                      {record.details.rank && ` • Rank: ${record.details.rank}`}
                                      {record.details.record && ` • ${record.details.record}`}
                                      {record.details.opponent && ` • vs ${record.details.opponent}`}
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
                                  {record.contextualRank || index + 1}
                                </span>
                                <Avatar avatarId={record.avatar} size={32} className="rounded" />
                                <span className="font-medium text-sm text-gray-900 dark:text-white">
                                  {record.username}
                                </span>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-lg text-gray-900 dark:text-white">
                                  {record.type === 'highScore' || record.type === 'lowScore' ||
                                   record.type === 'playoffHighScore' || record.type === 'playoffLowScore' ? 
                                    formatPoints(record.value) : 
                                    record.value}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {record.type === 'highScore' || record.type === 'lowScore' ||
                                   record.type === 'playoffHighScore' || record.type === 'playoffLowScore' ? 'points' : 
                                   record.type === 'winStreak' || record.type === 'lossStreak' ? 'games' :
                                   record.type === 'blowout' || record.type === 'closeGame' ? 'margin' :
                                   record.type === 'championship' || record.type === 'runnerUp' || record.type === 'playoffAppearance' ? 'finish' : 'record'}
                                </div>
                              </div>
                            </div>
                            
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {record.season}
                                  {record.week && ` • Week ${record.week}`}
                                </div>
                                {record.isPlayoff && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                                    Playoffs
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                {record.description}
                              </div>
                              {record.details && (
                                <div className="text-xs text-gray-500 dark:text-gray-500">
                                  {record.details.winnerScore && record.details.loserScore && 
                                    `${record.details.winnerScore.toFixed(2)} - ${record.details.loserScore.toFixed(2)}`}
                                  {record.details.rank && ` • Rank: ${record.details.rank}`}
                                  {record.details.record && ` • ${record.details.record}`}
                                  {record.details.opponent && ` • vs ${record.details.opponent}`}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
      </div>

      {/* All-Time User Stats */}
      {timeFrame === 'allTime' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <ChartBarIcon className="h-6 w-6 text-blue-500" />
              <span className="text-xl text-gray-900 dark:text-white">All-Time Manager Stats</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Manager</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Record</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Win%</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Championships</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Playoffs</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Avg Points</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Seasons</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.allTimeStats
                    .sort((a, b) => b.winPercentage - a.winPercentage)
                    .map((userStats) => (
                      <tr key={userStats.userId} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-3">
                            <Avatar avatarId={userStats.avatar} size={32} className="rounded" />
                            <span className="font-medium text-gray-900 dark:text-white">
                              {userStats.username}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {userStats.totalWins}-{userStats.totalLosses}
                            {userStats.totalTies > 0 && `-${userStats.totalTies}`}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {(userStats.winPercentage * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-yellow-600 dark:text-yellow-400">
                            {userStats.championships}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            {userStats.playoffAppearances}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {formatPoints(userStats.averagePointsPerGame)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-gray-500 dark:text-gray-400">
                            {userStats.seasonsPlayed}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            
            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {historyData.allTimeStats
                .sort((a, b) => b.winPercentage - a.winPercentage)
                .map((userStats, index) => (
                  <div key={userStats.userId} className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-200 dark:border-gray-800/50">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400 text-sm font-bold">
                        {index + 1}
                      </div>
                      <Avatar avatarId={userStats.avatar} size={32} className="rounded" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                          {userStats.username}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {userStats.seasonsPlayed} seasons played
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="space-y-1">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Record</div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {userStats.totalWins}-{userStats.totalLosses}
                          {userStats.totalTies > 0 && `-${userStats.totalTies}`}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Win %</div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {(userStats.winPercentage * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Championships</div>
                        <div className="font-bold text-yellow-600 dark:text-yellow-400">
                          {userStats.championships}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Playoffs</div>
                        <div className="font-medium text-blue-600 dark:text-blue-400">
                          {userStats.playoffAppearances}
                        </div>
                      </div>
                      <div className="space-y-1 col-span-2">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Average Points</div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {formatPoints(userStats.averagePointsPerGame)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}