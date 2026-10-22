import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerOf } from '../src/lib/ops/monitor.ts';
import { checkFeedback } from '../src/lib/ops/feedback.ts';

test('every call out is put down to the service it went to', () => {
  assert.equal(providerOf('api.sleeper.app'), 'sleeper');
  assert.equal(providerOf('api.sleeper.com'), 'sleeper');
  assert.equal(providerOf('sleepercdn.com'), 'images');
  assert.equal(providerOf('lm-api-reads.fantasy.espn.com'), 'espn');
  assert.equal(providerOf('site.api.espn.com'), 'espn');
  assert.equal(providerOf('a.espncdn.com'), 'images');
  assert.equal(providerOf('api.anthropic.com'), 'anthropic');
  assert.equal(providerOf('api.fantasycalc.com'), 'fantasycalc');
  assert.equal(providerOf('raw.githubusercontent.com'), 'dynastyprocess');
  assert.equal(providerOf('api.stripe.com'), 'stripe');
  assert.equal(providerOf('example.org'), 'other');
  // This site's own calls aren't another service's.
  assert.equal(providerOf('localhost'), null);
  assert.equal(providerOf('demo.localhost'), null);
});

test('feedback is checked before it is kept', () => {
  assert.equal(checkFeedback({ kind: 'rant', title: 'Hello there' }), 'Pick a bug or an idea.');
  assert.equal(checkFeedback({ kind: 'bug', title: 'x' }), 'Give it a short title.');
  assert.equal(checkFeedback({ kind: 'idea', title: 'Dark mode for the draft', email: 'nope' }), 'That email doesn’t look right.');
  const ok = checkFeedback({ kind: 'bug', title: '  The   standings  page  ', details: 'Steps\r\nhere', email: 'a@b.co', page: '/standings' });
  assert.ok(typeof ok === 'object');
  assert.equal(ok.title, 'The standings page');
  assert.equal(ok.details, 'Steps\nhere');
  assert.equal(ok.email, 'a@b.co');
  assert.equal((checkFeedback({ kind: 'idea', title: 'Long one', details: 'x'.repeat(9000) }) as { details: string }).details.length, 4000);
});
