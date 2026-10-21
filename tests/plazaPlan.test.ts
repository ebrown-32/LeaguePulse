import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blueprint } from '../src/lib/franchise/stadiumBlueprint.ts';
import { STYLE_ORDER } from '../src/lib/franchise/stadiumStyles.ts';
import { GATES, plazaPlan, plazaSpot, promenade, PLAZA, type PlazaSpot } from '../src/lib/franchise/plazaPlan.ts';
import { FEATURES } from '../src/lib/franchise/model.ts';

const LEVELS = [
  { stadium: 0, seating: 0, concessions: 0, restrooms: 0, parking: 0, videoboard: 0, suites: 0, store: 0, atmosphere: 0 },
  { stadium: 4, seating: 3, concessions: 4, restrooms: 3, parking: 4, videoboard: 3, suites: 3, store: 3, atmosphere: 3 },
];
// How much room each thing takes on the ground, as a circle.
const SIZE = { stand: 0.17, restroom: 0.33, bench: 0.13, lamp: 0.04, planter: 0.1, statue: 0.24, fountain: 0.42, store: 0.6 };

for (const style of STYLE_ORDER) for (const f of LEVELS) {
  test(`the plaza around a ${style} at stadium level ${f.stadium} has room for everything`, () => {
    const bp = blueprint(style, f as never);
    const plan = plazaPlan(bp.outline, bp.footprint, {
      concessions: f.concessions, restrooms: 2, features: [...FEATURES], plaza: 'concrete', store: f.store, towers: bp.towers,
    });
    assert.equal(plan.stands.length, f.concessions * 6, 'every stand found a place');
    assert.equal(plan.statues.length, 3, 'three legends, spaced around');
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      assert.ok(Math.hypot(plan.statues[i].x - plan.statues[j].x, plan.statues[i].z - plan.statues[j].z) > 2, 'the statues are spread out');
    }
    const things: [PlazaSpot, number, string][] = [
      ...plan.stands.map(s => [s, SIZE.stand, 'stand'] as [PlazaSpot, number, string]),
      ...plan.restrooms.map(s => [s, SIZE.restroom, 'restroom'] as [PlazaSpot, number, string]),
      ...plan.benches.map(s => [s, SIZE.bench, 'bench'] as [PlazaSpot, number, string]),
      ...plan.lamps.map(s => [s, SIZE.lamp, 'lamp'] as [PlazaSpot, number, string]),
      ...plan.planters.map(s => [s, SIZE.planter, 'planter'] as [PlazaSpot, number, string]),
      ...plan.statues.map(s => [s, SIZE.statue, 'statue'] as [PlazaSpot, number, string]),
      ...(plan.fountain ? [[plan.fountain, SIZE.fountain, 'fountain'] as [PlazaSpot, number, string]] : []),
    ];
    // Nothing on top of anything else (the store is long, so it's checked along its length below).
    for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) {
      const [a, ra, na] = things[i], [b, rb, nb] = things[j];
      const gap = Math.hypot(a.x - b.x, a.z - b.z) - Math.max(ra, rb) * 0.9;
      assert.ok(gap > 0, `${na} and ${nb} overlap by ${(-gap).toFixed(2)}`);
    }
    // Nothing in front of a gate but the flags and the medallion.
    for (const [t, , name] of things) for (const g of GATES) {
      const gate = plazaSpot(bp.outline, bp.footprint, g, PLAZA.band);
      assert.ok(Math.hypot(t.x - gate.x, t.z - gate.z) > 0.55, `a ${name} blocks the gate at ${g.toFixed(2)}`);
    }
    // The walkers' lanes stay clear of everything standing on the plaza.
    const solid = [...things.filter(([, , n]) => n !== 'bench' && n !== 'planter'), ...(plan.store ? [[plan.store, 0.18, 'store'] as [PlazaSpot, number, string]] : [])];
    for (const d of [PLAZA.inner - 0.045, PLAZA.inner + 0.045, PLAZA.outer - 0.045, PLAZA.outer + 0.045]) {
      const lane = promenade(bp.outline, bp.footprint, d, plan.obstacles);
      for (const [x, z] of lane.pts) {
        for (const ob of plan.obstacles) assert.ok(Math.hypot(x - ob.x, z - ob.z) > ob.r + 0.03, `a lane runs through an obstacle at ${x.toFixed(2)},${z.toFixed(2)}`);
        for (const [t, rad, name] of solid) {
          if (name === 'statue' || name === 'fountain') continue; // obstacles, checked above
          assert.ok(Math.hypot(x - t.x, z - t.z) > Math.min(rad, 0.2), `a lane runs through a ${name}`);
        }
      }
    }
  });
}
