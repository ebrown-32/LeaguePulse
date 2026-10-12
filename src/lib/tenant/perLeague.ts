/**
 * A module-level cache that holds one value per league.
 *
 * A plain `let cache = ...` at the top of a module is one value for the whole
 * server. Self-hosted that is one league and fine; on the hosted product one
 * server answers for many leagues, and the first league's cached history,
 * brief or theme would be served to whichever league asked next. Every cache
 * of league data goes through this instead.
 */

import { currentTenant } from './context';

/** The league a cache entry belongs to: the subdomain, or "_" when self-hosted. */
async function scope(): Promise<string> {
  return (await currentTenant())?.slug ?? '_';
}

export function perLeague<T>() {
  const store = new Map<string, T>();
  return {
    async get(): Promise<T | undefined> { return store.get(await scope()); },
    async set(value: T): Promise<void> { store.set(await scope(), value); },
    async clear(): Promise<void> { store.delete(await scope()); },
  };
}
