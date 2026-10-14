/**
 * `fetch` for Sleeper league data that also serves ESPN leagues.
 *
 * Every call site keeps its Sleeper URL. A URL that names an ESPN league,
 * draft or manager (see ids.ts) is answered by the ESPN adapter instead, in
 * Sleeper's shapes; anything else, which is every Sleeper league, goes to
 * `fetch` with exactly the URL and options it was given. A Sleeper league
 * cannot take the ESPN path by accident: its ids are all digits, and the
 * patterns below need the `espn-` forms in full.
 *
 * Where the ESPN answer comes from:
 *   - in the browser, this app's own /api/league-data route (ESPN needs
 *     credentials and refuses requests from other sites, so it is never
 *     called from a browser);
 *   - on the server, the adapter directly. It is registered on globalThis at
 *     startup by src/instrumentation.ts rather than imported here, because
 *     client components import this module and the adapter is server-only
 *     (credentials, crypto, Redis).
 */

const SLEEPER_V1 = 'https://api.sleeper.app/v1/';
const ESPN_PATH = /^(?:league\/espn-\d{1,12}-\d{4}(?:[/?]|$)|draft\/espn-\d{1,12}-\d{4}(?:[/?]|$)|user\/espn-\d{1,12}-u-)/;

export type LeagueDataServer = (path: string) => Promise<Response>;

declare global {
  // eslint-disable-next-line no-var
  var __lpLeagueData: LeagueDataServer | undefined;
}

/** The Sleeper-style path an ESPN URL asks for, or null for any other URL. */
export function espnPathOf(url: string): string | null {
  if (!url.startsWith(SLEEPER_V1)) return null;
  const path = url.slice(SLEEPER_V1.length);
  return ESPN_PATH.test(path) ? path : null;
}

export function leagueFetch(input: string, init?: RequestInit): Promise<Response> {
  const path = espnPathOf(input);
  if (path === null) return fetch(input, init);
  if (typeof window !== 'undefined') {
    return fetch(`/api/league-data/v1/${path}`, { cache: 'no-store', signal: init?.signal });
  }
  const serve = globalThis.__lpLeagueData;
  if (!serve) {
    return Promise.resolve(new Response(JSON.stringify({ error: 'League data is not available' }), {
      status: 503, headers: { 'content-type': 'application/json' },
    }));
  }
  return serve(path);
}
