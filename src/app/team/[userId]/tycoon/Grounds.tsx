'use client';

/**
 * Everything outside the stadium, drawn from its site plan
 * (lib/franchise/campusPlan): the plaza in its paving, the ring road and the
 * avenues with their sidewalks, lines and streetlights; the parking lots, filled
 * to the crowd, with tailgates behind the cars; walkways to the gates with fans
 * streaming along them and traffic on the roads; the district past the parking
 * (downtown, a college campus, suburbs or farmland); the extras the manager
 * turned on; and past it all the setting's horizon:
 *
 *   city        a skyline all round, its windows lit at dusk
 *   park        rolling hills
 *   waterfront  a bay along the far side with boats, wooded headlands and a
 *               lighthouse across it, hills inland
 *   mountains   ranges with snow on the tallest, wooded foothills in front
 *   desert      sand dunes, and pyramids rising out of them
 *
 * The sky deepens overhead from the haze color at the horizon; the land fades
 * into that haze (the scene's fog) and the horizon in a haze that thins with
 * height, so it all meets without a seam.
 *
 * Traffic keeps the rules (see Traffic) and fans cross at the signals (see
 * Walkers). Everything repeated is instanced; what moves moves in one frame
 * loop each.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BackSide, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Object3D, ShaderMaterial, Vector3, type Group, type InstancedMesh, type Matrix4, type Mesh } from 'three';
import { OVAL, type Outline } from '@/lib/franchise/stadiumBlueprint';
import type { StadiumLook } from '@/lib/franchise/model';
import { campusPlan, EDGE, pointAt, signalPhase, STEP, type CampusPlan, type Route, type Segment, type Tint } from '@/lib/franchise/campusPlan';
import { Boxes, Instanced, mat, Placed, Ribbon, Rise, mix, rng, type Item } from './stadiumParts';
import { groundTexture, hazeMaterial, plazaTexture, windowMaterial } from './campusLook';

type Setting = StadiumLook['setting'];

export const GROUND: Record<Setting, { grass: string; plaza: string }> = {
  city: { grass: '#5f8a4c', plaza: '#d5cfc2' },
  park: { grass: '#6a9a50', plaza: '#dcd6c6' },
  waterfront: { grass: '#5f8a4c', plaza: '#d9d4c9' },
  mountains: { grass: '#587f48', plaza: '#cfcabe' },
  desert: { grass: '#cdb383', plaza: '#e2d3b3' },
};

/**
 * The flat layers, by the height of their top. Each sits well clear of the one
 * below: surfaces drawn a millimeter apart (or at the same height) fight over
 * the same pixels and flicker where they cross.
 */
const Y = { plaza: 0.004, lawn: 0.007, lot: 0.01, crop: 0.012, road: 0.014, sidewalk: 0.02, walk: 0.026, paint: 0.032, glow: 0.036 };
/** A flat box's center, for its top to sit at `top`. */
const at = (top: number, h = 0.004) => top - h / 2;

const ASPHALT = '#33373c', SIDEWALK = '#b9b4aa', GRAVEL = '#a8997c', WALK = '#cfc6b4';
const CAR_COLORS = ['#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#2980b9', '#f1c40f', '#1e1e1e', '#16a085', '#8e44ad', '#d35400', '#bdc3c7', '#34495e'];
const CAR_SIZE: [number, number, number][] = [[0.5, 0.1, 0.24], [0.55, 0.14, 0.26], [0.62, 0.12, 0.27]];

/** Autumn and winter show in the trees. */
function treePalette(): string[] {
  const m = new Date().getMonth();
  if (m >= 8 && m <= 10) return ['#3f7d32', '#c46a1c', '#d99b2b', '#a63f1f', '#5d8a2e'];
  if (m === 11 || m <= 1) return ['#2f5d34', '#3a6b3d', '#7a6a55'];
  return ['#3f7d32', '#4f8f3a', '#2f6b2a', '#5d9a3e'];
}

/** A flat strip along a segment, as a box placement. */
const strip = (s: Segment, y: number, w = s.w): Item => ({
  x: (s.x1 + s.x2) / 2, y, z: (s.z1 + s.z2) / 2, ry: -Math.atan2(s.z2 - s.z1, s.x2 - s.x1), sx: Math.hypot(s.x2 - s.x1, s.z2 - s.z1), sz: w,
});

/** Dashes down a segment's middle. */
function dashes(s: Segment, every: number, len: number, y: number): Item[] {
  const L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1), n = Math.floor(L / every), ry = -Math.atan2(s.z2 - s.z1, s.x2 - s.x1);
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n;
    return { x: s.x1 + (s.x2 - s.x1) * t, y, z: s.z1 + (s.z2 - s.z1) * t, ry, sx: len };
  });
}

/** A unit roof: a triangular prism, ridge along x, 1 wide in z and 1 high. */
function prismGeometry() {
  const g = new BufferGeometry();
  const v = [
    // the two sloped faces, then the two gable ends
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0,
    -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, 0.5, 0, 0.5,
    -0.5, 0, -0.5, -0.5, 1, 0, -0.5, 0, 0.5,
    0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0,
  ];
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** Paint along a segment, one strip a side of its centre (a double line), from `skip` in from its start. */
function lines(s: Segment, offsets: number[], skip: number, y: number): Item[] {
  const L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1), dx = (s.x2 - s.x1) / L, dz = (s.z2 - s.z1) / L;
  if (L - skip < 0.2) return [];
  const mid = skip + (L - skip) / 2;
  return offsets.map(o => ({ x: s.x1 + dx * mid - dz * o, y, z: s.z1 + dz * mid + dx * o, ry: -Math.atan2(dz, dx), sx: L - skip }));
}

/** Continental crosswalk bars: running with the traffic, laid one after another across the road. */
function bars(c: Segment): Item[] {
  const L = Math.hypot(c.x2 - c.x1, c.z2 - c.z1), dx = (c.x2 - c.x1) / L, dz = (c.z2 - c.z1) / L, n = Math.max(2, Math.floor((L - 0.04) / 0.13));
  return Array.from({ length: n }, (_, i) => {
    const t = (L - (n - 1) * 0.13) / 2 + i * 0.13;
    return { x: c.x1 + dx * t, y: at(Y.paint, 0.002), z: c.z1 + dz * t, ry: Math.atan2(-dx, -dz), sx: c.w };
  });
}

function Roads({ o, plan, setting }: { o: Outline; plan: CampusPlan; setting: Setting }) {
  const paint = at(Y.paint, 0.002);
  const { asphalt, sidewalk, gravel, walk, white, yellow, zebra } = useMemo(() => {
    const asphalt = [...plan.avenues, ...plan.streets, ...plan.driveways].map(s => strip(s, at(Y.road)));
    const sidewalk = plan.sidewalks.map(s => strip(s, at(Y.sidewalk)));
    const gravel = plan.gravel.map(s => strip(s, at(Y.lot)));
    const walk = plan.walkways.map(s => strip(s, at(Y.walk)));
    const white = plan.stopLines.map(s => strip(s, paint));
    // A double yellow down each avenue, from past its stop line out.
    const yellow = plan.avenues.flatMap(a => lines(a, [-0.035, 0.035], 1.1, paint));
    // Dashed yellow down the side streets, left out where they cross each other and at their ends.
    const G = plan.block;
    for (const s of plan.streets) {
      const L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1), dx = (s.x2 - s.x1) / L, dz = (s.z2 - s.z1) / L;
      for (let d = 0.6; d < L - 0.6; d += 0.9) {
        const x = s.x1 + dx * d, z = s.z1 + dz * d, along = Math.abs(dx) > 0.5 ? x : z;
        if (Math.abs(along - Math.round(along / G) * G) < 0.6) continue;
        yellow.push({ x, y: paint, z, ry: -Math.atan2(dz, dx), sx: 0.4 });
      }
    }
    // Dashed yellow round the ring between its lanes, clear of the crosswalks and the avenue mouths.
    const mid = (plan.ring + plan.ringOut) / 2, mouths = plan.ringWalk;
    const inMouth = (a: number) => {
      const t = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return !mouths.some(([a0, a1]) => [t, t + Math.PI * 2, t - Math.PI * 2].some(u => u >= a0 && u <= a1));
    };
    let carry = 0, prev = o.around(0, mid);
    for (let k = 1; k <= 3000; k++) {
      const a = (k / 3000) * Math.PI * 2, p = o.around(a, mid);
      carry += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      if (carry >= 0.8) {
        carry = 0;
        const near = plan.signals.some(sg => Math.hypot(sg.x - p[0], sg.z - p[1]) < 0.55);
        if (!near && !inMouth(a)) yellow.push({ x: p[0], y: paint, z: p[1], ry: -Math.atan2(p[1] - prev[1], p[0] - prev[0]), sx: 0.36 });
      }
      prev = p;
    }
    const zebra = plan.crosswalks.flatMap(bars);
    return { asphalt, sidewalk, gravel, walk, white, yellow, zebra };
  }, [plan, o, paint]);
  return (
    <group>
      <Ribbon o={o} profile={() => [[plan.ring, Y.road], [plan.ringOut, Y.road]]} k={`ring${plan.ring}`}><meshStandardMaterial color={ASPHALT} roughness={0.95} /></Ribbon>
      {plan.ringWalk.map(([a0, a1], i) => (
        <Ribbon key={i} o={o} from={a0} to={a1} profile={() => [[plan.ringOut, Y.sidewalk], [plan.ringOut + 0.32, Y.sidewalk]]} k={`ringwalk${plan.ring}${i}`}>
          <meshStandardMaterial color={SIDEWALK} roughness={0.9} />
        </Ribbon>
      ))}
      <Boxes items={asphalt} size={[1, 0.004, 1]} color={ASPHALT} cast={false} roughness={0.95} />
      <Boxes items={sidewalk} size={[1, 0.004, 1]} color={SIDEWALK} cast={false} />
      <Boxes items={gravel} size={[1, 0.004, 1]} color={setting === 'desert' ? '#bfa678' : GRAVEL} cast={false} roughness={1} />
      <Boxes items={walk} size={[1, 0.004, 1]} color={WALK} cast={false} />
      <Boxes items={white} size={[1, 0.002, 1]} color="#f2efe6" cast={false} />
      <Boxes items={yellow} size={[1, 0.002, 0.035]} color="#e8c547" cast={false} />
      <Boxes items={zebra} size={[1, 0.002, 0.07]} color="#f2efe6" cast={false} />
    </group>
  );
}

