/**
 * Record a finished season: every request a page can make about it, asked of
 * the source once (Sleeper, or the ESPN adapter), with its status and body.
 *
 * About forty-five requests for a season, six at a time. Any request that
 * fails outright (a 5xx, or no answer) abandons the bundle rather than keep a
 * season with holes in it: pages then simply read live, as before, and the
 * next visit tries again.
 */

import { rawLeagueFetch } from '@/lib/providers/leagueFetch';
import { BUNDLE_VERSION, DRAFT_KEYS, leagueKeys, seasonFinal, type Recorded, type SeasonBundle } from './paths';

const SLEEPER_V1 = 'https://api.sleeper.app/v1';
const CONCURRENCY = 6;

class Incomplete extends Error {}

async function record(url: string): Promise<Recorded> {
  const r = await rawLeagueFetch(url, { cache: 'no-store' }).catch(() => null);
  if (!r || r.status >= 500) throw new Incomplete(`${url} answered ${r?.status ?? 'nothing'}`);
  const text = await r.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { throw new Incomplete(`${url} was not JSON`); }
  return { status: r.status, body };
}

async function recordAll(base: string, keys: string[]): Promise<Record<string, Recorded>> {
  const out: Record<string, Recorded> = {};
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < keys.length) {
      const key = keys[next++];
      out[key] = await record(key ? `${base}/${key}` : base);
    }
  }));
  return out;
}

/** The season's bundle, or null when it is not a finished season (or the source would not give all of it). */
export async function buildBundle(leagueId: string): Promise<SeasonBundle | null> {
  const base = `${SLEEPER_V1}/league/${leagueId}`;
  try {
    const info = await record(base);
    const season = Number((info.body as { season?: string } | null)?.season);
    if (info.status !== 200 || !season || !seasonFinal(season)) return null;

    const league = await recordAll(base, leagueKeys().filter(k => k !== ''));
    league[''] = info;

    const drafts: SeasonBundle['drafts'] = {};
    const list = league.drafts?.status === 200 && Array.isArray(league.drafts.body) ? league.drafts.body as { draft_id?: string }[] : [];
    for (const d of list) {
      if (d?.draft_id) drafts[d.draft_id] = await recordAll(`${SLEEPER_V1}/draft/${d.draft_id}`, DRAFT_KEYS);
    }
    return { v: BUNDLE_VERSION, leagueId, season, builtAt: Date.now(), league, drafts };
  } catch (err) {
    if (err instanceof Incomplete) {
      console.warn('[bundles] not bundling', leagueId, err.message);
      return null;
    }
    throw err;
  }
}
