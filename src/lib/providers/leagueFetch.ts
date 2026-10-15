/**
 * `fetch` for Sleeper league data: serves ESPN leagues and finished seasons
 * too, and asks for each thing once.
 *
 * Every call site keeps its Sleeper URL. In order:
 *
 *   1. A finished season is answered from its bundle (src/lib/bundles): the
 *      responses recorded once, kept permanently, loaded in one request per
 *      season instead of one per week.
 *   2. A URL that names an ESPN league, draft or manager (see ids.ts) is
 *      answered by the ESPN adapter, in Sleeper's shapes.
 *   3. Anything else, every live Sleeper request, goes to `fetch` with
 *      exactly the URL and options it was given.
 *
 * In the browser, identical requests made at the same moment share one
 * response: pages often ask for the same week from several components at
 * once.
 *
 * Server-only parts (the ESPN adapter, the bundle store) are registered on
 * globalThis at startup by src/instrumentation.ts rather than imported here,
 * because client components import this module and those parts read
 * credentials and storage.
 */

import { bundleRefOf, lookup, toResponse, BUNDLE_VERSION, type BundleRef, type Recorded, type SeasonBundle } from '../bundles/paths.ts';
import { applyManual, type ManualData } from '../manual/model.ts';

const SLEEPER_V1 = 'https://api.sleeper.app/v1/';
/** Ids this app answers itself: ESPN leagues, drafts and managers, and seasons a commissioner entered (`manual-<year>`). */
const ESPN_PATH = /^(?:(?:league|draft)\/(?:espn-\d{1,12}-\d{4}|manual-\d{4})(?:[/?]|$)|user\/espn-\d{1,12}-u-)/;

export type LeagueDataServer = (path: string) => Promise<Response>;
export type BundleLookup = (ref: BundleRef) => Promise<Recorded | undefined>;

declare global {
  // eslint-disable-next-line no-var
  var __lpLeagueData: LeagueDataServer | undefined;
  // eslint-disable-next-line no-var
  var __lpBundleLookup: BundleLookup | undefined;
  // eslint-disable-next-line no-var
  var __lpManual: (() => Promise<ManualData>) | undefined;
  // eslint-disable-next-line no-var
  var __lpNoteSleeper: ((n?: number) => void) | undefined;
}

const browser = () => typeof window !== 'undefined';
const bundlesOn = () => process.env.NEXT_PUBLIC_LP_BUNDLES !== '0';

/** The Sleeper-style path an ESPN URL asks for, or null for any other URL. */
export function espnPathOf(url: string): string | null {
  if (!url.startsWith(SLEEPER_V1)) return null;
  const path = url.slice(SLEEPER_V1.length);
  return ESPN_PATH.test(path) ? path : null;
}

// ── Bundles in the browser ──────────────────────────────────────────────────

const clientBundles = new Map<string, Promise<SeasonBundle | null>>();
/** Draft id to the league whose bundle holds it, learnt as bundles load. */
const draftLeague = new Map<string, string>();

function clientBundle(leagueId: string): Promise<SeasonBundle | null> {
  let p = clientBundles.get(leagueId);
  if (!p) {
    p = fetch(`/api/league-bundle/${encodeURIComponent(leagueId)}?v=${BUNDLE_VERSION}`)
      // A live season answers 404; its body is still read, or the request
      // never finishes and holds one of the browser's few connections.
      .then(r => (r.ok ? r.json() as Promise<SeasonBundle> : r.text().then(() => null)))
      .then(b => {
        if (b) for (const d of Object.keys(b.drafts ?? {})) draftLeague.set(d, leagueId);
        return b;
      })
      .catch(() => null);
    clientBundles.set(leagueId, p);
  }
  return p;
}

const clientLookup: BundleLookup = async ref => {
  // An ESPN draft's id is its league's id; a Sleeper draft is found through its league's bundle.
  const leagueId = ref.kind === 'league' ? ref.id : draftLeague.get(ref.id) ?? (ref.id.startsWith('espn-') ? ref.id : null);
  if (!leagueId) return undefined;
  const b = await clientBundle(leagueId);
  return b ? lookup(b, ref) : undefined;
};

