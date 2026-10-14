import test from 'node:test';
import assert from 'node:assert/strict';
import { costOf, PRICES, SEARCH_PRICE } from '../src/lib/ai/usage.ts';

const models = Object.keys(PRICES);
const zeros = () => new Array(models.length * 5 + 1).fill(0);

test('costs nothing when nothing ran', () => {
  assert.deepEqual(costOf(models, zeros()), { calls: 0, inputTokens: 0, outputTokens: 0, searches: 0, cost: 0 });
});

test('prices each model at its own rates, plus searches', () => {
  const v = zeros();
  const s = models.indexOf('claude-sonnet-5') * 5, h = models.indexOf('claude-haiku-4-5-20251001') * 5;
  // Sonnet: 1 call, 1M input, 100k output, 500k cache reads
  v[s] = 1; v[s + 1] = 1_000_000; v[s + 2] = 100_000; v[s + 3] = 500_000;
  // Haiku: 2 calls, 2M input, 200k output
  v[h] = 2; v[h + 1] = 2_000_000; v[h + 2] = 200_000;
  v[v.length - 1] = 10;
  const r = costOf(models, v);
  assert.equal(r.calls, 3);
  assert.equal(r.inputTokens, 3_500_000);
  assert.equal(r.outputTokens, 300_000);
  assert.equal(r.searches, 10);
  // 2 + 1 + 0.1 (Sonnet) + 2 + 1 (Haiku) + 0.10 (searches)
  assert.equal(r.cost, Math.round((2 + 1 + 0.1 + 2 + 1 + 10 * SEARCH_PRICE) * 100) / 100);
});
