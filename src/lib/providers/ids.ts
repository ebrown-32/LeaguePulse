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
 *   manager   espn-<espn league id>-u-<key>      espn-48153503-u-n3f9a01c2d4e5b6a7
 *
 * ESPN keeps one league id across every season, so the season is part of the
 * league id here, the way each Sleeper season is a league of its own. A
 * manager is the same person every season, so a manager id has no season:
 * all-time records follow the manager across years exactly as on Sleeper.
 *
 * A manager's key is a hash of their full name where ESPN gives one (n<hex>),
 * because people switch ESPN accounts between seasons and are still the same
 * manager; otherwise their ESPN member id. See managerIds in espn/translate.ts.
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

/** A manager id from a key: a name hash, or an ESPN member id (a braced GUID, braces dropped). */
export function espnUserKey(espnLeagueId: string | number, key: string): string {
  return `${ESPN_PREFIX}${espnLeagueId}-u-${key.replace(/[{}]/g, '')}`;
}

export function parseEspnUser(id: string): { leagueId: string; key: string } | null {
  const m = /^espn-(\d{1,12})-u-([0-9A-Za-z-]{8,64})$/.exec(id);
  return m ? { leagueId: m[1], key: m[2] } : null;
}
