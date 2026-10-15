/**
 * Runs once when a server starts.
 *
 * Registers the server-only parts of leagueFetch (src/lib/providers/leagueFetch.ts):
 * the ESPN adapter, the store of finished seasons, the commissioner's entries,
 * and the count of calls to Sleeper. They are registered here
 * rather than imported there because client components import leagueFetch,
 * and neither may reach a browser bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { serveLeagueData } = await import('./lib/providers/espn/serve');
  globalThis.__lpLeagueData = serveLeagueData;
  const { noteSleeperCalls } = await import('./lib/providers/sleeperBudget');
  globalThis.__lpNoteSleeper = noteSleeperCalls;
  // Register themselves on load.
  await import('./lib/bundles/store');
  await import('./lib/manual/store');
}
