import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getAggregatedUserStats, getAllLeagueSeasons } from '@/lib/api';
import { LEAGUE_ID } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { TrophyIcon, ChartBarIcon, CalendarIcon } from '@heroicons/react/24/outline';

export default async function AllTimePage() {
  if (!LEAGUE_ID || LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return (
      <ErrorMessage
        title="Configuration Required"
        message="Please set your Sleeper league ID in the .env.local file. You can find your league ID in the URL when viewing your league on Sleeper."
      />
    );
  }

  try {
    const [stats, seasons] = await Promise.all([
      getAggregatedUserStats(LEAGUE_ID),
      getAllLeagueSeasons(LEAGUE_ID),
    ]);

    // Sort stats by various metrics
    const byWinPct = [...stats].sort((a, b) => b.winPercentage - a.winPercentage);
    const byChampionships = [...stats].sort((a, b) => b.championships - a.championships);
    const byPoints = [...stats].sort((a, b) => b.averagePointsPerGame - a.averagePointsPerGame);

    return (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center space-x-4 pt-6">
              <div className="rounded-full bg-yellow-500/10 p-3">
                <TrophyIcon className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Seasons</p>
                <p className="text-2xl font-bold">{seasons.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center space-x-4 pt-6">
              <div className="rounded-full bg-purple-500/10 p-3">
                <ChartBarIcon className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Games</p>
                <p className="text-2xl font-bold">
                  {stats.reduce((sum, user) => 
                    sum + user.totalWins + user.totalLosses + user.totalTies, 0
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center space-x-4 pt-6">
              <div className="rounded-full bg-blue-500/10 p-3">
                <CalendarIcon className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">First Season</p>
                <p className="text-2xl font-bold">{seasons[0]?.season || 'N/A'}</p>
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
                    className="flex items-center justify-between p-4 rounded-lg bg-white/5"
                  >
                    <div className="flex items-center space-x-4">
                      <Avatar avatarId={user.avatar} size={40} />
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
                    className="flex items-center justify-between p-4 rounded-lg bg-white/5"
                  >
                    <div className="flex items-center space-x-4">
                      <Avatar avatarId={user.avatar} size={40} />
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
                    className="flex items-center justify-between p-4 rounded-lg bg-white/5"
                  >
                    <div className="flex items-center space-x-4">
                      <Avatar avatarId={user.avatar} size={40} />
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
  } catch (error) {
    console.error('Failed to fetch all-time stats:', error);
    return (
      <ErrorMessage
        title="Failed to Load All-Time Stats"
        message={error instanceof Error ? error.message : 'An unexpected error occurred while fetching all-time stats. Please check your league ID and try again.'}
      />
    );
  }
} 