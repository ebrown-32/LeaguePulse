/**
 * An ESPN league's connection, for its admin.
 *
 * GET says whether this site is an ESPN league, whether its data is coming
 * through, and when it last did. PUT replaces the league's ESPN cookies (the
 * usual fix: ESPN signs them out after about a year), testing them against
 * ESPN before anything is saved. The cookies themselves are never returned.
 *
 * Self-hosted: read only; the cookies are ESPN_SWID and ESPN_S2 in the
 * environment.
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { getRootLeagueId } from '@/config/league';
import { parseEspnLeague } from '@/lib/providers/ids';
import { cleanCredentials, getEspnCredentials, setEspnCredentials } from '@/lib/providers/espn/credentials';
import { findEspnLeague, FIND_MESSAGES } from '@/lib/providers/espn/lookup';
import { getEspnHealth, syncLeague } from '@/lib/providers/espn/data';

export const dynamic = 'force-dynamic';

const hosted = () => process.env.LP_HOSTED === '1';
const deny = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

async function ownLeague() {
  return parseEspnLeague(await getRootLeagueId());
}

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return deny();
  const espn = await ownLeague();
  if (!espn) return NextResponse.json({ provider: 'sleeper' });
  const [creds, health] = await Promise.all([getEspnCredentials(espn.leagueId), getEspnHealth(espn.leagueId)]);
  return NextResponse.json({
    provider: 'espn',
    mode: hosted() ? 'hosted' : 'self-hosted',
    espnLeagueId: espn.leagueId,
    hasCredentials: Boolean(creds),
    health,
  });
}

export async function PUT(req: Request) {
  if (!(await isAdminRequest(req))) return deny();
  if (!hosted()) return NextResponse.json({ error: 'Set ESPN_SWID and ESPN_S2 in the deployment environment.' }, { status: 400 });
  const espn = await ownLeague();
  if (!espn) return NextResponse.json({ error: 'This is not an ESPN league' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const creds = cleanCredentials(body);
  if (!creds) return NextResponse.json({ error: 'Those do not look like ESPN cookies. SWID is in {curly braces}; espn_s2 is a long string.' }, { status: 400 });

  const found = await findEspnLeague(espn.leagueId, creds);
  if (!found.ok) return NextResponse.json({ error: FIND_MESSAGES[found.reason] }, { status: 400 });

  await setEspnCredentials(espn.leagueId, creds);
  // Pull the current season straight away, so the site recovers now rather
  // than at the next scheduled sync.
  await syncLeague(espn.leagueId, Number(found.league.season)).catch(() => {});
  return NextResponse.json({ ok: true, health: await getEspnHealth(espn.leagueId) });
}
