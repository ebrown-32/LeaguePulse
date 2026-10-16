import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIdentity, DEFAULT_LOOK, LIMITS } from '../src/lib/franchise/model.ts';

test('a manager’s identity is tidied and kept', () => {
  assert.deepEqual(checkIdentity({ color: '#0D9488', motto: '  Defense   wins nothing  ', bio: 'Line one.\r\n\r\n\r\n\r\nLine two.' }),
    { color: '#0d9488', motto: 'Defense wins nothing', bio: 'Line one.\n\nLine two.' });
});

test('empty fields clear', () => {
  assert.deepEqual(checkIdentity({ color: '', motto: '', bio: '' }), { color: null, motto: null, bio: null });
  assert.deepEqual(checkIdentity(null), {}); // nothing named, nothing changed
});

test('what does not fit is refused, with a reason', () => {
  assert.match(String(checkIdentity({ motto: 'x'.repeat(LIMITS.motto + 1) })), /motto/);
  assert.match(String(checkIdentity({ bio: 'x'.repeat(LIMITS.bio + 1) })), /bio/);
  assert.equal(checkIdentity({ color: 'red' }), 'Pick a color.');
  assert.equal(checkIdentity({ color: 'url(javascript:1)' }), 'Pick a color.');
  assert.match(String(checkIdentity({ motto: 5 })), /text/);
});

test('an edit only touches the fields it names', () => {
  assert.deepEqual(checkIdentity({ stadiumName: '  Fight Milk   Coliseum ' }), { stadiumName: 'Fight Milk Coliseum' });
});

test('a stadium look must be a known one', () => {
  assert.deepEqual(checkIdentity({ look: { facade: 'brick', seats: 'team', turf: 'checker' } }), { look: { ...DEFAULT_LOOK, facade: 'brick', seats: 'team', turf: 'checker' } });
  assert.match(String(checkIdentity({ look: { facade: 'marble', seats: 'team', turf: 'checker' } })), /facade/);
  assert.match(String(checkIdentity({ stadiumName: 'x'.repeat(41) })), /stadium name/);
});
