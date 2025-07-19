import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDefaultSeason(seasons: string[], draftDate?: string | null): string {
  if (!seasons.length) return new Date().getFullYear().toString();
  
  // Always prefer the current active season (most recent season in the list)
  // This ensures we start with the current active season instead of completed seasons
  const currentActiveSeason = Math.max(...seasons.map(Number)).toString();
  
  // If no draft date is set, return the current active season
  if (!draftDate) {
    return currentActiveSeason;
  }
  
  // If draft date is provided, still prefer the current active season
  // The draft date logic was causing us to default to old seasons
  try {
    const draft = new Date(Number(draftDate));
    if (!isNaN(draft.getTime())) {
      const now = new Date();
      const monthBeforeDraft = new Date(draft);
      monthBeforeDraft.setMonth(draft.getMonth() - 1);
      
      // Always show the current active season regardless of draft timing
      return currentActiveSeason;
    }
  } catch (e) {
    console.warn('Invalid draft date provided:', draftDate);
  }
  
  // Default to current active season
  return currentActiveSeason;
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