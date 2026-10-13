/**
 * Set a new league's admin password, once, as the person who paid for it.
 *
 * Proof of that is the Stripe Checkout session id from the return URL: this
 * route reads the session from Stripe, so it cannot be faked from a browser,
 * checks it was completed and is for this league, and only works while no
 * password is set. After that, changing it is an admin action.
 */

import { NextResponse } from 'next/server';
import { stripe } from '@/lib/platform/stripe';
import { getTenant } from '@/lib/platform/tenants';
import { runAsTenant } from '@/lib/tenant/context';
import { adminPasswordSet, setAdminPassword } from '@/lib/tenant/admin';
import { rateLimit, clientIp } from '@/lib/ai/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { ok } = await rateLimit('lp_claim_rl_', clientIp(req), 20, 60 * 60 * 1000);
  if (!ok) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });

  let body: { session?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const password = String(body.password ?? '');
  if (password.length < 8) return NextResponse.json({ error: 'Use at least 8 characters.' }, { status: 400 });

  const s = stripe();
  if (!s || !body.session) return NextResponse.json({ error: 'Billing is not configured' }, { status: 503 });
  const session = await s.checkout.sessions.retrieve(body.session).catch(() => null);
  if (!session || session.status !== 'complete' || !session.metadata?.slug) {
    return NextResponse.json({ error: 'That checkout is not complete' }, { status: 403 });
  }
  const tenant = await getTenant(session.metadata.slug);
  if (!tenant || tenant.leagueId !== session.metadata.leagueId) {
    return NextResponse.json({ error: 'The league is still being set up. Try again in a moment.' }, { status: 409 });
  }

  // A league bought while signed in belongs to that account; its admin is
  // reached from the account page, and a checkout link (which can end up in
  // browser history or a screenshot) must not be able to add a password.
  const { getMembers } = await import('@/lib/platform/members');
  if ((await getMembers(tenant.slug)).length) {
    return NextResponse.json({ error: 'This league is managed from its owner\u2019s account. Sign in to open its admin.' }, { status: 409 });
  }

  return runAsTenant(tenant, async () => {
    if (await adminPasswordSet()) {
      return NextResponse.json({ error: 'An admin password is already set for this league.' }, { status: 409 });
    }
    await setAdminPassword(password);
    return NextResponse.json({ ok: true, slug: tenant.slug });
  });
}
