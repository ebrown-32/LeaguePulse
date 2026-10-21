'use client';

/**
 * The plaza around the stadium and what stands on it, laid out by lib/franchise/plazaPlan (the same
 * for every style), built so each piece reads as what it is from the air:
 *
 *   Paving       lines inlaid along the promenades, a lighter apron at each gate, and the team's
 *                medallion in front of the main one
 *   Concessions  stands with a counter and a striped awning in the stadium's colors, gathered into
 *                food courts between the gates, six more a level
 *   Restrooms    inside the stadium, under the back of the stands (on the plaza only where a style
 *                has no room under its seats): blocks with no roof of their own, so a preview's
 *                cutaway (Stadium3D's FocusRig) shows them from above. A trough along one wall, the
 *                classic stadium urinal, getting better with each level: galvanized steel on concrete
 *                to start; more blocks and stalls; then stainless on white tile with a light bar; then,
 *                spa-grade, a gold trough full of ice on marble, with a plant in the corner.
 *   The store    beside the west gate, running along the plaza, a bigger building each level
 *   Furniture    benches, plaza lamps (with banners when the manager wants them), planters with trees
 *                or shrubs, and two flags at every gate
 *   The crowd    fans walking the promenades at a walking pace, queueing at the stands, gathered
 *                round the statue and the fountain (PlazaCrowd)
 *
 * And where to look at each upgrade (focusShot), for the camera when one is previewed.
 * Everything repeated is drawn with Placed: one draw call a part, however many there are.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, Object3D, type InstancedMesh, type Matrix4 } from 'three';
import type { Facilities, TrackId } from '@/lib/tycoon/catalog';
import type { StadiumLook } from '@/lib/franchise/model';
import { outerOf, TAU, type Blueprint } from '@/lib/franchise/stadiumBlueprint';
import { along as alongLane, PLAZA, plazaPlan, plazaSpot, promenade, type PlazaPlan } from '@/lib/franchise/plazaPlan';
import { mat, mix, Placed, Ribbon } from './stadiumParts';

export interface Spot { x: number; z: number; ry: number; nx: number; nz: number }

/** Headroom a restroom block needs under the seats. */
const HEADROOM = 0.3;

/**
 * Under the back of a stand at angle a, if there's room: just inside its outer edge, where the
 * seats above are high enough to stand under. Null where there isn't (a bowl sunk in a berm, a
 * shallow deck).
 */
function underStand(bp: Blueprint, a: number): Spot | null {
  if (bp.berm) return null;
  const st = bp.stands.find(s => (s.to - s.from >= TAU - 1e-6) || (a >= s.from + 0.12 && a <= s.to - 0.12));
  if (!st) return null;
  const decks = st.decks(a);
  if (!decks.length) return null;
  const r = outerOf(decks) - 0.35, near = r - D / 2;
  // Every deck over the block clears it.
  for (const d of decks) {
    if (near > d.inner + d.depth || r + D / 2 < d.inner) continue;
    const x = Math.max(d.inner, near);
    if (d.base + d.height * ((x - d.inner) / Math.max(1e-6, d.depth)) < HEADROOM) return null;
  }
  return plazaSpot(bp.outline, 0, a, r);
}

/** Angles spread evenly along the stands' sweeps, wherever the stands are. */
function alongStands(bp: Blueprint, n: number): number[] {
  const sweeps = bp.stands.map(s => [s.from, Math.min(s.to, s.from + TAU)] as const);
  const total = sweeps.reduce((t, [f, to]) => t + (to - f), 0);
  if (!n || total <= 0) return [];
  return Array.from({ length: n }, (_, i) => {
    let at = ((i + 0.5) / n) * total + 0.6;
    at %= total;
    for (const [f, to] of sweeps) { if (at <= to - f) return f + at; at -= to - f; }
    return sweeps[0][0];
  });
}

export interface PlazaLayout {
  plan: PlazaPlan;
  /** The restroom blocks, and whether each is inside the stadium (true) or out on the plaza. */
  blocks: Spot[];
  inside: boolean[];
}

