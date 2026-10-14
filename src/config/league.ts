import { getAllLinkedLeagueIds } from '@/lib/api';
import { leagueFetch } from '@/lib/providers/leagueFetch';

/**
 * The self-hosted league, from the environment. In hosted mode this is unset
 * and the league comes from the request instead: always go through
 * `getRootLeagueId()` / `getCurrentLeagueId()` rather than reading this.
 */
export const INITIAL_LEAGUE_ID = process.env.NEXT_PUBLIC_LEAGUE_ID || 'YOUR_LEAGUE_ID';

const UNSET = 'YOUR_LEAGUE_ID';

declare global {
  // Set by the root layout in hosted mode: the league the page was rendered for.
  // eslint-disable-next-line no-var
  var __LP_LEAGUE__: string | undefined;
}

/**
 * The league this request is about, as configured: the env league when
 * self-hosted, the subdomain's league when hosted.
 */
export async function getRootLeagueId(): Promise<string> {
  if (typeof window !== 'undefined') return window.__LP_LEAGUE__ || INITIAL_LEAGUE_ID;
  if (process.env.LP_HOSTED === '1') {
    const { currentTenant } = await import('@/lib/tenant/context');
    return (await currentTenant())?.leagueId ?? UNSET;
  }
  return INITIAL_LEAGUE_ID;
}

/** The configured league, or null when there is none. */
export async function configuredRootLeagueId(): Promise<string | null> {
  const id = await getRootLeagueId();
  return id && id !== UNSET ? id : null;
}

/** Whether there is a league to show at all. Replaces checks on INITIAL_LEAGUE_ID. */
export async function leagueConfigured(): Promise<boolean> {
  const id = await getRootLeagueId();
  return Boolean(id) && id !== UNSET;
}

/**
 * Linked seasons per root league. A Map, not a single value: on the hosted
 * product one server serves many leagues, and a single cached chain handed
 * one league's history to the next.
 */
const linked = new Map<string, { ids: string[]; at: number }>();
/**
 * A single season is also what a failed lookup returns (one bad request
 * anywhere in the chain), so it is only trusted briefly; a full chain is kept
 * for the life of the process as before.
 */
const SINGLE_SEASON_MS = 2 * 60 * 1000;

/**
 * Gets all linked league IDs, with the most recent season first
 */
export async function getLinkedLeagueIds(): Promise<string[]> {
  const root = await getRootLeagueId();
  if (!root || root === UNSET) return [];
  const hit = linked.get(root);
  if (hit && (hit.ids.length > 1 || Date.now() - hit.at < SINGLE_SEASON_MS)) return hit.ids;

  try {
    const ids = await getAllLinkedLeagueIds(root);
    linked.set(root, { ids, at: Date.now() });
    return ids;
  } catch (error) {
    console.error('Failed to get linked league IDs:', error);
    return [root];
  }
}

/**
 * Gets the most recent league ID
 */
export async function getCurrentLeagueId(): Promise<string> {
  const ids = await getLinkedLeagueIds();
  return ids[0] || (await getRootLeagueId());
}

/**
 * Gets all league IDs for a specific season
 */
export async function getLeagueIdForSeason(season: string): Promise<string | null> {
  const ids = await getLinkedLeagueIds();
  const league = await leagueFetch(`https://api.sleeper.app/v1/league/${ids[0]}`).then(res => res.json());
  
  // If the requested season matches the current league, return it
  if (league.season === season) {
    return ids[0];
  }

  // Otherwise, find the league ID for the requested season
  for (const id of ids) {
    const leagueInfo = await leagueFetch(`https://api.sleeper.app/v1/league/${id}`).then(res => res.json());
    if (leagueInfo.season === season) {
      return id;
    }
  }

  return null;
} 