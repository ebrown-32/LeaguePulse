/**
 * Stripe tells us about subscriptions here, and this is the only place a
 * league's site is created or its status changed.
 *
 * Every request is verified against STRIPE_WEBHOOK_SECRET before anything is
 * read. Without that check anyone could post a fake "checkout completed" and
 * create a site for free.
 */

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/platform/stripe';
import { getTenant, saveTenant, type Tenant, type TenantStatus } from '@/lib/platform/tenants';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, TenantStatus> = {
  trialing: 'trialing', active: 'active', past_due: 'past_due', unpaid: 'past_due',
  canceled: 'canceled', incomplete_expired: 'canceled', paused: 'canceled',
};

export async function POST(req: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!s || !secret) return NextResponse.json({ error: 'Billing is not configured' }, { status: 503 });

  // The raw body, exactly as sent: the signature is over these bytes.
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(raw, req.headers.get('stripe-signature') ?? '', secret);
  } catch {
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const m = session.metadata ?? {};
      if (m.slug && m.leagueId) {
        const now = new Date().toISOString();
        const existing = await getTenant(m.slug);
        const tenant: Tenant = {
          slug: m.slug,
          leagueId: m.leagueId,
          leagueName: m.leagueName ?? '',
          status: 'trialing',
          plan: m.plan === 'monthly' ? 'monthly' : 'season',
          ownerEmail: session.customer_details?.email ?? session.customer_email ?? null,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
          stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        await saveTenant(tenant);
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const slug = sub.metadata?.slug;
      const t = slug ? await getTenant(slug) : null;
      if (t) {
        await saveTenant({
          ...t,
          status: event.type === 'customer.subscription.deleted' ? 'canceled' : STATUS[sub.status] ?? t.status,
          stripeSubscriptionId: sub.id,
        });
      }
    }
  } catch (err) {
    console.error('[api/platform/stripe-webhook]', event.type, err);
    // A 500 makes Stripe retry, which is what a storage blip wants.
    return NextResponse.json({ error: 'Could not record the event' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