/** Everything on the plaza for this stadium, with the restrooms under the stands wherever they fit. */
export function plazaLayout(bp: Blueprint, f: Facilities, look: Pick<StadiumLook, 'features' | 'plaza'>): PlazaLayout {
  const under = alongStands(bp, 2 + f.restrooms * 2).map(a => underStand(bp, a));
  const plan = plazaPlan(bp.outline, bp.footprint, {
    concessions: f.concessions, restrooms: under.filter(u => !u).length, features: look.features, plaza: look.plaza,
    store: f.store, towers: bp.towers,
  });
  let k = 0;
  const blocks: Spot[] = [], inside: boolean[] = [];
  for (const u of under) {
    const at = u ?? plan.restrooms[k++];
    if (at) { blocks.push(at); inside.push(Boolean(u)); }
  }
  return { plan, blocks, inside };
}

const place = (s: Spot) => mat(null, [s.x, 0, s.z], [0, s.ry, 0]);
const each = (spots: Spot[], p: [number, number, number], r: [number, number, number] = [0, 0, 0], sc?: [number, number, number]) =>
  spots.map(s => mat(place(s), p, r, sc));

/** Concession stands: a cream kiosk, a wooden counter facing the plaza, an awning in the team's colors. */
export function ConcessionStands({ spots, team, accent }: { spots: Spot[]; team: string; accent: string }) {
  const parts = useMemo(() => ({
    // Facing the plaza (local x, out from the stadium), where the fans walk past.
    body: each(spots, [-0.02, 0.12, 0]),
    counter: each(spots, [0.1, 0.075, 0]),
    awning: each(spots, [0.13, 0.25, 0], [0, 0, -0.45]),
    stripe: [-0.11, 0, 0.11].flatMap(dz => each(spots, [0.13, 0.252, dz], [0, 0, -0.45])),
    colors: spots.map((_, i) => (i % 2 ? accent : team)),
  }), [spots, team, accent]);
  return (
    <group>
      <Placed matrices={parts.body} cast><boxGeometry args={[0.2, 0.24, 0.3]} /><meshStandardMaterial color="#f4efe4" roughness={0.85} /></Placed>
      <Placed matrices={parts.counter}><boxGeometry args={[0.05, 0.15, 0.28]} /><meshStandardMaterial color="#9a6b43" roughness={0.8} /></Placed>
      <Placed matrices={parts.awning} colors={parts.colors} cast><boxGeometry args={[0.16, 0.012, 0.34]} /><meshStandardMaterial roughness={0.7} /></Placed>
      {/* White stripes across the awning. */}
      <Placed matrices={parts.stripe}><boxGeometry args={[0.161, 0.012, 0.05]} /><meshStandardMaterial color="#ffffff" roughness={0.7} /></Placed>
    </group>
  );
}

/** What each restroom level is made of. */
const FINISH = [
  { trough: '#a3a9ad', metal: 0.25, rough: 0.55, floor: '#b7b2a9', wall: '#cdc7bb', glow: 0 },   // galvanized, concrete
  { trough: '#a3a9ad', metal: 0.25, rough: 0.55, floor: '#b7b2a9', wall: '#cdc7bb', glow: 0 },   // more of them, and stalls
  { trough: '#e3e8ec', metal: 0.3, rough: 0.15, floor: '#eef1f3', wall: '#e8ecef', glow: 1 },    // stainless, white tile
  { trough: '#d8a521', metal: 0.35, rough: 0.2, floor: '#f1ebe1', wall: '#f5efe4', glow: 1.4 },  // gold, marble
] as const;

// A block, in its own frame: x points out from the stadium, z runs along the plaza.
const L = 0.62, D = 0.34, H = 0.2, T = 0.02;

/**
 * Restroom blocks with the roof left off. The trough runs along the wall nearest the stadium, so
 * the camera, looking in from the plaza side, sees it face on; the way in is on the outer wall.
 */
