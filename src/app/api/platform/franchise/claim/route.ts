/**
 * Claiming a franchise, on the product site where people are signed in.
 *
 *   POST   { slug, franchiseId, note? }   file a claim; the league's admins approve or decline it
 *   DELETE { slug, claimId }              withdraw your own claim while it waits
 *
 * A claim needs an account with a verified email (the admins see it), a real
 * franchise of a live league, and no manager on that franchise already.
 * It is approved at once for an admin of the league, or for the email an
 * admin invited to this franchise; anyone else's waits for an admin.
 */

import { NextResponse } from 'next/server';
import { accountsEnabled, signedInAccount } from '@/lib/platform/account';
import { getTenant, isLive } from '@/lib/platform/tenants';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  if (!accountsEnabled()) return bad('Accounts are not available.', 404);
  const me = await signedInAccount();
  if (!me) return bad('Sign in to claim a team.', 401);
  if (!me.email) return bad('Verify your email address first, so the league’s admins know who is asking.');
  const { clientIp, rateLimit } = await import('@/lib/ai/rateLimit');
  if (!(await rateLimit('lp_claim_rl_', `${me.userId}:${clientIp(req)}`, 10, 3_600_000)).ok) return bad('Too many claims. Try again later.', 429);

  const body = await req.json().catch(() => ({})) as { slug?: string; franchiseId?: string; note?: string };
  const t = body.slug ? await getTenant(body.slug) : null;
  if (!t || !isLive(t)) return bad('That league is not on LeaguePulse.', 404);
  const { franchiseInfo } = await import('@/lib/franchise/lookup');
  const info = body.franchiseId ? await franchiseInfo(t, body.franchiseId) : null;
  if (!info) return bad('That team is not part of this league.', 404);

  const store = await import('@/lib/franchise/store');
  const { roleOf } = await import('@/lib/platform/members');
  // Approved at once: someone the admins invited (by this verified email), or one of the league's own admins.
  const invite = await store.inviteFor(t.slug, info.franchiseId, me.email);
  const approvedBy = invite ? 'invite' : (await roleOf(t.slug, me.userId)) ? 'admin' : undefined;
  const claim = await store.fileClaim(t.slug, {
    franchiseId: info.franchiseId, teamName: info.teamName, userId: me.userId, email: me.email,
    name: me.name || me.email, note: body.note,
  }, approvedBy);
  if (claim === 'managed') return bad('This team already has a manager. Ask the league\u2019s admin if that is wrong.', 409);
  if (claim === 'has-team') return bad('You already manage a team in this league. Each person manages one.', 409);
  if (claim === 'waiting-elsewhere') return bad('You already have a claim waiting for another team in this league. Withdraw it first.', 409);
  if (claim === 'already') return NextResponse.json({ status: 'pending', already: true });
  if (claim.status === 'approved') {
    if (invite) await store.cancelInvite(t.slug, info.franchiseId);
    const { openPath } = await import('@/lib/franchise/links');
    return NextResponse.json({ status: 'approved', editHref: openPath(t.slug, info.franchiseId) });
  }
  return NextResponse.json({ status: 'pending', claimId: claim.id });
}

export async function DELETE(req: Request) {
  if (!accountsEnabled()) return bad('Accounts are not available.', 404);
  const me = await signedInAccount();
  if (!me) return bad('Sign in first.', 401);
  const body = await req.json().catch(() => ({})) as { slug?: string; claimId?: string };
  const { withdrawClaim } = await import('@/lib/franchise/store');
  const ok = body.slug && body.claimId ? await withdrawClaim(body.slug, body.claimId, me.userId) : false;
  return ok ? NextResponse.json({ ok: true }) : bad('No waiting claim of yours by that id.', 404);
}
