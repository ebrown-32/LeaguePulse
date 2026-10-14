/**
 * Operator only: the platform's leagues, for the /operator panel.
 *
 *   GET     every league with its status, plan, owner and health
 *   POST    { leagueId, slug }        add a league by hand (a free beta league, no Stripe)
 *   PATCH   { slug, status }          pause ("canceled") or resume ("active") a league
 *   PATCH   { slug, ownerEmail }      hand the league to someone: they become owner
 *                                     when they sign in with that email (the
 *                                     current owner becomes an admin)
 *   DELETE  { slug }                  take a league off the platform
 *
 * Status changes made here are overwritten by the next Stripe event for a
 * league that has a subscription, so pausing a paying league belongs in
 * Stripe. For a league added by hand, this is the only switch.
 *
 * All take `Authorization: Bearer $LP_OPERATOR_SECRET`.
 */

import { NextResponse } from 'next/server';
import { isOperator } from '@/lib/platform/operator';
import {
  listTenants, getTenant, saveTenant, deleteTenant, tenantForLeague, slugAvailability,
  type Tenant, type TenantStatus,
} from '@/lib/platform/tenants';
import { PLATFORM, PLANS, slugify } from '@/lib/platform/config';
import { runAsTenant, forgetTenant } from '@/lib/tenant/context';
import { adminPasswordSet } from '@/lib/tenant/admin';
import { tenantAnthropicKey } from '@/lib/tenant/secrets';
import { getPosts } from '@/lib/ai/store';
import { issueRecoveryLink } from '@/lib/platform/recovery';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const deny = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

/** A league's health, read inside its own storage. Never the key itself. */
async function health(t: Tenant) {
  return runAsTenant(t, async () => {
    const [admin, key, posts] = await Promise.all([
      adminPasswordSet().catch(() => false),
      tenantAnthropicKey().then(Boolean).catch(() => false),
      getPosts(1).catch(() => []),
    ]);
    const last = posts[0];
    const { getMembers, getInvites } = await import('@/lib/platform/members');
    const [members, invites] = await Promise.all([getMembers(t.slug).catch(() => []), getInvites(t.slug).catch(() => [])]);
    return {
      ownerAccount: members.find(m => m.role === 'owner')?.email ?? null,
      admins: members.filter(m => m.role === 'admin').length,
      pendingOwner: invites.find(i => i.role === 'owner')?.email ?? null,
      adminSet: admin,
      aiKey: key,
      lastPostAt: last ? (last.publishAt ?? last.createdAt) : null,
    };
  });
}

