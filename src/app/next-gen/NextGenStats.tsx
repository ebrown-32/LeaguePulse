'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getAdvancedTeamMetrics } from '@/lib/api';
import {
  BarChart3,
  Heart,
  TrendingUp,
  Star,
  Scale,
  ShieldCheck,
  Rocket,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SeasonSelect } from '@/components/ui/SeasonSelect';

interface NextGenStatsProps {
  initialMetrics: Awaited<ReturnType<typeof getAdvancedTeamMetrics>>;
  seasons: string[];
  leagueId: string;
}

interface AdvancedTeamMetrics {
  userId: string;
  username: string;
  avatar: string;
  teamName: string;
  record: {
    wins: number;
    losses: number;
    ties: number;
    winPct: number;
    gamesPlayed: number;
  };
  points: {
    total: number;
    average: number;
    high: number;
    low: number;
    standardDeviation: number;
    coefficientOfVariation: number;
    weeklyScores: number[];
  };
  consistency: {
    score: number;
    averageMargin: number;
    volatilityIndex: number;
    boomBustRatio: number;
  };
  explosiveness: {
    score: number;
    explosiveGames: number;
    explosiveRate: number;
    highestWeekRank: number;
  };
  clutch: {
    score: number;
    closeWins: number;
    closeGames: number;
    closeWinRate: number;
    topWins: number;
    playoffWins: number;
  };
  efficiency: {
    score: number;
    pointsPerWin: number;
    winEfficiency: number;
    scoringEfficiency: number;
  };
  momentum: {
    score: number;
    lateSeasonRecord: string;
    finalWeeksWinRate: number;
    longestWinStreak: number;
    currentStreak: number;
  };
  luck: {
    score: number;
    expectedWins: number;
    luckRating: number;
    closeLosses: number;
  };
  season: string;
  finalRank: number;
  playoffAppearance: boolean;
  championship: boolean;
}

