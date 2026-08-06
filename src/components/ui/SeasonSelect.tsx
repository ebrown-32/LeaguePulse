'use client';

import { Select, SelectTrigger, SelectContent, SelectItem } from './Select';

interface SeasonSelectProps {
  seasons: string[];
  selectedSeason: string;
  onSeasonChange: (season: string) => void;
  className?: string;
  /** Views with no meaningful aggregate (Rosters) opt out. Defaults on so
   *  every existing caller keeps the All-Time entry it already had. */
  includeAllTime?: boolean;
}

export function SeasonSelect({ seasons, selectedSeason, onSeasonChange, className, includeAllTime = true }: SeasonSelectProps) {
  const sortedSeasons = [...seasons].sort((a, b) => Number(b) - Number(a));

  return (
    <Select value={selectedSeason} onValueChange={onSeasonChange}>
      <SelectTrigger className={className}>
        {selectedSeason === 'all-time' ? 'All-Time' : `Season ${selectedSeason}`}
      </SelectTrigger>
      <SelectContent>
        {includeAllTime && <SelectItem value="all-time">All-Time</SelectItem>}
        {sortedSeasons.map((season) => (
          <SelectItem key={season} value={season}>
            Season {season}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
} 