/**
 * Where a league stands and how its AI runs, read from its registry record
 * (lib/platform/tenants). The operator changes both from the back office
 * (lib/platform/standing, api/platform/operator/leagues).
 *
 * Pure.
 */

import type { Tenant } from './tenants';

/**
 * How a league's AI runs: not at all, on a key of its own, or on the
 * platform's (what League Pass + AI pays for).
 */
export type AiMode = 'off' | 'own' | 'platform';

/** What its plan gives it. */
export const billedAiMode = (t: Pick<Tenant, 'tier'>): AiMode => (t.tier === 'ai' ? 'platform' : 'own');

/** What it actually gets: the operator's word, else its plan's. */
export const aiMode = (t: Pick<Tenant, 'tier' | 'aiOverride'>): AiMode => t.aiOverride ?? billedAiMode(t);

/**
 *   beta    free, no billing: added by hand, or moved here from a plan
 *   trial   a Stripe subscription in its free trial
 *   paid    a Stripe subscription past its trial (active, or retrying a payment)
 *   paused  ended: paused by the operator, or its subscription ran out
 */
export type Standing = 'beta' | 'trial' | 'paid' | 'paused';

export function standingOf(t: Pick<Tenant, 'status' | 'stripeSubscriptionId'>): Standing {
  if (t.status === 'canceled') return 'paused';
  if (!t.stripeSubscriptionId) return 'beta';
  return t.status === 'trialing' ? 'trial' : 'paid';
}
