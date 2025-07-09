'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getAdvancedTeamMetrics } from '@/lib/api';
import {
  ChartBarIcon,
  BoltIcon,
  HeartIcon,
  ArrowTrendingUpIcon,
  StarIcon,
  TrophyIcon,
  FireIcon,
  TagIcon,
  ClockIcon,
  SparklesIcon,
  ArrowTrendingUpIcon as TrendingUpIcon,
  ArrowTrendingDownIcon,
  ScaleIcon,
  BoltIcon as LightningBoltIcon,
  ShieldCheckIcon,
  RocketLaunchIcon,
  EyeIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import { SeasonSelect } from '@/components/ui/SeasonSelect';

interface NextGenStatsProps {
  initialMetrics: Awaited<ReturnType<typeof getAdvancedTeamMetrics>>;
  seasons: string[];
  leagueId: string;
}

interface AdvancedTeamMetrics {
  userId: string;
  username: string;
  avatar: string;
  teamName: string;
  record: {
    wins: number;
    losses: number;
    ties: number;
    winPct: number;
    gamesPlayed: number;
  };
  points: {
    total: number;
    average: number;
    high: number;
    low: number;
    standardDeviation: number;
    coefficientOfVariation: number;
    weeklyScores: number[];
  };
  consistency: {
    score: number;
    averageMargin: number;
    volatilityIndex: number;
    boomBustRatio: number;
  };
  explosiveness: {
    score: number;
    explosiveGames: number;
    explosiveRate: number;
    highestWeekRank: number;
  };
  clutch: {
    score: number;
    closeWins: number;
    closeGames: number;
    closeWinRate: number;
    topWins: number;
    playoffWins: number;
  };
  efficiency: {
    score: number;
    pointsPerWin: number;
    winEfficiency: number;
    scoringEfficiency: number;
  };
  momentum: {
    score: number;
    lateSeasonRecord: string;
    finalWeeksWinRate: number;
    longestWinStreak: number;
    currentStreak: number;
  };
  luck: {
    score: number;
    expectedWins: number;
    luckRating: number;
    closeLosses: number;
  };
  season: string;
  finalRank: number;
  playoffAppearance: boolean;
  championship: boolean;
}

function MetricRadar({ metrics, team }: { metrics: string[]; team: AdvancedTeamMetrics }) {
  const getMetricValue = (metric: string) => {
    switch (metric) {
      case 'consistency': return team.consistency.score;
      case 'explosiveness': return team.explosiveness.score;
      case 'clutch': return team.clutch.score;
      case 'efficiency': return team.efficiency.score;
      case 'momentum': return team.momentum.score;
      case 'luck': return team.luck.score;
      default: return 0;
    }
  };

  const getMetricColor = (metric: string) => {
    switch (metric) {
      case 'consistency': return 'from-blue-500 to-blue-600';
      case 'explosiveness': return 'from-purple-500 to-purple-600';
      case 'clutch': return 'from-green-500 to-green-600';
      case 'efficiency': return 'from-yellow-500 to-yellow-600';
      case 'momentum': return 'from-orange-500 to-orange-600';
      case 'luck': return 'from-pink-500 to-pink-600';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  // Calculate overall rating as average of all metrics
  const overallRating = metrics.reduce((sum, metric) => sum + getMetricValue(metric), 0) / metrics.length;

  return (
    <div className="relative w-full h-64">
      <svg className="w-full h-full" viewBox="0 0 200 200">
        {/* Background circles */}
        <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <circle cx="100" cy="100" r="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <circle cx="100" cy="100" r="20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        
        {/* Radar lines */}
        {metrics.map((metric, index) => {
          const angle = (index * 2 * Math.PI) / metrics.length - Math.PI / 2;
          const x = 100 + 80 * Math.cos(angle);
          const y = 100 + 80 * Math.sin(angle);
          return (
            <line
              key={metric}
              x1="100"
              y1="100"
              x2={x}
              y2={y}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
            />
          );
        })}
        
        {/* Data polygon */}
        <polygon
          points={metrics.map((metric, index) => {
            const angle = (index * 2 * Math.PI) / metrics.length - Math.PI / 2;
            const value = getMetricValue(metric) / 100;
            const r = 80 * value;
            const x = 100 + r * Math.cos(angle);
            const y = 100 + r * Math.sin(angle);
            return `${x},${y}`;
          }).join(' ')}
          fill="rgba(59, 130, 246, 0.2)"
          stroke="rgba(59, 130, 246, 0.8)"
          strokeWidth="2"
        />
        
        {/* Data points */}
        {metrics.map((metric, index) => {
          const angle = (index * 2 * Math.PI) / metrics.length - Math.PI / 2;
          const value = getMetricValue(metric) / 100;
          const r = 80 * value;
          const x = 100 + r * Math.cos(angle);
          const y = 100 + r * Math.sin(angle);
          return (
            <circle
              key={metric}
              cx={x}
              cy={y}
              r="3"
              fill={`url(#${getMetricColor(metric).split('-')[1]})`}
              className="drop-shadow-lg"
            />
          );
        })}
      </svg>
      
      {/* Metric labels */}
      {metrics.map((metric, index) => {
        const angle = (index * 2 * Math.PI) / metrics.length - Math.PI / 2;
        const x = 100 + 90 * Math.cos(angle);
        const y = 100 + 90 * Math.sin(angle);
        const value = getMetricValue(metric);
        
        return (
          <div
            key={metric}
            className="absolute text-xs font-medium text-gray-700 dark:text-gray-300"
            style={{
              left: `${(x / 200) * 100}%`,
              top: `${(y / 200) * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="text-center">
              <div className="capitalize">{metric}</div>
              <div className="text-blue-600 dark:text-blue-400 font-bold">{value.toFixed(0)}</div>
            </div>
          </div>
        );
      })}
      
      {/* Overall rating in center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center bg-white/10 dark:bg-black/20 rounded-full p-4 backdrop-blur-sm">
          <div className="text-3xl font-bold text-gray-900 dark:text-white">
            {overallRating.toFixed(0)}
          </div>
          <div className="text-xs text-gray-700 dark:text-gray-300">Overall</div>
        </div>
      </div>
    </div>
  );
}

function WeeklyScoreChart({ scores }: { scores: number[] }) {
  if (scores.length === 0) return null;
  
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-gray-400">
        <span>Weekly Scores</span>
        <span>Avg: {avgScore.toFixed(1)}</span>
      </div>
      <div className="flex items-end space-x-1 h-16">
        {scores.map((score, index) => {
          const height = (score / maxScore) * 100;
          const isAboveAvg = score > avgScore;
          return (
            <motion.div
              key={index}
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              className={`flex-1 rounded-t ${
                isAboveAvg ? 'bg-green-500' : 'bg-red-500'
              } min-h-[4px]`}
              title={`Week ${index + 1}: ${score.toFixed(1)}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function StatBadge({ label, value, color, icon: Icon }: { 
  label: string; 
  value: string | number; 
  color: string; 
  icon: any;
}) {
  return (
    <div className={`bg-${color}-500/10 border border-${color}-500/20 rounded-lg p-3`}>
      <div className="flex items-center space-x-2">
        <Icon className={`h-4 w-4 text-${color}-500`} />
        <div>
          <div className="text-xs text-gray-400">{label}</div>
          <div className={`text-sm font-semibold text-${color}-500`}>{value}</div>
        </div>
      </div>
    </div>
  );
}

export default function NextGenStats({ initialMetrics, seasons, leagueId }: NextGenStatsProps) {
  const [metrics, setMetrics] = useState<AdvancedTeamMetrics[]>(initialMetrics);
  const [loading, setLoading] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState('all-time');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'radar' | 'comparison'>('cards');

  const handleSeasonChange = async (season: string) => {
    setLoading(true);
    setSelectedSeason(season);
    try {
      const newMetrics = await getAdvancedTeamMetrics(leagueId, season === 'all-time' ? undefined : season);
      setMetrics(newMetrics);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
    setLoading(false);
  };

  const radarMetrics = ['consistency', 'explosiveness', 'clutch', 'efficiency', 'momentum', 'luck'];

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-end">
        {/* View Mode Toggle */}
        <div className="flex bg-gray-100 dark:bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-2 rounded-md text-sm transition-all ${
              viewMode === 'cards' 
                ? 'bg-blue-500 text-white' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Cards
          </button>
          <button
            onClick={() => setViewMode('radar')}
            className={`px-3 py-2 rounded-md text-sm transition-all ${
              viewMode === 'radar' 
                ? 'bg-blue-500 text-white' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Radar
          </button>
          <button
            onClick={() => setViewMode('comparison')}
            className={`px-3 py-2 rounded-md text-sm transition-all ${
              viewMode === 'comparison' 
                ? 'bg-blue-500 text-white' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Compare
          </button>
        </div>
        
        <SeasonSelect
          seasons={seasons}
          selectedSeason={selectedSeason}
          onSeasonChange={handleSeasonChange}
          className="min-w-[140px]"
        />
      </div>

             {/* League Leaders */}
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-500/20">
           <CardContent className="p-6">
             <div className="flex items-center space-x-4">
               <div className="rounded-full bg-blue-500/20 p-3">
                 <ShieldCheckIcon className="h-6 w-6 text-blue-500" />
               </div>
               <div>
                 <p className="text-sm text-gray-600 dark:text-gray-400">Most Consistent</p>
                 <p className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                   {metrics.sort((a, b) => b.consistency.score - a.consistency.score)[0]?.teamName}
                 </p>
                 <p className="text-xs text-blue-500">
                   {metrics.sort((a, b) => b.consistency.score - a.consistency.score)[0]?.consistency.score.toFixed(1)}%
                 </p>
               </div>
             </div>
           </CardContent>
         </Card>

                          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 border-purple-500/20">
           <CardContent className="p-6">
             <div className="flex items-center space-x-4">
               <div className="rounded-full bg-purple-500/20 p-3">
                 <LightningBoltIcon className="h-6 w-6 text-purple-500" />
               </div>
               <div>
                 <p className="text-sm text-gray-600 dark:text-gray-400">Most Explosive</p>
                 <p className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                   {metrics.sort((a, b) => b.explosiveness.score - a.explosiveness.score)[0]?.teamName}
                 </p>
                 <p className="text-xs text-purple-500">
                   {metrics.sort((a, b) => b.explosiveness.score - a.explosiveness.score)[0]?.explosiveness.explosiveGames} explosive games
                 </p>
               </div>
             </div>
           </CardContent>
         </Card>

         <Card className="bg-gradient-to-br from-green-500/10 to-green-600/10 border-green-500/20">
           <CardContent className="p-6">
             <div className="flex items-center space-x-4">
               <div className="rounded-full bg-green-500/20 p-3">
                 <HeartIcon className="h-6 w-6 text-green-500" />
               </div>
               <div>
                 <p className="text-sm text-gray-600 dark:text-gray-400">Most Clutch</p>
                 <p className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                   {metrics.sort((a, b) => b.clutch.score - a.clutch.score)[0]?.teamName}
                 </p>
                 <p className="text-xs text-green-500">
                   {metrics.sort((a, b) => b.clutch.score - a.clutch.score)[0]?.clutch.closeWinRate.toFixed(1)} close win rate
                 </p>
               </div>
             </div>
           </CardContent>
         </Card>

         <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/10 border-yellow-500/20">
           <CardContent className="p-6">
             <div className="flex items-center space-x-4">
               <div className="rounded-full bg-yellow-500/20 p-3">
                 <RocketLaunchIcon className="h-6 w-6 text-yellow-500" />
               </div>
               <div>
                 <p className="text-sm text-gray-600 dark:text-gray-400">Most Efficient</p>
                 <p className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                   {metrics.sort((a, b) => b.efficiency.score - a.efficiency.score)[0]?.teamName}
                 </p>
                 <p className="text-xs text-yellow-500">
                   {metrics.sort((a, b) => b.efficiency.score - a.efficiency.score)[0]?.efficiency.score.toFixed(1)}% efficiency
                 </p>
               </div>
             </div>
           </CardContent>
         </Card>
      </div>

      {/* Main Content */}
      <AnimatePresence mode="wait">
        {viewMode === 'cards' && (
          <motion.div
            key="cards"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`grid gap-6 md:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-50' : ''}`}
          >
        {metrics.map((team) => (
              <motion.div
                key={team.userId}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                whileHover={{ scale: 1.02 }}
                className="group"
              >
                <Card className="h-full transform transition-all duration-300 hover:shadow-xl">
            <CardHeader>
              <div className="flex items-center space-x-4">
                      <Avatar avatarId={team.avatar} size={48} className="rounded-lg" />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg text-gray-800 dark:text-white truncate">
                          {team.teamName}
                        </CardTitle>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                    {team.record.wins}-{team.record.losses}
                    {team.record.ties > 0 ? `-${team.record.ties}` : ''} ({team.record.winPct.toFixed(1)}%)
                  </p>
                        {team.playoffAppearance && (
                          <div className="flex items-center space-x-1 mt-1">
                            <StarIcon className="h-3 w-3 text-yellow-500" />
                            <span className="text-xs text-yellow-600 dark:text-yellow-400">Playoffs</span>
                          </div>
                        )}
                </div>
              </div>
            </CardHeader>
                  
                  <CardContent className="space-y-6">
                                         {/* Key Stats */}
                     <div className="grid grid-cols-2 gap-4">
                       <div className="text-center">
                         <p className="text-xs text-gray-500 dark:text-gray-400">PPG</p>
                         <p className="text-2xl font-bold text-gray-900 dark:text-white">
                           {team.points.average.toFixed(1)}
                         </p>
                </div>
                       <div className="text-center">
                         <p className="text-xs text-gray-500 dark:text-gray-400">vs. Avg</p>
                         <p className={`text-2xl font-bold ${
                           team.consistency.averageMargin > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {team.consistency.averageMargin > 0 ? '+' : ''}
                    {team.consistency.averageMargin.toFixed(1)}
                  </p>
                </div>
              </div>

                                                              {/* Weekly Score Chart */}
                     <WeeklyScoreChart scores={team.points.weeklyScores} />

                     {/* Advanced Metrics */}
                     <div className="grid grid-cols-2 gap-3">
                       <StatBadge 
                  label="Consistency"
                         value={`${team.consistency.score.toFixed(0)}%`} 
                         color="blue" 
                         icon={ShieldCheckIcon}
                />
                       <StatBadge 
                  label="Explosiveness"
                         value={`${team.explosiveness.score.toFixed(0)}%`} 
                         color="purple" 
                         icon={LightningBoltIcon}
                />
                       <StatBadge 
                  label="Clutch"
                         value={`${team.clutch.score.toFixed(0)}%`} 
                         color="green" 
                         icon={HeartIcon}
                       />
                       <StatBadge 
                         label="Efficiency" 
                         value={`${team.efficiency.score.toFixed(0)}%`} 
                         color="yellow" 
                         icon={RocketLaunchIcon}
                />
              </div>

                     {/* Streak Info */}
                     <div className="flex justify-between items-center text-sm">
                <div>
                         <span className="text-gray-500 dark:text-gray-400">Longest Streak:</span>
                         <span className="ml-1 font-medium text-gray-900 dark:text-white">
                           {team.momentum.longestWinStreak}W
                         </span>
                </div>
                <div>
                         <span className="text-gray-500 dark:text-gray-400">Luck:</span>
                         <span className={`ml-1 font-medium ${
                           team.luck.luckRating > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                         }`}>
                           {team.luck.luckRating > 0 ? '+' : ''}{team.luck.luckRating.toFixed(1)}
                         </span>
                </div>
              </div>
            </CardContent>
          </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {viewMode === 'radar' && (
          <motion.div
            key="radar"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            {metrics.map((team) => (
              <motion.div
                key={team.userId}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                whileHover={{ scale: 1.02 }}
              >
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-center space-x-3">
                      <Avatar avatarId={team.avatar} size={32} className="rounded" />
              <div>
                        <CardTitle className="text-base text-gray-800 dark:text-white">
                          {team.teamName}
                        </CardTitle>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {team.record.wins}-{team.record.losses} ({team.record.winPct.toFixed(1)}%)
                </p>
              </div>
            </div>
                  </CardHeader>
                  <CardContent>
                    <MetricRadar metrics={radarMetrics} team={team} />
          </CardContent>
        </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {viewMode === 'comparison' && (
          <motion.div
            key="comparison"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Team Selection */}
            <div className="flex flex-wrap gap-4">
              {metrics.map((team) => (
                <button
                  key={team.userId}
                  onClick={() => setSelectedTeam(selectedTeam === team.userId ? null : team.userId)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all ${
                    selectedTeam === team.userId
                      ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <Avatar avatarId={team.avatar} size={24} className="rounded" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {team.teamName}
                  </span>
                </button>
              ))}
            </div>

            {/* Comparison Chart */}
            {selectedTeam && (
        <Card>
                <CardHeader>
                  <CardTitle className="text-gray-900 dark:text-white">
                    Team Comparison: {metrics.find(t => t.userId === selectedTeam)?.teamName}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Advanced Metrics</h4>
                      <div className="space-y-4">
                        {radarMetrics.map((metric) => {
                          const team = metrics.find(t => t.userId === selectedTeam);
                          if (!team) return null;
                          
                          const value = getMetricValue(metric, team);
                          const maxValue = Math.max(...metrics.map(t => getMetricValue(metric, t)));
                          const percentage = (value / maxValue) * 100;
                          
                          return (
                            <div key={metric} className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600 dark:text-gray-400 capitalize">{metric}</span>
                                <span className="font-medium text-gray-900 dark:text-white">{value.toFixed(1)}</span>
                              </div>
                              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${percentage}%` }}
                                  transition={{ duration: 0.8, delay: 0.1 }}
                                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
              </div>
                    
              <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Performance Breakdown</h4>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">
                              {metrics.find(t => t.userId === selectedTeam)?.points.high.toFixed(1)}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Highest Score</div>
                          </div>
                          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">
                              {metrics.find(t => t.userId === selectedTeam)?.clutch.closeWins}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Close Wins</div>
                          </div>
                        </div>
                        
                        <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg">
                          <h5 className="font-semibold text-gray-900 dark:text-white mb-2">Streak Analysis</h5>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Longest Win Streak:</span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                {metrics.find(t => t.userId === selectedTeam)?.momentum.longestWinStreak} games
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Late Season Record:</span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                {metrics.find(t => t.userId === selectedTeam)?.momentum.lateSeasonRecord}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Luck Rating:</span>
                              <span className={`font-medium ${
                                (metrics.find(t => t.userId === selectedTeam)?.luck.luckRating || 0) > 0 
                                  ? 'text-green-600 dark:text-green-400' 
                                  : 'text-red-600 dark:text-red-400'
                              }`}>
                                {(metrics.find(t => t.userId === selectedTeam)?.luck.luckRating || 0).toFixed(1)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
              </div>
            </div>
          </CardContent>
        </Card>
            )}
          </motion.div>
                 )}
       </AnimatePresence>

       {/* Metrics Explanation */}
       <div className="mt-12 p-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
         <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Understanding the Metrics</h3>
         <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
           <div>
             <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
               <ShieldCheckIcon className="h-4 w-4 text-blue-500 mr-2" />
               Consistency
             </h4>
             <p className="text-sm text-gray-600 dark:text-gray-400">
               Measures scoring consistency using coefficient of variation. Lower variation = higher consistency. 
               Accounts for median games if your league has them enabled.
             </p>
           </div>
           
           <div>
             <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
               <LightningBoltIcon className="h-4 w-4 text-purple-500 mr-2" />
               Explosiveness
             </h4>
             <p className="text-sm text-gray-600 dark:text-gray-400">
               Percentage of games scoring above 120% of league average. Higher percentage = more explosive scoring weeks.
             </p>
              </div>
           
              <div>
             <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
               <HeartIcon className="h-4 w-4 text-green-500 mr-2" />
               Clutch
             </h4>
             <p className="text-sm text-gray-600 dark:text-gray-400">
               Win rate in close games (within 10 points). Higher percentage = better performance under pressure.
                </p>
              </div>
           
           <div>
             <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
               <RocketLaunchIcon className="h-4 w-4 text-yellow-500 mr-2" />
               Efficiency
             </h4>
             <p className="text-sm text-gray-600 dark:text-gray-400">
               Combines scoring efficiency with win efficiency. Higher score = better points-to-wins ratio.
             </p>
            </div>
           
           <div>
             <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
               <TrendingUpIcon className="h-4 w-4 text-orange-500 mr-2" />
               Momentum
             </h4>
             <p className="text-sm text-gray-600 dark:text-gray-400">
               Based on late-season performance and win streaks. Shows how teams finish the season.
             </p>
              </div>
           
              <div>
             <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
               <ScaleIcon className="h-4 w-4 text-pink-500 mr-2" />
               Luck
             </h4>
             <p className="text-sm text-gray-600 dark:text-gray-400">
               Expected wins vs actual wins. Positive = lucky (won more than expected), negative = unlucky.
                </p>
              </div>
            </div>
         
         <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
           <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Median Games</h4>
           <p className="text-sm text-blue-800 dark:text-blue-200">
             All metrics properly account for median games if your league has them enabled. Win/loss records and 
             points per game include both head-to-head and median game results. The system automatically detects 
             and handles median game settings from your Sleeper league configuration.
           </p>
         </div>
      </div>
    </div>
  );
 }

function getMetricValue(metric: string, team: AdvancedTeamMetrics): number {
  switch (metric) {
    case 'consistency': return team.consistency.score;
    case 'explosiveness': return team.explosiveness.score;
    case 'clutch': return team.clutch.score;
    case 'efficiency': return team.efficiency.score;
    case 'momentum': return team.momentum.score;
    case 'luck': return team.luck.score;
    default: return 0;
  }
} 