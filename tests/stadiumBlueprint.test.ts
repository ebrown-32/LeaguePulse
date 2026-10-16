import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blueprint, FIELD_CORNER, seatsFilled, seatSpots, TAU, roofClosed } from '../src/lib/franchise/stadiumBlueprint.ts';
import { LOOK_OPTIONS, normalizeLook, checkIdentity, DEFAULT_LOOK } from '../src/lib/franchise/model.ts';
import { EMPTY_FACILITIES, type Facilities } from '../src/lib/tycoon/catalog.ts';

const at = (stadium: number, more: Partial<Facilities> = {}): Facilities => ({ ...EMPTY_FACILITIES, stadium, ...more });
const MAX: Facilities = { stadium: 4, seating: 3, concessions: 4, restrooms: 3, parking: 4, videoboard: 3, suites: 3, store: 3, atmosphere: 3 };

test('no style puts a seat on the field', () => {
  for (const style of LOOK_OPTIONS.style) for (const f of [at(0), MAX]) {
    const bp = blueprint(style, f);
    assert.ok(bp.inner > bp.outline.reach(...FIELD_CORNER), style);
    for (const s of seatSpots(bp, 0.3)) {
      const inField = Math.abs(s.x) < FIELD_CORNER[0] && Math.abs(s.z) < FIELD_CORNER[1];
      assert.ok(!inField, `${style} seat at ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
    }
  }
});

test('every style grows with the stadium level', () => {
  for (const style of LOOK_OPTIONS.style) {
    let top = 0, seats = 0;
    for (let level = 0; level <= 4; level++) {
      const bp = blueprint(style, at(level));
      const n = seatSpots(bp).length;
      assert.ok(bp.top >= top, `${style} top at level ${level}`);
      assert.ok(n >= seats, `${style} seats at level ${level}`);
      top = bp.top; seats = n;
    }
    assert.ok(seats > seatSpots(blueprint(style, at(0))).length, `${style} gains seats`);
  }
});

test('the same upgrades are built differently by style', () => {
  assert.equal(blueprint('dome', MAX).boards[0].kind, 'cube');
  assert.equal(blueprint('grandstand', at(2, { videoboard: 1 })).boards[0].kind, 'scoreboard');
  assert.ok(blueprint('grandstand', at(2, { suites: 1 })).pressBox);
  assert.equal(blueprint('bowl', at(2, { suites: 1 })).suites[0].to - blueprint('bowl', at(2, { suites: 1 })).suites[0].from, TAU);
  assert.equal(blueprint('horseshoe', MAX).boards[0].mount, 'tower');
  assert.ok(blueprint('coliseum', MAX).torch && blueprint('coliseum', MAX).colonnade);
  assert.deepEqual(blueprint('cantilever', at(3)).roof, { kind: 'membrane', moving: true });
  assert.deepEqual(blueprint('cantilever', at(2)).roof, { kind: 'membrane', moving: false });
  assert.equal(blueprint('grandstand', at(0)).stands.length, 2); // bleachers come with seating
  assert.equal(blueprint('grandstand', at(0, { seating: 1 })).stands.length, 4);
});

test('old looks load, with every new choice defaulted', () => {
  assert.deepEqual(normalizeLook({ facade: 'brick', seats: 'mono', turf: 'classic' }),
    { ...DEFAULT_LOOK, facade: 'brick', seats: 'mono', turf: 'plain', endZone: 'argyle' });
  assert.deepEqual(normalizeLook(null), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ style: 'pyramid', accent: 'red' }), DEFAULT_LOOK);
});

test('a look edit is checked', () => {
  const ok = checkIdentity({ look: { style: 'dome', accent: '#FFAA00', endZoneText: '  Go   Milk! <script> ' } });
  assert.equal(typeof ok, 'object');
  const look = (ok as { look: typeof DEFAULT_LOOK }).look;
  assert.equal(look.style, 'dome'); assert.equal(look.accent, '#ffaa00'); assert.equal(look.endZoneText, 'Go Milk! script');
  assert.match(String(checkIdentity({ look: { style: 'pyramid' } })), /style/);
  assert.match(String(checkIdentity({ look: { accent: 'blue' } })), /accent/);
  assert.match(String(checkIdentity({ look: { endZoneText: 'x'.repeat(30) } })), /end zone/);
});

test('an automatic roof closes at night and in winter', () => {
  assert.equal(roofClosed('auto', 0, 9), false);
  assert.equal(roofClosed('auto', 0.9, 9), true);
  assert.equal(roofClosed('auto', 0, 0), true);
  assert.equal(roofClosed('open', 1, 0), false);
});

test('a crowd fills the best seats first, to exactly its size', () => {
  const bp = blueprint('bowl', MAX);
  const spots = seatSpots(bp);
  for (const fill of [0, 0.25, 0.6, 1]) assert.equal(seatsFilled(bp, spots, fill).length, Math.round(spots.length * fill));
  const half = new Set(seatsFilled(bp, spots, 0.5));
  const empty = spots.filter(s => !half.has(s));
  const mean = (xs: typeof spots, f: (s: (typeof spots)[number]) => number) => xs.reduce((t, s) => t + f(s), 0) / xs.length;
  // The empty seats are higher up and further toward the end zones than the sold ones.
  assert.ok(mean(empty, s => s.y) > mean([...half], s => s.y) + 0.3);
  assert.ok(mean(empty, s => Math.abs(s.x)) > mean([...half], s => Math.abs(s.x)));
  // The same crowd always sits in the same seats.
  assert.deepEqual(seatsFilled(bp, spots, 0.5), seatsFilled(bp, spots, 0.5));
});

test('seats are spaced evenly along every row, the 50-yard line as close as the corners', () => {
  for (const style of LOOK_OPTIONS.style) {
    const spots = seatSpots(blueprint(style, MAX));
    // Seats per unit of x near midfield vs near the corners, on the far sideline's front rows.
    const front = spots.filter(s => s.deck === 0 && s.z < 0 && s.y < 0.4);
    if (front.length < 20) continue;
    const xMax = Math.max(...front.map(s => Math.abs(s.x)));
    const near = (lo: number, hi: number) => front.filter(s => Math.abs(s.x) >= lo * xMax && Math.abs(s.x) < hi * xMax).length / (hi - lo);
    const ratio = near(0, 0.25) / near(0.4, 0.65);
    assert.ok(ratio > 0.8 && ratio < 1.25, `${style}: midfield density ${ratio.toFixed(2)} of the corners`);
  }
});

test('every board is held up by something that reaches what it stands on', () => {
  for (const style of LOOK_OPTIONS.style) for (const f of [at(0, { videoboard: 1 }), at(2, { videoboard: 2 }), MAX]) {
    const bp = blueprint(style, f);
    for (const b of bp.boards) {
      assert.ok(b.reach > 0, `${style} ${b.mount} reach`);
      const bottom = b.y - b.h / 2;
      if (b.mount === 'posts' || b.mount === 'tower') assert.ok(Math.abs(bottom - b.reach) < 1e-9, `${style} stands on the ground`);
      if (b.mount === 'truss') assert.ok(Math.abs(bottom - b.reach - (bp.top - 0.04)) < 1e-9, `${style} truss lands on the stands`);
      if (b.mount === 'piers') assert.ok(Math.abs(bottom - b.reach - (bp.colonnade!.base + bp.colonnade!.h + 0.22)) < 1e-9, `${style} piers land on the colonnade`);
      if (b.mount === 'cables' && bp.roof?.kind === 'dome') assert.ok(Math.abs(b.y + b.h / 2 + b.reach - (bp.top + (bp.footprint + 0.05) * bp.roof.rise)) < 1e-9, 'cables reach the crown');
    }
  }
});
