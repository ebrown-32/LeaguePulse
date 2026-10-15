/**
 * Where finished seasons are kept: built once, stored permanently, compressed.
 *
 * In Redis under the league's own prefix (gzip, about a tenth of the JSON's
 * size, so even a big season sits well under any per-value limit), and in
 * memory for the life of the server process. A season that is not finished,
 * or could not be recorded completely, is remembered as "none" for a few
 * minutes so a page full of requests does not ask again for each one.
 *
 * Server only. leagueFetch reaches it through globalThis (see the bottom of
 * this file and src/instrumentation.ts).
 */

import { gzipSync, gunzipSync } from 'node:zlib';
import { getRedis } from '@/lib/redisClient';
import { buildBundle } from './build';
import { BUNDLE_VERSION, lookup, type BundleRef, type Recorded, type SeasonBundle } from './paths';

const KEY = (leagueId: string) => `league_bundle_v${BUNDLE_VERSION}:${leagueId}`;
const NONE_MS = 10 * 60 * 1000;
const MEMORY_MAX = 40;

const memory = new Map<string, SeasonBundle>();
const none = new Map<string, number>();
const inflight = new Map<string, Promise<SeasonBundle | null>>();
/** Draft id to the league whose bundle holds it. */
const draftLeague = new Map<string, string>();

function remember(b: SeasonBundle) {
  memory.delete(b.leagueId);
  memory.set(b.leagueId, b);
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
  for (const d of Object.keys(b.drafts)) draftLeague.set(d, b.leagueId);
}

async function load(leagueId: string): Promise<SeasonBundle | null> {
  const redis = getRedis().client;
  const stored = await redis?.get(KEY(leagueId)).catch(() => null);
  if (stored) {
    try {
      const b = JSON.parse(gunzipSync(Buffer.from(stored, 'base64')).toString('utf8')) as SeasonBundle;
      if (b.v === BUNDLE_VERSION) return b;
    } catch { /* rebuild below */ }
  }
  const built = await buildBundle(leagueId);
  if (built && redis) {
    await redis.set(KEY(leagueId), gzipSync(JSON.stringify(built)).toString('base64'))
      .catch(err => console.error('[bundles] could not store', leagueId, err));
  }
  return built;
}

/** A finished season's bundle, or null for a season that is still live. */
export async function getBundle(leagueId: string): Promise<SeasonBundle | null> {
  const hit = memory.get(leagueId);
  if (hit) return hit;
  if ((none.get(leagueId) ?? 0) > Date.now()) return null;
  let p = inflight.get(leagueId);
  if (!p) {
    p = load(leagueId).finally(() => inflight.delete(leagueId));
    inflight.set(leagueId, p);
  }
  const b = await p.catch(err => { console.error('[bundles]', leagueId, err); return null; });
  if (b) remember(b); else none.set(leagueId, Date.now() + NONE_MS);
  return b;
}

/** Forget a season's bundle, so it is recorded again on the next visit. */
export async function dropBundle(leagueId: string): Promise<void> {
  memory.delete(leagueId);
  none.delete(leagueId);
  await getRedis().client?.del(KEY(leagueId));
}

const serverLookup = async (ref: BundleRef): Promise<Recorded | undefined> => {
  const leagueId = ref.kind === 'league' ? ref.id : draftLeague.get(ref.id) ?? (ref.id.startsWith('espn-') ? ref.id : null);
  if (!leagueId) return undefined;
  const b = await getBundle(leagueId);
  if (b) return lookup(b, ref);
  // The season is still being played: its settled weeks are kept too.
  const { settledLookup } = await import('./settled');
  return settledLookup(ref);
};

// Registered whenever this module loads (and at startup, by instrumentation).
globalThis.__lpBundleLookup = serverLookup;
