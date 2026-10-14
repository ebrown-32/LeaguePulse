/**
 * Find an ESPN league, for sign-up.
 *
 * POST, not GET: a private league comes with its ESPN cookies, and those must
 * never sit in a URL (or in any log that records URLs). Cookies that work are
 * kept, encrypted, for two days so checkout and the league's first sync can
 * use them; payment makes them permanent (see the Stripe webhook). Nothing
 * here can change the league on ESPN: the cookies are only ever used to read.
 */

import { NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/ai/rateLimit';
import { parseEspnInput, findEspnLeague, FIND_MESSAGES } from '@/lib/providers/espn/lookup';
import { cleanCredentials, getEspnCredentials, setEspnCredentials } from '@/lib/providers/espn/credentials';
import { tenantForLeague, isLive } from '@/lib/platform/tenants';
import { espnLeagueKey } from '@/lib/providers/ids';

export const dynamic = 'force-dynamic';

const SIGNUP_CREDENTIALS_TTL = 2 * 24 * 60 * 60;

export async function POST(req: Request) {
  const { ok } = await rateLimit('lp_lookup_rl_', clientIp(req), 60, 60 * 60 * 1000);
  if (!ok) return NextResponse.json({ error: 'Too many lookups. Try again in a bit.' }, { status: 429 });

  let body: { q?: string; swid?: string; s2?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const lid = parseEspnInput(String(body.q ?? ''));
  if (!lid) return NextResponse.json({ error: 'Paste your ESPN league ID, or the address of your league page' }, { status: 400 });

  const given = body.swid || body.s2;
  const fresh = given ? cleanCredentials(body) : null;
  if (given && !fresh) {
    return NextResponse.json({ error: 'Those do not look like ESPN cookies. SWID is in {curly braces}; espn_s2 is a long string.', needsCredentials: true }, { status: 400 });
  }

  // Any season names the same site (see leagueRegistryKey).
  const existing = await tenantForLeague(espnLeagueKey(lid, new Date().getFullYear())).catch(() => null);
  const hostedAt = existing && isLive(existing) ? existing.slug : null;
  // Cookies saved at an earlier attempt (or by the live site) are used when none are given.
  const creds = fresh ?? await getEspnCredentials(lid);

  const found = await findEspnLeague(lid, creds);
  if (!found.ok) {
    const status = found.reason === 'not_found' ? 404 : found.reason === 'unavailable' ? 503 : 401;
    return NextResponse.json({
      error: FIND_MESSAGES[found.reason],
      needsCredentials: found.reason === 'private' || found.reason === 'bad_credentials',
    }, { status });
  }

  // A live site's cookies are its admin's to change, not a stranger's at sign-up.
  if (fresh && !hostedAt) await setEspnCredentials(lid, fresh, SIGNUP_CREDENTIALS_TTL);

  return NextResponse.json({ user: null, leagues: [{ ...found.league, hostedAt }] });
}
