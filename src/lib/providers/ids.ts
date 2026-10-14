/**
 * League ids that say which fantasy provider they belong to.
 *
 * The app was built on Sleeper and speaks Sleeper everywhere: a league is a
 * Sleeper league id, a season links to the last through `previous_league_id`,
 * a manager is a Sleeper user id. ESPN leagues are given ids in the same
 * shape, with a prefix no Sleeper id can have (Sleeper's are all digits), so
 * one look at an id says where its data comes from and nothing else in the app
 * has to know.
 *
 *   league    espn-<espn league id>-<season>     espn-48153503-2019
 *   manager   espn-<espn league id>-u-<member>   espn-48153503-u-189C4665-164F-...
 *
 * ESPN keeps one league id across every season, so the season is part of the
 * league id here, the way each Sleeper season is a league of its own. A
 * manager is the same person every season, so a manager id has no season:
 * all-time records follow the manager across years exactly as on Sleeper.
 *
 * No imports: this runs in the browser and in Node's own test runner.
 */

export const ESPN_PREFIX = 'espn-';

export type Provider = 'sleeper' | 'espn';

export function providerOf(id: string | null | undefined): Provider {
  return id && id.startsWith(ESPN_PREFIX) ? 'espn' : 'sleeper';
}

export const isEspnId = (id: string | null | undefined): boolean => providerOf(id) === 'espn';

export function espnLeagueKey(espnLeagueId: string | number, season: string | number): string {
  return `${ESPN_PREFIX}${espnLeagueId}-${season}`;
}

/** `espn-48153503-2019` to its ESPN league and season, or null if it is not one. */
export function parseEspnLeague(id: string): { leagueId: string; season: number } | null {
  const m = /^espn-(\d{1,12})-(\d{4})$/.exec(id);
  return m ? { leagueId: m[1], season: Number(m[2]) } : null;
}

/** ESPN member ids are braced GUIDs: `{189C4665-...}`. The braces go, the rest is kept. */
export function espnUserKey(espnLeagueId: string | number, memberId: string): string {
  return `${ESPN_PREFIX}${espnLeagueId}-u-${memberId.replace(/[{}]/g, '')}`;
}

export function parseEspnUser(id: string): { leagueId: string; memberId: string } | null {
  const m = /^espn-(\d{1,12})-u-([0-9A-Fa-f-]{8,64})$/.exec(id);
  return m ? { leagueId: m[1], memberId: `{${m[2].toUpperCase()}}` } : null;
}
