/**
 * The ESPN session cookies a private league needs (SWID and espn_s2).
 *
 * Self-hosted: ESPN_SWID and ESPN_S2 from the environment, and nowhere else,
 * as before.
 *
 * Hosted: encrypted with the platform key (AES-256-GCM, see
 * src/lib/tenant/secrets.ts) and kept under the ESPN league's own id, not a
 * site's, because they are needed before the site exists (sign-up checks
 * them) and by the sync job, which runs outside any request. Any member's
 * cookies can read the league, and one league has at most one site, so the
 * league is the natural owner. No route ever returns them.
 */

import { getRedis } from '@/lib/redisClient';
import type { EspnCredentials } from './client';

const KEY = (espnLeagueId: string) => `lp_espn_creds:${espnLeagueId}`;
const hosted = () => process.env.LP_HOSTED === '1';

/**
 * Tidy what a commissioner pastes: surrounding quotes, a `name=` prefix
 * copied along with the value, whitespace. SWID always has its braces.
 */
export function cleanCredentials(input: { swid?: string; s2?: string }): EspnCredentials | null {
  const tidy = (v: string | undefined, name: string) =>
    String(v ?? '').trim().replace(new RegExp(`^${name}=`, 'i'), '').replace(/^["']|["']$/g, '').trim();
  let swid = tidy(input.swid, 'SWID');
  const s2 = tidy(input.s2, 'espn_s2');
  if (!swid || !s2) return null;
  if (!swid.startsWith('{')) swid = `{${swid}`;
  if (!swid.endsWith('}')) swid = `${swid}}`;
  if (!/^\{[0-9A-Fa-f-]{30,40}\}$/.test(swid) || s2.length < 40 || /\s/.test(s2)) return null;
  return { swid: swid.toUpperCase(), s2 };
}

export async function getEspnCredentials(espnLeagueId: string): Promise<EspnCredentials | null> {
  if (!hosted()) {
    const swid = process.env.ESPN_SWID?.trim(), s2 = process.env.ESPN_S2?.trim();
    return swid && s2 ? cleanCredentials({ swid, s2 }) : null;
  }
  const sealed = await getRedis().client?.get(KEY(espnLeagueId)).catch(() => null);
  if (!sealed) return null;
  try {
    const { decrypt } = await import('@/lib/tenant/secrets');
    return JSON.parse(decrypt(sealed)) as EspnCredentials;
  } catch {
    return null;
  }
}

/**
 * Save (or, with null, forget) a league's cookies. `ttlSeconds` for cookies
 * given at sign-up, before payment: they expire on their own if the checkout
 * is never completed, and are saved again without one when it is.
 */
export async function setEspnCredentials(espnLeagueId: string, creds: EspnCredentials | null, ttlSeconds?: number): Promise<void> {
  if (!hosted()) throw new Error('Self-hosted ESPN credentials come from ESPN_SWID and ESPN_S2');
  const r = getRedis().client;
  if (!r) throw new Error('Storage is not configured');
  if (!creds) { await r.del(KEY(espnLeagueId)); return; }
  const { encrypt } = await import('@/lib/tenant/secrets');
  await r.set(KEY(espnLeagueId), encrypt(JSON.stringify(creds)), ttlSeconds);
}

/** Make sign-up cookies permanent once the league is paid for. */
export async function keepEspnCredentials(espnLeagueId: string): Promise<void> {
  const creds = await getEspnCredentials(espnLeagueId);
  if (creds) await setEspnCredentials(espnLeagueId, creds);
}
