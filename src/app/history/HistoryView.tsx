'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { 
  getAggregatedUserStats, 
  getAllLeagueSeasons, 
  getLeagueInfo, 
  getLeagueRosters, 
  getLeagueUsers, 
  getLeagueMatchups,
  getNFLState,
  getAllLinkedLeagueIds
} from '@/lib/api';
import { 
  TrophyIcon, 
  ChartBarIcon, 
  CalendarIcon,
  FireIcon,
  BoltIcon,
  SparklesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  QuestionMarkCircleIcon,
  UserGroupIcon,
  StarIcon,
  HeartIcon,
  ClockIcon,
  ChartPieIcon,
} from '@heroicons/react/24/outline';
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage, LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { Tooltip } from '@/components/ui/Tooltip';
import { getDefaultSeason, getDefaultValue, formatPoints, calculateWinPercentage, formatRecord } from '@/lib/utils';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Tooltip as RechartsTooltip,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  ComposedChart,
  Scatter,
} from 'recharts';

interface HistoryViewProps {
  currentWeek: number;
}

interface UserStats {
  userId: string;
  username: string;
  avatar: string;
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  totalPoints: number;
  championships: number;
  playoffAppearances: number;
  winPercentage: number;
  averagePointsPerGame: number;
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
  consistency: number;
  winStreak: number;
  currentStreak: number;
  closeGames: number;
  blowouts: number;
  weeklyRank: number[];
}

