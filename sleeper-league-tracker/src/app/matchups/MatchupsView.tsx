'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getLeagueMatchups, getNFLState } from '@/lib/api';
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage } from '@/components/ui/LoadingSpinner';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/Select';
import type { SleeperMatchup } from '@/types/sleeper';
import { motion } from 'framer-motion';

interface MatchupsViewProps {
  currentWeek?: number;
}

export default function MatchupsView({ currentWeek: initialWeek }: MatchupsViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [rosters, setRosters] = useState<any[]>([]);
  const [matchups, setMatchups] = useState<SleeperMatchup[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number>(initialWeek || 1);
  const [nflState, setNFLState] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
        setError('Please set your Sleeper league ID in the .env.local file.');
        setLoading(false);
        return;
      }

      try {
        const leagueId = await getCurrentLeagueId();
        const [leagueData, usersData, rostersData, nflStateData] = await Promise.all([
          getLeagueInfo(leagueId),
          getLeagueUsers(leagueId),
          getLeagueRosters(leagueId),
          getNFLState(),
        ]);

        setLeague(leagueData);
        setUsers(usersData);
        setRosters(rostersData);
        setNFLState(nflStateData);

        // Set initial week if not provided
        if (!initialWeek) {
          setSelectedWeek(nflStateData.week || 1);
        }

        // Fetch matchups for the selected week
        const matchupsData = await getLeagueMatchups(leagueId, selectedWeek);
        setMatchups(matchupsData);

      } catch (error) {
        console.error('Failed to fetch data:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch league data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [initialWeek, selectedWeek]);

  if (loading) return <LoadingPage />;
  if (error) return <ErrorMessage title="Error" message={error} />;

  // Group matchups by matchup_id
  const groupedMatchups = matchups.reduce((acc, matchup) => {
    if (!matchup.matchup_id) return acc;
    if (!acc[matchup.matchup_id]) acc[matchup.matchup_id] = [];
    acc[matchup.matchup_id].push(matchup);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-6">
      {/* Week Selector */}
      <Card className="bg-white dark:bg-gray-900">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Week {selectedWeek}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedWeek >= (league?.settings?.playoff_week_start || 15)
                  ? 'Playoffs'
                  : 'Regular Season'}
              </p>
            </div>
            <Select
              value={selectedWeek.toString()}
              onValueChange={(value) => setSelectedWeek(Number(value))}
            >
              <SelectTrigger className="w-[180px]">
                Week {selectedWeek}
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: nflState?.week || 18 }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    Week {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Matchups Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {Object.values(groupedMatchups).map((matchup) => {
          const [team1, team2] = matchup;
          if (!team1 || !team2) return null;

          const roster1 = rosters.find((r) => r.roster_id === team1.roster_id);
          const roster2 = rosters.find((r) => r.roster_id === team2.roster_id);
          const user1 = users.find((u) => u.user_id === roster1?.owner_id);
          const user2 = users.find((u) => u.user_id === roster2?.owner_id);

          if (!roster1 || !roster2 || !user1 || !user2) return null;

          const team1Points = team1.points || 0;
          const team2Points = team2.points || 0;
          const matchupComplete = team1.points !== null && team2.points !== null;
          const team1Winning = team1Points > team2Points;
          const team2Winning = team2Points > team1Points;

          return (
            <Card key={team1.matchup_id} className="overflow-hidden bg-white dark:bg-gray-900">
              <CardHeader className="border-b border-gray-200 pb-2 dark:border-gray-800">
                <CardTitle className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedWeek >= (league?.settings?.playoff_week_start || 15)
                    ? 'Playoff Match'
                    : 'Regular Season Match'}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 p-0">
                {/* Team 1 */}
                <motion.div
                  className={`flex items-center justify-between p-4 transition-colors ${
                    matchupComplete && team1Winning
                      ? 'bg-green-50 dark:bg-green-500/10'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  initial={false}
                  animate={{
                    backgroundColor: matchupComplete && team1Winning
                      ? 'var(--winner-bg)'
                      : 'var(--base-bg)'
                  }}
                >
                  <div className="flex items-center space-x-3">
                    <Avatar
                      avatarId={user1.avatar}
                      size={40}
                      className="rounded-lg ring-2 ring-gray-200 dark:ring-gray-800"
                    />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {user1.metadata?.team_name || user1.display_name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {roster1.settings.wins}-{roster1.settings.losses}
                        {roster1.settings.ties > 0 ? `-${roster1.settings.ties}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className={`text-2xl font-bold ${
                    matchupComplete && team1Winning
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-900 dark:text-white'
                  }`}>
                    {team1Points?.toFixed(2) || '0.00'}
                  </div>
                </motion.div>

                {/* Team 2 */}
                <motion.div
                  className={`flex items-center justify-between p-4 transition-colors ${
                    matchupComplete && team2Winning
                      ? 'bg-green-50 dark:bg-green-500/10'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  initial={false}
                  animate={{
                    backgroundColor: matchupComplete && team2Winning
                      ? 'var(--winner-bg)'
                      : 'var(--base-bg)'
                  }}
                >
                  <div className="flex items-center space-x-3">
                    <Avatar
                      avatarId={user2.avatar}
                      size={40}
                      className="rounded-lg ring-2 ring-gray-200 dark:ring-gray-800"
                    />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {user2.metadata?.team_name || user2.display_name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {roster2.settings.wins}-{roster2.settings.losses}
                        {roster2.settings.ties > 0 ? `-${roster2.settings.ties}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className={`text-2xl font-bold ${
                    matchupComplete && team2Winning
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-900 dark:text-white'
                  }`}>
                    {team2Points?.toFixed(2) || '0.00'}
                  </div>
                </motion.div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
} 