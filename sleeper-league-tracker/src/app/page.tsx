import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getNFLState } from '@/lib/api';
import { TrophyIcon, ChartBarIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { LEAGUE_ID } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

export default async function Home() {
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
    const [league, users, rosters, nflState] = await Promise.all([
      getLeagueInfo(LEAGUE_ID),
      getLeagueUsers(LEAGUE_ID),
      getLeagueRosters(LEAGUE_ID),
      getNFLState(),
    ]);

    // Sort rosters by wins, then points
    const sortedRosters = [...rosters].sort((a, b) => {
      if (b.settings.wins !== a.settings.wins) {
        return b.settings.wins - a.settings.wins;
      }
      return (b.settings.fpts + b.settings.fpts_decimal / 100) - 
             (a.settings.fpts + a.settings.fpts_decimal / 100);
    });

    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center space-x-4 pt-6">
              <div className="rounded-full bg-blue-500/10 p-3">
                <TrophyIcon className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Current Season</p>
                <p className="text-2xl font-bold">{league.season}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center space-x-4 pt-6">
              <div className="rounded-full bg-purple-500/10 p-3">
                <UserGroupIcon className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Teams</p>
                <p className="text-2xl font-bold">{league.total_rosters}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center space-x-4 pt-6">
              <div className="rounded-full bg-green-500/10 p-3">
                <ChartBarIcon className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Current Week</p>
                <p className="text-2xl font-bold">{nflState.week}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Current Standings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sortedRosters.map((roster, index) => {
                const user = users.find(u => u.user_id === roster.owner_id);
                if (!user) return null;

                const fpts = roster.settings.fpts + roster.settings.fpts_decimal / 100;

                return (
                  <div
                    key={roster.roster_id}
                    className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-8 text-center font-bold text-gray-400">
                        {index + 1}
                      </div>
                      <Avatar avatarId={user.avatar} size={40} />
                      <div>
                        <p className="font-medium">
                          {user.metadata.team_name || user.display_name}
                        </p>
                        <p className="text-sm text-gray-400">
                          {roster.settings.wins}-{roster.settings.losses}
                          {roster.settings.ties > 0 ? `-${roster.settings.ties}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{fpts.toFixed(2)}</p>
                      <p className="text-sm text-gray-400">Points For</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    console.error('Failed to fetch league data:', error);
    return (
      <ErrorMessage
        title="Failed to Load League Data"
        message={error instanceof Error ? error.message : 'An unexpected error occurred while fetching league data. Please check your league ID and try again.'}
      />
    );
  }
}
