import { test } from 'node:test';
import assert from 'node:assert/strict';

// A stand-in for the page's body: all the lock touches.
(globalThis as { document?: unknown }).document = { body: { style: { overflow: '' } } };
const body = (globalThis as unknown as { document: { body: { style: { overflow: string } } } }).document.body;
const { lockScroll } = await import('../src/lib/scrollLock.ts');

test('the page scrolls again only when the last modal closes, in any order', () => {
  const a = lockScroll();
  const b = lockScroll();
  assert.equal(body.style.overflow, 'hidden');
  a(); // the first one closes while the second is still open
  assert.equal(body.style.overflow, 'hidden');
  b();
  assert.equal(body.style.overflow, '');
});

test('letting go twice is harmless', () => {
  const a = lockScroll(), b = lockScroll();
  a(); a();
  assert.equal(body.style.overflow, 'hidden');
  b();
  assert.equal(body.style.overflow, '');
});
