'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getTeamMetrics } from '@/lib/api';
import {
  ChartBarIcon,
  BoltIcon,
  HeartIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';

function MetricBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span>{value.toFixed(1)}</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

interface NextGenStatsProps {
  initialMetrics: Awaited<ReturnType<typeof getTeamMetrics>>;
  seasons: string[];
  leagueId: string;
}

export default function NextGenStats({ initialMetrics, seasons, leagueId }: NextGenStatsProps) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [loading, setLoading] = useState(false);

  const handleSeasonChange = async (season: string) => {
    setLoading(true);
    try {
      const newMetrics = await getTeamMetrics(leagueId, season === 'all-time' ? undefined : season);
      setMetrics(newMetrics);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Next-Gen Stats</h1>
        <select
          className="w-full md:w-auto bg-white/5 border-white/10 rounded-md text-white focus:border-blue-500 focus:ring-blue-500 text-sm md:text-base py-2 px-3"
          onChange={(e) => handleSeasonChange(e.target.value)}
          disabled={loading}
        >
          <option value="all-time">All-Time</option>
          {seasons.map((season) => (
            <option key={season} value={season}>
              {season} Season
            </option>
          ))}
        </select>
      </div>

      <div className={`grid gap-4 md:gap-6 md:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-50' : ''}`}>
        {metrics.map((team) => (
          <Card key={team.userId} className="transform transition-all hover:scale-[1.02]">
            <CardHeader>
              <div className="flex items-center space-x-4">
                <Avatar avatarId={team.avatar} size={44} className="rounded-lg" />
                <div>
                  <CardTitle className="text-base md:text-lg">{team.teamName}</CardTitle>
                  <p className="text-xs md:text-sm text-gray-400">
                    {team.record.wins}-{team.record.losses}
                    {team.record.ties > 0 ? `-${team.record.ties}` : ''} ({team.record.winPct.toFixed(1)}%)
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 md:space-y-6">
              <div className="grid grid-cols-2 gap-3 md:gap-4 text-center">
                <div>
                  <p className="text-xs md:text-sm text-gray-400">PPG</p>
                  <p className="text-xl md:text-2xl font-bold">{team.points.average.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-xs md:text-sm text-gray-400">vs. Avg</p>
                  <p className={`text-xl md:text-2xl font-bold ${
                    team.consistency.averageMargin > 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {team.consistency.averageMargin > 0 ? '+' : ''}
                    {team.consistency.averageMargin.toFixed(1)}
                  </p>
                </div>
              </div>

              <div className="space-y-3 md:space-y-4">
                <MetricBar
                  value={team.consistency.score}
                  label="Consistency"
                  color="bg-blue-500"
                />
                <MetricBar
                  value={team.explosiveness.score}
                  label="Explosiveness"
                  color="bg-purple-500"
                />
                <MetricBar
                  value={team.clutch.score}
                  label="Clutch"
                  color="bg-green-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs md:text-sm">
                <div>
                  <p className="text-gray-400">High</p>
                  <p className="font-medium">{team.points.high.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Low</p>
                  <p className="font-medium">{team.points.low.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Close Wins</p>
                  <p className="font-medium">{team.clutch.closeWins}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:gap-6 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 md:pt-6">
            <div className="flex items-center space-x-3 md:space-x-4">
              <div className="rounded-full bg-blue-500/10 p-2 md:p-3">
                <ChartBarIcon className="h-4 w-4 md:h-6 md:w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-gray-400">Most Consistent</p>
                <p className="text-sm md:text-lg font-medium truncate">
                  {metrics.sort((a, b) => b.consistency.score - a.consistency.score)[0]?.teamName}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 md:pt-6">
            <div className="flex items-center space-x-3 md:space-x-4">
              <div className="rounded-full bg-purple-500/10 p-2 md:p-3">
                <BoltIcon className="h-4 w-4 md:h-6 md:w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-gray-400">Most Explosive</p>
                <p className="text-sm md:text-lg font-medium truncate">
                  {metrics.sort((a, b) => b.explosiveness.score - a.explosiveness.score)[0]?.teamName}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 md:pt-6">
            <div className="flex items-center space-x-3 md:space-x-4">
              <div className="rounded-full bg-green-500/10 p-2 md:p-3">
                <HeartIcon className="h-4 w-4 md:h-6 md:w-6 text-green-500" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-gray-400">Most Clutch</p>
                <p className="text-sm md:text-lg font-medium truncate">
                  {metrics.sort((a, b) => b.clutch.score - a.clutch.score)[0]?.teamName}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 md:pt-6">
            <div className="flex items-center space-x-3 md:space-x-4">
              <div className="rounded-full bg-yellow-500/10 p-2 md:p-3">
                <ArrowTrendingUpIcon className="h-4 w-4 md:h-6 md:w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-gray-400">Highest Scoring</p>
                <p className="text-sm md:text-lg font-medium truncate">
                  {metrics.sort((a, b) => b.points.average - a.points.average)[0]?.teamName}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 