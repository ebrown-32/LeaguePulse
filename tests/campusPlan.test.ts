import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campusPlan, CYCLE, pointAt, signalPhase, type Rect } from '../src/lib/franchise/campusPlan.ts';
import { blueprint } from '../src/lib/franchise/stadiumBlueprint.ts';
import { checkIdentity, DEFAULT_LOOK, FEATURES, LOOK_OPTIONS, normalizeLook } from '../src/lib/franchise/model.ts';
import { EMPTY_FACILITIES, type Facilities } from '../src/lib/tycoon/catalog.ts';

const MAX: Facilities = { stadium: 4, seating: 3, concessions: 4, restrooms: 3, parking: 4, videoboard: 3, suites: 3, store: 3, atmosphere: 3 };
const overlap = (a: Rect, b: Rect) => Math.abs(a.x - b.x) * 2 < a.w + b.w - 1e-6 && Math.abs(a.z - b.z) * 2 < a.d + b.d - 1e-6;
const plan = (look: Partial<typeof DEFAULT_LOOK> = {}, f: Facilities = MAX, fill = 0.9) => {
  const bp = blueprint(look.style ?? 'bowl', f);
  return campusPlan({ outline: bp.outline, footprint: bp.footprint, parking: f.parking, fill, look: { ...DEFAULT_LOOK, ...look } });
};

test('no building stands in a parking lot, in any neighborhood or setting', () => {
  for (const district of LOOK_OPTIONS.district) for (const setting of LOOK_OPTIONS.setting) {
    const p = plan({ district, setting, tailgate: 'rowdy', features: [...FEATURES] });
    for (const b of p.buildings) for (const l of p.lots) assert.ok(!overlap(b, l), `${district}/${setting}: ${b.kind} at ${b.x.toFixed(1)}, ${b.z.toFixed(1)} in a lot`);
    assert.ok(p.buildings.length > 0, `${district}/${setting} has buildings`);
  }
});

test('the lots grow with parking and fill with the crowd', () => {
  const small = plan({}, { ...MAX, parking: 0 }), big = plan();
  assert.ok(big.lots.length > small.lots.length);
  const empty = plan({}, MAX, 0.05), full = plan({}, MAX, 1);
  assert.ok(full.cars.length > empty.cars.length * 3, `${empty.cars.length} cars empty, ${full.cars.length} full`);
  assert.equal(plan({}, { ...EMPTY_FACILITIES, parking: 2 }).garage, null);
  assert.ok(plan().garage);
});

test('tailgating follows the setting chosen', () => {
  assert.equal(plan({ tailgate: 'off' }).tailgates.length, 0);
  const chill = plan({ tailgate: 'chill' }), rowdy = plan({ tailgate: 'rowdy' });
  assert.ok(chill.tailgates.length > 0 && rowdy.tailgates.length > chill.tailgates.length);
  assert.equal(chill.rvs.length, 0);
  assert.ok(rowdy.rvs.length > 0 && rowdy.partyTent);
});

test('extras appear only when turned on', () => {
  const none = plan({ features: [] });
  assert.ok(!none.statue && !none.fountain && !none.ferris && none.trucks.length === 0);
  const all = plan({ features: [...FEATURES] });
  assert.ok(all.statue && all.fountain && all.ferris && all.trucks.length > 0);
});

test('each neighborhood is itself', () => {
  assert.ok(plan({ district: 'downtown' }).buildings.some(b => b.kind === 'office' || b.kind === 'tower'));
  assert.ok(plan({ district: 'college' }).buildings.some(b => b.kind === 'clock'));
  assert.ok(plan({ district: 'suburbs' }).buildings.filter(b => b.kind === 'house').length > 50);
  const farm = plan({ district: 'countryside' });
  assert.ok(farm.fields.length > 0 && farm.waterTower && farm.buildings.some(b => b.kind === 'barn'));
});

test('the plan is the same every time', () => {
  assert.deepEqual(plan({ district: 'suburbs' }), plan({ district: 'suburbs' }));
});

test('the waterfront has a shore and nothing past it', () => {
  const p = plan({ setting: 'waterfront' });
  assert.ok(p.shore !== null);
  for (const b of p.buildings) assert.ok(b.z - b.d / 2 > p.shore!, `${b.kind} in the water`);
  assert.equal(plan({ setting: 'city' }).shore, null);
});

test('surroundings are checked and defaulted like the rest of the look', () => {
  assert.equal(normalizeLook({}).district, DEFAULT_LOOK.district);
  assert.deepEqual(normalizeLook({ features: ['fountain', 'jetpack', 'statue'] }).features, ['statue', 'fountain']);
  assert.match(String(checkIdentity({ look: { ...DEFAULT_LOOK, district: 'moon' } })), /district/);
  assert.match(String(checkIdentity({ look: { ...DEFAULT_LOOK, features: ['jetpack'] } })), /extras/i);
});

test('nothing planted or fenced lands in a lot, on the ring road or in the stadium', () => {
  for (const district of LOOK_OPTIONS.district) for (const setting of LOOK_OPTIONS.setting) for (const parking of [0, 2, 4]) {
    const bp = blueprint('bowl', { ...MAX, parking });
    const p = campusPlan({ outline: bp.outline, footprint: bp.footprint, parking, fill: 0.9, look: { ...DEFAULT_LOOK, district, setting, plaza: 'concrete' } });
    const inLot = (x: number, z: number) => p.lots.some(l => Math.abs(x - l.x) * 2 < l.w && Math.abs(z - l.z) * 2 < l.d);
    const inCore = (x: number, z: number) => bp.outline.reach(x, z) < p.ringOut + 0.1;
    const spots = [...p.trees, ...p.pines, ...p.cacti, ...p.shrubs, ...p.hay, ...p.fields];
    for (const s of spots) assert.ok(!inLot(s.x, s.z) && !inCore(s.x, s.z), `${district}/${setting}/P${parking}: something at ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`);
    for (const f of p.fences) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const x = f.x1 + (f.x2 - f.x1) * t, z = f.z1 + (f.z2 - f.z1) * t;
      assert.ok(!inLot(x, z) && !inCore(x, z), `${district}/${setting}/P${parking}: fence through ${x.toFixed(1)}, ${z.toFixed(1)}`);
    }
  }
});