export default function HistoryView({ currentWeek }: HistoryViewProps) {
  const [viewMode, setViewMode] = useState<'season' | 'all-time'>('season');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<any>(null);
  const [stats, setStats] = useState<UserStats[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [teamPerformances, setTeamPerformances] = useState<TeamPerformance[]>([]);
  const [leagueAvgScore, setLeagueAvgScore] = useState(0);
  const [loadingSeasonData, setLoadingSeasonData] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const leagueId = await getCurrentLeagueId();
        const league = await getLeagueInfo(leagueId);
        if (!league) {
          throw new Error('League not found');
        }
        setLeague(league);

        const linkedIds = await getAllLinkedLeagueIds(leagueId);
        const seasons = await getAllLeagueSeasons(leagueId);
        setSeasons(seasons);

        if (!selectedSeason) {
          const defaultSeason = getDefaultSeason(seasons);
          setSelectedSeason(defaultSeason);
        }

        const stats = await getAggregatedUserStats(linkedIds, currentWeek);
        setStats(stats);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setError(error instanceof Error ? error.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentWeek, selectedSeason]);

  // Fetch data when season changes
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

        // Fetch season data
        const [rostersData, usersData] = await Promise.all([
          getLeagueRosters(seasonLeagueId),
          getLeagueUsers(seasonLeagueId),
        ]);

        // Process weekly matchups for the season
        const weeklyMatchups = await Promise.all(
          Array.from({ length: currentWeek }, (_, i) => 
            getLeagueMatchups(seasonLeagueId, i + 1)
          )
        );

        // Update team performances for the selected season
        const performances = rostersData.map(roster => {
          const user = usersData.find(u => u.user_id === roster.owner_id)!;
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

          // Calculate consistency (standard deviation)
          const avgScore = weeklyScores.reduce((sum, score) => sum + score, 0) / weeklyScores.length;
          const variance = weeklyScores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / weeklyScores.length;
          const consistency = Math.sqrt(variance);

          return {
            rosterId: roster.roster_id,
            userId: user.user_id,
            name: user.metadata?.team_name || user.display_name,
            avatar: user.avatar,
            wins: roster.settings?.wins || 0,
            losses: roster.settings?.losses || 0,
            ties: roster.settings?.ties || 0,
            pointsFor,
            pointsAgainst,
            weeklyScores,
            highScore: Math.max(...weeklyScores),
            lowScore: Math.min(...weeklyScores),
            avgScore,
            consistency,
            winStreak,
            currentStreak,
            closeGames,
            blowouts,
            weeklyRank,
          };
        });

        setTeamPerformances(performances);
        setLeagueAvgScore(performances.reduce((sum, team) => sum + team.avgScore, 0) / performances.length);
      } catch (error) {
        console.error('Failed to fetch season data:', error);
      } finally {
        setLoadingSeasonData(false);
      }
    };

    fetchSeasonData();
  }, [selectedSeason, league, currentWeek]);

  // New function to calculate season trends
  const calculateSeasonTrends = (performances: TeamPerformance[]) => {
    return performances.map(team => {
      const totalGames = team.wins + team.losses + team.ties;
      return {
        name: team.name,
        avatar: team.avatar,
        avgScore: team.avgScore || 0,
        winRate: totalGames > 0 ? (team.wins / totalGames) * 100 : 0,
        consistency: team.avgScore > 0 ? 100 - (team.consistency / team.avgScore) * 100 : 0,
        closeGameRate: team.weeklyScores.length > 0 ? (team.closeGames / team.weeklyScores.length) * 100 : 0,
        blowoutRate: team.weeklyScores.length > 0 ? (team.blowouts / team.weeklyScores.length) * 100 : 0,
      };
    });
  };

  // New function to prepare scoring progression data
  const prepareScoringProgression = (performances: TeamPerformance[]) => {
    return performances[0]?.weeklyScores.map((_, weekIndex) => ({
      week: weekIndex + 1,
      ...performances.reduce((acc, team) => ({
        ...acc,
        [team.name]: team.weeklyScores[weekIndex],
      }), {}),
    }));
  };

  // New function to calculate win distribution
  const calculateWinDistribution = (performances: TeamPerformance[]) => {
    return performances.map(team => ({
      name: team.name,
      value: team.wins,
      total: team.wins + team.losses + team.ties,
      percentage: (team.wins / (team.wins + team.losses + team.ties)) * 100,
    }));
  };

  // New function to calculate scoring trends
  const calculateScoringTrends = (performances: TeamPerformance[]) => {
    return performances.map(team => ({
      name: team.name,
      avgScore: team.avgScore,
      highScore: team.highScore,
      lowScore: team.lowScore,
      consistency: team.consistency,
    }));
  };

  // New function to calculate head-to-head records
  const calculateH2HRecords = (performances: TeamPerformance[]) => {
    // This would need to be implemented based on matchup data
    // For now, returning placeholder data
    return performances.map(team => ({
      name: team.name,
      wins: team.wins,
      losses: team.losses,
    }));
  };

  if (loading) return <LoadingPage />;
  if (error) return <ErrorMessage title="Error" message={error} />;
  if (!league || !stats.length) return null;

  const seasonTrends = calculateSeasonTrends(teamPerformances);
  const scoringProgression = prepareScoringProgression(teamPerformances);
  const winDistribution = calculateWinDistribution(teamPerformances);
  const scoringTrends = calculateScoringTrends(teamPerformances);
  const h2hRecords = calculateH2HRecords(teamPerformances);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="space-y-8">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setViewMode('season')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              viewMode === 'season' 
                ? 'bg-blue-500 text-white' 
                : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            <ClockIcon className="w-5 h-5 inline mr-2" />
            Season View
          </button>
          <button
            onClick={() => setViewMode('all-time')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              viewMode === 'all-time' 
                ? 'bg-blue-500 text-white' 
                : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            <ChartPieIcon className="w-5 h-5 inline mr-2" />
            All-Time View
          </button>
        </div>
        {viewMode === 'season' && (
          <SeasonSelect
            seasons={seasons}
            selectedSeason={selectedSeason}
            onSeasonChange={setSelectedSeason}
            className="w-[140px]"
          />
        )}
      </div>

      {/* League Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>League Timeline</CardTitle>
            <SeasonSelect
              seasons={seasons}
              selectedSeason={selectedSeason}
              onSeasonChange={setSelectedSeason}
              className="w-[140px]"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-4">
            <div className="flex items-center space-x-4 p-4 bg-white/5 rounded-lg">
              <div className="rounded-xl bg-yellow-500/10 p-3">
                <TrophyIcon className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Championships</p>
                <p className="text-2xl font-bold tracking-tight">
                  {stats.reduce((sum, user) => sum + user.championships, 0)}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4 p-4 bg-white/5 rounded-lg">
              <div className="rounded-xl bg-purple-500/10 p-3">
                <UserGroupIcon className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Games</p>
                <p className="text-2xl font-bold tracking-tight">
                  {stats.reduce((sum, user) => 
                    sum + user.totalWins + user.totalLosses + user.totalTies, 0
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4 p-4 bg-white/5 rounded-lg">
              <div className="rounded-xl bg-blue-500/10 p-3">
                <StarIcon className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Playoff Games</p>
                <p className="text-2xl font-bold tracking-tight">
                  {stats.reduce((sum, user) => sum + user.playoffAppearances, 0)}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4 p-4 bg-white/5 rounded-lg">
              <div className="rounded-xl bg-green-500/10 p-3">
                <HeartIcon className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Seasons</p>
                <p className="text-2xl font-bold tracking-tight">{seasons.length}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Visualizations */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Scoring Progression */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              {viewMode === 'season' ? 'Weekly Scoring Progression' : 'Historical Scoring Trends'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                {viewMode === 'season' ? (
                  <LineChart data={scoringProgression}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-600/20" />
                    <XAxis 
                      dataKey="week"
                      className="text-xs text-gray-400"
                      tick={{ fill: 'currentColor' }}
                    />
                    <YAxis 
                      className="text-xs text-gray-400"
                      tick={{ fill: 'currentColor' }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '12px',
                      }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend />
                    {teamPerformances.map((team, index) => (
                      <Line
                        key={team.rosterId}
                        type="monotone"
                        dataKey={team.name}
                        stroke={`hsl(${(index * 360) / teamPerformances.length}, 70%, 50%)`}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                ) : (
                  <ComposedChart data={scoringTrends}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-600/20" />
                    <XAxis 
                      dataKey="name"
                      className="text-xs text-gray-400"
                      tick={{ fill: 'currentColor' }}
                    />
                    <YAxis 
                      className="text-xs text-gray-400"
                      tick={{ fill: 'currentColor' }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '12px',
                      }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend />
                    <Bar dataKey="avgScore" fill="#3b82f6" name="Average Score" />
                    <Scatter dataKey="highScore" fill="#10b981" name="High Score" />
                    <Scatter dataKey="lowScore" fill="#ef4444" name="Low Score" />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Win Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Win Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={winDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={({ name, percentage }) => `${name} (${percentage.toFixed(1)}%)`}
                  >
                    {winDistribution.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px',
                    }}
                    itemStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Performance Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={seasonTrends}>
                  <PolarGrid className="stroke-gray-600/20" />
                  <PolarAngleAxis
                    dataKey="name"
                    className="text-xs text-gray-400"
                    tick={{ fill: 'currentColor' }}
                  />
                  <PolarRadiusAxis className="text-xs text-gray-400" />
                  <Radar
                    name="Win Rate"
                    dataKey="winRate"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                  />
                  <Radar
                    name="Consistency"
                    dataKey="consistency"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.3}
                  />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dynasty Power Rankings */}
      {league.settings.type === 2 && viewMode === 'all-time' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Dynasty Power Rankings</CardTitle>
              <Tooltip content="Rankings based on championships, playoff appearances, win rate, and scoring ability">
                <QuestionMarkCircleIcon className="w-5 h-5 text-gray-400" />
              </Tooltip>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats
                .sort((a, b) => {
                  // Calculate dynasty score based on multiple factors
                  const getScore = (user: UserStats) => 
                    user.championships * 100 + // Heavy weight on championships
                    user.playoffAppearances * 20 + // Good weight on playoff appearances
                    user.winPercentage + // Consider win percentage
                    user.averagePointsPerGame; // Consider scoring ability
                  return getScore(b) - getScore(a);
                })
                .map((user, index) => (
                  <div
                    key={user.userId}
                    className="flex items-center space-x-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 text-center">
                      <span className={`
                        text-lg font-bold
                        ${index === 0 ? 'text-yellow-500' :
                          index === 1 ? 'text-gray-400' :
                          index === 2 ? 'text-amber-600' :
                          'text-gray-500'}
                      `}>
                        {index + 1}
                      </span>
                    </div>
                    <Avatar avatarId={user.avatar} size={48} className="rounded-lg" />
                    <div className="flex-grow">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium">{user.username}</p>
                        {user.championships > 0 && (
                          <div className="flex items-center space-x-1">
                            {Array.from({ length: user.championships }).map((_, i) => (
                              <TrophyIcon key={i} className="w-4 h-4 text-yellow-500" />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 mt-1 text-sm text-gray-400">
                        <span>{formatRecord(user.totalWins, user.totalLosses, user.totalTies)}</span>
                        <span>•</span>
                        <span>{user.winPercentage.toFixed(1)}% Win Rate</span>
                        <span>•</span>
                        <span>{user.playoffAppearances} Playoff Appearances</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <div className="text-right">
                          <p className="font-medium text-lg">{user.averagePointsPerGame.toFixed(1)}</p>
                          <p className="text-sm text-gray-400">PPG</p>
                        </div>
                        {user.championships > 0 && (
                          <div className="text-right">
                            <p className="font-medium text-lg text-yellow-500">{user.championships}</p>
                            <p className="text-sm text-gray-400">🏆</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Season Highlights */}
      {viewMode === 'season' && (
        <div className="grid gap-6 md:grid-cols-3">
          {teamPerformances.map(team => {
            const isHighScore = team.highScore === Math.max(...teamPerformances.map(t => t.highScore));
            const isMostBlowouts = team.blowouts === Math.max(...teamPerformances.map(t => t.blowouts));
            const isMostCloseGames = team.closeGames === Math.max(...teamPerformances.map(t => t.closeGames));
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
      )}
    </div>
  );
} 