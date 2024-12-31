import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { PageHeader } from '@/components/ui/PageHeader';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getNFLState } from '@/lib/api';
import { 
  TrophyIcon, 
  ChartBarIcon, 
  UserGroupIcon,
  CalendarIcon,
  CogIcon,
  UserIcon,
  HomeIcon,
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="space-y-6 pb-20 md:pb-8">
          {/* Page Header */}
          <PageHeader
            icon={<HomeIcon className="h-6 w-6 text-gray-400" />}
            title={`${league.name}: Overview`}
            subtitle={`Season ${league.season}`}
            action={commissioner && (
              <div className="flex items-center space-x-2 text-sm text-gray-400 bg-white/5 px-3 py-2 rounded-lg">
                <UserIcon className="h-4 w-4" />
                <span>Commissioner: {commissioner.display_name}</span>
              </div>
            )}
          />

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
            <Card>
              <CardContent className="flex items-center space-x-3 p-4 md:pt-6">
                <div className="rounded-xl bg-blue-500/10 p-2.5 md:p-3">
                  <TrophyIcon className="h-5 w-5 md:h-6 md:w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-gray-400">Status</p>
                  <p className="text-lg md:text-2xl font-bold tracking-tight">{formatLeagueStatus(league.status)}</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="flex items-center space-x-3 p-4 md:pt-6">
                <div className="rounded-xl bg-purple-500/10 p-2.5 md:p-3">
                  <UserGroupIcon className="h-5 w-5 md:h-6 md:w-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-gray-400">Teams</p>
                  <p className="text-lg md:text-2xl font-bold tracking-tight">{league.total_rosters}</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="flex items-center space-x-3 p-4 md:pt-6">
                <div className="rounded-xl bg-green-500/10 p-2.5 md:p-3">
                  <ChartBarIcon className="h-5 w-5 md:h-6 md:w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-gray-400">Week</p>
                  <p className="text-lg md:text-2xl font-bold tracking-tight">{nflState.week}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center space-x-3 p-4 md:pt-6">
                <div className="rounded-xl bg-orange-500/10 p-2.5 md:p-3">
                  <CalendarIcon className="h-5 w-5 md:h-6 md:w-6 text-orange-500" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-gray-400">Playoff Teams</p>
                  <p className="text-lg md:text-2xl font-bold tracking-tight">{league.settings.playoff_teams}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* League Settings */}
          <Card>
            <CardHeader className="pb-2 md:pb-4">
              <div className="flex items-center space-x-2">
                <CogIcon className="h-5 w-5 text-gray-400" />
                <CardTitle>League Settings</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:gap-6 md:grid-cols-2">
                <div className="p-4 rounded-xl bg-white/5">
                  <h3 className="font-medium mb-2 text-sm md:text-base">Roster Positions</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {formatRosterPositions(league.roster_positions)}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white/5">
                  <h3 className="font-medium mb-2 text-sm md:text-base">Scoring Type</h3>
                  <p className="text-gray-400 text-sm capitalize">
                    {league.scoring_settings.rec ? 'PPR' : 'Standard'}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white/5">
                  <h3 className="font-medium mb-2 text-sm md:text-base">Playoff Weeks</h3>
                  <p className="text-gray-400 text-sm">
                    Weeks {league.settings.playoff_week_start} - {league.settings.playoff_week_start + league.settings.playoff_teams - 2}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white/5">
                  <h3 className="font-medium mb-2 text-sm md:text-base">Trade Deadline</h3>
                  <p className="text-gray-400 text-sm">
                    Week {league.settings.trade_deadline || 'None'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Standings */}
          <Card>
            <CardHeader className="pb-2 md:pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-8">
                <div className="flex items-center space-x-2">
                  <TrophyIcon className="h-5 w-5 text-gray-400" />
                  <CardTitle>League Standings</CardTitle>
                </div>
                <div className="text-sm text-gray-400 md:bg-white/5 md:px-4 md:py-2 md:rounded-lg">
                  Week {nflState.week}
                </div>
              </div>
            </CardHeader>
            <CardContent className="md:pt-2">
              {/* Table Header */}
              <div className="hidden md:grid md:grid-cols-[3rem_1fr_8rem_5rem_6rem_6rem] gap-2 px-4 py-2 text-sm font-medium text-gray-400">
                <div>Rank</div>
                <div>Team</div>
                <div className="text-center">Record</div>
                <div className="text-center">Win%</div>
                <div className="text-center">PF</div>
                <div className="text-center">PA</div>
              </div>
              
              <div className="space-y-2 md:space-y-3">
                {sortedRosters.map((roster, index) => {
                  const user = users.find(u => u.user_id === roster.owner_id);
                  if (!user) return null;

                  const fpts = roster.settings.fpts + roster.settings.fpts_decimal / 100;
                  const fptsAgainst = roster.settings.fpts_against + roster.settings.fpts_against_decimal / 100;
                  const winPct = ((roster.settings.wins + roster.settings.ties * 0.5) / 
                                (roster.settings.wins + roster.settings.losses + roster.settings.ties) * 100) || 0;
                  
                  // Determine playoff status
                  const isInPlayoffs = index < league.settings.playoff_teams;
                  const isOnBubble = index === league.settings.playoff_teams;

                  return (
                    <div
                      key={roster.roster_id}
                      className={`
                        relative overflow-hidden rounded-xl transition-all
                        ${isInPlayoffs ? 'bg-blue-500/10 hover:bg-blue-500/20' : 
                          isOnBubble ? 'bg-orange-500/10 hover:bg-orange-500/20' : 
                          'bg-white/5 hover:bg-white/10'}
                      `}
                    >
                      {/* Mobile Layout */}
                      <div className="md:hidden p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`
                              w-7 h-7 flex items-center justify-center rounded-lg text-sm font-bold
                              ${isInPlayoffs ? 'bg-blue-500/20 text-blue-400' : 
                                isOnBubble ? 'bg-orange-500/20 text-orange-400' : 
                                'bg-gray-500/20 text-gray-400'}
                            `}>
                              {index + 1}
                            </div>
                            <Avatar avatarId={user.avatar} size={36} className="rounded-lg" />
                            <div>
                              <p className="font-medium tracking-tight">{user.metadata.team_name || user.display_name}</p>
                              <p className="text-sm text-gray-400">
                                {roster.settings.wins}-{roster.settings.losses}
                                {roster.settings.ties > 0 ? `-${roster.settings.ties}` : ''} 
                                <span className="ml-1 text-xs">({winPct.toFixed(1)}%)</span>
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm bg-white/5 rounded-lg p-2">
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">Points For</p>
                            <p className="font-medium tracking-tight">{fpts.toFixed(1)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">Points Against</p>
                            <p className="font-medium tracking-tight">{fptsAgainst.toFixed(1)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Desktop Layout */}
                      <div className="hidden md:grid md:grid-cols-[3rem_1fr_8rem_5rem_6rem_6rem] gap-2 items-center px-4 py-3">
                        <div className={`
                          w-7 h-7 flex items-center justify-center rounded-lg text-sm font-bold
                          ${isInPlayoffs ? 'bg-blue-500/20 text-blue-400' : 
                            isOnBubble ? 'bg-orange-500/20 text-orange-400' : 
                            'bg-gray-500/20 text-gray-400'}
                        `}>
                          {index + 1}
                        </div>
                        <div className="flex items-center space-x-3 min-w-0">
                          <Avatar avatarId={user.avatar} size={36} className="rounded-lg flex-shrink-0" />
                          <span className="font-medium tracking-tight truncate">{user.metadata.team_name || user.display_name}</span>
                        </div>
                        <div className="text-center whitespace-nowrap font-medium">
                          {roster.settings.wins}-{roster.settings.losses}
                          {roster.settings.ties > 0 ? `-${roster.settings.ties}` : ''}
                        </div>
                        <div className="text-center font-medium">{winPct.toFixed(1)}%</div>
                        <div className="text-center font-medium">{fpts.toFixed(1)}</div>
                        <div className="text-center font-medium">{fptsAgainst.toFixed(1)}</div>
                      </div>

                      {/* Playoff Indicator */}
                      {isInPlayoffs && (
                        <div className="absolute top-0 right-0 px-2 py-1 text-[10px] font-bold text-blue-400 bg-blue-500/20 rounded-bl-lg">
                          PLAYOFF SPOT
                        </div>
                      )}
                      {isOnBubble && (
                        <div className="absolute top-0 right-0 px-2 py-1 text-[10px] font-bold text-orange-400 bg-orange-500/20 rounded-bl-lg">
                          BUBBLE
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
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