export async function GET(req: Request) {
  if (!(await isOperator(req))) return deny();
  const tenants = (await listTenants()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const leagues = await Promise.all(tenants.map(async t => ({
    slug: t.slug,
    url: `https://${t.slug}.${PLATFORM.rootDomain}`,
    name: t.leagueName,
    leagueId: t.leagueId,
    status: t.status,
    plan: t.plan,
    owner: t.ownerEmail,
    stripeCustomer: t.stripeCustomerId,
    comp: !t.stripeSubscriptionId,
    created: t.createdAt,
    updated: t.updatedAt,
    ...(await health(t)),
  })));
  const count = (s: TenantStatus) => leagues.filter(l => l.status === s).length;
  const paying = leagues.filter(l => l.status === 'active' && !l.comp);
  const { getRedis } = await import('@/lib/redisClient');
  const conflicts = ((await getRedis().client?.lrange('lp_tenant_conflicts', 0, 49).catch(() => [])) ?? [])
    .map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  return NextResponse.json({
    rootDomain: PLATFORM.rootDomain,
    conflicts,
    stripeMode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'live' : 'test',
    prices: { monthly: PLANS.pro.monthly, season: PLANS.pro.season },
    totals: {
      all: leagues.length, trialing: count('trialing'), active: count('active'),
      past_due: count('past_due'), canceled: count('canceled'),
      paying: paying.length, comp: leagues.filter(l => l.comp && l.status !== 'canceled').length,
      // A season is about five months, so the season price is spread over five.
      mrr: paying.reduce((s, l) => s + (l.plan === 'monthly' ? PLANS.pro.monthly : PLANS.pro.season / 5), 0),
    },
    leagues,
  });
}

export async function POST(req: Request) {
  if (!(await isOperator(req))) return deny();
  const body = await req.json().catch(() => ({})) as { leagueId?: string; slug?: string; provider?: string; swid?: string; s2?: string };
  let leagueId = String(body.leagueId ?? '').trim();
  let league: { league_id?: string; name?: string } | null;
  if (body.provider === 'espn') {
    // An ESPN league id or league page URL, and for a private league the
    // cookies, which are checked against ESPN before they are kept.
    const { parseEspnInput, findEspnLeague, FIND_MESSAGES } = await import('@/lib/providers/espn/lookup');
    const { cleanCredentials, getEspnCredentials, setEspnCredentials } = await import('@/lib/providers/espn/credentials');
    const lid = parseEspnInput(leagueId);
    if (!lid) return NextResponse.json({ error: 'That is not an ESPN league id or league URL.' }, { status: 400 });
    const fresh = body.swid || body.s2 ? cleanCredentials(body) : null;
    if ((body.swid || body.s2) && !fresh) return NextResponse.json({ error: 'Those do not look like ESPN cookies.' }, { status: 400 });
    const found = await findEspnLeague(lid, fresh ?? await getEspnCredentials(lid));
    if (!found.ok) return NextResponse.json({ error: FIND_MESSAGES[found.reason] }, { status: found.reason === 'not_found' ? 404 : 400 });
    if (fresh) await setEspnCredentials(lid, fresh);
    leagueId = found.league.leagueId;
    league = { league_id: leagueId, name: found.league.name };
  } else {
    if (!/^\d{15,22}$/.test(leagueId)) return NextResponse.json({ error: 'That is not a Sleeper league id.' }, { status: 400 });
    league = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`).then(r => r.json()).catch(() => null);
    if (!league?.league_id) return NextResponse.json({ error: 'Sleeper has no league with that id.' }, { status: 404 });
  }

  const slug = slugify(String(body.slug || league.name || ''));
  const existing = await tenantForLeague(leagueId);
  if (existing && existing.status !== 'canceled') {
    return NextResponse.json({ error: `That league already lives at ${existing.slug}.${PLATFORM.rootDomain}.` }, { status: 409 });
  }
  const avail = await slugAvailability(slug, leagueId);
  if (!avail.ok) return NextResponse.json({ error: `The address "${slug}" is ${avail.reason}.` }, { status: 409 });

  const now = new Date().toISOString();
  const tenant: Tenant = {
    slug, leagueId, leagueName: String(league.name ?? '').slice(0, 200),
    status: 'active', plan: 'season', ownerEmail: null,
    stripeCustomerId: null, stripeSubscriptionId: null, createdAt: now, updatedAt: now,
  };
  await saveTenant(tenant);
  // The owner sets their admin password through the same one-time link a
  // locked-out owner gets.
  const link = await issueRecoveryLink(slug);
  return NextResponse.json({ ok: true, slug, url: `https://${slug}.${PLATFORM.rootDomain}`, setupLink: link.url });
}

export async function PATCH(req: Request) {
  if (!(await isOperator(req))) return deny();
  const body = await req.json().catch(() => ({})) as { slug?: string; status?: string; ownerEmail?: string };
  if (body.ownerEmail !== undefined) {
    const email = String(body.ownerEmail).trim().toLowerCase();
    const t = body.slug ? await getTenant(body.slug) : null;
    if (!t || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Unknown league or invalid email' }, { status: 400 });
    const { addInvite } = await import('@/lib/platform/members');
    await addInvite(t.slug, email, 'operator', 'owner');
    return NextResponse.json({ ok: true, slug: t.slug, pendingOwner: email });
  }
  const status = body.status === 'canceled' ? 'canceled' : body.status === 'active' ? 'active' : null;
  const t = body.slug ? await getTenant(body.slug) : null;
  if (!t || !status) return NextResponse.json({ error: 'Unknown league or status' }, { status: 400 });
  await saveTenant({ ...t, status });
  forgetTenant(t.slug);
  return NextResponse.json({ ok: true, slug: t.slug, status });
}

export async function DELETE(req: Request) {
  if (!(await isOperator(req))) return deny();
  const body = await req.json().catch(() => ({})) as { slug?: string };
  const t = body.slug ? await getTenant(body.slug) : null;
  if (!t) return NextResponse.json({ error: 'Unknown league' }, { status: 404 });
  if (t.stripeSubscriptionId && t.status !== 'canceled') {
    return NextResponse.json({ error: 'This league has a live subscription. Cancel it in Stripe first.' }, { status: 409 });
  }
  await deleteTenant(t.slug);
  await (await import('@/lib/platform/members')).forgetLeague(t.slug);
  forgetTenant(t.slug);
  return NextResponse.json({ ok: true });
}
