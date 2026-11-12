import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoView, SHOTS, SHOTS_FOR } from '../src/lib/franchise/photo.ts';
import { blueprint } from '../src/lib/franchise/stadiumBlueprint.ts';
import { DEFAULT_LOOK, LOOK_OPTIONS } from '../src/lib/franchise/model.ts';
import type { Facilities } from '../src/lib/tycoon/catalog.ts';

const F: Facilities = { stadium: 2, seating: 2, concessions: 2, restrooms: 2, parking: 2, videoboard: 2, suites: 1, store: 1, atmosphere: 2 };

test('every shot has a camera that makes sense, for every style', () => {
  for (const style of LOOK_OPTIONS.style) {
    const look = { ...DEFAULT_LOOK, style }, bp = blueprint(style, F);
    for (const shot of SHOTS) {
      const v = photoView(shot, F, look, false);
      // The fans close-up is at eye level (a fan is about 0.15 tall); everything else stands higher.
      assert.ok(v.position[1] > (shot === 'fans' ? 0.05 : 0.2), `${style}/${shot}: camera below the ground`);
      assert.ok(v.fov > 20 && v.fov < 80);
      const out = Math.hypot(v.position[0] / 1.45, v.position[2]);
      if (shot === 'exterior' || shot === 'aerial' || shot === 'drone') assert.ok(out > bp.footprint, `${style}/${shot}: inside the stadium`);
      if (shot === 'crowd' || shot === 'warmup' || shot === 'interview') assert.ok(out < bp.inner + 0.5, `${style}/${shot}: not on the field`);
    }
  }
});

test('the drone looks down on a lot, and the field matches the moment', () => {
  const v = photoView('drone', F, DEFAULT_LOOK, false);
  assert.ok(v.position[1] - v.target[1] > 4, 'looking down');
  assert.ok(Math.hypot(v.target[0], v.target[2]) > blueprint('bowl', F).footprint, 'over a lot, not the stadium');
  assert.equal(photoView('warmup', F, DEFAULT_LOOK, false).field, 'warmup');
  assert.equal(photoView('crowd', F, DEFAULT_LOOK, true).field, 'game');
  assert.equal(photoView('exterior', F, DEFAULT_LOOK, false).field, 'empty');
  for (const shots of Object.values(SHOTS_FOR)) for (const s of shots) assert.ok((SHOTS as readonly string[]).includes(s));
});

test('the fans close-up stands in a lot, the crowd a step in front of the lens', () => {
  for (const style of LOOK_OPTIONS.style) {
    const look = { ...DEFAULT_LOOK, style }, bp = blueprint(style, F);
    const v = photoView('fans', F, look, false);
    assert.ok(v.fans, `${style}: no fans`);
    assert.ok(v.near && v.near < 0.1, `${style}: near plane would clip the close-up`);
    const cam = Math.hypot(v.position[0], v.position[2]);
    assert.ok(cam > bp.footprint, `${style}: the camera is inside the stadium, not in a lot`);
    const gap = Math.hypot(v.fans!.x - v.position[0], v.fans!.z - v.position[2]);
    assert.ok(gap > 0.2 && gap < 0.8, `${style}: the fans are ${gap.toFixed(2)} from the lens`);
    // Looking past the fans toward the stadium.
    assert.ok(Math.hypot(v.target[0], v.target[2]) < cam, `${style}: looking away from the stadium`);
  }
});
