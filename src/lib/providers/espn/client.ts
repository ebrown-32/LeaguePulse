/**
 * ESPN's fantasy football API: the few requests the adapter makes.
 *
 * Unofficial and undocumented, so everything here is defensive: a timeout on
 * every request, one retry on a network error or a 5xx, and every failure
 * sorted into one of three kinds the rest of the adapter can act on:
 *
 *   auth          401/403. A private league without credentials, or with
 *                 cookies that have expired. Needs the commissioner.
 *   not_found     404. No such league, or no such season of it.
 *   unavailable   anything else: ESPN down, slow, or answering in a shape we
 *                 do not recognise. The last good copy is served meanwhile.
 *
 * ESPN moved this API to the lm-api-reads host in 2024. If it moves again,
 * HOST is the one line to change.
 */

const HOST = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';
const TIMEOUT_MS = 15_000;

export type EspnErrorKind = 'auth' | 'not_found' | 'unavailable';

export class EspnError extends Error {
  constructor(public kind: EspnErrorKind, message: string, public status?: number) {
    super(message);
    this.name = 'EspnError';
  }
}

/** The two session cookies ESPN uses for private leagues. Never logged, never returned to a browser. */
export interface EspnCredentials { swid: string; s2: string }

/**
 * At most four requests to ESPN at a time from one server. A cold page can ask
 * for a whole season at once (seventeen weeks), and a burst like that is the
 * likeliest way to get an address rate limited.
 */
const MAX_CONCURRENT = 4;
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>(r => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

function get(path: string, creds: EspnCredentials | null, filter?: unknown): Promise<any> {
  return slot(() => request(path, creds, filter));
}

async function request(path: string, creds: EspnCredentials | null, filter?: unknown): Promise<any> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (creds) headers.cookie = `SWID=${creds.swid}; espn_s2=${creds.s2}`;
  if (filter) headers['x-fantasy-filter'] = JSON.stringify(filter);

  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${HOST}${path}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      last = err;
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new EspnError('auth', 'ESPN refused access to this league', res.status);
    if (res.status === 404) throw new EspnError('not_found', 'ESPN has no such league or season', 404);
    if (res.status >= 500) { last = new Error(`ESPN ${res.status}`); continue; }
    if (!res.ok) throw new EspnError('unavailable', `ESPN answered ${res.status}`, res.status);
    // An expired session is sometimes a 200 with a login page rather than a 401.
    if (!(res.headers.get('content-type') ?? '').includes('json')) {
      throw new EspnError(creds ? 'auth' : 'unavailable', 'ESPN did not return league data', res.status);
    }
    return res.json();
  }
  throw new EspnError('unavailable', `ESPN could not be reached: ${last instanceof Error ? last.message : 'unknown error'}`);
}

const leaguePath = (leagueId: string, season: number) => `/seasons/${season}/segments/0/leagues/${leagueId}`;

/**
 * Seasons before 2018 live behind a different endpoint, which answers with a
 * list. Libraries that read ESPN use it; it has not been checked against a
 * real pre-2018 league here.
 */
async function league(leagueId: string, season: number, query: string, creds: EspnCredentials | null, filter?: unknown) {
  if (season >= 2018) return get(`${leaguePath(leagueId, season)}?${query}`, creds, filter);
  const list = await get(`/leagueHistory/${leagueId}?seasonId=${season}&${query}`, creds, filter);
  const one = Array.isArray(list) ? list[0] : list;
  if (!one) throw new EspnError('not_found', 'ESPN has no such season of this league', 404);
  return one;
}

/** Settings, teams, rosters, schedule, status and draft: everything but weekly box scores. */
export function fetchSeason(leagueId: string, season: number, creds: EspnCredentials | null) {
  return league(leagueId, season,
    'view=mSettings&view=mTeam&view=mRoster&view=mMatchup&view=mStatus&view=mNav&view=mDraftDetail', creds);
}

/** One week's box scores, filtered to that week's games (about a fifth of the unfiltered size). */
export function fetchWeek(leagueId: string, season: number, week: number, period: number, creds: EspnCredentials | null) {
  return league(leagueId, season, `view=mMatchupScore&view=mBoxscore&scoringPeriodId=${week}`, creds,
    { schedule: { filterMatchupPeriodIds: { value: [period] } } });
}

export function fetchTransactions(leagueId: string, season: number, week: number, creds: EspnCredentials | null) {
  return league(leagueId, season, `view=mTransactions2&scoringPeriodId=${week}`, creds);
}

/** Every player ESPN had that season, with name, position and team. Public, no credentials needed. */
export async function fetchSeasonPlayers(season: number): Promise<any[]> {
  const list = await get(`/seasons/${season}/players?scoringPeriodId=0&view=players_wl`, null, { filterActive: null });
  if (!Array.isArray(list)) throw new EspnError('unavailable', 'ESPN player list was not a list');
  return list;
}
