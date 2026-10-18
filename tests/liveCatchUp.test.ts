import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catchUp } from '../src/lib/live/catchUp.ts';

const at = (ms: number) => new Date(ms).toISOString();

test('plays after Sleeper last moved are added to its figure', () => {
  const anchor = { p: 10.1, at: 1_000 };
  const plays = [{ points: 2.4, at: at(2_000) }, { points: 6, at: at(3_000) }, { points: 5, at: at(500) }];
  assert.equal(catchUp(10.1, anchor, plays), 18.5);
});

test("Sleeper's figure stands alone once it moves, without an anchor, or without new plays", () => {
  assert.equal(catchUp(18.5, { p: 10.1, at: 1_000 }, [{ points: 2.4, at: at(2_000) }]), 18.5);
  assert.equal(catchUp(10.1, null, [{ points: 2.4, at: at(2_000) }]), 10.1);
  assert.equal(catchUp(10.1, { p: 10.1, at: 1_000 }, [{ points: null, at: at(2_000) }, { points: 3, at: null }]), 10.1);
  assert.equal(catchUp(null, { p: 0, at: 0 }, [{ points: 3, at: at(2_000) }]), null);
});
