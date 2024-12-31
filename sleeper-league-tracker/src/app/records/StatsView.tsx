'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getLeagueMatchups } from '@/lib/api';
import { 
  FireIcon,
  BoltIcon,
  ChartBarIcon,
  SparklesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import { LEAGUE_ID } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Tooltip } from '@/components/ui/Tooltip';

interface StatsViewProps {
  currentWeek: number;
}

interface TeamPerformance {
  rosterId: number;
  userId: string;
  name: string;
  avatar: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  weeklyScores: number[];
  highScore: number;
  lowScore: number;
  avgScore: number;
  consistency: number; // standard deviation of scores
  winStreak: number;
  currentStreak: number;
  closeGames: number; // games decided by < 10 points
  blowouts: number; // games won by > 30 points
  weeklyRank: number[]; // rank each week
}

function calculateConsistency(scores: number[]): number {
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const squareDiffs = scores.map(score => Math.pow(score - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff);
}

function calculateStreak(results: ('W' | 'L' | 'T')[]): { current: number; longest: number } {
  let current = 0;
  let longest = 0;
  let currentType: 'W' | 'L' | 'T' | null = null;

  for (const result of results) {
    if (result === currentType) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
      currentType = result;
    }
  }

  return { current, longest };
}

export default function StatsView({ currentWeek }: StatsViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<any>(null);
  const [teamPerformances, setTeamPerformances] = useState<TeamPerformance[]>([]);
  const [leagueAvgScore, setLeagueAvgScore] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      if (!LEAGUE_ID || LEAGUE_ID === 'YOUR_LEAGUE_ID') {
        setError('Please set your Sleeper league ID in the .env.local file.');
        setLoading(false);
        return;
      }

      try {
        const [leagueData, users, rosters] = await Promise.all([
          getLeagueInfo(LEAGUE_ID),
          getLeagueUsers(LEAGUE_ID),
          getLeagueRosters(LEAGUE_ID),
        ]);

        setLeague(leagueData);

        // Get all matchups for the season so far
        const matchupPromises = Array.from({ length: currentWeek }, (_, i) => 
          getLeagueMatchups(LEAGUE_ID, i + 1)
        );
        const weeklyMatchups = await Promise.all(matchupPromises);

        // Process team performances
        const performances = rosters.map(roster => {
          const user = users.find(u => u.user_id === roster.owner_id)!;
          const weeklyScores: number[] = [];
          const weeklyRank: number[] = [];
          let winStreak = 0;
          let currentStreak = 0;
          let closeGames = 0;
          let blowouts = 0;

          // Process weekly matchups
          weeklyMatchups.forEach((week, weekIndex) => {
            const matchup = week.find(m => m.roster_id === roster.roster_id);
            if (!matchup) return;

            weeklyScores.push(matchup.points);

            // Calculate weekly rank
            const weekScores = week.map(m => m.points);
            const rank = weekScores.filter(score => score > matchup.points).length + 1;
            weeklyRank.push(rank);

            // Find opponent's score
            const opponent = week.find(m => 
              m.matchup_id === matchup.matchup_id && m.roster_id !== matchup.roster_id
            );
            if (opponent) {
              const diff = Math.abs(matchup.points - opponent.points);
              if (diff < 10) closeGames++;
              if (diff > 30 && matchup.points > opponent.points) blowouts++;
            }
          });

          const pointsFor = roster.settings.fpts + roster.settings.fpts_decimal / 100;
          const pointsAgainst = roster.settings.fpts_against + roster.settings.fpts_against_decimal / 100;

          return {
            rosterId: roster.roster_id,
            userId: user.user_id,
            name: user.metadata.team_name || user.display_name,
            avatar: user.avatar,
            wins: roster.settings.wins,
            losses: roster.settings.losses,
            ties: roster.settings.ties,
            pointsFor,
            pointsAgainst,
            weeklyScores,
            highScore: Math.max(...weeklyScores),
            lowScore: Math.min(...weeklyScores),
            avgScore: pointsFor / weeklyScores.length,
            consistency: calculateConsistency(weeklyScores),
            winStreak,
            currentStreak,
            closeGames,
            blowouts,
            weeklyRank,
          };
        });

        setTeamPerformances(performances);
        setLeagueAvgScore(performances.reduce((sum, team) => sum + team.avgScore, 0) / performances.length);
      } catch (err) {
        setError('Failed to fetch season stats. Please check your league ID and try again.');
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentWeek]);

  if (error) {
    return <ErrorMessage title="Error" message={error} />;
  }

  if (loading || !league) {
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

  const highestScore = Math.max(...teamPerformances.map(t => t.highScore));
  const mostBlowouts = Math.max(...teamPerformances.map(t => t.blowouts));
  const mostCloseGames = Math.max(...teamPerformances.map(t => t.closeGames));

  return (
    <div className="space-y-6">
      {/* Season Superlatives */}
      <div className="grid gap-6 md:grid-cols-3">
        {teamPerformances.map(team => {
          const isHighScore = team.highScore === highestScore;
          const isMostBlowouts = team.blowouts === mostBlowouts;
          const isMostCloseGames = team.closeGames === mostCloseGames;
          const isConsistent = team.consistency === Math.min(...teamPerformances.map(t => t.consistency));

          if (!isHighScore && !isMostBlowouts && !isMostCloseGames && !isConsistent) return null;

          return (
            <Card key={team.rosterId} className="bg-gradient-to-br from-blue-500/10 to-purple-500/10">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-4">
                  <Avatar avatarId={team.avatar} size={48} />
                  <div>
                    <div className="font-medium">{team.name}</div>
                    <div className="text-sm text-gray-400">
                      {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {isHighScore && (
                    <div className="flex items-center text-yellow-500">
                      <SparklesIcon className="w-5 h-5 mr-2" />
                      <span>Highest Score: {team.highScore.toFixed(2)}</span>
                    </div>
                  )}
                  {isMostBlowouts && (
                    <div className="flex items-center text-red-500">
                      <FireIcon className="w-5 h-5 mr-2" />
                      <span>{team.blowouts} Blowout Wins</span>
                      <Tooltip content="Games won by more than 30 points">
                        <QuestionMarkCircleIcon className="w-4 h-4 ml-1 opacity-50" />
                      </Tooltip>
                    </div>
                  )}
                  {isMostCloseGames && (
                    <div className="flex items-center text-blue-500">
                      <BoltIcon className="w-5 h-5 mr-2" />
                      <span>{team.closeGames} Close Games</span>
                      <Tooltip content="Games decided by less than 10 points">
                        <QuestionMarkCircleIcon className="w-4 h-4 ml-1 opacity-50" />
                      </Tooltip>
                    </div>
                  )}
                  {isConsistent && (
                    <div className="flex items-center text-green-500">
                      <ChartBarIcon className="w-5 h-5 mr-2" />
                      <span>Most Consistent Team</span>
                      <Tooltip content="Lowest standard deviation in weekly scores">
                        <QuestionMarkCircleIcon className="w-4 h-4 ml-1 opacity-50" />
                      </Tooltip>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <CardTitle>Team Performance Metrics</CardTitle>
            <Tooltip content="Comprehensive stats for each team's performance throughout the season">
              <QuestionMarkCircleIcon className="w-5 h-5 text-gray-400" />
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {teamPerformances
              .sort((a, b) => b.pointsFor - a.pointsFor)
              .map((team, index) => {
                const avgDiff = team.avgScore - leagueAvgScore;
                const isAboveAvg = avgDiff > 0;
                const diffPercent = Math.abs(avgDiff / leagueAvgScore * 100);

                return (
                  <div key={team.rosterId} className="flex items-center space-x-4">
                    <div className="w-8 text-center font-bold text-gray-400">
                      {index + 1}
                    </div>
                    <Avatar avatarId={team.avatar} size={40} />
                    <div className="flex-1">
                      <div className="flex items-center">
                        <span className="font-medium">{team.name}</span>
                        {Math.abs(diffPercent) > 10 && (
                          <span className={`ml-2 flex items-center text-sm ${isAboveAvg ? 'text-green-500' : 'text-red-500'}`}>
                            {isAboveAvg ? (
                              <ArrowTrendingUpIcon className="w-4 h-4 mr-1" />
                            ) : (
                              <ArrowTrendingDownIcon className="w-4 h-4 mr-1" />
                            )}
                            {diffPercent.toFixed(1)}% {isAboveAvg ? 'above' : 'below'} avg
                          </span>
                        )}
                      </div>
                      <div className="flex space-x-4 text-sm text-gray-400">
                        <Tooltip content="Points Per Game">
                          <span className="cursor-help">{team.avgScore.toFixed(1)} PPG</span>
                        </Tooltip>
                        <Tooltip content="Standard Deviation - Lower means more consistent scoring">
                          <span className="cursor-help">{team.consistency.toFixed(1)} σ</span>
                        </Tooltip>
                        <Tooltip content="Games decided by less than 10 points">
                          <span className="cursor-help">{team.closeGames} Close</span>
                        </Tooltip>
                        <Tooltip content="Games won by more than 30 points">
                          <span className="cursor-help">{team.blowouts} Blowouts</span>
                        </Tooltip>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{team.pointsFor.toFixed(1)}</div>
                      <div className="text-sm text-gray-400">Total Points</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Weekly Performance Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <CardTitle>Weekly Rankings</CardTitle>
            <Tooltip content="Each team's rank by points scored each week. Gold = 1st, Blue = Top 3, Red = Bottom 2">
              <QuestionMarkCircleIcon className="w-5 h-5 text-gray-400" />
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left font-medium p-2">Team</th>
                  {Array.from({ length: currentWeek }, (_, i) => (
                    <th key={i} className="text-center font-medium p-2">
                      Week {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamPerformances
                  .sort((a, b) => 
                    b.weeklyRank.reduce((sum, rank) => sum + rank, 0) - 
                    a.weeklyRank.reduce((sum, rank) => sum + rank, 0)
                  )
                  .map(team => (
                    <tr key={team.rosterId} className="border-t border-gray-700">
                      <td className="p-2">
                        <div className="flex items-center space-x-2">
                          <Avatar avatarId={team.avatar} size={24} />
                          <span>{team.name}</span>
                        </div>
                      </td>
                      {team.weeklyRank.map((rank, week) => (
                        <td key={week} className="text-center p-2">
                          <Tooltip content={`Week ${week + 1}: Ranked ${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'}`}>
                            <span className={`
                              inline-flex items-center justify-center w-6 h-6 rounded-full cursor-help
                              ${rank === 1 ? 'bg-yellow-500/20 text-yellow-500' :
                                rank <= 3 ? 'bg-blue-500/20 text-blue-500' :
                                rank >= league.total_rosters - 2 ? 'bg-red-500/20 text-red-500' :
                                'bg-gray-500/20 text-gray-500'}
                            `}>
                              {rank}
                            </span>
                          </Tooltip>
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 