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
 * A season of a league, by either of ESPN's two endpoints.
 *
 * Seasons before 2018 are only behind `leagueHistory`, which answers with a
 * list. Later seasons are behind the seasons endpoint, but ESPN can refuse a
 * past one there that `leagueHistory` still serves (a real league: 2018 and
 * 2019 refused, 2020 on served; its history endpoint served every one). So a
 * past season that is refused or missing is asked for there too. Seasons
 * read that way have scores but no player-by-player lineups, which ESPN does
 * not keep that far back.
 */
async function history(leagueId: string, season: number, query: string, creds: EspnCredentials | null, filter?: unknown) {
  const list = await get(`/leagueHistory/${leagueId}?seasonId=${season}&${query}`, creds, filter);
  const one = Array.isArray(list) ? list.find(l => Number(l?.seasonId) === season) ?? list[0] : list;
  if (!one) throw new EspnError('not_found', 'ESPN has no such season of this league', 404);
  // Marked so the translation can say what this season is missing (see coverage).
  return { ...one, lpSource: 'history' };
}

async function league(leagueId: string, season: number, query: string, creds: EspnCredentials | null, filter?: unknown) {
  if (season < 2018) return history(leagueId, season, query, creds, filter);
  try {
    return await get(`${leaguePath(leagueId, season)}?${query}`, creds, filter);
  } catch (err) {
    const past = season < new Date().getFullYear();
    if (!past || !(err instanceof EspnError) || (err.kind !== 'auth' && err.kind !== 'not_found')) throw err;
    try { return await history(leagueId, season, query, creds, filter); } catch { throw err; }
  }
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

/**
 * A season's completed trades, from the league's activity feed: the one place
 * ESPN keeps a finished trade's players (its transaction list keeps them only
 * on the proposal, which it stops returning once the trade goes through).
 * ESPN deletes a league's feed when the season is over, so a past season has
 * none: an empty list, not an error.
 */
export async function fetchTrades(leagueId: string, season: number, creds: EspnCredentials | null): Promise<any[]> {
  const topics: any[] = [];
  for (let offset = 0; offset < 1000; offset += 200) {
    let page: any;
    try {
      page = await get(`${leaguePath(leagueId, season)}/communication/?view=kona_league_communication`, creds, {
        topics: {
          filterType: { value: ['ACTIVITY_TRANSACTIONS'] },
          limit: 200, offset,
          limitPerMessageSet: { value: 25 },
          sortMessageDate: { sortPriority: 1, sortAsc: false },
          sortFor: { sortPriority: 2, sortAsc: false },
          // 244: a player moved in a trade.
          filterIncludeMessageTypeIds: { value: [244] },
        },
      });
    } catch (err) {
      if (err instanceof EspnError && err.kind === 'not_found') return topics;
      throw err;
    }
    const batch = Array.isArray(page?.topics) ? page.topics : [];
    topics.push(...batch);
    if (batch.length < 200) break;
  }
  return topics;
}

/**
 * When each NFL week of a season ends: the kickoff of its last game, from
 * ESPN's public pro schedule. Used to place a trade in the week it happened.
 */
export async function fetchWeekEnds(season: number): Promise<Record<string, number>> {
  const data = await get(`/seasons/${season}?view=proTeamSchedules_wl`, null);
  const ends: Record<string, number> = {};
  for (const team of data?.settings?.proTeams ?? []) {
    for (const [week, games] of Object.entries(team.proGamesByScoringPeriod ?? {})) {
      for (const g of games as any[]) if (Number(g?.date) > (ends[week] ?? 0)) ends[week] = Number(g.date);
    }
  }
  return ends;
}
