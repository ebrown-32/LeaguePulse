/**
 * Runs once when a server starts.
 *
 * Registers the server-only parts of leagueFetch (src/lib/providers/leagueFetch.ts):
 * the ESPN adapter, the store of finished seasons, the commissioner's entries,
 * and the count of calls to Sleeper; and the back office's watch over every call the server makes
 * to another service (lib/ops/monitor). They are registered here
 * rather than imported there because client components import leagueFetch,
 * and neither may reach a browser bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { serveLeagueData } = await import('./lib/providers/espn/serve');
  globalThis.__lpLeagueData = serveLeagueData;
  const { noteSleeperCalls } = await import('./lib/providers/sleeperBudget');
  globalThis.__lpNoteSleeper = noteSleeperCalls;
  const { watchFetch } = await import('./lib/ops/monitor');
  watchFetch();
  // Register themselves on load.
  await import('./lib/bundles/store');
  await import('./lib/manual/store');
}

/** A server error, for the back office (lib/ops/monitor). Never throws: reporting must not fail the request twice. */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath: string; routeType: string }) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { noteError } = await import('./lib/ops/monitor');
    await noteError({
      message: err instanceof Error ? err.message : String(err),
      digest: typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : undefined,
      path: `${request.method} ${request.path}`.slice(0, 300), route: context.routePath, kind: context.routeType,
    });
  } catch { /* nothing to be done */ }
}
