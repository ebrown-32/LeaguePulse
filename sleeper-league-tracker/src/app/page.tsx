import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getNFLState } from '@/lib/api';
import { 
  TrophyIcon, 
  ChartBarIcon, 
  UserGroupIcon,
  CalendarIcon,
  CogIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import { LEAGUE_ID } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

function formatRosterPositions(positions: string[]): string {
  const counts = positions.reduce((acc: { [key: string]: number }, pos) => {
    acc[pos] = (acc[pos] || 0) + 1;
    return acc;
  }, {});
  
  return Object.entries(counts)
    .map(([pos, count]) => `${pos}${count > 1 ? ` x${count}` : ''}`)
    .join(', ');
}

function formatLeagueStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'pre_draft': 'Pre-Draft',
    'drafting': 'Drafting',
    'in_season': 'In Season',
    'post_season': 'Postseason',
    'complete': 'Complete',
  };
  return statusMap[status] || status;
}

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

    // Find commissioner
    const commissioner = users.find(user => user.is_owner);

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
        {/* League Header */}
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div className="flex items-center space-x-4">
              <Avatar avatarId={league.avatar} size={64} />
              <div>
                <h1 className="text-2xl font-bold">{league.name}</h1>
                <p className="text-gray-400">Season {league.season}</p>
              </div>
            </div>
            {commissioner && (
              <div className="flex items-center space-x-2 text-sm text-gray-400">
                <UserIcon className="h-4 w-4" />
                <span>Commissioner: {commissioner.display_name}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid gap-6 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center space-x-4 pt-6">
              <div className="rounded-full bg-blue-500/10 p-3">
                <TrophyIcon className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Status</p>
                <p className="text-2xl font-bold">{formatLeagueStatus(league.status)}</p>
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
                <p className="text-sm text-gray-400">Week</p>
                <p className="text-2xl font-bold">{nflState.week}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center space-x-4 pt-6">
              <div className="rounded-full bg-orange-500/10 p-3">
                <CalendarIcon className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Playoff Teams</p>
                <p className="text-2xl font-bold">{league.settings.playoff_teams}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* League Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <CogIcon className="h-5 w-5 text-gray-400" />
              <CardTitle>League Settings</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="font-medium mb-2">Roster Positions</h3>
                <p className="text-gray-400">
                  {formatRosterPositions(league.roster_positions)}
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Scoring Type</h3>
                <p className="text-gray-400 capitalize">
                  {league.scoring_settings.rec ? 'PPR' : 'Standard'}
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Playoff Weeks</h3>
                <p className="text-gray-400">
                  Weeks {league.settings.playoff_week_start} - {league.settings.playoff_week_start + league.settings.playoff_teams - 2}
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Trade Deadline</h3>
                <p className="text-gray-400">
                  Week {league.settings.trade_deadline || 'None'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Standings */}
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
                const fptsAgainst = roster.settings.fpts_against + roster.settings.fpts_against_decimal / 100;
                const winPct = ((roster.settings.wins + roster.settings.ties * 0.5) / 
                              (roster.settings.wins + roster.settings.losses + roster.settings.ties) * 100) || 0;

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
                          ({winPct.toFixed(1)}%)
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-8 text-right">
                      <div>
                        <p className="font-medium">{fpts.toFixed(2)}</p>
                        <p className="text-sm text-gray-400">Points For</p>
                      </div>
                      <div>
                        <p className="font-medium">{fptsAgainst.toFixed(2)}</p>
                        <p className="text-sm text-gray-400">Points Against</p>
                      </div>
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
