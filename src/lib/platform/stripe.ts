/**
 * Stripe, for the hosted product's subscriptions.
 *
 * Optional: without STRIPE_SECRET_KEY the sign-up flow still runs end to end
 * up to checkout and says billing is not switched on, which is how a fresh
 * deployment, or a self-hosted copy, behaves.
 */

import Stripe from 'stripe';

let client: Stripe | null = null;

export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}

export function billingReady(): { ok: true } | { ok: false; missing: string[] } {
  const missing = ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_MONTHLY', 'STRIPE_PRICE_SEASON']
    .filter(k => !process.env[k]?.trim());
  return missing.length ? { ok: false, missing } : { ok: true };
}