export function Restrooms({ spots, level, night }: { spots: Spot[]; level: number; night: number }) {
  const f = FINISH[Math.min(3, Math.max(0, level))];
  const parts = useMemo(() => {
    const ice: Matrix4[] = [];
    if (level >= 3) {
      for (const s of spots) {
        const base = place(s);
        for (let i = 0; i < 14; i++) {
          const z = -L * 0.38 + (i / 13) * L * 0.76, x = -D / 2 + 0.045 + ((i * 37) % 7 - 3) * 0.004;
          ice.push(mat(base, [x, 0.118, z], [i * 0.7, i * 1.3, 0]));
        }
      }
    }
    return {
      floor: each(spots, [0, 0.006, 0]),
      // The walls: outer (with the doorway's gap), inner, and the two ends.
      inner: each(spots, [-D / 2, H / 2, 0]),
      outerA: each(spots, [D / 2, H / 2, -L * 0.3]),
      outerB: each(spots, [D / 2, H / 2, L * 0.3]),
      ends: [...each(spots, [0, H / 2, -L / 2]), ...each(spots, [0, H / 2, L / 2])],
      // The trough on its legs, its splash panel, the water in it and the pipe that flushes it.
      trough: each(spots, [-D / 2 + 0.045, 0.09, 0]),
      splash: each(spots, [-D / 2 + 0.014, 0.135, 0]),
      water: each(spots, [-D / 2 + 0.045, 0.1155, 0]),
      pipe: each(spots, [-D / 2 + 0.018, 0.178, 0], [Math.PI / 2, 0, 0]),
      legs: [...each(spots, [-D / 2 + 0.045, 0.035, -L * 0.3]), ...each(spots, [-D / 2 + 0.045, 0.035, L * 0.3])],
      // A blue sign on the wall beside the door.
      sign: each(spots, [D / 2 + 0.012, 0.15, L * 0.18]),
      // Stalls from the second level: two partitions off the outer wall, in the corner past the door.
      stalls: level >= 1 ? [0, 1].flatMap(k => each(spots, [D / 2 - 0.07, 0.085, L / 2 - 0.1 - k * 0.09])) : [],
      light: level >= 2 ? each(spots, [-D / 2 + 0.02, H - 0.01, 0]) : [],
      pot: level >= 3 ? each(spots, [D / 2 - 0.05, 0.03, -L / 2 + 0.06]) : [],
      plant: level >= 3 ? each(spots, [D / 2 - 0.05, 0.1, -L / 2 + 0.06]) : [],
      ice,
    };
  }, [spots, level]);
  const wall = <meshStandardMaterial color={f.wall} roughness={0.9} />;
  const metal = <meshStandardMaterial color={f.trough} metalness={f.metal} roughness={f.rough} emissive={level >= 3 ? '#6b4a00' : '#000000'} emissiveIntensity={level >= 3 ? 0.25 : 0} />;
  return (
    <group>
      <Placed matrices={parts.floor}><boxGeometry args={[D, 0.012, L]} /><meshStandardMaterial color={f.floor} roughness={level >= 2 ? 0.35 : 0.95} /></Placed>
      <Placed matrices={parts.inner} cast><boxGeometry args={[T, H, L]} />{wall}</Placed>
      <Placed matrices={parts.outerA} cast><boxGeometry args={[T, H, L * 0.4]} />{wall}</Placed>
      <Placed matrices={parts.outerB} cast><boxGeometry args={[T, H, L * 0.4]} />{wall}</Placed>
      <Placed matrices={parts.ends} cast><boxGeometry args={[D, H, T]} />{wall}</Placed>
      <Placed matrices={parts.trough}><boxGeometry args={[0.07, 0.05, L * 0.82]} />{metal}</Placed>
      <Placed matrices={parts.splash}><boxGeometry args={[0.006, 0.09, L * 0.82]} />{metal}</Placed>
      <Placed matrices={parts.legs}><boxGeometry args={[0.012, 0.07, 0.012]} />{metal}</Placed>
      <Placed matrices={parts.water}><boxGeometry args={[0.055, 0.004, L * 0.78]} /><meshStandardMaterial color={level >= 3 ? '#dff3fb' : '#8fb4c4'} roughness={0.1} /></Placed>
      <Placed matrices={parts.pipe}><cylinderGeometry args={[0.006, 0.006, L * 0.82, 6]} />{metal}</Placed>
      <Placed matrices={parts.sign}><boxGeometry args={[0.006, 0.05, 0.07]} /><meshStandardMaterial color="#2a6fd6" emissive="#2a6fd6" emissiveIntensity={0.2 + night * 0.8} /></Placed>
      {parts.stalls.length > 0 && <Placed matrices={parts.stalls}><boxGeometry args={[0.12, 0.15, 0.008]} /><meshStandardMaterial color={level >= 3 ? '#4b3a2a' : level >= 2 ? '#5d7f99' : '#8c8f93'} roughness={0.6} /></Placed>}
      {parts.light.length > 0 && <Placed matrices={parts.light}><boxGeometry args={[0.012, 0.012, L * 0.6]} /><meshStandardMaterial color="#ffffff" emissive="#fff4dc" emissiveIntensity={f.glow * (0.4 + night)} /></Placed>}
      {parts.ice.length > 0 && <Placed matrices={parts.ice}><boxGeometry args={[0.014, 0.01, 0.014]} /><meshStandardMaterial color="#f7fbff" roughness={0.2} /></Placed>}
      {parts.pot.length > 0 && <Placed matrices={parts.pot}><cylinderGeometry args={[0.025, 0.02, 0.06, 10]} /><meshStandardMaterial color="#e8e1d4" /></Placed>}
      {parts.plant.length > 0 && <Placed matrices={parts.plant}><sphereGeometry args={[0.05, 10, 8]} /><meshStandardMaterial color="#3f7d3a" roughness={0.9} /></Placed>}
    </group>
  );
}

