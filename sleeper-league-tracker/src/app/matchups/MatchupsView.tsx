'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueMatchups } from '@/lib/api';
import type { SleeperMatchup, SleeperNFLState, SleeperRoster, SleeperUser } from '@/types/sleeper';

interface MatchupsViewProps {
  initialMatchups: SleeperMatchup[];
  nflState: SleeperNFLState;
  users: SleeperUser[];
  rosters: SleeperRoster[];
  leagueId: string;
}

export default function MatchupsView({
  initialMatchups,
  nflState,
  users,
  rosters,
  leagueId,
}: MatchupsViewProps) {
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [matchups, setMatchups] = useState<SleeperMatchup[]>(initialMatchups);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (initialMatchups.length > 0) {
      setMatchups(initialMatchups);
    }
  }, [initialMatchups]);

  const fetchWeekMatchups = async (week: number) => {
    if (week === 1 && initialMatchups.length > 0) {
      setMatchups(initialMatchups);
      return;
    }

    setLoading(true);
    try {
      const newMatchups = await getLeagueMatchups(leagueId, week);
      setMatchups(newMatchups);
    } catch (error) {
      console.error('Failed to fetch matchups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWeekChange = (newWeek: number) => {
    setSelectedWeek(newWeek);
    fetchWeekMatchups(newWeek);
  };

  const matchupPairs = matchups.reduce((acc, matchup) => {
    if (!acc[matchup.matchup_id]) {
      acc[matchup.matchup_id] = [];
    }
    acc[matchup.matchup_id].push(matchup);
    return acc;
  }, {} as Record<number, SleeperMatchup[]>);

  if (!matchups.length) {
    return <div>Loading matchups...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Week {selectedWeek} Matchups</h1>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleWeekChange(Math.max(1, selectedWeek - 1))}
            className="px-3 py-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            disabled={selectedWeek === 1 || loading}
          >
            Previous
          </button>
          <span className="px-3">{selectedWeek}</span>
          <button
            onClick={() => handleWeekChange(Math.min(nflState.week, selectedWeek + 1))}
            className="px-3 py-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            disabled={selectedWeek === nflState.week || loading}
          >
            Next
          </button>
        </div>
      </div>

      <div className={`grid gap-6 md:grid-cols-2 ${loading ? 'opacity-50' : ''}`}>
        {Object.values(matchupPairs).map((pair) => {
          if (pair.length !== 2) return null;

          const [team1, team2] = pair;
          const user1 = users.find(u => 
            rosters.find(r => r.roster_id === team1.roster_id)?.owner_id === u.user_id
          );
          const user2 = users.find(u => 
            rosters.find(r => r.roster_id === team2.roster_id)?.owner_id === u.user_id
          );

          if (!user1 || !user2) return null;

          return (
            <Card key={team1.matchup_id} className="overflow-hidden">
              <CardHeader>
                <CardTitle>Matchup {team1.matchup_id}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between space-x-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <Avatar avatarId={user1.avatar} size={32} />
                      <span className="font-medium truncate">
                        {user1.metadata.team_name || user1.display_name}
                      </span>
                    </div>
                    <div className="mt-2 text-2xl font-bold text-center">
                      {team1.points?.toFixed(2) || '0.00'}
                    </div>
                  </div>

                  <div className="text-xl font-bold text-gray-400">VS</div>

                  <div className="flex-1 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <span className="font-medium truncate">
                        {user2.metadata.team_name || user2.display_name}
                      </span>
                      <Avatar avatarId={user2.avatar} size={32} />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-center">
                      {team2.points?.toFixed(2) || '0.00'}
                    </div>
                  </div>
                </div>

                {team1.points !== null && team2.points !== null && (
                  <div className="mt-4 text-center text-sm">
                    <span className={`font-medium ${
                      team1.points > team2.points ? 'text-green-400' :
                      team1.points < team2.points ? 'text-red-400' :
                      'text-gray-400'
                    }`}>
                      {team1.points > team2.points ? 'Winner!' :
                       team1.points < team2.points ? 'Defeat' :
                       'Tie'}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
} 