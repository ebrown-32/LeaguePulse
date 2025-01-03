'use client';

import React, { useState, useEffect } from 'react';
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
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
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
      if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
        setError('Please set your Sleeper league ID in the .env.local file.');
        setLoading(false);
        return;
      }

      try {
        const leagueId = await getCurrentLeagueId();
        const [leagueData, users, rosters] = await Promise.all([
          getLeagueInfo(leagueId),
          getLeagueUsers(leagueId),
          getLeagueRosters(leagueId),
        ]);

        setLeague(leagueData);

        // Get all matchups for the season so far
        const matchupPromises = Array.from({ length: currentWeek }, (_, i) => 
          getLeagueMatchups(leagueId, i + 1)
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
      <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-3">
        {teamPerformances.map(team => {
          const isHighScore = team.highScore === highestScore;
          const isMostBlowouts = team.blowouts === mostBlowouts;
          const isMostCloseGames = team.closeGames === mostCloseGames;
          const isConsistent = team.consistency === Math.min(...teamPerformances.map(t => t.consistency));

          if (!isHighScore && !isMostBlowouts && !isMostCloseGames && !isConsistent) return null;

          return (
            <Card key={team.rosterId} className="bg-gradient-to-br from-blue-500/10 to-purple-500/10">
              <CardContent className="p-4 md:pt-6">
                <div className="flex items-center space-x-3 md:space-x-4">
                  <Avatar avatarId={team.avatar} size={40} className="rounded-lg" />
                  <div>
                    <div className="font-medium text-sm md:text-base">{team.name}</div>
                    <div className="text-xs md:text-sm text-gray-400">
                      {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}
                    </div>
                  </div>
                </div>
                <div className="mt-3 md:mt-4 space-y-2">
                  {isHighScore && (
                    <div className="flex items-center text-yellow-500 text-sm md:text-base">
                      <SparklesIcon className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                      <span>Highest Score: {team.highScore.toFixed(2)}</span>
                    </div>
                  )}
                  {isMostBlowouts && (
                    <div className="flex items-center text-red-500 text-sm md:text-base">
                      <FireIcon className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                      <span>{team.blowouts} Blowout Wins</span>
                      <Tooltip content="Games won by more than 30 points">
                        <QuestionMarkCircleIcon className="w-3 h-3 md:w-4 md:h-4 ml-1 opacity-50" />
                      </Tooltip>
                    </div>
                  )}
                  {isMostCloseGames && (
                    <div className="flex items-center text-blue-500 text-sm md:text-base">
                      <BoltIcon className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                      <span>{team.closeGames} Close Games</span>
                      <Tooltip content="Games decided by less than 10 points">
                        <QuestionMarkCircleIcon className="w-3 h-3 md:w-4 md:h-4 ml-1 opacity-50" />
                      </Tooltip>
                    </div>
                  )}
                  {isConsistent && (
                    <div className="flex items-center text-green-500 text-sm md:text-base">
                      <ChartBarIcon className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                      <span>Most Consistent Team</span>
                      <Tooltip content="Lowest standard deviation in weekly scores">
                        <QuestionMarkCircleIcon className="w-3 h-3 md:w-4 md:h-4 ml-1 opacity-50" />
                      </Tooltip>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Team Performance Table */}
      <Card>
        <CardHeader className="pb-2 md:pb-4">
          <CardTitle className="text-lg md:text-xl">Team Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Desktop View */}
          <div className="hidden md:block">
            <div className="grid grid-cols-[2fr_6rem_5rem_5rem_5rem_5rem_6rem] gap-4 text-sm text-gray-400 px-4 py-2">
              <div>Team</div>
              <div className="text-center">Record</div>
              <div className="text-center">PPG</div>
              <div className="text-center">High</div>
              <div className="text-center">Low</div>
              <div className="text-center">vs Avg</div>
              <div className="text-center">Close Games</div>
            </div>
            <div className="space-y-2">
              {teamPerformances.sort((a, b) => b.avgScore - a.avgScore).map(team => (
                <div key={team.rosterId} className="grid grid-cols-[2fr_6rem_5rem_5rem_5rem_5rem_6rem] gap-4 items-center px-4 py-3 rounded-lg hover:bg-white/5">
                  <div className="flex items-center space-x-3 min-w-0">
                    <Avatar avatarId={team.avatar} size={32} className="rounded-lg flex-shrink-0" />
                    <span className="font-medium truncate">{team.name}</span>
                  </div>
                  <div className="text-center whitespace-nowrap">
                    {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}
                  </div>
                  <div className="text-center font-medium">{team.avgScore.toFixed(1)}</div>
                  <div className="text-center">{team.highScore.toFixed(1)}</div>
                  <div className="text-center">{team.lowScore.toFixed(1)}</div>
                  <div className={`text-center ${
                    team.avgScore > leagueAvgScore ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {team.avgScore > leagueAvgScore ? '+' : ''}
                    {(team.avgScore - leagueAvgScore).toFixed(1)}
                  </div>
                  <div className="text-center">{team.closeGames}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile View */}
          <div className="md:hidden space-y-4">
            {teamPerformances.sort((a, b) => b.avgScore - a.avgScore).map(team => (
              <div key={team.rosterId} className="space-y-3 p-3 rounded-lg bg-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Avatar avatarId={team.avatar} size={28} className="rounded-lg" />
                    <div>
                      <div className="font-medium text-sm">{team.name}</div>
                      <div className="text-xs text-gray-400">
                        {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{team.avgScore.toFixed(1)} PPG</div>
                    <div className={`text-xs ${
                      team.avgScore > leagueAvgScore ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {team.avgScore > leagueAvgScore ? '+' : ''}
                      {(team.avgScore - leagueAvgScore).toFixed(1)} vs Avg
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs bg-white/5 rounded-lg p-2">
                  <div>
                    <p className="text-gray-400 mb-0.5">High</p>
                    <p className="font-medium">{team.highScore.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-0.5">Low</p>
                    <p className="font-medium">{team.lowScore.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-0.5">Close Games</p>
                    <p className="font-medium">{team.closeGames}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Weekly Rankings */}
      <Card>
        <CardHeader className="pb-2 md:pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg md:text-xl">Weekly Rankings</CardTitle>
            <Tooltip content="Each team's rank by points scored each week. Gold = 1st, Blue = Top 3, Red = Bottom 2">
              <QuestionMarkCircleIcon className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto -mx-6 md:mx-0">
            <div className="min-w-[640px] px-6 md:px-0">
              <div className="grid grid-cols-[2fr_repeat(18,minmax(2.5rem,1fr))] gap-2 text-sm">
                <div className="text-gray-400 font-medium p-2">Team</div>
                {Array.from({ length: currentWeek }, (_, i) => (
                  <div key={i} className="text-center text-gray-400 font-medium p-2">
                    {i + 1}
                  </div>
                ))}
                
                {teamPerformances
                  .sort((a, b) => 
                    b.weeklyRank.reduce((sum, rank) => sum + rank, 0) / b.weeklyRank.length - 
                    a.weeklyRank.reduce((sum, rank) => sum + rank, 0) / a.weeklyRank.length
                  )
                  .map(team => (
                    <React.Fragment key={team.rosterId}>
                      <div className="flex items-center space-x-2 p-2 min-w-0">
                        <Avatar avatarId={team.avatar} size={24} className="rounded-lg flex-shrink-0" />
                        <span className="truncate text-sm">{team.name}</span>
                      </div>
                      {team.weeklyRank.map((rank, week) => (
                        <div key={week} className="flex items-center justify-center p-2">
                          <Tooltip content={`Week ${week + 1}: Ranked ${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'}`}>
                            <div className={`
                              flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full
                              ${rank === 1 ? 'bg-yellow-500/20 text-yellow-500' :
                                rank <= 3 ? 'bg-blue-500/20 text-blue-500' :
                                rank >= league.total_rosters - 1 ? 'bg-red-500/20 text-red-400' :
                                'bg-white/5 text-gray-400'}
                            `}>
                              {rank}
                            </div>
                          </Tooltip>
                        </div>
                      ))}
                    </React.Fragment>
                  ))
                }
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 