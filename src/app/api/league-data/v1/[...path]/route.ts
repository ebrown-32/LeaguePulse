/**
 * ESPN league data for the browser, in Sleeper's shapes.
 *
 * Client components fetch Sleeper URLs; for an ESPN league leagueFetch sends
 * them here instead (ESPN needs the league's credentials and does not answer
 * other sites' pages). Only this site's own league is served: see serve.ts.
 */

import { serveLeagueData } from '@/lib/providers/espn/serve';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return serveLeagueData(path.map(encodeURIComponent).join('/') + new URL(req.url).search);
}