function Lots({ plan }: { plan: CampusPlan }) {
  const { cars, cabins, lines, surfaces } = useMemo(() => {
    const all = [...plan.cars, ...plan.curbCars];
    const cars = all.map(c => ({ x: c.x, y: CAR_SIZE[c.size][1] / 2 + 0.01, z: c.z, ry: c.ry, sx: CAR_SIZE[c.size][0] / 0.5, sy: CAR_SIZE[c.size][1] / 0.1, sz: CAR_SIZE[c.size][2] / 0.24, c: CAR_COLORS[c.color] }));
    const cabins = all.map(c => ({ x: c.x - (c.size === 2 ? Math.cos(c.ry) * 0.12 : 0), y: CAR_SIZE[c.size][1] + 0.05, z: c.z + (c.size === 2 ? Math.sin(c.ry) * 0.12 : 0), ry: c.ry, sx: c.size === 2 ? 0.8 : 1, c: '#1d2733' }));
    const lines = plan.stallLines.map(s => ({ x: s.x, y: at(Y.paint, 0.002), z: s.z, ry: s.ry }));
    const surfaces = plan.lots.map(l => ({ x: l.x, y: at(Y.lot), z: l.z, sx: l.w, sz: l.d, c: l.grass ? '#6f8f4f' : l.paved ? '#3b3f45' : '#9a907c' }));
    return { cars, cabins, lines, surfaces };
  }, [plan]);
  return (
    <group>
      <Boxes items={surfaces} size={[1, 0.004, 1]} cast={false} roughness={0.95} />
      <Boxes items={lines} size={[0.012, 0.002, 0.55]} color="#e9e6dc" cast={false} />
      <Boxes items={cars} size={[0.5, 0.1, 0.24]} />
      <Boxes items={cabins} size={[0.26, 0.08, 0.2]} />
    </group>
  );
}

