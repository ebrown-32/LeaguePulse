import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDefaultSeason(seasons: string[], draftDate?: string | null): string {
  if (!seasons.length) return new Date().getFullYear().toString();
  
  // Get current year and most recent completed season
  const currentYear = new Date().getFullYear();
  const completedSeasons = seasons.filter(season => Number(season) < currentYear);
  const mostRecentSeason = completedSeasons.length ? Math.max(...completedSeasons.map(Number)).toString() : currentYear.toString();
  
  // If no draft date is set, return the most recent completed season
  if (!draftDate) {
    return mostRecentSeason;
  }
  
  // If draft date is provided, check if it's valid and we're within a month of it
  try {
    const draft = new Date(Number(draftDate));
    if (!isNaN(draft.getTime())) {
      const now = new Date();
      const monthBeforeDraft = new Date(draft);
      monthBeforeDraft.setMonth(draft.getMonth() - 1);
      
      if (now >= monthBeforeDraft) {
        return Math.max(...seasons.map(Number)).toString();
      }
    }
  } catch (e) {
    console.warn('Invalid draft date provided:', draftDate);
  }
  
  // Default to most recent completed season
  return mostRecentSeason;
}

export function getDefaultValue<T>(value: T | null | undefined, defaultValue: T): T {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return defaultValue;
  }
  return value;
}

export function formatPoints(points: number | null | undefined): string {
  const value = getDefaultValue(points, 0);
  return value.toFixed(1);
}

export function calculateWinPercentage(wins: number, losses: number, ties: number): number {
  const totalGames = wins + losses + ties;
  if (totalGames === 0) return 0;
  return ((wins + ties * 0.5) / totalGames) * 100;
}

export function formatRecord(wins: number, losses: number, ties: number = 0): string {
  return `${wins}-${losses}${ties > 0 ? `-${ties}` : ''}`;
} 