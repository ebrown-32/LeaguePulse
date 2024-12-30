import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers } from '@/lib/api';
import { TrophyIcon } from '@heroicons/react/24/outline';
import { LEAGUE_ID } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

interface Record {
  value: number;
  user: {
    name: string;
    avatar: string;
  };
  detail: string;
}

export default async function RecordsPage() {
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

    // Calculate records
    const records: { [key: string]: Record } = {
      highestScore: {
        value: 0,
        user: { name: '', avatar: '' },
        detail: '',
      },
      mostWins: {
        value: 0,
        user: { name: '', avatar: '' },
        detail: '',
      },
      bestWinPercentage: {
        value: 0,
        user: { name: '', avatar: '' },
        detail: '',
      },
      mostPointsFor: {
        value: 0,
        user: { name: '', avatar: '' },
        detail: '',
      },
    };

    // Process rosters to find records
    rosters.forEach(roster => {
      const user = users.find(u => u.user_id === roster.owner_id);
      if (!user) return;

      const pointsFor = roster.settings.fpts + roster.settings.fpts_decimal / 100;
      const totalGames = roster.settings.wins + roster.settings.losses + roster.settings.ties;
      const winPercentage = totalGames > 0
        ? ((roster.settings.wins + roster.settings.ties * 0.5) / totalGames) * 100
        : 0;

      // Update records if necessary
      if (pointsFor > records.highestScore.value) {
        records.highestScore = {
          value: pointsFor,
          user: {
            name: user.metadata.team_name || user.display_name,
            avatar: user.avatar,
          },
          detail: `${pointsFor.toFixed(2)} points`,
        };
      }

      if (roster.settings.wins > records.mostWins.value) {
        records.mostWins = {
          value: roster.settings.wins,
          user: {
            name: user.metadata.team_name || user.display_name,
            avatar: user.avatar,
          },
          detail: `${roster.settings.wins} wins`,
        };
      }

      if (winPercentage > records.bestWinPercentage.value) {
        records.bestWinPercentage = {
          value: winPercentage,
          user: {
            name: user.metadata.team_name || user.display_name,
            avatar: user.avatar,
          },
          detail: `${winPercentage.toFixed(1)}% win rate`,
        };
      }

      if (pointsFor > records.mostPointsFor.value) {
        records.mostPointsFor = {
          value: pointsFor,
          user: {
            name: user.metadata.team_name || user.display_name,
            avatar: user.avatar,
          },
          detail: `${pointsFor.toFixed(2)} total points`,
        };
      }
    });

    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">League Records</h1>
        
        <div className="grid gap-6 md:grid-cols-2">
          {Object.entries(records).map(([key, record]) => (
            <Card key={key} className="transform transition-all hover:scale-[1.02]">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrophyIcon className="w-5 h-5 text-yellow-500" />
                  <span>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-4">
                  <Avatar avatarId={record.user.avatar} size={48} />
                  <div>
                    <div className="font-medium">{record.user.name}</div>
                    <div className="text-2xl font-bold bg-gradient-to-r from-yellow-500 to-yellow-300 bg-clip-text text-transparent">
                      {record.detail}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>League Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-gray-400">League Name</p>
                <p className="text-lg font-medium">{league.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Season</p>
                <p className="text-lg font-medium">{league.season}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Teams</p>
                <p className="text-lg font-medium">{league.total_rosters}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    console.error('Failed to fetch records data:', error);
    return (
      <ErrorMessage
        title="Failed to Load Records"
        message={error instanceof Error ? error.message : 'An unexpected error occurred while fetching records data. Please check your league ID and try again.'}
      />
    );
  }
} 