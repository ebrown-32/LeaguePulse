'use client';

import { Select, SelectTrigger, SelectContent, SelectItem } from './Select';

interface SeasonSelectProps {
  seasons: string[];
  selectedSeason: string;
  onSeasonChange: (season: string) => void;
  className?: string;
}

export function SeasonSelect({ seasons, selectedSeason, onSeasonChange, className }: SeasonSelectProps) {
  const sortedSeasons = [...seasons].sort((a, b) => Number(b) - Number(a));

  return (
    <Select value={selectedSeason} onValueChange={onSeasonChange}>
      <SelectTrigger className={className}>
        Season {selectedSeason}
      </SelectTrigger>
      <SelectContent>
        {sortedSeasons.map((season) => (
          <SelectItem key={season} value={season}>
            Season {season}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
} 