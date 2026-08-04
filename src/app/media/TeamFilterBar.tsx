'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import Avatar from '@/components/ui/Avatar';

interface FantasyTeamSummary {
  userId: string;
  teamName: string;
  avatar: string;
}

export default function TeamFilterBar({ selected, onSelect }: { selected: string | null; onSelect: (userId: string | null) => void }) {
  const [teams, setTeams] = useState<FantasyTeamSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/media/teams')
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setTeams(data.teams || []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!teams.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 mb-4">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
          selected === null
            ? 'bg-primary/10 text-primary border-primary/20'
            : 'text-muted-foreground border-border hover:text-foreground'
        )}
      >
        All Teams
      </button>
      {teams.map(team => (
        <button
          key={team.userId}
          onClick={() => onSelect(team.userId)}
          className={cn(
            'shrink-0 flex items-center gap-1.5 whitespace-nowrap pl-1.5 pr-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
            selected === team.userId
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'text-muted-foreground border-border hover:text-foreground'
          )}
        >
          <Avatar avatarId={team.avatar || null} size={18} className="rounded-full" />
          {team.teamName}
        </button>
      ))}
    </div>
  );
}
