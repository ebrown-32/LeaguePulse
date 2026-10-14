/**
 * Answer a Sleeper API path for an ESPN league, from the kept copy.
 *
 * Takes the path a call site would have sent to api.sleeper.app (see
 * leagueFetch.ts) and returns what Sleeper would: same status codes for the
 * cases the app handles (404 for a league or season that does not exist), same
 * JSON.
 *
 * Only the ESPN league this site is for is served. Credentials belong to that
 * league, so without this check a site could be used to read some other
 * private league its commissioner happens to be in.
 */

import { parseEspnLeague, parseEspnUser } from '../ids';
import { EspnError } from './client';
import { seasonBase, seasonWeek, seasonTransactions, seasonExists } from './data';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** The ESPN league this request may read: the site's own. */
async function ownEspnLeague(): Promise<string | null> {
  let root: string | null | undefined;
  if (process.env.LP_HOSTED === '1') {
    const { currentTenant } = await import('@/lib/tenant/context');
    root = (await currentTenant())?.leagueId;
  } else {
    root = process.env.NEXT_PUBLIC_LEAGUE_ID;
  }
  return (root && parseEspnLeague(root)?.leagueId) || null;
}

export async function serveLeagueData(path: string): Promise<Response> {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  const own = await ownEspnLeague();

  try {
    if (parts[0] === 'user') {
      // user/<manager>/leagues/nfl/<season>: how the app finds next season's league.
      const u = parseEspnUser(parts[1] ?? '');
      const season = Number(parts[4]);
      if (!u || u.leagueId !== own || parts[2] !== 'leagues' || !season) return json([]);
      if (!(await seasonExists(u.leagueId, season))) return json([]);
      return json([(await seasonBase(u.leagueId, season)).league]);
    }

    const id = parseEspnLeague(parts[1] ?? '');
    if (!id) return json(null, 404);
    if (id.leagueId !== own) return json({ error: 'Not this site’s league' }, 403);
    const { leagueId: lid, season } = id;
    // league/<id>/<season>/rosters is one call site's spelling of league/<id>/rosters.
    const rest = parts.slice(2).filter(p => p !== String(season));

    if (parts[0] === 'draft') {
      const base = await seasonBase(lid, season);
      if (rest.length === 0) return json(base.drafts[0] ?? null);
      if (rest[0] === 'picks') return json(base.picks);
      if (rest[0] === 'traded_picks') return json([]);
      return json(null, 404);
    }

    if (parts[0] !== 'league') return json(null, 404);
    const [what, arg] = rest;
    if (what === 'matchups') return json(await seasonWeek(lid, season, Number(arg)));
    if (what === 'transactions') return json(await seasonTransactions(lid, season, Number(arg)));

    const base = await seasonBase(lid, season);
    switch (what) {
      case undefined: return json(base.league);
      case 'users': return json(base.users);
      case 'rosters': return json(base.rosters);
      case 'winners_bracket': return json(base.winners_bracket);
      case 'losers_bracket': return json(base.losers_bracket);
      case 'drafts': return json(base.drafts);
      case 'traded_picks': return json([]);
      default: return json(null, 404);
    }
  } catch (err) {
    if (err instanceof EspnError && err.kind === 'not_found') return json(null, 404);
    // Nothing kept yet and ESPN would not answer. The reason goes to the
    // health record; the page sees an ordinary failure.
    console.error('[espn] could not serve', path, err instanceof Error ? err.message : err);
    return json({ error: 'League data is temporarily unavailable', reason: err instanceof EspnError ? err.kind : 'unavailable' }, 503);
  }
}

// Registered again whenever this module loads, not only at startup
// (src/instrumentation.ts): in development a code change reloads this module
// but not the startup hook, which would otherwise keep serving the old code.
globalThis.__lpLeagueData = serveLeagueData;