async function fromBundle(url: string): Promise<Response | null> {
  if (!bundlesOn()) return null;
  const ref = bundleRefOf(url);
  if (!ref) return null;
  const find = browser() ? clientLookup : globalThis.__lpBundleLookup;
  if (!find) return null;
  const hit = await find(ref).catch(() => undefined);
  return hit ? toResponse(hit) : null;
}

// ── Live requests ───────────────────────────────────────────────────────────

/** In the browser: requests in flight (and for a moment after), by URL, so simultaneous asks share one. */
const inflight = new Map<string, Promise<{ status: number; statusText: string; type: string; text: string }>>();
const SHARE_MS = 1500;

function sharedFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (!browser()) {
    // Our servers' calls are what Sleeper's per-minute limit counts (see sleeperBudget.ts).
    if (url.startsWith('https://api.sleeper.app/')) globalThis.__lpNoteSleeper?.();
    return fetch(url, init);
  }
  if (method !== 'GET' || init?.body) return fetch(url, init);
  let p = inflight.get(url);
  if (!p) {
    p = fetch(url, init).then(async r => ({
      status: r.status, statusText: r.statusText, type: r.headers.get('content-type') ?? 'application/json', text: await r.text(),
    }));
    inflight.set(url, p);
    p.finally(() => setTimeout(() => inflight.delete(url), SHARE_MS)).catch(() => {});
  }
  return p.then(x => new Response(x.status === 204 || x.status === 304 ? null : x.text, {
    status: x.status, statusText: x.statusText, headers: { 'content-type': x.type },
  }));
}

/**
 * The request as the source answers it, with no bundle: what bundles are
 * built from (see src/lib/bundles/build.ts), and what everything falls back to.
 */
export function rawLeagueFetch(input: string, init?: RequestInit): Promise<Response> {
  const path = espnPathOf(input);
  if (path === null) return sharedFetch(input, init);
  if (browser()) {
    return sharedFetch(`/api/league-data/v1/${path}`, { cache: 'no-store', signal: init?.signal });
  }
  const serve = globalThis.__lpLeagueData;
  if (!serve) {
    return Promise.resolve(new Response(JSON.stringify({ error: 'League data is not available' }), {
      status: 503, headers: { 'content-type': 'application/json' },
    }));
  }
  return serve(path);
}

// ── The commissioner's entries ──────────────────────────────────────────────

let clientManual: Promise<ManualData | null> | null = null;

function manualData(): Promise<ManualData | null> {
  if (!browser()) return globalThis.__lpManual?.().catch(() => null) ?? Promise.resolve(null);
  clientManual ??= fetch('/api/league-manual').then(r => (r.ok ? r.json() : null)).catch(() => null);
  return clientManual;
}

/** Only these responses can carry entries: a season's league record, and its weekly transactions. */
const MANUAL_TOUCHES = /^league\/[^/?]+(?:\/transactions\/\d+)?$/;

/** The response with the commissioner's entries joined in (see src/lib/manual). */
async function withManual(url: string, res: Response): Promise<Response> {
  if (!url.startsWith(SLEEPER_V1) || !res.ok) return res;
  const path = url.slice(SLEEPER_V1.length);
  if (!MANUAL_TOUCHES.test(path)) return res;
  const data = await manualData();
  if (!data || (!data.moves?.length && !data.seasons?.length)) return res;
  const body = await res.clone().json().catch(() => undefined);
  if (body === undefined) return res;
  const next = applyManual(data, path, body);
  if (next === body) return res;
  return new Response(JSON.stringify(next), { status: res.status, headers: { 'content-type': 'application/json' } });
}

export async function leagueFetch(input: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const read = method === 'GET' && !init?.body;
  const res = (read && await fromBundle(input)) || await rawLeagueFetch(input, init);
  return read ? withManual(input, res) : res;
}