function MetricRadar({ metrics, team }: { metrics: string[]; team: AdvancedTeamMetrics }) {
  const getMetricValue = (metric: string) => {
    switch (metric) {
      case 'consistency': return team.consistency.score;
      case 'explosiveness': return team.explosiveness.score;
      case 'clutch': return team.clutch.score;
      case 'efficiency': return team.efficiency.score;
      case 'momentum': return team.momentum.score;
      case 'luck': return team.luck.score;
      default: return 0;
    }
  };

  const overallRating = metrics.reduce((sum, metric) => sum + getMetricValue(metric), 0) / metrics.length;

  return (
    <div className="relative w-full h-64">
      <svg className="w-full h-full" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <circle cx="100" cy="100" r="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <circle cx="100" cy="100" r="20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

        {metrics.map((metric, index) => {
          const angle = (index * 2 * Math.PI) / metrics.length - Math.PI / 2;
          const x = 100 + 80 * Math.cos(angle);
          const y = 100 + 80 * Math.sin(angle);
          return (
            <line
              key={metric}
              x1="100"
              y1="100"
              x2={x}
              y2={y}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1"
            />
          );
        })}

        <polygon
          points={metrics.map((metric, index) => {
            const angle = (index * 2 * Math.PI) / metrics.length - Math.PI / 2;
            const value = getMetricValue(metric) / 100;
            const r = 80 * value;
            const x = 100 + r * Math.cos(angle);
            const y = 100 + r * Math.sin(angle);
            return `${x},${y}`;
          }).join(' ')}
          fill="hsl(var(--primary) / 0.15)"
          stroke="hsl(var(--primary) / 0.7)"
          strokeWidth="2"
        />

        {metrics.map((metric, index) => {
          const angle = (index * 2 * Math.PI) / metrics.length - Math.PI / 2;
          const value = getMetricValue(metric) / 100;
          const r = 80 * value;
          const x = 100 + r * Math.cos(angle);
          const y = 100 + r * Math.sin(angle);
          return (
            <circle
              key={metric}
              cx={x}
              cy={y}
              r="3"
              fill="hsl(var(--primary))"
            />
          );
        })}
      </svg>

      {metrics.map((metric, index) => {
        const angle = (index * 2 * Math.PI) / metrics.length - Math.PI / 2;
        const x = 100 + 90 * Math.cos(angle);
        const y = 100 + 90 * Math.sin(angle);
        const value = getMetricValue(metric);

        return (
          <div
            key={metric}
            className="absolute text-xs font-medium text-muted-foreground"
            style={{
              left: `${(x / 200) * 100}%`,
              top: `${(y / 200) * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="text-center">
              <div className="capitalize">{metric}</div>
              <div className="text-primary font-bold">{value.toFixed(0)}</div>
            </div>
          </div>
        );
      })}

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center bg-background/60 rounded-full p-4">
          <div className="font-display text-3xl font-bold text-foreground">
            {overallRating.toFixed(0)}
          </div>
          <div className="text-xs text-muted-foreground">Overall</div>
        </div>
      </div>
    </div>
  );
}

function WeeklyScoreChart({ scores }: { scores: number[] }) {
  if (scores.length === 0) return null;

  const maxScore = Math.max(...scores);
  const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Weekly Scores</span>
        <span>Avg: {avgScore.toFixed(1)}</span>
      </div>
      <div className="flex items-end space-x-1 h-14">
        {scores.map((score, index) => {
          const height = (score / maxScore) * 100;
          const isAboveAvg = score > avgScore;
          return (
            <motion.div
              key={index}
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ duration: 0.5, delay: index * 0.04 }}
              className={`flex-1 rounded-t min-h-[3px] ${isAboveAvg ? 'bg-primary' : 'bg-muted-foreground/40'}`}
              title={`Week ${index + 1}: ${score.toFixed(1)}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function StatBadge({ label, value, icon: Icon }: {
  label: string;
  value: string | number;
  icon: any;
}) {
  return (
    <div
      className="border rounded-lg p-3"
      style={{
        color:           'hsl(var(--primary))',
        backgroundColor: 'hsl(var(--primary) / 0.08)',
        borderColor:     'hsl(var(--primary) / 0.2)',
      }}
    >
      <div className="flex items-center space-x-2">
        <Icon className="h-4 w-4" />
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-sm font-semibold">{value}</div>
        </div>
      </div>
    </div>
  );
}

export default function NextGenStats({ initialMetrics, seasons, leagueId }: NextGenStatsProps) {
  const [metrics, setMetrics] = useState<AdvancedTeamMetrics[]>(initialMetrics);
  const [loading, setLoading] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState('all-time');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'radar' | 'comparison'>('cards');

  const handleSeasonChange = async (season: string) => {
    setLoading(true);
    setSelectedSeason(season);
    try {
      const newMetrics = await getAdvancedTeamMetrics(leagueId, season === 'all-time' ? undefined : season);
      setMetrics(newMetrics);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
    setLoading(false);
  };

  const radarMetrics = ['consistency', 'explosiveness', 'clutch', 'efficiency', 'momentum', 'luck'];

  const leaderCards = [
    {
      label: 'Most Consistent',
      icon: ShieldCheck,
      team: [...metrics].sort((a, b) => b.consistency.score - a.consistency.score)[0],
      sub: (t: AdvancedTeamMetrics) => `${t.consistency.score.toFixed(1)}%`,
    },
    {
      label: 'Most Explosive',
      icon: Zap,
      team: [...metrics].sort((a, b) => b.explosiveness.score - a.explosiveness.score)[0],
      sub: (t: AdvancedTeamMetrics) => `${t.explosiveness.explosiveGames} explosive games`,
    },
    {
      label: 'Most Clutch',
      icon: Heart,
      team: [...metrics].sort((a, b) => b.clutch.score - a.clutch.score)[0],
      sub: (t: AdvancedTeamMetrics) => `${t.clutch.closeWinRate.toFixed(1)} close win rate`,
    },
    {
      label: 'Most Efficient',
      icon: Rocket,
      team: [...metrics].sort((a, b) => b.efficiency.score - a.efficiency.score)[0],
      sub: (t: AdvancedTeamMetrics) => `${t.efficiency.score.toFixed(1)}% efficiency`,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        {/* View Mode Toggle */}
        <div className="flex bg-muted rounded-lg p-1 gap-1">
          {(['cards', 'radar', 'comparison'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-all ${
                viewMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode === 'comparison' ? 'Compare' : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        <SeasonSelect
          seasons={seasons}
          selectedSeason={selectedSeason}
          onSeasonChange={handleSeasonChange}
          className="min-w-[140px]"
        />
      </div>

      {/* League Leaders */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {leaderCards.map(({ label, icon: Icon, team, sub }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="rounded-full p-2.5 sm:p-3 w-fit bg-primary/10">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-muted-foreground">{label}</p>
                  <p className="text-sm sm:text-base font-semibold text-foreground truncate">
                    {team?.teamName}
                  </p>
                  <p className="text-xs text-primary">
                    {team ? sub(team) : '—'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <AnimatePresence mode="wait">
        {viewMode === 'cards' && (
          <motion.div
            key="cards"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`grid gap-6 md:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-50' : ''}`}
          >
            {metrics.map((team) => (
              <motion.div
                key={team.userId}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="group"
              >
                <Card className="h-full hover:shadow-md transition-shadow duration-300">
                  <CardHeader>
                    <div className="flex items-center space-x-4">
                      <Avatar avatarId={team.avatar} size={48} className="rounded-lg" />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg text-foreground truncate">
                          {team.teamName}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {team.record.wins}-{team.record.losses}
                          {team.record.ties > 0 ? `-${team.record.ties}` : ''} ({team.record.winPct.toFixed(1)}%)
                        </p>
                        {team.playoffAppearance && (
                          <div className="flex items-center space-x-1 mt-1">
                            <Star className="h-3 w-3 text-amber-500" />
                            <span className="text-xs text-amber-500">Playoffs</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-5">
                    {/* Key Stats */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">PPG</p>
                        <p className="font-display text-2xl font-bold text-foreground">
                          {team.points.average.toFixed(1)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">vs. Avg</p>
                        <p className={`font-display text-2xl font-bold ${
                          team.consistency.averageMargin > 0 ? 'text-emerald-500' : 'text-rose-500'
                        }`}>
                          {team.consistency.averageMargin > 0 ? '+' : ''}
                          {team.consistency.averageMargin.toFixed(1)}
                        </p>
                      </div>
                    </div>

                    {/* Weekly Score Chart */}
                    <WeeklyScoreChart scores={team.points.weeklyScores} />

                    {/* Advanced Metrics */}
                    <div className="grid grid-cols-2 gap-3">
                      <StatBadge label="Consistency"   value={`${team.consistency.score.toFixed(0)}%`}   icon={ShieldCheck} />
                      <StatBadge label="Explosiveness" value={`${team.explosiveness.score.toFixed(0)}%`} icon={Zap}         />
                      <StatBadge label="Clutch"        value={`${team.clutch.score.toFixed(0)}%`}        icon={Heart}       />
                      <StatBadge label="Efficiency"    value={`${team.efficiency.score.toFixed(0)}%`}    icon={Rocket}      />
                    </div>

                    {/* Streak Info */}
                    <div className="flex justify-between items-center text-sm pt-1 border-t border-border">
                      <div>
                        <span className="text-muted-foreground">Longest Streak:</span>
                        <span className="ml-1 font-semibold text-foreground">
                          {team.momentum.longestWinStreak}W
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Luck:</span>
                        <span className={`ml-1 font-semibold ${
                          team.luck.luckRating > 0 ? 'text-emerald-500' : 'text-rose-500'
                        }`}>
                          {team.luck.luckRating > 0 ? '+' : ''}{team.luck.luckRating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {viewMode === 'radar' && (
          <motion.div
            key="radar"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            {metrics.map((team) => (
              <motion.div
                key={team.userId}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-center space-x-3">
                      <Avatar avatarId={team.avatar} size={32} className="rounded" />
                      <div>
                        <CardTitle className="text-base text-foreground">
                          {team.teamName}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {team.record.wins}-{team.record.losses} ({team.record.winPct.toFixed(1)}%)
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <MetricRadar metrics={radarMetrics} team={team} />
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {viewMode === 'comparison' && (
          <motion.div
            key="comparison"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Team Selection */}
            <div className="flex flex-wrap gap-2">
              {metrics.map((team) => (
                <button
                  key={team.userId}
                  onClick={() => setSelectedTeam(selectedTeam === team.userId ? null : team.userId)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all text-sm font-medium ${
                    selectedTeam === team.userId
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-border/80 text-foreground hover:bg-accent/40'
                  }`}
                >
                  <Avatar avatarId={team.avatar} size={20} className="rounded" />
                  <span>{team.teamName}</span>
                </button>
              ))}
            </div>

            {/* Comparison Chart */}
            {selectedTeam && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">
                    Team Breakdown: {metrics.find(t => t.userId === selectedTeam)?.teamName}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <h4 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">Advanced Metrics</h4>
                      <div className="space-y-4">
                        {radarMetrics.map((metric) => {
                          const team = metrics.find(t => t.userId === selectedTeam);
                          if (!team) return null;

                          const value = getMetricValue(metric, team);
                          const maxValue = Math.max(...metrics.map(t => getMetricValue(metric, t)));
                          const percentage = (value / maxValue) * 100;

                          return (
                            <div key={metric} className="space-y-1.5">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground capitalize">{metric}</span>
                                <span className="font-semibold text-foreground">{value.toFixed(1)}</span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${percentage}%` }}
                                  transition={{ duration: 0.8, delay: 0.1 }}
                                  className="h-full bg-primary rounded-full"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">Performance Breakdown</h4>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="text-center p-3 bg-muted/50 rounded-lg">
                            <div className="font-display text-2xl font-bold text-foreground">
                              {metrics.find(t => t.userId === selectedTeam)?.points.high.toFixed(1)}
                            </div>
                            <div className="text-xs text-muted-foreground">Highest Score</div>
                          </div>
                          <div className="text-center p-3 bg-muted/50 rounded-lg">
                            <div className="font-display text-2xl font-bold text-foreground">
                              {metrics.find(t => t.userId === selectedTeam)?.clutch.closeWins}
                            </div>
                            <div className="text-xs text-muted-foreground">Close Wins</div>
                          </div>
                        </div>

                        <div className="p-4 bg-card border border-border rounded-lg space-y-3">
                          <h5 className="text-sm font-semibold text-foreground">Streak Analysis</h5>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Longest Win Streak:</span>
                              <span className="font-semibold text-foreground">
                                {metrics.find(t => t.userId === selectedTeam)?.momentum.longestWinStreak} games
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Late Season Record:</span>
                              <span className="font-semibold text-foreground">
                                {metrics.find(t => t.userId === selectedTeam)?.momentum.lateSeasonRecord}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Luck Rating:</span>
                              <span className={`font-semibold ${
                                (metrics.find(t => t.userId === selectedTeam)?.luck.luckRating || 0) > 0
                                  ? 'text-emerald-500'
                                  : 'text-rose-500'
                              }`}>
                                {(metrics.find(t => t.userId === selectedTeam)?.luck.luckRating || 0).toFixed(1)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Metrics Explanation */}
      <div className="p-6 bg-card border border-border rounded-xl">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-6">Understanding the Metrics</h3>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: ShieldCheck, title: 'Consistency',   body: 'Measures scoring consistency using coefficient of variation. Lower variation = higher consistency. Accounts for median games if your league has them enabled.' },
            { icon: Zap,         title: 'Explosiveness', body: 'Percentage of games scoring above 120% of league average. Higher percentage = more explosive scoring weeks.' },
            { icon: Heart,       title: 'Clutch',        body: 'Win rate in close games (within 10 points). Higher percentage = better performance under pressure.' },
            { icon: Rocket,      title: 'Efficiency',    body: 'Combines scoring efficiency with win efficiency. Higher score = better points-to-wins ratio.' },
            { icon: TrendingUp,  title: 'Momentum',      body: 'Based on late-season performance and win streaks. Shows how teams finish the season.' },
            { icon: Scale,       title: 'Luck',          body: 'Expected wins vs actual wins. Positive = lucky (won more than expected), negative = unlucky.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                {title}
              </h4>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <h4 className="font-semibold text-foreground mb-2">Median Games</h4>
          <p className="text-sm text-muted-foreground">
            All metrics properly account for median games if your league has them enabled. Win/loss records and
            points per game include both head-to-head and median game results. The system automatically detects
            and handles median game settings from your Sleeper league configuration.
          </p>
        </div>
      </div>
    </div>
  );
}

function getMetricValue(metric: string, team: AdvancedTeamMetrics): number {
  switch (metric) {
    case 'consistency': return team.consistency.score;
    case 'explosiveness': return team.explosiveness.score;
    case 'clutch': return team.clutch.score;
    case 'efficiency': return team.efficiency.score;
    case 'momentum': return team.momentum.score;
    case 'luck': return team.luck.score;
    default: return 0;
  }
}
