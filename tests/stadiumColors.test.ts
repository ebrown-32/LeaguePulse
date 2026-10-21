import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIdentity, DEFAULT_LOOK, normalizeLook, type StadiumLook } from '../src/lib/franchise/model.ts';
import { accentOf, autoColors, stadiumColors } from '../src/lib/franchise/stadiumColors.ts';

const FRANCHISE = '#1f4fa8';
const look = (o: Partial<StadiumLook> = {}): StadiumLook => ({ ...DEFAULT_LOOK, ...o });

test('a stadium is painted in the franchise color until the manager picks a primary', () => {
  assert.equal(autoColors(look(), FRANCHISE).endzones, FRANCHISE);
  const red = '#c8102e';
  const k = stadiumColors(look({ primary: red }), FRANCHISE);
  assert.equal(k.endzones, red);
  assert.equal(k.crowd, red);
  // The automatic accent suits the primary, not the franchise color: white on a dark red, dark on a pale yellow.
  assert.equal(accentOf(look({ primary: '#f7f0a0' }), FRANCHISE), '#1b1d21');
  assert.equal(accentOf(look({ primary: red }), FRANCHISE), '#f4f4f2');
  // A part painted by hand still wins.
  assert.equal(stadiumColors(look({ primary: red, colors: { endzones: '#000000' } }), FRANCHISE).endzones, '#000000');
});

test('the primary color is saved as a color, or not at all', () => {
  assert.equal(normalizeLook({ primary: '#C8102E' }).primary, '#c8102e');
  assert.equal(normalizeLook({ primary: 'red' }).primary, null);
  assert.equal(normalizeLook({}).primary, null, 'looks saved before it existed use the franchise color');
  assert.equal(checkIdentity({ look: { primary: 'nope' } }), 'Pick a primary color.');
  assert.equal((checkIdentity({ look: { primary: '#123456' } }) as { look: StadiumLook }).look.primary, '#123456');
});
