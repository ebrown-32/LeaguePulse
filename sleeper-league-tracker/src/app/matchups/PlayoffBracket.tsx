'use client';

import { Card, CardContent } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { Tooltip } from '@/components/ui/Tooltip';
import { TrophyIcon } from '@heroicons/react/24/outline';
import type { SleeperRoster, SleeperUser } from '@/types/sleeper';

interface PlayoffBracketProps {
  matchups: {
    team1: {
      name: string;
      avatar: string;
      points: number;
      seed: number;
    };
    team2: {
      name: string;
      avatar: string;
      points: number;
      seed: number;
    };
    matchup_id: number;
    isComplete: boolean;
  }[];
}

export default function PlayoffBracket({ matchups }: PlayoffBracketProps) {
  // Sort matchups by ID to ensure correct order
  const sortedMatchups = [...matchups].sort((a, b) => a.matchup_id - b.matchup_id);
  const championshipMatch = sortedMatchups.find(m => m.matchup_id === 1);
  const semifinalMatches = sortedMatchups.filter(m => [2, 3].includes(m.matchup_id));

  return (
    <div className="relative">
      {/* Championship */}
      {championshipMatch && (
        <div className="flex justify-center mb-8">
          <Card className="w-80 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 ring-2 ring-yellow-500/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <TrophyIcon className="w-5 h-5 text-yellow-500" />
                <span className="text-sm font-medium text-yellow-500">Championship</span>
                {championshipMatch.isComplete && (
                  <span className="text-xs text-gray-400">Final</span>
                )}
              </div>
              <div className="space-y-4">
                <MatchupTeam
                  name={championshipMatch.team1.name}
                  avatar={championshipMatch.team1.avatar}
                  points={championshipMatch.team1.points}
                  seed={championshipMatch.team1.seed}
                  isWinner={championshipMatch.isComplete && championshipMatch.team1.points > championshipMatch.team2.points}
                />
                <MatchupTeam
                  name={championshipMatch.team2.name}
                  avatar={championshipMatch.team2.avatar}
                  points={championshipMatch.team2.points}
                  seed={championshipMatch.team2.seed}
                  isWinner={championshipMatch.isComplete && championshipMatch.team2.points > championshipMatch.team1.points}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Connecting Lines */}
      <div className="absolute top-[45%] left-1/2 w-px h-16 bg-gray-600 -translate-x-1/2 -translate-y-full" />
      <div className="absolute top-[45%] left-1/4 w-[50%] h-px bg-gray-600 -translate-y-full" />

      {/* Semifinals */}
      <div className="grid grid-cols-2 gap-8">
        {semifinalMatches.map((match) => (
          <Card key={match.matchup_id} className="bg-gradient-to-br from-blue-500/10 to-purple-500/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium">Semifinal {match.matchup_id - 1}</span>
                {match.isComplete && (
                  <span className="text-xs text-gray-400">Final</span>
                )}
              </div>
              <div className="space-y-4">
                <MatchupTeam
                  name={match.team1.name}
                  avatar={match.team1.avatar}
                  points={match.team1.points}
                  seed={match.team1.seed}
                  isWinner={match.isComplete && match.team1.points > match.team2.points}
                />
                <MatchupTeam
                  name={match.team2.name}
                  avatar={match.team2.avatar}
                  points={match.team2.points}
                  seed={match.team2.seed}
                  isWinner={match.isComplete && match.team2.points > match.team1.points}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface MatchupTeamProps {
  name: string;
  avatar: string;
  points: number;
  seed: number;
  isWinner: boolean;
}

function MatchupTeam({ name, avatar, points, seed, isWinner }: MatchupTeamProps) {
  return (
    <div className={`flex items-center space-x-2 p-2 rounded ${isWinner ? 'bg-green-500/10 ring-1 ring-green-500/50' : ''}`}>
      <Avatar avatarId={avatar} size={24} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">#{seed}</span>
          <span className="font-medium truncate">{name}</span>
        </div>
        <div className="text-sm text-gray-400">{points.toFixed(2)}</div>
      </div>
    </div>
  );
} 