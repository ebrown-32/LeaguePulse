'use client';

/**
 * The upgrades that stand on the plaza, built so each one reads as what it is from the air:
 *
 *   Concessions  stands with a counter and a striped awning in the stadium's colors, six more a level
 *   Restrooms    inside the stadium, under the back of the stands: blocks with no roof of their own, so
 *                a preview's cutaway (Stadium3D's FocusRig) shows them from above: a trough along one wall, the classic
 *                stadium urinal, getting better with each level. Galvanized steel on concrete to
 *                start; more blocks and stalls; then stainless on white tile with a light bar; then,
 *                spa-grade, a gold trough full of ice on marble, with a plant in the corner.
 *
 * And where to look at each upgrade (focusShot), for the camera when one is previewed.
 * Everything repeated is drawn with Placed: one draw call a part, however many blocks there are.
 */

import { useMemo } from 'react';
import { type Matrix4 } from 'three';
import type { TrackId } from '@/lib/tycoon/catalog';
import { OVAL, outerOf, TAU, type Blueprint, type Outline } from '@/lib/franchise/stadiumBlueprint';
import { mat, Placed } from './stadiumParts';

export interface Spot { x: number; z: number; ry: number; nx: number; nz: number }

/** A spot on the plaza at angle a, r out from midfield: turned so its local x points straight out. */
function spot(o: Outline, a: number, r: number): Spot {
  const [x, z] = o.around(a, r);
  const [x1, z1] = o.around(a - 0.01, r), [x2, z2] = o.around(a + 0.01, r);
  // The outward normal is the tangent turned a quarter, whichever way points away from midfield.
  let nx = z2 - z1, nz = -(x2 - x1);
  if (nx * x + nz * z < 0) { nx = -nx; nz = -nz; }
  const len = Math.hypot(nx, nz) || 1;
  nx /= len; nz /= len;
  return { x, z, ry: Math.atan2(-nz, nx), nx, nz };
}

/** Clear of the team store, which stands on the west side of the plaza. */
const clearOfStore = (a: number) => {
  const d = Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI)); // how far from due west, signed
  return Math.abs(d) < 0.45 ? a + Math.sign(d || 1) * (0.45 - Math.abs(d)) : a;
};

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
  return spot(bp.outline, a, r);
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

export function plazaSpots(bp: Blueprint, concessions: number, restrooms: number) {
  const o = bp.outline, footprint = bp.footprint;
  const stands = concessions * 6, blocks = 2 + restrooms * 2;
  return {
    stands: Array.from({ length: stands }, (_, i) => spot(o, clearOfStore((i / Math.max(1, stands)) * TAU + 0.2), footprint + 0.75)),
    // Inside, under the stands; on the plaza where a stadium has no room under its seats.
    blocks: alongStands(bp, blocks).map((a, i) => underStand(bp, a) ?? spot(o, clearOfStore((i / blocks) * TAU + 0.6), footprint + 1.05)),
  };
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

export interface Shot {
  position: [number, number, number]; target: [number, number, number];
  /** Cut away whatever is nearer than the target and above this height, to see inside the stadium. */
  cut?: number;
}

/** The default view: the whole stadium from a corner. */
export const WIDE: Shot = { position: [19, 7, 19], target: [0, 0.8, 0] };

/** Where to look at an upgrade: close in on the plaza's buildings, over the bowl for what's in it. */
export function focusShot(track: TrackId, bp: Blueprint, spots: ReturnType<typeof plazaSpots>): Shot {
  const near = (s: Spot | undefined, out: number, up: number, y = 0.08): Shot | null => s
    ? { position: [s.x + s.nx * out, up, s.z + s.nz * out], target: [s.x, y, s.z] }
    : null;
  switch (track) {
    case 'restrooms': {
      const s = near(spots.blocks[0], 1.5, 1.45);
      return s ? { ...s, cut: 0.26 } : WIDE;
    }
    case 'concessions': return near(spots.stands[0], 1.5, 0.9, 0.12) ?? WIDE;
    case 'store': {
      const x = -(bp.footprint + 0.95) * OVAL;
      return { position: [x - 2.2, 1.6, 2.4], target: [x, 0.25, 0.9] };
    }
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
