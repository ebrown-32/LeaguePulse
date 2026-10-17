import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiMode, billedAiMode, standingOf } from '../src/lib/platform/plan.ts';

test('the plan decides the AI unless the operator says otherwise', () => {
  assert.equal(billedAiMode({ tier: 'ai' }), 'platform');
  assert.equal(billedAiMode({ tier: 'standard' }), 'own');
  assert.equal(billedAiMode({}), 'own');
  assert.equal(aiMode({ tier: 'ai' }), 'platform');
  assert.equal(aiMode({ tier: 'ai', aiOverride: 'off' }), 'off');
  assert.equal(aiMode({ tier: 'standard', aiOverride: 'platform' }), 'platform');
});

test('standing: beta without a subscription, trial or paid with one, paused once ended', () => {
  assert.equal(standingOf({ status: 'active', stripeSubscriptionId: null }), 'beta');
  // A hand-added league marked trialing has no trial to run out: still beta.
  assert.equal(standingOf({ status: 'trialing', stripeSubscriptionId: null }), 'beta');
  assert.equal(standingOf({ status: 'trialing', stripeSubscriptionId: 'sub_1' }), 'trial');
  assert.equal(standingOf({ status: 'active', stripeSubscriptionId: 'sub_1' }), 'paid');
  assert.equal(standingOf({ status: 'past_due', stripeSubscriptionId: 'sub_1' }), 'paid');
  assert.equal(standingOf({ status: 'canceled', stripeSubscriptionId: 'sub_1' }), 'paused');
  assert.equal(standingOf({ status: 'canceled', stripeSubscriptionId: null }), 'paused');
});
