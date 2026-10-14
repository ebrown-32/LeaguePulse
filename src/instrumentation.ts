/**
 * Runs once when a server starts.
 *
 * Registers the ESPN adapter for leagueFetch (src/lib/providers/leagueFetch.ts)
 * to call on the server. It is registered here rather than imported there
 * because client components import leagueFetch, and the adapter must never
 * reach a browser bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { serveLeagueData } = await import('./lib/providers/espn/serve');
  globalThis.__lpLeagueData = serveLeagueData;
}