/** Tailgates: canopies, grills with smoke, chairs, coolers, cornhole, flags and the people around them. */
function Tailgates({ plan, team, accent, night }: { plan: CampusPlan; team: string; accent: string; night: number }) {
  const tint = (t: Tint, i: number) => (t === 'team' ? team : t === 'accent' ? accent : t === 'white' ? '#f4f4f2' : i % 2 ? team : accent);
  const parts = useMemo(() => {
    const r = rng(91);
    const tents: Item[] = [], legs: Item[] = [], tables: Item[] = [], chairs: Item[] = [], grills: Item[] = [], coolers: Item[] = [];
    const boards: Item[] = [], poles: Item[] = [], flags: Item[] = [], people: Item[] = [], smoke: { x: number; z: number; p: number }[] = [];
    const crowd = [team, team, accent, '#f2f2f2', '#2b2b2b', '#c0392b', '#2980b9'];
    plan.tailgates.forEach((t, i) => {
      const cos = Math.cos(t.ry), sin = Math.sin(t.ry);
      const at = (dx: number, dz: number) => ({ x: t.x + dx * cos + dz * sin, z: t.z - dx * sin + dz * cos });
      if (t.tent) {
        tents.push({ ...at(0, 0), y: 0.36, ry: t.ry + Math.PI / 4, c: tint(t.tent, i) });
        for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) legs.push({ ...at(dx, dz), y: 0.15 });
      }
      tables.push({ ...at(0, 0), y: 0.08, ry: t.ry });
      for (let c = 0; c < t.chairs; c++) {
        const a = (c / t.chairs) * Math.PI * 2;
        chairs.push({ ...at(Math.cos(a) * 0.26, Math.sin(a) * 0.26), y: 0.04, ry: -a, c: c % 2 ? team : '#2c3e50' });
      }
      if (t.grill) { const g = at(0.32, 0); grills.push({ ...g, y: 0.07 }); smoke.push({ ...g, p: r() }); }
      coolers.push({ ...at(-0.3, 0.1), y: 0.03, c: r() < 0.5 ? '#2980b9' : '#c0392b' });
      if (t.cornhole) {
        for (const s of [-1, 1]) boards.push({ ...at(s * 0.7, 0), y: 0.03, ry: t.ry, c: s > 0 ? team : accent });
      }
      if (t.flag) { const f = at(-0.22, -0.22); poles.push({ ...f, y: 0.32 }); flags.push({ x: f.x + 0.07, y: 0.56, z: f.z, ry: t.ry, c: i % 2 ? team : accent }); }
      for (let p = 0; p < t.people; p++) {
        const a = r() * Math.PI * 2, d = 0.18 + r() * 0.28;
        people.push({ ...at(Math.cos(a) * d, Math.sin(a) * d), y: 0.09, c: crowd[Math.floor(r() * crowd.length)] });
      }
    });
    return { tents, legs, tables, chairs, grills, coolers, boards, poles, flags, people, smoke };
  }, [plan, team, accent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smoke off the grills: puffs rise, swell and fade, on a loop.
  const puff = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  useFrame(({ clock }) => {
    const m = puff.current; if (!m) return;
    const t = clock.elapsedTime;
    let i = 0;
    for (const s of parts.smoke) for (let k = 0; k < 3; k++) {
      const life = (t * 0.35 + s.p + k / 3) % 1;
      dummy.position.set(s.x + Math.sin(t + k) * 0.03 + life * 0.08, 0.16 + life * 0.55, s.z);
      dummy.scale.setScalar(0.04 + life * 0.11);
      dummy.updateMatrix(); m.setMatrixAt(i++, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <Instanced items={parts.tents} roughness={0.7}><coneGeometry args={[0.32, 0.13, 4]} /></Instanced>
      <Boxes items={parts.legs} size={[0.012, 0.3, 0.012]} color="#d9dcdf" cast={false} />
      <Boxes items={parts.tables} size={[0.26, 0.02, 0.12]} color="#e9e6dc" />
      <Boxes items={parts.chairs} size={[0.06, 0.06, 0.06]} cast={false} />
      <Boxes items={parts.grills} size={[0.09, 0.07, 0.07]} color="#1b1d21" emissive="#ff6a1a" emissiveIntensity={0.15 + night * 0.4} />
      <Boxes items={parts.coolers} size={[0.08, 0.06, 0.05]} cast={false} />
      <Boxes items={parts.boards} size={[0.12, 0.02, 0.22]} />
      <Boxes items={parts.poles} size={[0.01, 0.64, 0.01]} color="#c9ced3" cast={false} />
      <Boxes items={parts.flags} size={[0.14, 0.09, 0.005]} cast={false} />
      <Instanced items={parts.people} roughness={0.8}><capsuleGeometry args={[0.03, 0.09, 3, 6]} /></Instanced>
      {parts.smoke.length > 0 && (
        <instancedMesh ref={puff} args={[undefined, undefined, parts.smoke.length * 3]} key={parts.smoke.length}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial color="#d9d9d9" transparent opacity={0.32} depthWrite={false} roughness={1} />
        </instancedMesh>
      )}
    </group>
  );
}

/** Rowdy's overflow field: RVs in a row and a party tent strung with lights. */
function Overflow({ plan, team, night }: { plan: CampusPlan; team: string; night: number }) {
  const bulbs = useMemo(() => {
    const t = plan.partyTent;
    if (!t) return [];
    return Array.from({ length: 24 }, (_, i) => ({ x: t.x - 1.3 + (i % 12) * 0.24, y: 0.62 + Math.sin(((i % 12) / 11) * Math.PI) * -0.06, z: t.z + (i < 12 ? -0.62 : 0.62) }));
  }, [plan.partyTent]);
  return (
    <group>
      <Boxes items={plan.rvs.map(v => ({ x: v.x, y: 0.2, z: v.z, ry: v.ry }))} size={[1.3, 0.34, 0.42]} color="#eeeae2" />
      <Boxes items={plan.rvs.map(v => ({ x: v.x, y: 0.22, z: v.z + 0.212, ry: v.ry }))} size={[1.3, 0.05, 0.005]} color={team} cast={false} />
      {plan.partyTent && (
        <group position={[plan.partyTent.x, 0, plan.partyTent.z]}>
          <mesh position={[0, 0.27, 0]} castShadow><boxGeometry args={[2.6, 0.54, 1.2]} /><meshStandardMaterial color="#f5f3ee" transparent opacity={0.9} /></mesh>
          <mesh position={[0, 0.68, 0]} rotation-y={Math.PI / 4} scale={[1, 1, 0.46]}><coneGeometry args={[1.9, 0.32, 4]} /><meshStandardMaterial color={team} /></mesh>
          {[-1, 1].map(s => <mesh key={s} position={[s * 1.45, 0.2, 0]}><boxGeometry args={[0.18, 0.4, 0.18]} /><meshStandardMaterial color="#1b1d21" /></mesh>)}
        </group>
      )}
      <Boxes items={bulbs} size={[0.04, 0.04, 0.04]} color="#fff4cc" emissive="#ffd27a" emissiveIntensity={0.3 + night * 2.2} cast={false} />
    </group>
  );
}

/** The district's buildings: walls with windows, pitched roofs where they have them. */
function Buildings({ plan, night, setting }: { plan: CampusPlan; night: number; setting: Setting }) {
  const { blocks, roofs, clock } = useMemo(() => {
    const office = setting === 'desert' ? ['#d9c3a0', '#cdb08a', '#e4d2b4', '#bfa27c'] : ['#8a96a3', '#a3adb7', '#6f7c89', '#b9c2ca', '#5c6b7a', '#c9c2b6'];
    const hall = setting === 'desert' ? ['#d8b48a', '#c99f73'] : ['#9c4a32', '#8a3f2b', '#a85a3c', '#b5654a'];
    const house = setting === 'desert' ? ['#e7d3b1', '#d9b98f', '#efe0c4', '#cfae86'] : ['#e8e1d3', '#c9d6df', '#e6d3b8', '#d9c4c4', '#c8d8c0', '#f0e6c8', '#b9c7d6'];
    const blocks: Item[] = [], roofs: Item[] = [];
    for (const b of plan.buildings) {
      if (b.kind === 'clock' || b.kind === 'barn') continue;
      const pal = b.kind === 'hall' ? hall : b.kind === 'house' ? house : office;
      blocks.push({ x: b.x, y: b.h / 2, z: b.z, ry: b.ry, sx: b.w, sy: b.h, sz: b.d, c: pal[b.color % pal.length] });
      if (b.roof === 'pitched') {
        const along = b.w >= b.d;
        roofs.push({ x: b.x, y: b.h, z: b.z, ry: b.ry + (along ? 0 : Math.PI / 2), sx: (along ? b.w : b.d) + 0.08, sy: Math.min(b.w, b.d) * 0.45, sz: (along ? b.d : b.w) + 0.08, c: b.kind === 'house' ? '#5b4a44' : '#4b5157' });
      }
    }
    return { blocks, roofs, clock: plan.buildings.find(b => b.kind === 'clock') ?? null };
  }, [plan, setting]);
  const tall = useMemo(() => windowMaterial({ cols: 3.2, rows: 3.4, lit: 0.45 }), []);
  useEffect(() => () => tall.material.dispose(), [tall]);
  useFrame(() => { tall.uniforms.uNight.value = night; });
  const roof = useMemo(() => prismGeometry(), []);
  const mesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current; if (!m) return;
    const d = new Object3D();
    blocks.forEach((b, i) => { d.position.set(b.x, b.y, b.z); d.rotation.set(0, b.ry ?? 0, 0); d.scale.set(b.sx!, b.sy!, b.sz!); d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, new Color(b.c)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [blocks]);
  return (
    <group>
      {blocks.length > 0 && (
        <instancedMesh ref={mesh} args={[undefined, tall.material, blocks.length]} key={blocks.length} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      <Instanced items={roofs} roughness={0.85}><primitive object={roof} attach="geometry" /></Instanced>
      {clock && <ClockTower x={clock.x} z={clock.z} night={night} />}
    </group>
  );
}

function ClockTower({ x, z, night }: { x: number; z: number; night: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.8, 0]} castShadow><boxGeometry args={[0.8, 3.6, 0.8]} /><meshStandardMaterial color="#9c4a32" roughness={0.9} /></mesh>
      <mesh position={[0, 3.75, 0]} castShadow><boxGeometry args={[0.9, 0.3, 0.9]} /><meshStandardMaterial color="#e6dccb" /></mesh>
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map(r => (
        <mesh key={r} position={[Math.sin(r) * 0.41, 3.2, Math.cos(r) * 0.41]} rotation-y={r}>
          <circleGeometry args={[0.22, 24]} />
          <meshStandardMaterial color="#f7f2e6" emissive="#ffe6b0" emissiveIntensity={night * 0.9} />
        </mesh>
      ))}
      <mesh position={[0, 4.35, 0]} castShadow><coneGeometry args={[0.55, 0.9, 4]} /><meshStandardMaterial color="#3d5a45" /></mesh>
    </group>
  );
}

/** Farmland: crop rows, barns with silos, hay, fences and the water tower in team colors. */
function Farms({ plan, team, accent, setting }: { plan: CampusPlan; team: string; accent: string; setting: Setting }) {
  const { rows, barns, silos, hay, rails, posts } = useMemo(() => {
    const crops = setting === 'desert' ? [['#c9b07a', '#b8995f'], ['#a8a06a', '#958c58']] : [['#6f8f3a', '#5d7a2f'], ['#c9a94a', '#b8973c'], ['#7a5a3a', '#6a4c30'], ['#8aa04a', '#759040']];
    const rows: Item[] = [];
    for (const f of plan.fields) {
      const [a, b] = crops[f.crop % crops.length];
      for (let i = 0; i < f.rows; i++) {
        const t = (i + 0.5) / f.rows - 0.5;
        rows.push(f.along === 'x'
          ? { x: f.x, y: at(Y.crop, 0.01), z: f.z + t * f.d, sx: f.w, sz: f.d / f.rows, c: i % 2 ? a : b }
          : { x: f.x + t * f.w, y: at(Y.crop, 0.01), z: f.z, sx: f.w / f.rows, sz: f.d, c: i % 2 ? a : b });
      }
    }
    const barns = plan.buildings.filter(b => b.kind === 'barn');
    const silos = barns.map(b => ({ x: b.x + b.w / 2 + 0.35, y: 0.75, z: b.z - 0.2 }));
    const hay = plan.hay.map(h => ({ x: h.x, y: 0.09, z: h.z }));
    const rails = plan.fences.flatMap(s => [strip(s, 0.12, 0.02), strip(s, 0.22, 0.02)]);
    const posts = plan.fences.flatMap(s => dashes(s, 0.6, 0.03, 0.12)).map(p => ({ ...p, sx: 1 }));
    return { rows, barns, silos, hay, rails, posts };
  }, [plan, setting]);
  const tower = plan.waterTower;
  const roof = useMemo(() => prismGeometry(), []);
  useEffect(() => () => roof.dispose(), [roof]);
  return (
    <group>
      <Boxes items={rows} size={[1, 0.01, 1]} cast={false} roughness={1} />
      <Boxes items={barns.map(b => ({ x: b.x, y: b.h / 2, z: b.z, sx: b.w, sy: b.h, sz: b.d }))} size={[1, 1, 1]} color="#9b2d22" roughness={0.9} />
      <Instanced items={barns.map(b => ({ x: b.x, y: b.h, z: b.z, sx: b.w + 0.1, sy: 0.6, sz: b.d + 0.1 }))} color="#3b3f44"><primitive object={roof} attach="geometry" /></Instanced>
      <Boxes items={barns.map(b => ({ x: b.x, y: b.h * 0.4, z: b.z + b.d / 2 + 0.005 }))} size={[0.5, 0.7, 0.01]} color="#f4efe4" cast={false} />
      <Instanced items={silos} color="#c9ced3"><cylinderGeometry args={[0.24, 0.24, 1.5, 14]} /></Instanced>
      <Instanced items={hay} color="#d9b45a" cast={false}><cylinderGeometry args={[0.1, 0.1, 0.16, 10]} /></Instanced>
      <Boxes items={rails} size={[1, 0.02, 1]} color="#e9e2d2" cast={false} />
      <Boxes items={posts} size={[0.03, 0.26, 0.03]} color="#8b6b4a" cast={false} />
      {tower && (
        <group position={[tower.x, 0, tower.z]}>
          {[[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]].map(([x, z], i) => (
            <mesh key={i} position={[x, 1.1, z]}><cylinderGeometry args={[0.03, 0.04, 2.2, 6]} /><meshStandardMaterial color="#9aa1a8" /></mesh>
          ))}
          <mesh position={[0, 2.55, 0]} castShadow><cylinderGeometry args={[0.7, 0.62, 0.9, 20]} /><meshStandardMaterial color={team} /></mesh>
          <mesh position={[0, 2.55, 0]}><cylinderGeometry args={[0.705, 0.705, 0.14, 20]} /><meshStandardMaterial color={accent} /></mesh>
          <mesh position={[0, 3.1, 0]}><coneGeometry args={[0.72, 0.3, 20]} /><meshStandardMaterial color={team} /></mesh>
        </group>
      )}
    </group>
  );
}

function Greenery({ plan, setting, detail }: { plan: CampusPlan; setting: Setting; detail: number }) {
  const parts = useMemo(() => {
    const colors = treePalette();
    const r = rng(77), thin = rng(78);
    // Past the edge of town, on a smaller device, only some of the trees: the haze has most of them anyway.
    const keep = (t: { x: number; z: number }) => Math.hypot(t.x, t.z) < EDGE || thin() < detail;
    const trunks: Item[] = [], crowns: Item[] = [], cones: Item[] = [], cacti: Item[] = [], arms: Item[] = [], shrubs: Item[] = [];
    for (const t of plan.trees) {
      if (!keep(t)) continue;
      const s = t.s ?? 1;
      trunks.push({ x: t.x, y: 0.2 * s, z: t.z, sy: s });
      crowns.push({ x: t.x, y: 0.6 * s, z: t.z, sx: s, sy: s * 0.9, sz: s, c: colors[Math.floor(r() * colors.length)] });
    }
    for (const t of plan.pines) {
      if (!keep(t)) continue;
      const s = t.s ?? 1, snow = setting === 'mountains' && r() < 0.2;
      trunks.push({ x: t.x, y: 0.15 * s, z: t.z, sy: s * 0.7 });
      cones.push({ x: t.x, y: 0.7 * s, z: t.z, sx: s, sy: s, sz: s, c: snow ? '#dfe7ea' : mix('#2f5d34', '#24492a', r()) });
    }
    for (const t of plan.cacti) {
      if (!keep(t)) continue;
      const s = t.s ?? 1;
      cacti.push({ x: t.x, y: 0.3 * s, z: t.z, sy: s, c: '#5f8a4a' });
      if (r() < 0.7) arms.push({ x: t.x + 0.1 * s, y: 0.36 * s, z: t.z, sy: s * 0.5, c: '#5f8a4a' }, { x: t.x - 0.1 * s, y: 0.3 * s, z: t.z, sy: s * 0.4, c: '#5f8a4a' });
    }
    for (const t of plan.shrubs) {
      if (!keep(t)) continue;
      const s = (t.s ?? 1) * 0.5;
      shrubs.push({ x: t.x, y: 0.1 * s, z: t.z, sx: s, sy: s * 0.7, sz: s, c: setting === 'desert' ? mix('#8a8f5a', '#a49a6a', r()) : mix('#4f7f3a', '#3a6b2e', r()) });
    }
    return { trunks, crowns, cones, cacti, arms, shrubs };
  }, [plan, setting, detail]);
  return (
    <group>
      <Boxes items={parts.trunks} size={[0.08, 0.4, 0.08]} color="#6b4a2f" />
      <Instanced items={parts.crowns} roughness={0.9} flat><icosahedronGeometry args={[0.35, 1]} /></Instanced>
      <Instanced items={parts.cones} roughness={0.9} flat><coneGeometry args={[0.3, 0.9, 7]} /></Instanced>
      <Instanced items={parts.cacti} roughness={0.9}><capsuleGeometry args={[0.06, 0.5, 3, 8]} /></Instanced>
      <Instanced items={parts.arms} roughness={0.9}><capsuleGeometry args={[0.04, 0.22, 3, 6]} /></Instanced>
      <Instanced items={parts.shrubs} roughness={0.95} flat><icosahedronGeometry args={[0.35, 0]} /></Instanced>
    </group>
  );
}

/** Yards and parks: lawn a shade lighter than the ground around them. */
function Lawns({ plan, grass }: { plan: CampusPlan; grass: string }) {
  const items = useMemo(() => [...plan.yards.map(y => ({ ...y, c: mix(grass, '#9fcf6a', 0.25) })), ...plan.parks.map(p => ({ ...p, c: mix(grass, '#8fd06a', 0.3) }))]
    .map(r => ({ x: r.x, y: at(Y.lawn), z: r.z, sx: r.w, sz: r.d, c: r.c })), [plan, grass]);
  const benches = useMemo(() => plan.benches.map(b => ({ x: b.x, y: 0.05, z: b.z, ry: b.ry })), [plan]);
  return (
    <group>
      <Boxes items={items} size={[1, 0.004, 1]} cast={false} roughness={1} />
      <Boxes items={benches} size={[0.3, 0.06, 0.1]} color="#7a5a3a" cast={false} />
    </group>
  );
}

/** Streetlights along the avenues and the ring; the extras' banners hang on them. */
function Streetlights({ plan, night, banners, team, accent }: { plan: CampusPlan; night: number; banners: boolean; team: string; accent: string }) {
  const { poles, heads, flags } = useMemo(() => {
    const poles = plan.lights.map(l => ({ x: l.x, y: 0.4, z: l.z }));
    const heads = plan.lights.map(l => ({ x: l.x + Math.cos(l.ry ?? 0) * 0.12, y: 0.8, z: l.z - Math.sin(l.ry ?? 0) * 0.12, ry: l.ry }));
    const flags = banners ? plan.lights.flatMap((l, i) => [{ x: l.x + Math.cos((l.ry ?? 0) + Math.PI) * 0.07, y: 0.58, z: l.z - Math.sin((l.ry ?? 0) + Math.PI) * 0.07, ry: l.ry, c: i % 2 ? team : accent }]) : [];
    return { poles, heads, flags };
  }, [plan, banners, team, accent]);
  // After dark, a warm pool of light on the ground under each one.
  const pools = useRef<InstancedMesh>(null);
  const lit = night > 0.05;
  useEffect(() => {
    const m = pools.current; if (!m) return;
    const d = new Object3D();
    heads.forEach((h, i) => { d.position.set(h.x, Y.glow, h.z); d.rotation.set(-Math.PI / 2, 0, 0); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
    m.instanceMatrix.needsUpdate = true;
  }, [heads, lit]);
  return (
    <group>
      {lit && heads.length > 0 && (
        <instancedMesh ref={pools} args={[undefined, undefined, heads.length]} key={heads.length} renderOrder={1}>
          <circleGeometry args={[0.75, 20]} />
          <meshBasicMaterial color="#ffc979" transparent opacity={night * 0.22} blending={AdditiveBlending} depthWrite={false} />
        </instancedMesh>
      )}
      <Boxes items={poles} size={[0.03, 0.8, 0.03]} color="#5c6168" cast={false} />
      <Boxes items={heads} size={[0.2, 0.035, 0.07]} color="#f6f1df" emissive="#ffe0a3" emissiveIntensity={night * 2.2} cast={false} />
      <Boxes items={flags} size={[0.1, 0.26, 0.012]} cast={false} />
    </group>
  );
}

/** The signals at the crosswalks: a lamp for the cars (green, amber, red) and a walk light for the fans. */
function Signals({ plan }: { plan: CampusPlan }) {
  const poles = useMemo(() => plan.signals.flatMap((sg, i) => sg.poles.map(p => ({ ...p, signal: i }))), [plan]);
  const car = useRef<InstancedMesh>(null), walk = useRef<InstancedMesh>(null);
  const items = useMemo(() => ({
    posts: poles.map(p => ({ x: p.x, y: 0.3, z: p.z })),
    heads: poles.map(p => ({ x: p.x, y: 0.58, z: p.z, ry: p.ry })),
    peds: poles.map(p => ({ x: p.x, y: 0.36, z: p.z, ry: p.ry })),
  }), [poles]);
  const dummy = useMemo(() => new Object3D(), []);
  useEffect(() => {
    for (const [m, y, off] of [[car.current, 0.58, 0.032], [walk.current, 0.36, 0.028]] as const) {
      if (!m) continue;
      poles.forEach((p, i) => {
        // The lamp on the face of the head, towards the traffic (or across the road, for the walk light).
        const ry = y > 0.5 ? p.ry : p.ry + Math.PI / 2;
        dummy.position.set(p.x + Math.cos(ry) * off, y, p.z - Math.sin(ry) * off); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
  }, [poles, dummy]);
  const c = useMemo(() => ({ green: new Color('#39e46a'), amber: new Color('#ffb21f'), red: new Color('#ff3b2f'), walk: new Color('#f4f7ff'), stop: new Color('#ff7a1a') }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    poles.forEach((p, i) => {
      const ph = signalPhase(t, p.signal);
      car.current?.setColorAt(i, c[ph.car]);
      walk.current?.setColorAt(i, ph.walk ? c.walk : c.stop);
    });
    if (car.current?.instanceColor) car.current.instanceColor.needsUpdate = true;
    if (walk.current?.instanceColor) walk.current.instanceColor.needsUpdate = true;
  });
  if (!poles.length) return null;
  return (
    <group>
      <Boxes items={items.posts} size={[0.03, 0.6, 0.03]} color="#3d4249" cast={false} />
      <Boxes items={items.heads} size={[0.05, 0.15, 0.05]} color="#1b1d21" cast={false} />
      <Boxes items={items.peds} size={[0.045, 0.06, 0.045]} color="#1b1d21" cast={false} />
      <instancedMesh ref={car} args={[undefined, undefined, poles.length]} key={`c${poles.length}`}>
        <sphereGeometry args={[0.018, 8, 6]} /><meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={walk} args={[undefined, undefined, poles.length]} key={`w${poles.length}`}>
        <sphereGeometry args={[0.014, 8, 6]} /><meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/**
 * Fans walking from among the cars to the gates. They keep to their side of
 * the path, wait at the curb until the walk sign, hurry across, and fade into
 * the gate (or out from between the cars). More of them the bigger the crowd.
 */
function Walkers({ routes, fill, colors, detail }: { routes: Route[]; fill: number; colors: string[]; detail: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const walkers = useMemo(() => {
    const r = rng(12);
    const out: { route: number; s: number; speed: number; side: number; wait: number; c: string; age: number }[] = [];
    const per = Math.max(1, Math.round((2 + fill * 7) * detail));
    routes.forEach((rt, i) => {
      const curb = rt.holds[0]?.s ?? rt.length;
      for (let k = 0; k < per; k++) {
        // Anywhere but out on the road.
        const s = r() < 0.7 ? r() * curb : curb + 1.8 + r() * Math.max(0, rt.length - curb - 1.8);
        out.push({ route: i, s, speed: 0.26 + r() * 0.1, side: (r() - 0.5) * 0.3, wait: 0.03 + r() * 0.22, c: colors[Math.floor(r() * colors.length)], age: 1 });
      }
    });
    return out;
  }, [routes, fill, colors, detail]);
  const dummy = useMemo(() => new Object3D(), []);
  useEffect(() => {
    const m = mesh.current; if (!m) return;
    walkers.forEach((w, i) => m.setColorAt(i, new Color(w.c)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [walkers]);
  useFrame(({ clock }, delta) => {
    const m = mesh.current; if (!m) return;
    const dt = Math.min(delta, 0.05), time = clock.elapsedTime;
    walkers.forEach((w, i) => {
      const rt = routes[w.route], hold = rt.holds[0];
      let v = w.speed;
      if (hold) {
        const toCurb = hold.s - w.wait - w.s;
        const walkOn = signalPhase(time, hold.signal ?? 0).walk;
        if (toCurb > -w.wait && toCurb >= -0.01 && !walkOn) v = Math.min(v, Math.max(0, toCurb) * 3); // wait at the curb
        else if (w.s >= hold.s - w.wait && w.s < hold.s + 1.6) v = Math.max(w.speed * 1.6, 0.55); // hurry over
      }
      w.s += v * dt; w.age += dt;
      if (w.s >= rt.length) { w.s = 0; w.age = 0; }
      const [x, z, dx, dz] = pointAt(rt, w.s);
      // Out from between the cars, in through the gate.
      const grow = Math.min(1, w.age / 0.5, Math.max(0, (rt.length - w.s) / 0.3));
      const step = v > 0.01 ? Math.abs(Math.sin(time * 9 + i)) * 0.012 : 0;
      dummy.position.set(x - dz * w.side, 0.1 + step, z + dx * w.side);
      dummy.scale.setScalar(Math.max(0.001, grow));
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  if (!walkers.length) return null;
  return <instancedMesh ref={mesh} args={[undefined, undefined, walkers.length]} key={walkers.length}><capsuleGeometry args={[0.032, 0.09, 3, 6]} /><meshStandardMaterial roughness={0.8} /></instancedMesh>;
}

/**
 * Traffic that keeps the rules: each car holds its lane, keeps a safe gap to
 * the one ahead, slows for the bends, comes to a full stop at the stop signs,
 * and stops at the line when its crosswalk signal turns (going through an amber
 * it couldn't stop for). Brake lights come on as it slows; headlights after dark.
 */
function Traffic({ routes, night, detail }: { routes: Route[]; night: number; detail: number }) {
  const body = useRef<InstancedMesh>(null), cabin = useRef<InstancedMesh>(null), head = useRef<InstancedMesh>(null), tail = useRef<InstancedMesh>(null);
  const ACCEL = 0.9, BRAKE = 1.6, GAP = 0.7;
  const fleet = useMemo(() => {
    const r = rng(33);
    const cars: { route: number; s: number; v: number; on: boolean; next: number; waited: number; braking: boolean; c: string; size: number }[] = [];
    const lanes = routes.map((rt, ri) => {
      const n = Math.max(2, Math.floor((rt.length / (rt.loop ? 8 : 11)) * Math.max(0.5, detail)));
      const ids: number[] = [];
      for (let k = 0; k < n; k++) {
        // Spread out, the first car furthest along.
        const s = rt.length * (1 - (k + 0.3 + r() * 0.4) / n) * (rt.loop ? 1 : 0.97);
        ids.push(cars.length);
        cars.push({ route: ri, s, v: 0.5, on: true, next: 0, waited: 0, braking: false, c: CAR_COLORS[Math.floor(r() * CAR_COLORS.length)], size: r() < 0.75 ? 0 : 1 });
      }
      return ids;
    });
    for (const c of cars) { const h = routes[c.route].holds; c.next = h.findIndex(x => x.s >= c.s); if (c.next < 0) c.next = h.length; }
    return { cars, lanes };
  }, [routes, detail]);
  const dummy = useMemo(() => new Object3D(), []);
  const lamp = useMemo(() => ({ brake: new Color('#ff2a1f'), off: new Color('#4a0d0d'), dusk: new Color('#a3140f') }), []);
  useEffect(() => {
    const m = body.current; if (!m) return;
    fleet.cars.forEach((c, i) => m.setColorAt(i, new Color(c.c)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [fleet]);
  useFrame(({ clock }, delta) => {
    if (!body.current || !cabin.current || !head.current || !tail.current) return;
    const dt = Math.min(delta, 0.05), time = clock.elapsedTime, { cars, lanes } = fleet;
    lanes.forEach((ids, ri) => {
      const rt = routes[ri], L = rt.length;
      // Leaders first; a car that drove off the end waits its turn to come back on.
      ids.sort((a, b) => (cars[b].on ? cars[b].s : -1e9) - (cars[a].on ? cars[a].s : -1e9));
      ids.forEach((id, k) => {
        const c = cars[id];
        if (!c.on) {
          const last = ids.filter(j => cars[j].on).map(j => cars[j].s);
          if (!last.length || Math.min(...last) > GAP + 0.6) { c.on = true; c.s = 0; c.v = rt.vmax[0]; c.next = 0; c.waited = 0; }
          return;
        }
        let target = rt.vmax[Math.min(rt.pts.length - 1, Math.floor((c.s % L) / STEP))];
        // Keep a safe gap to the car ahead.
        const ahead = rt.loop ? cars[ids[(k + ids.length - 1) % ids.length]] : k > 0 ? cars[ids[k - 1]] : null;
        if (ahead && ahead !== c && ahead.on) {
          const gap = rt.loop ? (((ahead.s - c.s) % L) + L) % L - GAP : ahead.s - c.s - GAP;
          target = Math.min(target, Math.sqrt(2 * BRAKE * Math.max(0, gap - 0.05)), Math.max(0, gap) < 0.3 ? ahead.v : Infinity);
        }
        // The next stop line.
        const h = rt.holds[c.next];
        if (h) {
          const to = h.s - c.s;
          let stop = false;
          if (h.kind === 'stop') {
            stop = true;
            if (to < 0.04 && c.v < 0.03) { c.waited += dt; if (c.waited > 0.9) { stop = false; c.next++; c.waited = 0; } }
          } else {
            const ph = signalPhase(time, h.signal ?? 0).car;
            stop = ph === 'red' || (ph === 'amber' && to > (c.v * c.v) / (2 * BRAKE) + 0.05);
          }
          if (stop && to > -0.02) target = Math.min(target, Math.sqrt(2 * BRAKE * Math.max(0, to)));
          if (to < -0.02) { c.next++; c.waited = 0; }
        }
        const was = c.v;
        c.v = Math.min(target, c.v + ACCEL * dt);
        c.braking = c.v < was - 0.002 || c.v < 0.03;
        c.s += c.v * dt;
        if (rt.loop) { if (c.s >= L) { c.s -= L; c.next = 0; } }
        else if (c.s >= L) c.on = false;
      });
    });
    const tailColor = night > 0.3 ? lamp.dusk : lamp.off;
    cars.forEach((c, i) => {
      const [x, z, dx, dz] = pointAt(routes[c.route], c.s);
      const ry = -Math.atan2(dz, dx), size = c.on ? (c.size ? 1.1 : 1) : 0.0001;
      const put = (m: InstancedMesh, ox: number, y: number) => {
        dummy.position.set(x + dx * ox * size, y * size + Y.road, z + dz * ox * size); dummy.rotation.set(0, ry, 0); dummy.scale.setScalar(size); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      };
      put(body.current!, 0, 0.06); put(cabin.current!, -0.03, 0.14); put(head.current!, 0.25, 0.07); put(tail.current!, -0.25, 0.07);
      tail.current!.setColorAt(i, c.braking ? lamp.brake : tailColor);
    });
    for (const m of [body.current, cabin.current, head.current, tail.current]) m.instanceMatrix.needsUpdate = true;
    if (tail.current.instanceColor) tail.current.instanceColor.needsUpdate = true;
  });
  const n = fleet.cars.length;
  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, n]}><boxGeometry args={[0.5, 0.1, 0.24]} /><meshStandardMaterial roughness={0.6} /></instancedMesh>
      <instancedMesh ref={cabin} args={[undefined, undefined, n]}><boxGeometry args={[0.26, 0.08, 0.2]} /><meshStandardMaterial color="#1d2733" /></instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, n]}><boxGeometry args={[0.02, 0.035, 0.2]} /><meshStandardMaterial color="#f6f1df" emissive="#fff4d6" emissiveIntensity={night * 3} /></instancedMesh>
      <instancedMesh ref={tail} args={[undefined, undefined, n]}><boxGeometry args={[0.02, 0.03, 0.2]} /><meshBasicMaterial toneMapped={false} /></instancedMesh>
    </group>
  );
}

// ── Extras ──────────────────────────────────────────────────────────────────

function Statue({ at, team }: { at: { x: number; z: number; ry?: number }; team: string }) {
  const bronze = <meshStandardMaterial color="#8c6a3a" metalness={0.35} roughness={0.45} />;
  return (
    <group position={[at.x, 0, at.z]} rotation-y={at.ry ?? 0}>
      <mesh position={[0, 0.16, 0]} castShadow><boxGeometry args={[0.42, 0.32, 0.42]} /><meshStandardMaterial color="#d6d0c4" /></mesh>
      <mesh position={[0, 0.2, 0.213]}><planeGeometry args={[0.3, 0.12]} /><meshStandardMaterial color={team} /></mesh>
      {/* A player mid stiff-arm, ball tucked. */}
      <mesh position={[0, 0.5, 0]} rotation-z={0.15} castShadow><capsuleGeometry args={[0.07, 0.26, 4, 8]} />{bronze}</mesh>
      <mesh position={[0.02, 0.72, 0]}><sphereGeometry args={[0.07, 12, 10]} />{bronze}</mesh>
      <mesh position={[-0.13, 0.62, 0]} rotation-z={1.2}><capsuleGeometry args={[0.025, 0.2, 4, 6]} />{bronze}</mesh>
      <mesh position={[0.09, 0.5, 0.04]} rotation-x={0.6}><sphereGeometry args={[0.05, 10, 8]} />{bronze}</mesh>
      {[-1, 1].map(s => <mesh key={s} position={[s * 0.05, 0.35, s * 0.05]} rotation-x={s * 0.4}><capsuleGeometry args={[0.03, 0.18, 4, 6]} />{bronze}</mesh>)}
    </group>
  );
}

function Fountain({ at }: { at: { x: number; z: number } }) {
  const jets = useRef<Group>(null);
  useFrame(({ clock }) => {
    jets.current?.children.forEach((c, i) => { c.scale.y = 0.75 + Math.sin(clock.elapsedTime * 3 + i * 1.7) * 0.25; });
  });
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.46, 0.5, 0.1, 28]} /><meshStandardMaterial color="#d6d0c4" /></mesh>
      <mesh position={[0, 0.101, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.42, 28]} /><meshStandardMaterial color="#4f8fb8" roughness={0.1} metalness={0.2} /></mesh>
      <group ref={jets}>
        {[0, 1, 2, 3, 4].map(i => {
          const a = (i / 5) * Math.PI * 2, d = i === 0 ? 0 : 0.22;
          return <mesh key={i} position={[Math.cos(a) * d, 0.1, Math.sin(a) * d]}><coneGeometry args={[0.03, i === 0 ? 0.5 : 0.28, 8]} /><meshStandardMaterial color="#cfe8f5" transparent opacity={0.75} /></mesh>;
        })}
      </group>
    </group>
  );
}

function FoodTrucks({ trucks, team, accent }: { trucks: { x: number; z: number; ry?: number }[]; team: string; accent: string }) {
  const parts = useMemo(() => {
    const bodies = ['#f4f1e8', '#e8a23a', '#3a8fc4', '#c0392b', '#2fa36b', '#f4f1e8'];
    const out = { box: [] as Matrix4[], boxColor: [] as string[], cab: [] as Matrix4[], window: [] as Matrix4[], awning: [] as Matrix4[], awningColor: [] as string[] };
    trucks.forEach((t, i) => {
      const g = mat(null, [t.x, 0, t.z], [0, t.ry ?? 0, 0]);
      out.box.push(mat(g, [0, 0.17, 0])); out.boxColor.push(bodies[i % bodies.length]);
      out.cab.push(mat(g, [0.24, 0.12, 0]));
      out.window.push(mat(g, [-0.08, 0.2, 0.162]));
      out.awning.push(mat(g, [-0.08, 0.3, 0.22], [0.5, 0, 0])); out.awningColor.push(i % 2 ? team : accent);
    });
    return out;
  }, [trucks, team, accent]);
  return (
    <group>
      <Placed matrices={parts.box} colors={parts.boxColor} cast><boxGeometry args={[0.72, 0.3, 0.32]} /><meshStandardMaterial /></Placed>
      <Placed matrices={parts.cab}><boxGeometry args={[0.22, 0.2, 0.3]} /><meshStandardMaterial color="#2c3e50" /></Placed>
      <Placed matrices={parts.window}><planeGeometry args={[0.36, 0.12]} /><meshStandardMaterial color="#1b1d21" emissive="#ffd27a" emissiveIntensity={0.4} /></Placed>
      <Placed matrices={parts.awning} colors={parts.awningColor}><boxGeometry args={[0.42, 0.01, 0.14]} /><meshStandardMaterial /></Placed>
    </group>
  );
}

function FerrisWheel({ at, team, accent, night }: { at: { x: number; z: number; ry?: number }; team: string; accent: string; night: number }) {
  const wheel = useRef<Group>(null);
  useFrame((_, dt) => { if (wheel.current) wheel.current.rotation.z += dt * 0.12; });
  const R = 1.8, n = 14;
  const parts = useMemo(() => {
    const legs: Matrix4[] = [], spokes: Matrix4[] = [], cars: Matrix4[] = [], carColors: string[] = [];
    for (const s of [-1, 1]) for (const lean of [-1, 1]) legs.push(mat(null, [lean * 0.55, 1.05, s * 0.32], [0, 0, lean * 0.5]));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      spokes.push(mat(null, [Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0], [0, 0, a]));
      cars.push(mat(null, [Math.cos(a) * R, Math.sin(a) * R - 0.12, 0])); carColors.push(i % 2 ? team : accent);
    }
    return { legs, spokes, cars, carColors };
  }, [team, accent]);
  return (
    <group position={[at.x, 0, at.z]} rotation-y={at.ry ?? 0}>
      <Placed matrices={parts.legs}><boxGeometry args={[0.06, 2.3, 0.06]} /><meshStandardMaterial color="#e8ecef" roughness={0.5} /></Placed>
      <group ref={wheel} position={[0, 2.05, 0]}>
        {[-0.18, 0.18].map(z => <mesh key={z} position={[0, 0, z]}><torusGeometry args={[R, 0.03, 8, 48]} /><meshStandardMaterial color="#f4f4f2" emissive={team} emissiveIntensity={night * 1.6} /></mesh>)}
        <Placed matrices={parts.spokes}><boxGeometry args={[R, 0.02, 0.02]} /><meshStandardMaterial color="#e8ecef" roughness={0.5} /></Placed>
        <Placed matrices={parts.cars} colors={parts.carColors}><boxGeometry args={[0.2, 0.16, 0.3]} /><meshStandardMaterial /></Placed>
      </group>
    </group>
  );
}

// ── The horizon ─────────────────────────────────────────────────────────────

/** The sky's colors, as the stadium's clock has them. */
export interface SkyTone { horizon: string; zenith: string; sun: [number, number, number]; glow: string; night: number }

/**
 * The sky: the haze color at the horizon (so the land, fading into the haze,
 * meets it without a seam) deepening overhead, warm around the sun. It rides
 * with the camera, always out past everything.
 */
function SkyDome({ tone }: { tone: SkyTone }) {
  const dome = useRef<Mesh>(null);
  const material = useMemo(() => new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { uHorizon: { value: new Color() }, uZenith: { value: new Color() }, uGlow: { value: new Color() }, uSun: { value: new Vector3(0, 1, 0) } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // Colors arrive already in the screen's color space, exactly as the fog's are.
    fragmentShader: `varying vec3 vDir; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uGlow; uniform vec3 uSun;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.6, d.y), 0.75));
        float sun = max(0.0, dot(d, normalize(uSun)));
        col += uGlow * pow(sun, 6.0) * (1.0 - smoothstep(0.0, 0.45, d.y)) * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }), []);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const u = material.uniforms;
    u.uHorizon.value.set(tone.horizon).convertLinearToSRGB();
    u.uZenith.value.set(tone.zenith).convertLinearToSRGB();
    u.uGlow.value.set(tone.glow).convertLinearToSRGB().multiplyScalar(1 - tone.night);
    u.uSun.value.set(...tone.sun);
  }, [material, tone.horizon, tone.zenith, tone.glow, tone.night, tone.sun]);
  useFrame(({ camera }) => dome.current?.position.copy(camera.position));
  return <mesh ref={dome} material={material} renderOrder={-1} frustumCulled={false}><sphereGeometry args={[300, 32, 16]} /></mesh>;
}

/** Far-off pieces of the horizon in the height haze (campusLook.hazeMaterial). */
function Backdrop({ items, haze, top, children }: { items: Item[]; haze: string; top: number; children: React.ReactNode }) {
  const h = useMemo(() => hazeMaterial(top), [top]);
  useEffect(() => () => h.material.dispose(), [h]);
  useEffect(() => { h.uniforms.uHaze.value.set(haze).convertLinearToSRGB(); }, [h, haze]);
  const mesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current; if (!m) return;
    const d = new Object3D();
    items.forEach((it, i) => {
      d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.ry ?? 0, 0); d.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1); d.updateMatrix();
      m.setMatrixAt(i, d.matrix); m.setColorAt(i, new Color(it.c ?? '#888888'));
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={mesh} args={[undefined, h.material, items.length]} key={items.length} frustumCulled={false}>{children}</instancedMesh>;
}

/** Angles round the horizon, but not straight down an avenue. */
function around(n: number, r: () => number, from = 0, span = Math.PI * 2) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = from + ((i + 0.2 + r() * 0.6) / n) * span;
    if ([0, 0.5, 1, 1.5, 2].some(k => Math.abs(a - k * Math.PI) < 0.09 || Math.abs(a + Math.PI * 2 - k * Math.PI) < 0.09)) continue;
    out.push(a);
  }
  return out;
}

/** A city on the horizon all round, its windows coming on at dusk. */
function Skyline({ night }: { night: number }) {
  const items = useMemo(() => {
    const r = rng(5);
    return around(110, r).map(a => {
      const d = 60 + r() * 22, h = 3 + r() * r() * 20 + (d < 66 ? 0 : 4);
      return { x: Math.cos(a) * d * 1.1, y: h / 2, z: Math.sin(a) * d, sy: h, sx: 2.2 + r() * 3, sz: 2 + r() * 2, ry: -a, c: mix('#6b7684', '#97a2ae', r()) };
    });
  }, []);
  const lit = useMemo(() => windowMaterial({ cols: 1.4, rows: 1.6, lit: 0.5 }), []);
  useEffect(() => () => lit.material.dispose(), [lit]);
  useFrame(() => { lit.uniforms.uNight.value = night; });
  const mesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current; if (!m) return;
    const d = new Object3D();
    items.forEach((b, i) => { d.position.set(b.x, b.y, b.z); d.rotation.set(0, b.ry, 0); d.scale.set(b.sx, b.sy, b.sz); d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, new Color(b.c)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={mesh} args={[undefined, lit.material, items.length]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} /></instancedMesh>;
}

/** Ranges of peaks far off, snow on the tallest, and darker wooded foothills in front of them. */
function Mountains({ haze }: { haze: string }) {
  const { peaks, caps, foothills } = useMemo(() => {
    const r = rng(19);
    const peaks: Item[] = [], caps: Item[] = [], foothills: Item[] = [];
    // Broad ranges, wider than they are tall, overlapping into ridgelines.
    for (const a of around(40, r)) {
      const d = 112 + r() * 24, h = 11 + r() * 11, w = h * (2.1 + r() * 0.9), x = Math.cos(a) * d * 1.1, z = Math.sin(a) * d, ry = r() * Math.PI;
      peaks.push({ x, y: h / 2, z, sx: w, sy: h, sz: w * 0.7, ry, c: mix('#5d6e80', '#7b899c', r()) });
      // Proud of the slope, so the snow and the rock don't fight over the same pixels.
      if (h > 16) { const cap = h * 0.3; caps.push({ x, y: h - cap / 2 + h * 0.012, z, sx: w * 0.3 * 1.08, sy: cap, sz: w * 0.7 * 0.3 * 1.08, ry, c: '#f2f5f7' }); }
    }
    // Rounded, wooded foothills in front.
    for (const a of around(28, r)) {
      const d = 80 + r() * 14, w = 20 + r() * 18;
      foothills.push({ x: Math.cos(a) * d * 1.1, y: 0, z: Math.sin(a) * d, sx: w, sy: 2.5 + r() * 3, sz: w * 0.45, ry: -a, c: mix('#3b5b42', '#56744f', r()) });
    }
    return { peaks, caps, foothills };
  }, []);
  return (
    <group>
      <Backdrop items={peaks} haze={haze} top={24}><coneGeometry args={[0.5, 1, 6]} /></Backdrop>
      <Backdrop items={caps} haze={haze} top={24}><coneGeometry args={[0.5, 1, 6]} /></Backdrop>
      <Backdrop items={foothills} haze={haze} top={30}><sphereGeometry args={[1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></Backdrop>
    </group>
  );
}

/** The desert's horizon: sand dunes all round, and pyramids rising out of them. */
function Pyramids({ haze }: { haze: string }) {
  const { pyramids, dunes } = useMemo(() => {
    const r = rng(29);
    const pyramids: Item[] = [];
    // A great pyramid with two smaller ones stepped off its corner (behind the stadium from where the
    // camera starts), and a smaller pair the other way.
    const group = (a: number, d: number, scale: number, n: number) => {
      const cx = Math.cos(a) * d * 1.1, cz = Math.sin(a) * d;
      const tx = -Math.sin(a), tz = Math.cos(a); // across the line of sight
      const sizes = [1, 0.72, 0.42].slice(0, n);
      sizes.forEach((s, k) => {
        const w = 15 * scale * s, off = [0, 1.15, 2][k] * 15 * scale, back = [0, 0.35, 0.6][k] * 15 * scale;
        pyramids.push({ x: cx + tx * off + Math.cos(a) * back, y: (w * 0.64) / 2, z: cz + tz * off + Math.sin(a) * back, sx: w, sy: w * 0.64, sz: w, ry: Math.PI / 4 - a, c: mix('#d8b77a', '#e6c992', r()) });
      });
    };
    group(Math.PI * 1.25, 70, 1.5, 3);
    group(Math.PI * 0.32, 76, 1, 2);
    const dunes = around(36, r).map(a => {
      const d = 58 + r() * 34, w = 14 + r() * 20;
      return { x: Math.cos(a) * d * 1.1, y: 0, z: Math.sin(a) * d, sx: w, sy: 0.7 + r() * 1.1, sz: w * (0.22 + r() * 0.18), ry: -a + (r() - 0.5) * 0.6, c: mix('#d6b480', '#e5c899', r()) };
    });
    return { pyramids, dunes };
  }, []);
  return (
    <group>
      {/* Even haze top to bottom, so they stand on the sand instead of floating over it. */}
      <Backdrop items={pyramids} haze={haze} top={60}><coneGeometry args={[Math.SQRT1_2, 1, 4]} /></Backdrop>
      <Backdrop items={dunes} haze={haze} top={60}><sphereGeometry args={[1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></Backdrop>
    </group>
  );
}

/** Rolling hills round the horizon (on the waterfront, only on the landward side). */
function Hills({ haze, landward = false }: { haze: string; landward?: boolean }) {
  const hills = useMemo(() => {
    const r = rng(31);
    return around(30, r, landward ? -0.15 : 0, landward ? Math.PI + 0.3 : Math.PI * 2).map(a => {
      const d = 78 + r() * 22, w = 22 + r() * 20;
      return { x: Math.cos(a) * d * 1.1, y: 0, z: Math.sin(a) * d, sx: w, sy: 2.4 + r() * 3, sz: w * 0.45, ry: -a, c: mix('#4d7a3f', '#6d9a52', r()) };
    });
  }, [landward]);
  return <Backdrop items={hills} haze={haze} top={30}><sphereGeometry args={[1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></Backdrop>;
}

/** The bay: water past the north lots, a beach, boats, and across it wooded headlands with a lighthouse. */
function Bay({ shore, night, haze }: { shore: number; night: number; haze: string }) {
  const hulls = useRef<InstancedMesh>(null), cabins = useRef<InstancedMesh>(null), sails = useRef<InstancedMesh>(null), beam = useRef<Group>(null);
  const { fleet, heads, light } = useMemo(() => {
    const r = rng(53);
    const fleet = Array.from({ length: 12 }, () => ({ x: (r() - 0.5) * 60, z: shore - 4 - r() * 24, ry: r() * Math.PI, s: 0.7 + r() * 0.8 }));
    const heads: Item[] = [];
    for (let i = 0; i < 9; i++) {
      const x = -90 + i * 22 + (r() - 0.5) * 10, w = 24 + r() * 22;
      heads.push({ x, y: 0, z: shore - 46 - r() * 18, sx: w, sy: 3 + r() * 5, sz: 7 + r() * 7, c: mix('#3d5f45', '#577a55', r()) });
    }
    // The lighthouse, on the point nearest across the water.
    const point = heads.reduce((b, h) => (Math.abs(h.x) < Math.abs(b.x) + 6 && h.z > b.z ? h : b));
    return { fleet, heads, light: { x: point.x + 4, z: point.z + point.sz! * 0.55 } };
  }, [shore]);
  useFrame(({ clock }, dt) => {
    if (hulls.current && cabins.current && sails.current) {
      fleet.forEach((b, i) => {
        // Each boat bobbing on its own swell.
        const g = mat(null, [b.x, 0.05 + Math.sin(clock.elapsedTime * 1.3 + i) * 0.03, b.z], [0, b.ry, 0], [b.s, b.s, b.s]);
        hulls.current!.setMatrixAt(i, g); cabins.current!.setMatrixAt(i, mat(g, [-0.1, 0.14, 0]));
        if (i % 2 === 0) sails.current!.setMatrixAt(i / 2, mat(g, [0.15, 0.45, 0]));
      });
      for (const m of [hulls.current, cabins.current, sails.current]) m.instanceMatrix.needsUpdate = true;
    }
    if (beam.current) beam.current.rotation.y += dt * 0.9;
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, shore - 150]}><planeGeometry args={[600, 300]} /><meshStandardMaterial color={mix('#3f7fa6', '#14243a', night)} roughness={0.12} metalness={0.25} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.016, shore + 0.35]}><planeGeometry args={[600, 0.9]} /><meshStandardMaterial color="#e3d3a6" /></mesh>
      <instancedMesh ref={hulls} args={[undefined, undefined, fleet.length]} frustumCulled={false}><boxGeometry args={[0.9, 0.14, 0.3]} /><meshStandardMaterial color="#f4f4f2" /></instancedMesh>
      <instancedMesh ref={cabins} args={[undefined, undefined, fleet.length]} frustumCulled={false}><boxGeometry args={[0.35, 0.14, 0.22]} /><meshStandardMaterial color="#d9dee3" emissive="#ffd79a" emissiveIntensity={night * 0.8} /></instancedMesh>
      <instancedMesh ref={sails} args={[undefined, undefined, Math.ceil(fleet.length / 2)]} frustumCulled={false}><coneGeometry args={[0.18, 0.6, 3]} /><meshStandardMaterial color="#fafafa" /></instancedMesh>
      <Backdrop items={heads} haze={haze} top={7}><sphereGeometry args={[1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></Backdrop>
      <group position={[light.x, 0, light.z]} scale={2.2}>
        <mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.16, 0.24, 1.8, 14]} /><meshStandardMaterial color="#f4f1ea" /></mesh>
        {[0.5, 1.3].map(y => <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[0.215, 0.225, 0.22, 14]} /><meshStandardMaterial color="#b8322a" /></mesh>)}
        <mesh position={[0, 1.95, 0]}><cylinderGeometry args={[0.13, 0.13, 0.2, 10]} /><meshStandardMaterial color="#fff6d8" emissive="#ffe6a0" emissiveIntensity={0.3 + night * 2.5} /></mesh>
        <mesh position={[0, 2.12, 0]}><coneGeometry args={[0.17, 0.16, 10]} /><meshStandardMaterial color="#2d3238" /></mesh>
        {night > 0.3 && (
          <group ref={beam} position={[0, 1.95, 0]}>
            <mesh position={[3, 0, 0]} rotation-z={Math.PI / 2}><coneGeometry args={[0.6, 6, 12, 1, true]} /><meshBasicMaterial color="#fff2c4" transparent opacity={0.12 * night} depthWrite={false} side={DoubleSide} /></mesh>
          </group>
        )}
      </group>
    </group>
  );
}

function Garage({ at }: { at: { x: number; z: number } }) {
  const { decks, columns } = useMemo(() => ({
    decks: [0, 1, 2].map(l => ({ x: at.x, y: 0.25 + l * 0.45, z: at.z })),
    columns: [0, 1, 2].flatMap(l => [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]].map(([x, z]) => ({ x: at.x + x, y: l * 0.45 + 0.02, z: at.z + z }))),
  }), [at]);
  return (
    <group>
      <Boxes items={decks} size={[3.2, 0.08, 2.2]} color="#a7abb0" />
      <Boxes items={columns} size={[0.1, 0.45, 0.1]} color="#8f9398" cast={false} />
    </group>
  );
}

function Transit({ z }: { z: number }) {
  return (
    <group>
      <mesh position={[0, 0.05, z]}><boxGeometry args={[300, 0.06, 0.5]} /><meshStandardMaterial color="#6d6d6d" /></mesh>
      {[-0.12, 0.12].map(off => <mesh key={off} position={[0, 0.1, z + off]}><boxGeometry args={[300, 0.03, 0.04]} /><meshStandardMaterial color="#b9b9b9" metalness={0.5} /></mesh>)}
      <mesh position={[2.4, 0.4, z - 0.6]} castShadow><boxGeometry args={[3, 0.6, 0.6]} /><meshStandardMaterial color="#e8e8e8" /></mesh>
      <mesh position={[2.4, 0.75, z - 0.6]}><boxGeometry args={[3.3, 0.06, 0.9]} /><meshStandardMaterial color="#c0392b" /></mesh>
    </group>
  );
}

// ── The grounds ─────────────────────────────────────────────────────────────

export function Grounds({ o, footprint, parking, fill, night, sky, look, team, accent, crowd, detail = 1 }: {
  o: Outline; footprint: number; parking: number; fill: number; night: number;
  /** How much of the scattered and moving detail to draw, for the device (see quality). */
  detail?: number;
  /** The sky: its horizon is the haze the far land fades into. */
  sky: SkyTone;
  look: StadiumLook; team: string; accent: string;
  /** The fans' shirt colors, the same as the crowd's in the stands. */
  crowd: string[];
}) {
  const plan = useMemo(() => campusPlan({ outline: o, footprint, parking, fill, look }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [o, footprint, parking, fill, look.setting, look.district, look.tailgate, look.plaza, look.features.join()]);
  const ground = GROUND[look.setting];
  const haze = sky.horizon;
  const grassTex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const t = groundTexture(ground.grass, look.setting);
    t.repeat.set(48, 48); // over the whole ground, out to where the haze takes it
    return t;
  }, [ground.grass, look.setting]);
  const plazaTex = useMemo(() => (typeof document === 'undefined' ? null : plazaTexture(look.plaza, ground.plaza)), [look.plaza, ground.plaza]);
  useEffect(() => () => { grassTex?.dispose(); plazaTex?.dispose(); }, [grassTex, plazaTex]);
  const has = (f: StadiumLook['features'][number]) => look.features.includes(f);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[240, 96]} /><meshStandardMaterial map={grassTex} color="#ffffff" roughness={1} /></mesh>
      <Ribbon o={o} profile={() => [[0, Y.plaza], [plan.plaza, Y.plaza]]} k={`plaza${plan.plaza}${look.plaza}`} opts={{ planarUV: 1.2 }}>
        <meshStandardMaterial map={plazaTex} color="#ffffff" roughness={0.9} />
      </Ribbon>
      <Lawns plan={plan} grass={ground.grass} />
      <Roads o={o} plan={plan} setting={look.setting} />
      <Lots plan={plan} />
      {look.tailgate !== 'off' && <Tailgates plan={plan} team={team} accent={accent} night={night} />}
      {look.tailgate === 'rowdy' && <Overflow plan={plan} team={team} night={night} />}
      {plan.garage && <Rise key="garage"><Garage at={plan.garage} /></Rise>}
      {plan.rail !== null && <Rise key="transit"><Transit z={plan.rail} /></Rise>}
      <Buildings plan={plan} night={night} setting={look.setting} />
      {look.district === 'countryside' && <Farms plan={plan} team={team} accent={accent} setting={look.setting} />}
      <Greenery plan={plan} setting={look.setting} detail={detail} />
      <Streetlights plan={plan} night={night} banners={has('banners')} team={team} accent={accent} />
      <Walkers routes={plan.fans} fill={fill} colors={crowd} detail={detail} />
      <Traffic routes={plan.traffic} night={night} detail={detail} />
      <Signals plan={plan} />
      {plan.statue && <Statue at={plan.statue} team={team} />}
      {plan.fountain && <Fountain at={plan.fountain} />}
      {plan.trucks.length > 0 && <FoodTrucks trucks={plan.trucks} team={team} accent={accent} />}
      {plan.ferris && <FerrisWheel at={plan.ferris} team={team} accent={accent} night={night} />}
      <SkyDome tone={sky} />
      {plan.shore !== null && <Bay shore={plan.shore} night={night} haze={haze} />}
      {look.setting === 'city' && <Skyline night={night} />}
      {look.setting === 'park' && <Hills haze={haze} />}
      {look.setting === 'waterfront' && <Hills haze={haze} landward />}
      {look.setting === 'mountains' && <Mountains haze={haze} />}
      {look.setting === 'desert' && <Pyramids haze={haze} />}
    </group>
  );
}

export { OVAL };
