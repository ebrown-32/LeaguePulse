/** The owner opens Stripe's billing portal for a league, from their account. */

import { NextResponse } from 'next/server';
import { accountsEnabled, signedInAccount } from '@/lib/platform/account';
import { roleOf } from '@/lib/platform/members';
import { getTenant } from '@/lib/platform/tenants';
import { stripe } from '@/lib/platform/stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!accountsEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const me = await signedInAccount();
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { slug } = await req.json().catch(() => ({})) as { slug?: string };
  if (!slug || (await roleOf(slug, me.userId)) !== 'owner') return NextResponse.json({ error: 'Only the owner can manage billing.' }, { status: 403 });
  const t = await getTenant(slug);
  const s = stripe();
  if (!t?.stripeCustomerId || !s) return NextResponse.json({ error: 'This league has no subscription to manage.' }, { status: 409 });
  const origin = new URL(req.url).origin;
  const portal = await s.billingPortal.sessions.create({
    customer: t.stripeCustomerId,
    ...(process.env.STRIPE_PORTAL_CONFIGURATION?.trim() ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION.trim() } : {}),
    return_url: `${origin}/account`,
  });
  return NextResponse.json({ url: portal.url });
}