test('the countryside farms right up to the parking', () => {
  const p = plan({ district: 'countryside' });
  const near = p.fields.filter(f => Math.hypot(f.x / 1.45, f.z) < 26);
  assert.ok(near.length >= 4, `${near.length} fields near the stadium`);
});

test('cars keep to the right, on the ring and on the avenues', () => {
  for (const setting of ['city', 'waterfront'] as const) {
    const bp = blueprint('bowl', MAX), p = plan({ setting });
    for (const rt of p.traffic) for (let s = 0; s < rt.length; s += 0.5) {
      const [x, z, dx, dz] = pointAt(rt, s), rx = -dz, rz = dx; // the driver's right
      const R = bp.outline.reach(x, z);
      if (R > p.ring && R < p.ringOut) assert.ok(rx * -x + rz * -z > 0 === R < (p.ring + p.ringOut) / 2, `${setting}: on the ring at ${x.toFixed(1)}, ${z.toFixed(1)} on the wrong side`);
      else if (Math.abs(x) < 0.5 && Math.abs(z) > p.ringOut + 2) assert.ok(rx * x > 0, `${setting}: wrong side of a north-south avenue at z ${z.toFixed(1)}`);
      else if (Math.abs(z) < 0.5 && Math.abs(x) > p.ringOut * 1.45 + 2) assert.ok(rz * z > 0, `${setting}: wrong side of an east-west avenue at x ${x.toFixed(1)}`);
    }
  }
});

test('no two streams of traffic ever cross', () => {
  const p = plan();
  const segs = p.traffic.map(rt => rt.pts.map((a, i) => [a, rt.pts[(i + 1) % rt.pts.length]] as const).filter(([a]) => Math.hypot(a[0], a[1]) < 30).slice(0, rt.loop ? undefined : -1));
  const cross = (a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]) => {
    const o = (p1: readonly number[], p2: readonly number[], p3: readonly number[]) => Math.sign((p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++)
    for (const [a, b] of segs[i]) for (const [c, d] of segs[j]) assert.ok(!cross(a, b, c, d), `routes ${i} and ${j} cross near ${a[0].toFixed(1)}, ${a[1].toFixed(1)}`);
});

test('every lane on the ring stops at every crosswalk, and inbound cars at a stop sign', () => {
  const p = plan();
  assert.ok(p.signals.length > 0);
  const [inner, ...through] = p.traffic;
  assert.equal(inner.holds.filter(h => h.kind === 'signal').length, p.signals.length);
  assert.equal(through.reduce((n, t) => n + t.holds.filter(h => h.kind === 'signal').length, 0), p.signals.length);
  for (const t of through) assert.equal(t.holds.filter(h => h.kind === 'stop').length, 1);
  assert.equal(p.stopLines.length, p.traffic.reduce((n, t) => n + t.holds.length, 0));
});

test('fans wait at the curb, and only walk while every car is held at red', () => {
  const bp = blueprint('bowl', MAX), p = plan();
  for (const f of p.fans) {
    const [x, z] = pointAt(f, f.holds[0].s), R = bp.outline.reach(x, z);
    assert.ok(R > p.ringOut && R < p.ringOut + 0.32, `waits at size ${R.toFixed(2)}, not on the sidewalk`);
  }
  for (let t = 0; t < CYCLE * 2; t += 0.05) {
    const ph = signalPhase(t, 3);
    if (ph.walk) {
      assert.equal(ph.car, 'red');
      // and stays red long enough for the slowest fan to clear: 1.7 at 0.55 a second
      assert.equal(signalPhase(t + 3.2, 3).car, 'red');
    }
  }
});

test('the waterfront has no through traffic into the bay', () => {
  const p = plan({ setting: 'waterfront' });
  for (const rt of p.traffic) for (const [, z] of rt.pts) assert.ok(z > p.shore!, 'a car in the water');
});

test('an undressed franchise gets a stadium of its own, the same every time', async () => {
  const { seededLook } = await import('../src/lib/franchise/seededLook.ts');
  const ids = Array.from({ length: 60 }, (_, i) => `espn-1252101-u-${i.toString(36)}team`);
  for (const id of ids) {
    const l = seededLook(id);
    assert.deepEqual(seededLook(id), l);
    assert.deepEqual(normalizeLook(l), l, 'a look that saves and loads as itself');
    assert.equal(typeof checkIdentity({ look: l }), 'object');
  }
  const styles = new Set(ids.map(id => seededLook(id).style)), settings = new Set(ids.map(id => seededLook(id).setting));
  assert.ok(styles.size >= 5 && settings.size >= 4, 'teams differ');
});

test('unpicked teams in a league each get a color of their own', async () => {
  const { seededColors, TEAM_COLORS } = await import('../src/lib/franchise/seededLook.ts');
  const ids = Array.from({ length: 14 }, (_, i) => `espn-1252101-u-${(i * 7919).toString(36)}`);
  const a = seededColors(ids), b = seededColors([...ids].reverse());
  assert.deepEqual([...a].sort(), [...b].sort(), 'the same whatever order the league lists them in');
  assert.equal(new Set(a.values()).size, ids.length, 'no two alike');
  for (const c of a.values()) assert.ok((TEAM_COLORS as readonly string[]).includes(c));
});
