import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers } from '@/lib/api';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';
import { LEAGUE_ID } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

export default async function StandingsPage() {
  // Check if league ID is configured
  if (!LEAGUE_ID || LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return (
      <ErrorMessage
        title="Configuration Required"
        message="Please set your Sleeper league ID in the .env.local file. You can find your league ID in the URL when viewing your league on Sleeper."
      />
    );
  }

  try {
    const [league, users, rosters] = await Promise.all([
      getLeagueInfo(LEAGUE_ID),
      getLeagueUsers(LEAGUE_ID),
      getLeagueRosters(LEAGUE_ID),
    ]);

    // Calculate additional stats
    const rosterStats = rosters.map(roster => {
      const user = users.find(u => u.user_id === roster.owner_id);
      const totalGames = roster.settings.wins + roster.settings.losses + roster.settings.ties;
      const winPercentage = totalGames > 0
        ? ((roster.settings.wins + roster.settings.ties * 0.5) / totalGames) * 100
        : 0;
      
      const pointsFor = roster.settings.fpts + roster.settings.fpts_decimal / 100;
      const pointsAgainst = roster.settings.fpts_against + roster.settings.fpts_against_decimal / 100;
      const avgPointsFor = totalGames > 0 ? pointsFor / totalGames : 0;
      const avgPointsAgainst = totalGames > 0 ? pointsAgainst / totalGames : 0;

      return {
        roster,
        user,
        winPercentage,
        avgPointsFor,
        avgPointsAgainst,
        pointsFor,
        pointsAgainst,
      };
    });

    // Sort by wins, then points
    const sortedStats = rosterStats.sort((a, b) => {
      if (b.roster.settings.wins !== a.roster.settings.wins) {
        return b.roster.settings.wins - a.roster.settings.wins;
      }
      return b.pointsFor - a.pointsFor;
    });

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>League Standings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4">Rank</th>
                    <th className="text-left py-3 px-4">Team</th>
                    <th className="text-center py-3 px-4">Record</th>
                    <th className="text-center py-3 px-4">Win %</th>
                    <th className="text-center py-3 px-4">PF</th>
                    <th className="text-center py-3 px-4">PA</th>
                    <th className="text-center py-3 px-4">Avg PF</th>
                    <th className="text-center py-3 px-4">Avg PA</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStats.map((stats, index) => {
                    if (!stats.user) return null;
                    
                    return (
                      <tr
                        key={stats.roster.roster_id}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center">
                            <span className="font-mono text-gray-400">{index + 1}</span>
                            {index < league.settings.playoff_teams && (
                              <ArrowTrendingUpIcon className="w-4 h-4 ml-2 text-green-400" />
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center space-x-3">
                            <Avatar avatarId={stats.user.avatar} size={32} />
                            <span className="font-medium">
                              {stats.user.metadata.team_name || stats.user.display_name}
                            </span>
                          </div>
                        </td>
                        <td className="text-center py-4 px-4">
                          {stats.roster.settings.wins}-{stats.roster.settings.losses}
                          {stats.roster.settings.ties > 0 ? `-${stats.roster.settings.ties}` : ''}
                        </td>
                        <td className="text-center py-4 px-4">
                          {stats.winPercentage.toFixed(1)}%
                        </td>
                        <td className="text-center py-4 px-4">
                          {stats.pointsFor.toFixed(2)}
                        </td>
                        <td className="text-center py-4 px-4">
                          {stats.pointsAgainst.toFixed(2)}
                        </td>
                        <td className="text-center py-4 px-4">
                          {stats.avgPointsFor.toFixed(2)}
                        </td>
                        <td className="text-center py-4 px-4">
                          {stats.avgPointsAgainst.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Highest Scoring Game</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedStats.reduce((max, stats) => {
                const weeklyHigh = Math.max(...rosters.map(r => 
                  r.settings.fpts + r.settings.fpts_decimal / 100
                ));
                return weeklyHigh > max ? weeklyHigh : max;
              }, 0).toFixed(2)} pts
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>League Average</CardTitle>
            </CardHeader>
            <CardContent>
              {(sortedStats.reduce((sum, stats) => sum + stats.avgPointsFor, 0) / sortedStats.length).toFixed(2)} pts/week
            </CardContent>
          </Card>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Failed to fetch standings data:', error);
    return (
      <ErrorMessage
        title="Failed to Load Standings"
        message={error instanceof Error ? error.message : 'An unexpected error occurred while fetching standings data. Please check your league ID and try again.'}
      />
    );
  }
} 