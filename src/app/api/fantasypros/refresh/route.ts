import { bearerMatches } from '@/lib/platform/operator';
import { NextResponse } from 'next/server';
import { refreshRankings } from '@/lib/fantasyProsRefresh';
import { isAdminRequest } from '@/lib/tenant/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The daily FantasyPros refresh (lib/fantasyProsRefresh). The only thing in
 * the app, with the admin's "Refresh now", that calls FantasyPros; every
 * reader is served the cached snapshot.
 *
 * Hosted: the scheduler pokes the bare domain, where there is no league, and
 * this fans out one request per live league (`?tenant=`), so each runs on its
 * own key in its own invocation. A league without a key skips at once.
 */

async function authorized(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  // Vercel attaches this header to scheduled invocations automatically.
  if (bearerMatches(request, secret)) return true;
  if (await isAdminRequest(request)) return true;
  // With neither configured we are running locally. Never on the hosted
  // product, where an unset secret must not mean "open".
  return process.env.LP_HOSTED !== '1' && !secret && !process.env.ADMIN_PASSWORD;
}

async function run(by: 'schedule' | 'admin') {
  try {
    const result = await refreshRankings(by);
    return NextResponse.json(result, { status: result.ok || result.skipped ? 200 : 502 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[fantasypros/refresh]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

async function fanOut(request: Request): Promise<Response> {
  const { listTenants, isLive } = await import('@/lib/platform/tenants');
  const url = new URL(request.url);
  // Vercel's cron calls the deployment's own address, which can sit behind
  // deployment protection; each league is called on the real domain instead.
  const root = process.env.NEXT_PUBLIC_LP_ROOT_DOMAIN?.trim();
  if (root && !/localhost|127\.0\.0\.1/.test(url.hostname)) { url.protocol = 'https:'; url.host = root; url.port = ''; }
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is required on the hosted product' }, { status: 500 });
  const tenants = (await listTenants()).filter(isLive);
  // A refresh takes about fifteen seconds per board; this invocation stops
  // waiting well before its own limit. A league still running finishes anyway.
  const WAIT_MS = 45_000;
  const results = await Promise.all(tenants.map(t => {
    const target = new URL(url);
    target.searchParams.set('tenant', t.slug);
    const call = fetch(target, { headers: { authorization: `Bearer ${secret}` }, cache: 'no-store' })
      .then(async r => ({ league: t.slug, status: r.status, ...(await r.json().catch(() => ({}))) }))
      .catch(err => ({ league: t.slug, error: err instanceof Error ? err.message : String(err) }));
    return Promise.race([call, new Promise(resolve => setTimeout(() => resolve({ league: t.slug, started: true }), WAIT_MS))]);
  }));
  return NextResponse.json({ leagues: results.length, results });
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bySecret = bearerMatches(request, process.env.CRON_SECRET);

  if (process.env.LP_HOSTED === '1') {
    const { currentTenant, runAsTenant } = await import('@/lib/tenant/context');
    const named = new URL(request.url).searchParams.get('tenant');
    // Naming a league is the scheduler's alone: an admin is authorised for their own league only.
    if (named && !bySecret) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!named && (await currentTenant())) return run(bySecret ? 'schedule' : 'admin');
    if (!named) return bySecret ? fanOut(request) : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { getTenant, isLive } = await import('@/lib/platform/tenants');
    const tenant = await getTenant(named);
    if (!tenant || !isLive(tenant)) return NextResponse.json({ skipped: 'league-not-live' });
    return runAsTenant(tenant, () => run('schedule'));
  }
  return run(bySecret ? 'schedule' : 'admin');
}
