'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { 
  TrophyIcon, 
  StarIcon,
  FireIcon,
  BoltIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  HeartIcon,
  ClockIcon,
  ChartBarIcon,
  FlagIcon,
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { formatPoints, formatRecord } from '@/lib/utils';

interface TeamStoryProps {
  user: {
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
    seasonsPlayed: number;
    highestScore: number;
    lowestScore: number;
    longestWinStreak: number;
    longestLossStreak: number;
    bestFinish: number;
    worstFinish: number;
  };
  seasonData: any[];
  records: any[];
}

export default function TeamStory({ user, seasonData, records }: TeamStoryProps) {
  const userRecords = records.filter(r => r.userId === user.userId);
  const userSeasons = seasonData.filter(s => 
    s.users.some((u: any) => u.user_id === user.userId)
  );

  const getSeasonPerformance = (season: any) => {
    const userRoster = season.rosters.find((r: any) => r.owner_id === user.userId);
    if (!userRoster) return null;
    
    const userData = season.users.find((u: any) => u.user_id === user.userId);
    return {
      season: season.season,
      wins: userRoster.settings.wins || 0,
      losses: userRoster.settings.losses || 0,
      ties: userRoster.settings.ties || 0,
      points: (userRoster.settings.fpts || 0) + (userRoster.settings.fpts_decimal || 0) / 100,
      rank: userRoster.settings.rank || 0,
      championship: season.champions.some((c: any) => c.user.user_id === user.userId),
      playoffAppearance: season.playoffTeams.some((p: any) => p.user.user_id === user.userId),
    };
  };

  const seasonPerformances = userSeasons.map(getSeasonPerformance).filter(Boolean);

  return (
    <div className="space-y-8">
      {/* Team Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Card className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/20">
          <CardContent className="p-8">
            <div className="flex items-center space-x-6">
              <Avatar avatarId={user.avatar} size={80} className="rounded-lg" />
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-2">{user.username}</h1>
                <p className="text-xl text-gray-300 mb-4">
                  {user.seasonsPlayed} seasons • {user.championships} championships
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-400">{formatRecord(user.totalWins, user.totalLosses, user.totalTies)}</div>
                    <div className="text-sm text-gray-400">All-Time Record</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">{user.winPercentage.toFixed(1)}%</div>
                    <div className="text-sm text-gray-400">Win Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-400">{formatPoints(user.averagePointsPerGame)}</div>
                    <div className="text-sm text-gray-400">Avg PPG</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-400">{user.playoffAppearances}</div>
                    <div className="text-sm text-gray-400">Playoff Appearances</div>
                  </div>
                </div>
              </div>
              {user.championships > 0 && (
                <div className="flex items-center space-x-2">
                  {Array.from({ length: user.championships }).map((_, i) => (
                    <TrophyIcon key={i} className="w-8 h-8 text-yellow-500" />
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Season-by-Season Performance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <ChartBarIcon className="h-6 w-6" />
              <span>Season-by-Season Performance</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {seasonPerformances
                .filter((performance): performance is NonNullable<typeof performance> => performance !== null)
                .sort((a, b) => {
                  const seasonA = a.season ? parseInt(a.season) : 0;
                  const seasonB = b.season ? parseInt(b.season) : 0;
                  return seasonB - seasonA;
                })
                .map((performance, index) => (
                  <motion.div
                    key={performance.season}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className={`flex items-center justify-between p-4 rounded-lg ${
                      performance.championship 
                        ? 'bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20' 
                        : performance.playoffAppearance 
                        ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20'
                        : 'bg-white/5'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="text-lg font-semibold">{performance.season}</div>
                      <div className="text-sm text-gray-400">
                        {formatRecord(performance.wins, performance.losses, performance.ties)}
                      </div>
                      <div className="text-sm text-gray-400">
                        {formatPoints(performance.points)} pts
                      </div>
                      <div className="text-sm text-gray-400">
                        Rank: {performance.rank}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {performance.championship && (
                        <TrophyIcon className="w-5 h-5 text-yellow-500" />
                      )}
                      {performance.playoffAppearance && !performance.championship && (
                        <StarIcon className="w-5 h-5 text-blue-500" />
                      )}
                    </div>
                  </motion.div>
                ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Team Records */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FireIcon className="h-6 w-6 text-red-500" />
              <span>Team Records</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="bg-red-500/10 rounded-lg p-4">
                <div className="text-lg font-bold text-red-400">{formatPoints(user.highestScore)}</div>
                <div className="text-sm text-gray-400">Highest Score</div>
              </div>
              <div className="bg-gray-500/10 rounded-lg p-4">
                <div className="text-lg font-bold text-gray-400">{formatPoints(user.lowestScore)}</div>
                <div className="text-sm text-gray-400">Lowest Score</div>
              </div>
              <div className="bg-green-500/10 rounded-lg p-4">
                <div className="text-lg font-bold text-green-400">{user.longestWinStreak}</div>
                <div className="text-sm text-gray-400">Longest Win Streak</div>
              </div>
              <div className="bg-red-500/10 rounded-lg p-4">
                <div className="text-lg font-bold text-red-400">{user.longestLossStreak}</div>
                <div className="text-sm text-gray-400">Longest Loss Streak</div>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-4">
                <div className="text-lg font-bold text-blue-400">{user.bestFinish}</div>
                <div className="text-sm text-gray-400">Best Finish</div>
              </div>
              <div className="bg-orange-500/10 rounded-lg p-4">
                <div className="text-lg font-bold text-orange-400">{user.worstFinish}</div>
                <div className="text-sm text-gray-400">Worst Finish</div>
              </div>
              <div className="bg-purple-500/10 rounded-lg p-4">
                <div className="text-lg font-bold text-purple-400">{user.championships}</div>
                <div className="text-sm text-gray-400">Championships</div>
              </div>
              <div className="bg-indigo-500/10 rounded-lg p-4">
                <div className="text-lg font-bold text-indigo-400">{user.playoffAppearances}</div>
                <div className="text-sm text-gray-400">Playoff Appearances</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Personal Records */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrophyIcon className="h-6 w-6 text-yellow-500" />
              <span>Personal Records</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {userRecords
                .sort((a, b) => b.value - a.value)
                .slice(0, 10)
                .map((record, index) => (
                  <motion.div
                    key={`${record.season}-${record.type}-${record.week || 'season'}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="flex items-center space-x-4 p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <span className="text-sm font-bold text-blue-400">{index + 1}</span>
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{record.description}</div>
                      <div className="text-sm text-gray-400">
                        {record.season} {record.week && `• Week ${record.week}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{record.value}</div>
                      <div className="text-xs text-gray-400">
                        {record.type === 'highScore' || record.type === 'lowScore' ? 'points' : 
                         record.type === 'winStreak' || record.type === 'lossStreak' ? 'games' :
                         record.type === 'blowout' || record.type === 'closeGame' ? 'margin' : 'record'}
                      </div>
                    </div>
                  </motion.div>
                ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
} 