'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueMatchups, getLeagueRosters, getLeagueUsers, getNFLState, getLeagueInfo } from '@/lib/api';
import type { SleeperMatchup, SleeperRoster, SleeperUser } from '@/types/sleeper';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { LEAGUE_ID } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

interface Team {
  name: string;
  avatar: string;
  points: number;
  record: {
    wins: number;
    losses: number;
    ties: number;
  };
}

interface MatchupDisplayData {
  team1: Team;
  team2: Team;
  matchup_id: number;
  isComplete: boolean;
}

export default function MatchupsView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [league, setLeague] = useState<any>(null);
  const [matchups, setMatchups] = useState<SleeperMatchup[]>([]);
  const [users, setUsers] = useState<SleeperUser[]>([]);
  const [rosters, setRosters] = useState<SleeperRoster[]>([]);
  const [currentWeek, setCurrentWeek] = useState(1);

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!LEAGUE_ID || LEAGUE_ID === 'YOUR_LEAGUE_ID') {
        setError('Please set your Sleeper league ID in the .env.local file.');
        setLoading(false);
        return;
      }

      try {
        const [nflState, leagueData, usersData, rostersData] = await Promise.all([
          getNFLState(),
          getLeagueInfo(LEAGUE_ID),
          getLeagueUsers(LEAGUE_ID),
          getLeagueRosters(LEAGUE_ID),
        ]);

        setCurrentWeek(nflState.week);
        setSelectedWeek(nflState.week);
        setLeague(leagueData);
        setUsers(usersData);
        setRosters(rostersData);

        const matchupsData = await getLeagueMatchups(LEAGUE_ID, nflState.week);
        setMatchups(matchupsData);
      } catch (err) {
        setError('Failed to fetch league data. Please check your league ID and try again.');
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

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

        // Find the corresponding rosters and users
        const roster1 = rosters.find(r => r.roster_id === team1.roster_id);
        const roster2 = rosters.find(r => r.roster_id === team2.roster_id);
        const user1 = users.find(u => roster1?.owner_id === u.user_id);
        const user2 = users.find(u => roster2?.owner_id === u.user_id);

        if (!user1 || !user2 || !roster1 || !roster2) return null;

        return {
          team1: {
            name: user1.metadata.team_name || user1.display_name,
            avatar: user1.avatar,
            points: team1.points || 0,
            record: {
              wins: roster1.settings.wins,
              losses: roster1.settings.losses,
              ties: roster1.settings.ties,
            },
          },
          team2: {
            name: user2.metadata.team_name || user2.display_name,
            avatar: user2.avatar,
            points: team2.points || 0,
            record: {
              wins: roster2.settings.wins,
              losses: roster2.settings.losses,
              ties: roster2.settings.ties,
            },
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
        {processedMatchups.map((matchup, index) => (
          <Card key={index}>
            <CardContent className="p-3 md:p-6">
              <div className="space-y-3 md:space-y-6">
                {/* Team 1 */}
                <div className="flex items-center justify-between gap-3 md:gap-4">
                  <div className="flex items-center space-x-2 md:space-x-3">
                    <Avatar avatarId={matchup.team1.avatar} size={32} className="rounded-lg md:w-10 md:h-10" />
                    <div>
                      <p className="font-medium tracking-tight text-sm md:text-base">{matchup.team1.name}</p>
                      <p className="text-xs md:text-sm text-gray-400">
                        {matchup.team1.record.wins}-{matchup.team1.record.losses}
                        {matchup.team1.record.ties > 0 ? `-${matchup.team1.record.ties}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl md:text-2xl font-bold tracking-tight">{matchup.team1.points.toFixed(1)}</p>
                    <p className="text-xs md:text-sm text-gray-400">Points</p>
                  </div>
                </div>

                {/* VS Divider */}
                <div className="relative py-1 md:py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-gray-900 px-2 md:px-3 text-xs md:text-sm font-medium text-gray-400">VS</span>
                  </div>
                </div>

                {/* Team 2 */}
                <div className="flex items-center justify-between gap-3 md:gap-4">
                  <div className="flex items-center space-x-2 md:space-x-3">
                    <Avatar avatarId={matchup.team2.avatar} size={32} className="rounded-lg md:w-10 md:h-10" />
                    <div>
                      <p className="font-medium tracking-tight text-sm md:text-base">{matchup.team2.name}</p>
                      <p className="text-xs md:text-sm text-gray-400">
                        {matchup.team2.record.wins}-{matchup.team2.record.losses}
                        {matchup.team2.record.ties > 0 ? `-${matchup.team2.record.ties}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl md:text-2xl font-bold tracking-tight">{matchup.team2.points.toFixed(1)}</p>
                    <p className="text-xs md:text-sm text-gray-400">Points</p>
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