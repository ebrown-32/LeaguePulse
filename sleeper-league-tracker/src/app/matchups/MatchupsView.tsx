'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueMatchups, getLeagueRosters, getLeagueUsers } from '@/lib/api';
import type { SleeperMatchup, SleeperRoster, SleeperUser } from '@/types/sleeper';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { LEAGUE_ID } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

interface MatchupsViewProps {
  currentWeek: number;
}

interface MatchupDisplayData {
  team1: {
    name: string;
    avatar: string;
    points: number;
  };
  team2: {
    name: string;
    avatar: string;
    points: number;
  };
  matchup_id: number;
  isComplete: boolean;
}

export default function MatchupsView({ currentWeek }: MatchupsViewProps) {
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [matchups, setMatchups] = useState<SleeperMatchup[]>([]);
  const [users, setUsers] = useState<SleeperUser[]>([]);
  const [rosters, setRosters] = useState<SleeperRoster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      if (!LEAGUE_ID || LEAGUE_ID === 'YOUR_LEAGUE_ID') {
        setError('Please set your Sleeper league ID in the .env.local file.');
        setLoading(false);
        return;
      }

      try {
        const [usersData, rostersData, matchupsData] = await Promise.all([
          getLeagueUsers(LEAGUE_ID),
          getLeagueRosters(LEAGUE_ID),
          getLeagueMatchups(LEAGUE_ID, 1), // Always fetch week 1 initially
        ]);

        setUsers(usersData);
        setRosters(rostersData);
        setMatchups(matchupsData);
      } catch (err) {
        setError('Failed to fetch league data. Please check your league ID and try again.');
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); // Remove currentWeek dependency since we want to start with week 1

  const fetchWeekMatchups = async (week: number) => {
    setLoading(true);
    try {
      const newMatchups = await getLeagueMatchups(LEAGUE_ID, week);
      setMatchups(newMatchups);
    } catch (error) {
      console.error('Failed to fetch matchups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWeekChange = (week: string) => {
    const newWeek = parseInt(week, 10);
    setSelectedWeek(newWeek);
    fetchWeekMatchups(newWeek);
  };

  const processMatchups = (): MatchupDisplayData[] => {
    // First, group matchups by matchup_id
    const matchupPairs = matchups.reduce((acc, matchup) => {
      // Ensure matchup_id is not null/undefined and convert to string to be safe
      const id = matchup.matchup_id?.toString() || 'none';
      if (!acc[id]) {
        acc[id] = [];
      }
      acc[id].push(matchup);
      return acc;
    }, {} as Record<string, SleeperMatchup[]>);

    // Process each pair
    return Object.entries(matchupPairs)
      .filter(([id, pair]) => id !== 'none' && pair.length === 2) // Ensure valid pairs only
      .map(([_, pair]) => {
        // Sort by roster_id to ensure consistent ordering
        const [team1, team2] = pair.sort((a, b) => a.roster_id - b.roster_id);

        // Find the corresponding users
        const user1 = users.find(u => 
          rosters.find(r => r.roster_id === team1.roster_id)?.owner_id === u.user_id
        );
        const user2 = users.find(u => 
          rosters.find(r => r.roster_id === team2.roster_id)?.owner_id === u.user_id
        );

        if (!user1 || !user2) return null;

        return {
          team1: {
            name: user1.metadata.team_name || user1.display_name,
            avatar: user1.avatar,
            points: team1.points || 0,
          },
          team2: {
            name: user2.metadata.team_name || user2.display_name,
            avatar: user2.avatar,
            points: team2.points || 0,
          },
          matchup_id: team1.matchup_id,
          isComplete: team1.points !== null && team2.points !== null,
        };
      })
      .filter(Boolean) as MatchupDisplayData[];
  };

  if (error) {
    return <ErrorMessage title="Error" message={error} />;
  }

  if (loading && !matchups.length) {
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

  const processedMatchups = processMatchups();

  return (
    <div className="space-y-8">
      {/* Week Selection */}
      <div className="flex items-center justify-end">
        <div className="w-40">
          <Select
            value={selectedWeek.toString()}
            onValueChange={handleWeekChange}
          >
            <SelectTrigger>
              <SelectValue>Week {selectedWeek}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
                <SelectItem key={week} value={week.toString()}>
                  Week {week}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Matchups */}
      <div className={`grid gap-6 md:grid-cols-2 ${loading ? 'opacity-50' : ''}`}>
        {processedMatchups.map((matchup) => (
          <Card key={matchup.matchup_id} className="overflow-hidden hover:bg-white/5 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-x-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <Avatar avatarId={matchup.team1.avatar} size={40} />
                    <div>
                      <div className="font-medium">{matchup.team1.name}</div>
                      <div className="text-3xl font-bold mt-1">
                        {matchup.team1.points.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center px-4">
                  {matchup.isComplete && (
                    <div className="text-sm font-medium text-gray-400 mb-1">Final</div>
                  )}
                  <div className="text-xl font-bold text-gray-400">VS</div>
                </div>

                <div className="flex-1 text-right">
                  <div className="flex items-center justify-end space-x-3">
                    <div>
                      <div className="font-medium">{matchup.team2.name}</div>
                      <div className="text-3xl font-bold mt-1">
                        {matchup.team2.points.toFixed(2)}
                      </div>
                    </div>
                    <Avatar avatarId={matchup.team2.avatar} size={40} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
} 