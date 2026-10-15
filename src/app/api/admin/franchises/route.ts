/**
 * Admin only: who manages the league's franchises, and the claims waiting.
 *
 *   GET                                  claims (waiting first) and current managers
 *   POST { action: 'approve' | 'decline', claimId }
 *   POST { action: 'remove', franchiseId }   take a franchise's manager away
 *   POST { action: 'invite', franchiseId, email }   invite someone to manage a franchise: they
 *        become its manager when they sign in with that email and open the link
 *   POST { action: 'cancel-invite', franchiseId }
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';

export const dynamic = 'force-dynamic';

const deny = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

async function overview(req: Request) {
  const [{ currentSite }, store, links] = await Promise.all([import('@/lib/archive/ingest'), import('@/lib/franchise/store'), import('@/lib/franchise/links')]);
  const site = await currentSite();
  const [claims, invites] = await Promise.all([store.getClaims(site), store.getInvites(site)]);
  // Managers come from the franchises themselves; names from the archive, else the claim.
  const { listFranchises } = await import('@/lib/archive/franchises');
  const names = new Map((await listFranchises(site).catch(() => null) ?? []).map(f => [f.franchiseId, f.teamName || f.manager]));
  for (const c of claims) if (!names.has(c.franchiseId)) names.set(c.franchiseId, c.teamName);
  const teamName = names;
  const managers = (await store.listFranchiseRecords(site)).filter(f => f.manager).map(f => ({
    franchiseId: f.franchiseId, teamName: teamName.get(f.franchiseId) ?? f.franchiseId, name: f.manager!.name, email: f.manager!.email,
  }));
  const product = links.productOrigin(req);
  return {
    invites: invites.map(i => ({ ...i, link: product + links.claimPath(site, i.franchiseId) })),
    pending: claims.filter(c => c.status === 'pending'),
    recent: claims.filter(c => c.status !== 'pending').slice(0, 20),
    managers,
  };
}

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return deny();
  return NextResponse.json(await overview(req), { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return deny();
  const body = await req.json().catch(() => ({})) as { action?: string; claimId?: string; franchiseId?: string; email?: string };
  const [{ currentSite }, store] = await Promise.all([import('@/lib/archive/ingest'), import('@/lib/franchise/store')]);
  const site = await currentSite();
  if ((body.action === 'approve' || body.action === 'decline') && body.claimId) {
    const done = await store.decideClaim(site, body.claimId, body.action === 'approve' ? 'approved' : 'declined', 'admin');
    if (done === 'has-team') return NextResponse.json({ error: 'That person already manages another team in this league. Remove them there first.' }, { status: 409 });
    if (!done) return NextResponse.json({ error: 'That claim is no longer waiting.' }, { status: 409 });
  } else if (body.action === 'remove' && body.franchiseId) {
    await store.removeManager(site, body.franchiseId);
  } else if (body.action === 'invite' && body.franchiseId) {
    const email = String(body.email ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return NextResponse.json({ error: 'Enter their email address.' }, { status: 400 });
    const { listFranchises } = await import('@/lib/archive/franchises');
    const f = (await listFranchises(site).catch(() => null))?.find(x => x.franchiseId === body.franchiseId);
    if (!f) return NextResponse.json({ error: 'That team is not part of this league.' }, { status: 404 });
    if ((await store.getFranchise(site, f.franchiseId)).manager) return NextResponse.json({ error: 'That team already has a manager. Remove them first.' }, { status: 409 });
    await store.inviteManager(site, f.franchiseId, f.teamName || f.manager, email);
  } else if (body.action === 'cancel-invite' && body.franchiseId) {
    await store.cancelInvite(site, body.franchiseId);
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  return NextResponse.json(await overview(req));
}
