import { getAllLinkedLeagueIds } from '@/lib/api';

// The initial league ID from environment variables
export const INITIAL_LEAGUE_ID = process.env.NEXT_PUBLIC_LEAGUE_ID || 'YOUR_LEAGUE_ID';

// Cache for linked league IDs
let linkedLeagueIds: string[] | null = null;

/**
 * Gets all linked league IDs, with the most recent season first
 */
export async function getLinkedLeagueIds(): Promise<string[]> {
  if (linkedLeagueIds) {
    return linkedLeagueIds;
  }

  if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return [];
  }

  try {
    linkedLeagueIds = await getAllLinkedLeagueIds(INITIAL_LEAGUE_ID);
    return linkedLeagueIds;
  } catch (error) {
    console.error('Failed to get linked league IDs:', error);
    return [INITIAL_LEAGUE_ID];
  }
}

/**
 * Gets the most recent league ID
 */
export async function getCurrentLeagueId(): Promise<string> {
  const ids = await getLinkedLeagueIds();
  return ids[0] || INITIAL_LEAGUE_ID;
}

/**
 * Gets all league IDs for a specific season
 */
export async function getLeagueIdForSeason(season: string): Promise<string | null> {
  const ids = await getLinkedLeagueIds();
  const league = await fetch(`https://api.sleeper.app/v1/league/${ids[0]}`).then(res => res.json());
  
  // If the requested season matches the current league, return it
  if (league.season === season) {
    return ids[0];
  }

  // Otherwise, find the league ID for the requested season
  for (const id of ids) {
    const leagueInfo = await fetch(`https://api.sleeper.app/v1/league/${id}`).then(res => res.json());
    if (leagueInfo.season === season) {
      return id;
    }
  }

  return null;
} 