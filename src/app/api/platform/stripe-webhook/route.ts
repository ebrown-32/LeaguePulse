/**
 * Stripe tells us about subscriptions here, and this is the only place a
 * league's site is created or its status changed.
 *
 * Every request is verified against STRIPE_WEBHOOK_SECRET before anything is
 * read. Without that check anyone could post a fake "checkout completed" and
 * create a site for free.
 *
 * Status always comes from the subscription as Stripe has it now, retrieved
 * fresh, never from the event alone: events can arrive out of order, and a
 * late "checkout completed" must not undo a later "payment failed".
 *
 * Events this endpoint needs (configure them on the endpoint in Stripe):
 *   checkout.session.completed      create the league
 *   customer.subscription.updated   status and plan changes, trial ending
 *   customer.subscription.deleted   cancelled: the site shows as paused
 *   invoice.paid                    renewals, recovery after a failed payment
 *   invoice.payment_failed          a renewal failed: status becomes past_due
 */

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/platform/stripe';
import { getTenant, saveTenant, type Tenant, type TenantStatus } from '@/lib/platform/tenants';
import { getRedis } from '@/lib/redisClient';
import { priceInfo } from '@/lib/platform/config';
import { parseEspnLeague } from '@/lib/providers/ids';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, TenantStatus> = {
  trialing: 'trialing', active: 'active', past_due: 'past_due', unpaid: 'past_due',
  canceled: 'canceled', incomplete_expired: 'canceled', paused: 'canceled',
};

/** The tier and billing cycle a subscription is on, from its price; null for a price this product does not sell. */
const priceOf = (sub: Stripe.Subscription) => priceInfo(sub.items?.data?.[0]?.price?.id);

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : v?.id ?? null);

/** Bring a league's record in line with its subscription as Stripe has it now. */
async function syncSubscription(s: Stripe, subscriptionId: string): Promise<void> {
  const sub = await s.subscriptions.retrieve(subscriptionId);
  const slug = sub.metadata?.slug;
  const t = slug ? await getTenant(slug) : null;
  // Only the subscription linked to this league, for this league, may change
  // it. A league added by hand has no subscription, and a checkout that lost
  // its address (cancelled above) must not pause the league that has it.
  if (!t || t.stripeSubscriptionId !== sub.id || t.leagueId !== sub.metadata?.leagueId) return;
  await saveTenant({
    ...t,
    status: STATUS[sub.status] ?? t.status,
    stripeSubscriptionId: sub.id,
    // A plan or tier switch made in the billing portal arrives here.
    plan: priceOf(sub)?.plan ?? t.plan,
    tier: priceOf(sub)?.tier ?? t.tier ?? 'standard',
  });
}

async function checkoutCompleted(s: Stripe, session: Stripe.Checkout.Session): Promise<void> {
  const m = session.metadata ?? {};
  if (!m.slug || !m.leagueId) return;
  const subscriptionId = idOf(session.subscription);
  const existing = await getTenant(m.slug);

  /**
   * The address went to a different league while this checkout was open.
   * Overwriting would put this league on top of that league's data, so the
   * new subscription is cancelled instead (nothing is charged: it is still
   * in its trial) and the conflict is recorded for the operator to follow up.
   */
  if (existing && existing.leagueId !== m.leagueId) {
    if (subscriptionId) await s.subscriptions.cancel(subscriptionId).catch(err => console.error('[stripe-webhook] cancel after conflict failed', err));
    await getRedis().client?.lpush('lp_tenant_conflicts', JSON.stringify({
      session: session.id, slug: m.slug, leagueId: m.leagueId, takenBy: existing.leagueId,
      email: session.customer_details?.email ?? null, subscriptionId, at: new Date().toISOString(),
    }));
    console.error(`[stripe-webhook] ${m.slug} already belongs to league ${existing.leagueId}; cancelled ${subscriptionId}`);
    return;
  }

  const sub = subscriptionId ? await s.subscriptions.retrieve(subscriptionId) : null;
  const now = new Date().toISOString();
  const tenant: Tenant = {
    slug: m.slug,
    leagueId: m.leagueId,
    leagueName: m.leagueName ?? '',
    status: sub ? STATUS[sub.status] ?? 'trialing' : 'trialing',
    plan: (sub && priceOf(sub)?.plan) ?? (m.plan === 'monthly' ? 'monthly' : 'season'),
    tier: (sub && priceOf(sub)?.tier) ?? (m.tier === 'ai' ? 'ai' : 'standard'),
    ownerEmail: session.customer_details?.email ?? session.customer_email ?? null,
    stripeCustomerId: idOf(session.customer),
    stripeSubscriptionId: subscriptionId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await saveTenant(tenant);
  // An ESPN league's cookies were kept for two days at sign-up; it is paid
  // for now, so they stay.
  const espn = parseEspnLeague(m.leagueId);
  if (espn) {
    const { keepEspnCredentials } = await import('@/lib/providers/espn/credentials');
    await keepEspnCredentials(espn.leagueId);
  }
  // Bought while signed in: that account owns the league.
  if (m.userId) {
    const { addMember } = await import('@/lib/platform/members');
    await addMember(m.slug, { userId: m.userId, email: tenant.ownerEmail ?? '', role: 'owner' });
  }
}

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
    switch (event.type) {
      case 'checkout.session.completed':
        await checkoutCompleted(s, event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(s, (event.data.object as Stripe.Subscription).id);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = idOf(invoice.parent?.subscription_details?.subscription ?? null);
        if (subId) await syncSubscription(s, subId);
        break;
      }
    }
  } catch (err) {
    console.error('[api/platform/stripe-webhook]', event.type, err);
    // A 500 makes Stripe retry, which is what a storage blip wants.
    return NextResponse.json({ error: 'Could not record the event' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
