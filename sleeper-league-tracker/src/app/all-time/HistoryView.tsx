'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getAggregatedUserStats, getAllLeagueSeasons, getLeagueInfo } from '@/lib/api';
import { INITIAL_LEAGUE_ID, getLinkedLeagueIds } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { TrophyIcon, ChartBarIcon, CalendarIcon } from '@heroicons/react/24/outline';

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
}

export default function HistoryView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
        setError('Please set your Sleeper league ID in the .env.local file.');
        setLoading(false);
        return;
      }

      try {
        // Get all linked league IDs
        const leagueIds = await getLinkedLeagueIds();
        if (!leagueIds.length) {
          throw new Error('No league IDs found');
        }

        // Get stats and seasons data
        const [statsData, seasonsData] = await Promise.all([
          getAggregatedUserStats(leagueIds[0]), // Use most recent league ID
          getAllLeagueSeasons(leagueIds[0]),
        ]);

        setStats(statsData);
        setSeasons(seasonsData);
      } catch (err) {
        setError('Failed to fetch league history. Please check your league ID and try again.');
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (error) {
    return <ErrorMessage title="Error" message={error} />;
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-white/10 rounded w-1/4"></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-32 bg-white/10 rounded"></div>
              <div className="h-32 bg-white/10 rounded"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort stats by various metrics
  const byWinPct = [...stats].sort((a, b) => b.winPercentage - a.winPercentage);
  const byChampionships = [...stats].sort((a, b) => b.championships - a.championships);
  const byPoints = [...stats].sort((a, b) => b.averagePointsPerGame - a.averagePointsPerGame);

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center space-x-4 pt-6">
            <div className="rounded-xl bg-yellow-500/10 p-3">
              <TrophyIcon className="h-6 w-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Seasons</p>
              <p className="text-2xl font-bold tracking-tight">{seasons.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center space-x-4 pt-6">
            <div className="rounded-xl bg-purple-500/10 p-3">
              <ChartBarIcon className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Games</p>
              <p className="text-2xl font-bold tracking-tight">
                {stats.reduce((sum, user) => 
                  sum + user.totalWins + user.totalLosses + user.totalTies, 0
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center space-x-4 pt-6">
            <div className="rounded-xl bg-blue-500/10 p-3">
              <CalendarIcon className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400">First Season</p>
              <p className="text-2xl font-bold tracking-tight">{seasons[seasons.length - 1] || 'N/A'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Best Win Percentage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {byWinPct.slice(0, 5).map((user) => (
                <div
                  key={user.userId}
                  className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <Avatar avatarId={user.avatar} size={40} className="rounded-lg" />
                    <div>
                      <p className="font-medium">{user.username}</p>
                      <p className="text-sm text-gray-400">
                        {user.totalWins}-{user.totalLosses}
                        {user.totalTies > 0 ? `-${user.totalTies}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{user.winPercentage.toFixed(1)}%</p>
                    <p className="text-sm text-gray-400">Win Rate</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most Championships</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {byChampionships.slice(0, 5).map((user) => (
                <div
                  key={user.userId}
                  className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <Avatar avatarId={user.avatar} size={40} className="rounded-lg" />
                    <div>
                      <p className="font-medium">{user.username}</p>
                      <p className="text-sm text-gray-400">
                        {user.playoffAppearances} Playoff Appearances
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{user.championships}</p>
                    <p className="text-sm text-gray-400">Championships</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Highest Scoring</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {byPoints.slice(0, 5).map((user) => (
                <div
                  key={user.userId}
                  className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <Avatar avatarId={user.avatar} size={40} className="rounded-lg" />
                    <div>
                      <p className="font-medium">{user.username}</p>
                      <p className="text-sm text-gray-400">
                        {user.totalPoints.toFixed(2)} Total Points
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{user.averagePointsPerGame.toFixed(2)}</p>
                    <p className="text-sm text-gray-400">Points Per Game</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 