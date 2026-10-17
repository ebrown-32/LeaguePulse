/**
 * Moving a league between beta, trial and paid (lib/platform/plan), for the operator.
 *
 * Stripe is changed first and the league's record after, so a failed call to
 * Stripe never leaves a league that looks free while its subscription still
 * bills. Later Stripe events for the league keep its record in step as usual
 * (api/platform/stripe-webhook). Server only.
 */

import type Stripe from 'stripe';
import { getTenant, saveTenant, type Tenant } from './tenants';
import { stripe, billingReady } from './stripe';
import { PLANS, stripePriceFor } from './config';
import { standingOf } from './plan';

export { standingOf, type Standing } from './plan';

type Result = { ok: true; tenant: Tenant } | { ok: false; error: string; status: number };
const fail = (error: string, status = 400): Result => ({ ok: false, error, status });

const trialEnd = (sub: Stripe.Subscription) => (sub.status === 'trialing' && sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null);

/**
 * Make it a free beta league. A subscription it still has is cancelled in
 * Stripe straight away: nothing more is billed, and nothing already paid is
 * refunded (refund in Stripe if that is owed). A paused league comes back too.
 */
export async function moveToBeta(slug: string): Promise<Result> {
  const t = await getTenant(slug);
  if (!t) return fail('Unknown league', 404);
  if (t.stripeSubscriptionId) {
    const s = stripe();
    if (!s) return fail('Stripe is not configured here, so its subscription cannot be cancelled.', 503);
    const sub = await s.subscriptions.retrieve(t.stripeSubscriptionId).catch(() => null);
    if (sub && sub.status !== 'canceled' && sub.status !== 'incomplete_expired') {
      try { await s.subscriptions.cancel(sub.id); }
      catch (err) { console.error('[standing] cancel failed', err); return fail('Stripe would not cancel its subscription. Nothing was changed.', 502); }
    }
  }
  const next: Tenant = { ...t, status: 'active', stripeSubscriptionId: null, trialEndsAt: null };
  await saveTenant(next);
  return { ok: true, tenant: next };
}

/**
 * Put a beta league on a free trial of its plan, exactly as sign-up does: a
 * Stripe subscription with no card, which becomes paid if the owner adds a
 * card from the admin's billing before it ends, and cancels quietly if not.
 * On a league already in its trial, moves the end out by `days` from now.
 */
export async function startTrial(slug: string, days: number): Promise<Result> {
  const t = await getTenant(slug);
  if (!t) return fail('Unknown league', 404);
  if (!Number.isInteger(days) || days < 1 || days > 90) return fail('A trial runs 1 to 90 days.');
  const s = stripe();
  const tier = t.tier ?? 'standard';
  const ready = billingReady(tier);
  if (!s || !ready.ok) return fail('Billing is not switched on here.', 503);
  const end = Math.floor(Date.now() / 1000) + days * 86_400;

  // Already in a trial: extend it.
  if (t.stripeSubscriptionId && t.status === 'trialing') {
    try {
      const sub = await s.subscriptions.update(t.stripeSubscriptionId, { trial_end: end, proration_behavior: 'none' });
      const next: Tenant = { ...t, trialEndsAt: trialEnd(sub) };
      await saveTenant(next);
      return { ok: true, tenant: next };
    } catch (err) {
      console.error('[standing] extend failed', err);
      return fail('Stripe would not extend the trial.', 502);
    }
  }
  if (standingOf(t) !== 'beta') return fail('Only a beta league can start a trial. Move it to beta first.');

  // Billing goes to the owner: their account's email, else the one it was set up with.
  const { getMembers } = await import('./members');
  const email = (await getMembers(slug).catch(() => [])).find(m => m.role === 'owner')?.email || t.ownerEmail;
  if (!email) return fail('It has no owner email to bill. Hand it over to someone first.');
  try {
    const customer = t.stripeCustomerId ?? (await s.customers.create({ email, name: t.leagueName || undefined, metadata: { slug } })).id;
    const metadata = { leagueId: t.leagueId, slug, plan: t.plan, tier, leagueName: t.leagueName.slice(0, 200), startedBy: 'operator' };
    const sub = await s.subscriptions.create({
      customer,
      items: [{ price: stripePriceFor(tier, t.plan) }],
      trial_end: end,
      // As at sign-up: no card up front, and a quiet cancel if none is added.
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata,
    });
    const next: Tenant = {
      ...t, status: 'trialing', stripeCustomerId: customer, stripeSubscriptionId: sub.id,
      ownerEmail: t.ownerEmail ?? email, trialEndsAt: trialEnd(sub),
    };
    await saveTenant(next);
    return { ok: true, tenant: next };
  } catch (err) {
    console.error('[standing] trial failed', err);
    return fail('Stripe would not start the trial. Nothing was changed.', 502);
  }
}

/** The default trial, as sign-up gives. */
export const TRIAL_DAYS = PLANS.pro.trialDays;