/** The plaza's paving: lines along the promenades, an apron at each gate, the medallion at the main one. */
export function PlazaGround({ bp, plan, paving, team, accent }: { bp: Blueprint; plan: PlazaPlan; paving: string; team: string; accent: string }) {
  const o = bp.outline, fp = bp.footprint;
  const line = mix(paving, '#ffffff', 0.4), apron = mix(paving, '#ffffff', 0.18);
  const half = (PLAZA.gateClear * 0.8) / (fp + 0.7);
  const m = plan.medallion;
  return (
    <group>
      {[0.635, 1.045].map(d => (
        <Ribbon key={d} o={o} k={`pl${fp}${d}${line}`} profile={() => [[fp + d, 0.0075], [fp + d + 0.025, 0.0075]]}>
          <meshStandardMaterial color={line} roughness={0.85} />
        </Ribbon>
      ))}
      {plan.gates.map(g => (
        <Ribbon key={g} o={o} from={g - half} to={g + half} k={`ap${fp}${g}${apron}`} profile={() => [[fp, 0.0065], [fp + PLAZA.edge - 0.03, 0.0065]]}>
          <meshStandardMaterial color={apron} roughness={0.8} />
        </Ribbon>
      ))}
      <group position={[m.x, 0.009, m.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh><circleGeometry args={[0.32, 40]} /><meshStandardMaterial color={accent} roughness={0.6} /></mesh>
        <mesh position={[0, 0, 0.001]}><circleGeometry args={[0.27, 40]} /><meshStandardMaterial color={team} roughness={0.6} /></mesh>
        <mesh position={[0, 0, 0.002]}><ringGeometry args={[0.12, 0.15, 40]} /><meshStandardMaterial color={accent} roughness={0.6} side={DoubleSide} /></mesh>
        <mesh position={[0, 0, 0.002]}><circleGeometry args={[0.05, 20]} /><meshStandardMaterial color={accent} roughness={0.6} /></mesh>
      </group>
    </group>
  );
}

/** Benches, plaza lamps, planters with a tree or a shrub, and the flags at the gates. */
export function PlazaFurniture({ plan, team, accent, night, banners, garden }: {
  plan: PlazaPlan; team: string; accent: string; night: number; banners: boolean; garden: boolean;
}) {
  const parts = useMemo(() => {
    // Benches face the promenade on alternate sides.
    const benchFrames = plan.benches.map((b, i) => mat(place(b), [0, 0, 0], [0, i % 2 ? Math.PI : 0, 0]));
    const flagColors = plan.flags.map((_, i) => (i % 2 ? accent : team));
    const trees = plan.planters.filter((_, i) => !garden || i % 2 === 0), shrubs = plan.planters.filter((_, i) => garden && i % 2 === 1);
    return {
      seat: benchFrames.map(g => mat(g, [0, 0.05, 0])),
      back: benchFrames.map(g => mat(g, [0.04, 0.085, 0])),
      legs: benchFrames.flatMap(g => [mat(g, [0, 0.022, -0.1]), mat(g, [0, 0.022, 0.1])]),
      pole: plan.lamps.map(l => mat(place(l), [0, 0.27, 0])),
      lantern: plan.lamps.map(l => mat(place(l), [0, 0.55, 0])),
      banner: banners ? plan.lamps.flatMap(l => [mat(place(l), [0, 0.4, 0.035]), mat(place(l), [0, 0.4, -0.035])]) : [],
      bannerColors: plan.lamps.flatMap(() => [team, accent]),
      planter: plan.planters.map(p => mat(place(p), [0, 0.035, 0])),
      soil: plan.planters.map(p => mat(place(p), [0, 0.071, 0])),
      trunk: trees.map(p => mat(place(p), [0, 0.16, 0])),
      canopy: trees.map((p, i) => mat(place(p), [0, 0.3 + (i % 3) * 0.02, 0], [0, i, 0], [1, 0.9 + (i % 2) * 0.15, 1])),
      shrub: shrubs.map(p => mat(place(p), [0, 0.11, 0])),
      bloom: shrubs.map(p => mat(place(p), [0.03, 0.17, 0.02])),
      flagPole: plan.flags.map(f => mat(place(f), [0, 0.42, 0])),
      flag: plan.flags.map(f => mat(place(f), [0, 0.74, 0.12])),
      flagColors,
    };
  }, [plan, team, accent, garden, banners]);
  const glow = 0.15 + night * 2.2;
  return (
    <group>
      <Placed matrices={parts.seat} cast><boxGeometry args={[0.09, 0.015, 0.26]} /><meshStandardMaterial color="#8a5a34" roughness={0.8} /></Placed>
      <Placed matrices={parts.back}><boxGeometry args={[0.012, 0.06, 0.26]} /><meshStandardMaterial color="#8a5a34" roughness={0.8} /></Placed>
      <Placed matrices={parts.legs}><boxGeometry args={[0.08, 0.044, 0.012]} /><meshStandardMaterial color="#2f3338" /></Placed>
      <Placed matrices={parts.pole} cast><cylinderGeometry args={[0.01, 0.014, 0.54, 6]} /><meshStandardMaterial color="#2f3338" metalness={0.3} roughness={0.5} /></Placed>
      <Placed matrices={parts.lantern}><sphereGeometry args={[0.035, 10, 8]} /><meshStandardMaterial color="#fff6dc" emissive="#ffd98a" emissiveIntensity={glow} /></Placed>
      {parts.banner.length > 0 && <Placed matrices={parts.banner} colors={parts.bannerColors}><boxGeometry args={[0.004, 0.13, 0.05]} /><meshStandardMaterial side={DoubleSide} /></Placed>}
      <Placed matrices={parts.planter} cast><cylinderGeometry args={[0.1, 0.09, 0.07, 14]} /><meshStandardMaterial color="#cfc8ba" roughness={0.9} /></Placed>
      <Placed matrices={parts.soil}><cylinderGeometry args={[0.088, 0.088, 0.004, 14]} /><meshStandardMaterial color="#4b3a2a" roughness={1} /></Placed>
      {parts.trunk.length > 0 && <Placed matrices={parts.trunk}><cylinderGeometry args={[0.012, 0.016, 0.18, 6]} /><meshStandardMaterial color="#6b4b32" /></Placed>}
      {parts.canopy.length > 0 && <Placed matrices={parts.canopy} cast><icosahedronGeometry args={[0.11, 1]} /><meshStandardMaterial color="#4f8a3c" roughness={0.9} flatShading /></Placed>}
      {parts.shrub.length > 0 && <Placed matrices={parts.shrub}><icosahedronGeometry args={[0.075, 1]} /><meshStandardMaterial color="#3f7a35" roughness={0.9} flatShading /></Placed>}
      {parts.bloom.length > 0 && <Placed matrices={parts.bloom}><sphereGeometry args={[0.025, 8, 6]} /><meshStandardMaterial color={accent} roughness={0.7} /></Placed>}
      <Placed matrices={parts.flagPole} cast><cylinderGeometry args={[0.008, 0.01, 0.84, 6]} /><meshStandardMaterial color="#d9dde1" metalness={0.3} roughness={0.4} /></Placed>
      <Placed matrices={parts.flag} colors={parts.flagColors}><boxGeometry args={[0.004, 0.15, 0.24]} /><meshStandardMaterial side={DoubleSide} roughness={0.7} /></Placed>
    </group>
  );
}

/** The team store, running along the plaza by the west gate: a shop, then a flagship, then a megastore. */
export function TeamStore({ at, level, team, accent, night }: { at: Spot; level: number; team: string; accent: string; night: number }) {
  const len = 0.6 + 0.3 * level, h = 0.2 + 0.12 * level, dep = 0.32;
  const g = useMemo(() => place(at), [at]);
  const shop = { color: '#ffe6b0', emissive: '#ffcf7a', emissiveIntensity: 0.25 + night * 1.6 };
  return (
    <group matrixAutoUpdate={false} matrix={g}>
      <mesh position={[-0.02, h / 2, 0]} castShadow><boxGeometry args={[dep, h, len]} /><meshStandardMaterial color="#f4f1ea" roughness={0.8} /></mesh>
      {/* The shop window along the plaza side, lit at night. */}
      <mesh position={[dep / 2 - 0.012, h * 0.36, 0]}><boxGeometry args={[0.012, h * 0.55, len * 0.84]} /><meshStandardMaterial {...shop} roughness={0.2} /></mesh>
      <mesh position={[dep / 2 - 0.004, h - 0.04, 0]}><boxGeometry args={[0.014, 0.05, len * 0.62]} /><meshStandardMaterial color={team} emissive={team} emissiveIntensity={0.3 + night} /></mesh>
      <mesh position={[0, h + 0.01, 0]} castShadow><boxGeometry args={[dep + 0.08, 0.02, len + 0.06]} /><meshStandardMaterial color="#2f3338" roughness={0.6} /></mesh>
      {/* An awning over the doors, and from the flagship up, a giant jersey hung on the front. */}
      <mesh position={[dep / 2 + 0.04, h * 0.66, 0]} rotation={[0, 0, -0.35]}><boxGeometry args={[0.1, 0.01, 0.26]} /><meshStandardMaterial color={accent} /></mesh>
      {level >= 2 && <mesh position={[dep / 2 + 0.002, h * 0.62, len * 0.32]}><boxGeometry args={[0.006, h * 0.5, 0.2]} /><meshStandardMaterial color={team} /></mesh>}
      {level >= 3 && <mesh position={[-0.05, h + 0.12, -len * 0.2]} castShadow><boxGeometry args={[dep * 0.7, 0.2, len * 0.45]} /><meshStandardMaterial {...shop} roughness={0.15} /></mesh>}
    </group>
  );
}

/**
 * Fans on the plaza: walking the two promenades at a walking pace (each way on its own side, so
 * nobody walks through anyone), queueing at the concession stands and standing round the statue
 * and the fountain. They keep their own clock, so a dropped frame or the view scrolling back into
 * sight never makes anyone jump.
 */
export function PlazaCrowd({ bp, plan, fill, colors }: { bp: Blueprint; plan: PlazaPlan; fill: number; colors: Color[] }) {
  const walkMesh = useRef<InstancedMesh>(null), standMesh = useRef<InstancedMesh>(null);
  const o = bp.outline, fp = bp.footprint;
  const lanes = useMemo(() => [PLAZA.inner - 0.045, PLAZA.inner + 0.045, PLAZA.outer - 0.045, PLAZA.outer + 0.045]
    .map((d, i) => ({ lane: promenade(o, fp, d, plan.obstacles), dir: i % 2 ? 1 : -1 })), [o, fp, plan]);
  const r = useMemo(() => {
    let s = 7;
    return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; };
  }, []);
  const walkers = useMemo(() => {
    const total = lanes.reduce((t, l) => t + l.lane.length, 0);
    const n = Math.round(18 + fill * 70);
    return Array.from({ length: n }, () => {
      // A lane in proportion to its length.
      let pick = r() * total, li = 0;
      while (li < lanes.length - 1 && pick > lanes[li].lane.length) { pick -= lanes[li].lane.length; li++; }
      return { li, s: r() * lanes[li].lane.length, v: (0.09 + r() * 0.05) * lanes[li].dir, c: colors[Math.floor(r() * colors.length)] };
    });
  }, [lanes, fill, colors, r]);
  const standers = useMemo(() => {
    const out: { x: number; z: number; c: Color }[] = [];
    const c = () => colors[Math.floor(r() * colors.length)];
    // In line at the stands, more of them the bigger the crowd.
    for (const st of plan.stands) {
      const q = r() < 0.25 + fill * 0.6 ? (r() < fill ? 2 : 1) : 0;
      for (let j = 0; j < q; j++) {
        const jitter = (r() - 0.5) * 0.04;
        out.push({ x: st.x + st.nx * (0.27 + j * 0.09) - st.nz * jitter, z: st.z + st.nz * (0.27 + j * 0.09) + st.nx * jitter, c: c() });
      }
    }
    // Round the statue and the fountain, taking pictures.
    for (const f of [plan.statue, plan.fountain]) {
      if (!f) continue;
      const rad = f === plan.statue ? 0.36 : 0.48, k = 2 + Math.round(fill * 3);
      for (let j = 0; j < k; j++) {
        const a = r() * TAU;
        out.push({ x: f.x + Math.cos(a) * rad, z: f.z + Math.sin(a) * rad, c: c() });
      }
    }
    // A few by the main gate's medallion.
    const m = plan.medallion;
    for (let j = 0; j < 2 + Math.round(fill * 3); j++) {
      const a = r() * TAU, rad = 0.36 + r() * 0.08;
      out.push({ x: m.x + Math.cos(a) * rad, z: m.z + Math.sin(a) * rad, c: c() });
    }
    return out;
  }, [plan, fill, colors, r]);

  const dummy = useMemo(() => new Object3D(), []);
  useEffect(() => {
    const m = standMesh.current;
    if (m) {
      standers.forEach((p, i) => { dummy.position.set(p.x, 0.085, p.z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, p.c); });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
    const w = walkMesh.current;
    if (w) { walkers.forEach((p, i) => w.setColorAt(i, p.c)); if (w.instanceColor) w.instanceColor.needsUpdate = true; }
  }, [standers, walkers, dummy]);

  useFrame((_, delta) => {
    const m = walkMesh.current;
    if (!m) return;
    // Their own clock: a long gap between frames moves them a step, not across the plaza.
    const dt = Math.min(delta, 0.1);
    walkers.forEach((p, i) => {
      p.s += p.v * dt;
      const lane = lanes[p.li].lane;
      const [x, z] = alongLane(lane, p.s);
      // A little bob with each step, by distance walked.
      dummy.position.set(x, 0.085 + Math.abs(Math.sin(p.s * 38)) * 0.007, z);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={walkMesh} args={[undefined, undefined, walkers.length]} key={`w${walkers.length}`} frustumCulled={false}>
        <capsuleGeometry args={[0.035, 0.1, 3, 6]} /><meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      {standers.length > 0 && (
        <instancedMesh ref={standMesh} args={[undefined, undefined, standers.length]} key={`s${standers.length}`}>
          <capsuleGeometry args={[0.035, 0.1, 3, 6]} /><meshStandardMaterial roughness={0.8} />
        </instancedMesh>
      )}
    </>
  );
}

export interface Shot {
  position: [number, number, number]; target: [number, number, number];
  /** Cut away whatever is nearer than the target and above this height, to see inside the stadium. */
  cut?: number;
}

/** The default view: the whole stadium from a corner. */
export const WIDE: Shot = { position: [19, 7, 19], target: [0, 0.8, 0] };

/** Where to look at an upgrade: close in on the plaza's buildings, over the bowl for what's in it. */
export function focusShot(track: TrackId, bp: Blueprint, layout: PlazaLayout): Shot {
  const near = (s: Spot | undefined, out: number, up: number, y = 0.08): Shot | null => s
    ? { position: [s.x + s.nx * out, up, s.z + s.nz * out], target: [s.x, y, s.z] }
    : null;
  switch (track) {
    case 'restrooms': {
      const s = near(layout.blocks[0], 1.5, 1.45);
      return s ? (layout.inside[0] ? { ...s, cut: 0.26 } : s) : WIDE;
    }
    case 'concessions': return near(layout.plan.stands[0], 1.6, 1.0, 0.12) ?? WIDE;
    case 'store': return near(layout.plan.store ?? undefined, 2.2, 1.5, 0.25) ?? WIDE;
    case 'parking': return { position: [0, 21, 24], target: [0, 0, 3] };
    case 'videoboard': {
      const b = bp.boards[0];
      if (!b) return WIDE;
      // From the far side of the bowl, looking up at it.
      const back = Math.hypot(b.x, b.z) > 0.5 ? [-b.x * 0.4, -b.z * 0.4] : [5, 5];
      return { position: [back[0], b.y + 2.2, back[1]], target: [b.x, b.y, b.z] };
    }
    case 'atmosphere': {
      const t = bp.towers[0];
      return t ? { position: [-t[0] * 0.3, t[1] * 0.6 + 2, -t[2] * 0.3], target: [t[0], t[1] * 0.8, t[2]] } : WIDE;
    }
    case 'suites': return { position: [8, bp.top + 2.5, 8], target: [0, bp.top * 0.6, 0] };
    default: return { position: [17, 11, 17], target: [0, 0.8, 0] };
  }
}
