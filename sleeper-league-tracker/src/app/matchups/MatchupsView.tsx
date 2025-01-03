'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getLeagueMatchups, getNFLState, getAllLeagueSeasons, getAllLinkedLeagueIds } from '@/lib/api';
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage, LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/Select';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { getDefaultSeason } from '@/lib/utils';
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
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [seasonRosters, setSeasonRosters] = useState<any[]>([]);
  const [loadingSeasonData, setLoadingSeasonData] = useState(false);

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
        setError('Please set your Sleeper league ID in the .env.local file.');
        setLoading(false);
        return;
      }

      try {
        const leagueId = await getCurrentLeagueId();
        
        // First, get the league info and seasons
        const [leagueData, allSeasons] = await Promise.all([
          getLeagueInfo(leagueId),
          getAllLeagueSeasons(leagueId),
        ]);

        // Get the default season based on league data
        const defaultSeason = getDefaultSeason(
          allSeasons,
          leagueData.draft_id
        );

        // Then fetch the rest of the data
        const [usersData, rostersData, nflStateData] = await Promise.all([
          getLeagueUsers(leagueId),
          getLeagueRosters(leagueId),
          getNFLState(),
        ]);
        
        setLeague(leagueData);
        setUsers(usersData);
        setRosters(rostersData);
        setNFLState(nflStateData);
        setSeasons(allSeasons);
        setSelectedSeason(defaultSeason);
        setSeasonRosters(rostersData);

        // Set initial week if not provided
        if (!initialWeek) {
          // If in season, use current week, otherwise default to week 1
          const currentWeek = nflStateData.week || 1;
          setSelectedWeek(leagueData.status === 'in_season' ? currentWeek : 1);
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
  }, [initialWeek]);

  // Fetch rosters and matchups when season changes
  useEffect(() => {
    const fetchSeasonData = async () => {
      if (!selectedSeason || !league) return;
      
      setLoadingSeasonData(true);
      try {
        // Get all linked league IDs
        const linkedLeagues = await getAllLinkedLeagueIds(league.league_id);
        
        // Find the league ID for the selected season
        const seasonLeagueId = await (async () => {
          for (const leagueId of linkedLeagues) {
            const leagueInfo = await getLeagueInfo(leagueId);
            if (leagueInfo.season === selectedSeason) {
              return leagueId;
            }
          }
          return league.league_id; // Fallback to current league
        })();

        // Fetch rosters and matchups for the correct league
        const [seasonRostersData, matchupsData] = await Promise.all([
          getLeagueRosters(seasonLeagueId),
          getLeagueMatchups(seasonLeagueId, selectedWeek)
        ]);
        
        setSeasonRosters(seasonRostersData);
        setMatchups(matchupsData);
      } catch (error) {
        console.error('Failed to fetch season data:', error);
        // Fallback to current data if fetch fails
        setSeasonRosters(rosters);
      } finally {
        setLoadingSeasonData(false);
      }
    };

    fetchSeasonData();
  }, [selectedSeason, selectedWeek, league, rosters]);

  if (loading) return <LoadingPage />;
  if (error) return <ErrorMessage title="Error" message={error} />;
  if (!league || !users.length || !rosters.length) return null;

  // Group matchups by matchup_id
  const groupedMatchups = matchups.reduce((acc, matchup) => {
    if (!matchup.matchup_id) return acc;
    if (!acc[matchup.matchup_id]) acc[matchup.matchup_id] = [];
    acc[matchup.matchup_id].push(matchup);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-6">
      {/* Season and Week Selector */}
      <Card className="bg-white dark:bg-gray-900">
        <CardContent className="py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Week {selectedWeek}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedWeek >= (league?.settings?.playoff_week_start || 15)
                  ? 'Playoffs'
                  : 'Regular Season'}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <SeasonSelect
                seasons={seasons}
                selectedSeason={selectedSeason}
                onSeasonChange={setSelectedSeason}
                className="w-[140px]"
              />
              <Select
                value={selectedWeek.toString()}
                onValueChange={(value) => setSelectedWeek(Number(value))}
              >
                <SelectTrigger className="w-[180px]">
                  Week {selectedWeek}
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 18 }, (_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      Week {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Matchups Grid */}
      {loadingSeasonData ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {Object.values(groupedMatchups).map((matchup) => {
            const [team1, team2] = matchup;
            if (!team1 || !team2) return null;

            const roster1 = seasonRosters.find((r) => r.roster_id === team1.roster_id);
            const roster2 = seasonRosters.find((r) => r.roster_id === team2.roster_id);
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
      )}
    </div>
  );
} 