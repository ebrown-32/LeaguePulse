/**
 * Season bundles: which requests a finished season's bundle answers.
 *
 * A finished season never changes, yet pages asked for it one week at a time,
 * every visit: matchups and transactions for each of eighteen weeks of each
 * past season, about a thousand requests for a league with ten seasons. A
 * bundle is that season recorded once: the exact response to every one of
 * those requests, kept permanently, fetched in one go. See store.ts.
 *
 * The responses are recorded as Sleeper (or the ESPN adapter, which answers
 * in Sleeper's shapes) gave them, status and body, so a page reading from a
 * bundle gets precisely what it would have got from the source.
 *
 * No imports: runs in the browser and in Node's own test runner.
 */

/**
 * 2: ESPN seasons' transactions include trades rebuilt from weekly rosters.
 * 3: ESPN seasons say what they are missing (league metadata.coverage).
 * 4: ESPN names with mangled emoji are cleaned.
 * 5: Rebuilt ESPN trades include players who only passed through a roster.
 * 6: ESPN draft picks carry the player's name, position and team.
 */
export const BUNDLE_VERSION = 6;

/** Regular season and playoffs never go past week 18. Weeks with no games are recorded as Sleeper answers them. */
export const MAX_WEEK = 18;

const SLEEPER_V1 = 'https://api.sleeper.app/v1/';
/** A Sleeper league, an ESPN season, or a demo season (src/lib/demo). */
const LEAGUE_ID = '(\\d{8,22}|espn-\\d{1,12}-\\d{4}|demo-\\d{4})';
const PARTS = '(users|rosters|winners_bracket|losers_bracket|drafts|traded_picks)';

export type BundleRef =
  | { kind: 'league'; id: string; key: string }
  | { kind: 'draft'; id: string; key: string };

/**
 * What a URL asks of a bundle, or null when bundles do not cover it (players,
 * NFL state, a user's leagues: anything that is not one season's data).
 * `key` is the request relative to its league or draft: '' for the league
 * itself, 'users', 'matchups/3', 'picks'.
 */
export function bundleRefOf(url: string): BundleRef | null {
  if (!url.startsWith(SLEEPER_V1) || url.includes('?')) return null;
  const path = url.slice(SLEEPER_V1.length).replace(/\/+$/, '');
  let m = new RegExp(`^league/${LEAGUE_ID}$`).exec(path);
  if (m) return { kind: 'league', id: m[1], key: '' };
  m = new RegExp(`^league/${LEAGUE_ID}/${PARTS}$`).exec(path);
  if (m) return { kind: 'league', id: m[1], key: m[2] };
  // One call site spells rosters as league/<id>/<season>/rosters.
  m = new RegExp(`^league/${LEAGUE_ID}/\\d{4}/rosters$`).exec(path);
  if (m) return { kind: 'league', id: m[1], key: 'rosters' };
  m = new RegExp(`^league/${LEAGUE_ID}/(matchups|transactions)/(\\d{1,2})$`).exec(path);
  if (m) return { kind: 'league', id: m[1], key: `${m[2]}/${Number(m[3])}` };
  m = new RegExp(`^draft/${LEAGUE_ID}(?:/(picks|traded_picks))?$`).exec(path);
  if (m) return { kind: 'draft', id: m[1], key: m[2] ?? '' };
  return null;
}

/** Everything a season's bundle records for the league itself (drafts are added from its drafts list). */
export function leagueKeys(): string[] {
  const keys = ['', 'users', 'rosters', 'winners_bracket', 'losers_bracket', 'drafts', 'traded_picks'];
  for (let w = 1; w <= MAX_WEEK; w++) keys.push(`matchups/${w}`, `transactions/${w}`);
  return keys;
}

export const DRAFT_KEYS = ['', 'picks', 'traded_picks'];

/** A recorded response. */
export interface Recorded { status: number; body: unknown }

export interface SeasonBundle {
  v: number;
  leagueId: string;
  season: number;
  builtAt: number;
  league: Record<string, Recorded>;
  drafts: Record<string, Record<string, Recorded>>;
}

/** The recorded response a ref asks for, or undefined when the bundle has none. */
export function lookup(bundle: SeasonBundle, ref: BundleRef): Recorded | undefined {
  return ref.kind === 'league' ? bundle.league[ref.key] : bundle.drafts[ref.id]?.[ref.key];
}

/**
 * Whether a season is over and settled. The NFL season ends in February, and
 * stat corrections a week or two after; by March a season is final. Only a
 * final season is bundled: the current one is always read live.
 */
export function seasonFinal(season: number, now = new Date()): boolean {
  const year = now.getFullYear();
  return season < year - 1 || (season === year - 1 && now.getMonth() >= 2);
}

/** A recorded response as a fetch Response. */
export function toResponse(r: Recorded): Response {
  const empty = r.status === 204 || r.status === 304;
  return new Response(empty ? null : JSON.stringify(r.body), {
    status: r.status,
    headers: { 'content-type': 'application/json', 'x-lp-bundle': '1' },
  });
}
