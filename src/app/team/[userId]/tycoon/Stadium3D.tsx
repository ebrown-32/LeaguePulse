'use client';

/**
 * A franchise's stadium in 3D, drawn from what it has built (lib/tycoon/catalog)
 * and how its manager has styled it (lib/franchise/model, StadiumLook), set in
 * the world at the visitor's own time of day.
 *
 *   The bowl     a rounded rectangle around a regulation field (Gridiron),
 *                tiers by stadium level and seating, seats in the chosen
 *                colors, the crowd filled to the last game's attendance
 *   The outside  a facade in the chosen material, columns, four gates with
 *                banners, a canopy, a dome at the top levels
 *   The grounds  a plaza with people, a ring road, parking lots laid out in
 *                stalls and filled to the crowd, a garage and a transit
 *                station when built, trees, a pond, a skyline
 *   The sky      sun, light and color from the local hour; at night the
 *                stadium lights, the gates and the skyline come on, and stars
 *
 * Everything is made from primitives here (no model files), repeated things
 * are instanced, and nothing renders while off screen.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import {
  CircleGeometry, Color, CylinderGeometry, DoubleSide, Object3D, RingGeometry, SphereGeometry,
  type BufferGeometry, type Group, type InstancedMesh, type Mesh, type MeshStandardMaterial,
} from 'three';
import type { Facilities } from '@/lib/tycoon/catalog';
import { DEFAULT_LOOK, type StadiumLook } from '@/lib/franchise/model';
import { APRON, Gridiron } from './Gridiron';

export interface StadiumProps {
  facilities: Facilities; fill: number; color: string; name: string;
  /** Painted in the end zones and at midfield; the stadium's name otherwise. */
  teamName?: string;
  /** The team's logo for midfield, same-origin (see Gridiron). */
  logo?: string | null;
  look?: StadiumLook | null;
  /** Hour of day, 0 to 24; the visitor's clock when left out. */
  hour?: number;
}

const OVAL = 1.45; // stadiums are longer than they are wide
/** How square the bowl is: 2 would be an ellipse; 4 hugs the rectangular field with rounded corners. */
const SQUARE = 4;

/** The point of the bowl's outline at angle a and size r (x is the long axis). */
function around(a: number, r: number): [number, number] {
  const c = Math.cos(a), s = Math.sin(a), e = 2 / SQUARE;
  return [Math.sign(c) * Math.abs(c) ** e * r * OVAL, Math.sign(s) * Math.abs(s) ** e * r];
}
/** The outline size that passes through (x, z): around()'s inverse. */
const reach = (x: number, z: number) => ((Math.abs(x) / OVAL) ** SQUARE + Math.abs(z) ** SQUARE) ** (1 / SQUARE);

/** Bends a round geometry (round in x and `axis`) to the bowl's outline. */
function bowlShape<G extends BufferGeometry>(g: G, axis: 'z' | 'y'): G {
  const p = g.attributes.position, j = axis === 'z' ? 2 : 1;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), w = p.getComponent(i, j), r = Math.hypot(x, w);
    if (!r) continue;
    const [nx, nw] = around(Math.atan2(w, x), r);
    p.setX(i, nx); p.setComponent(i, j, nw);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
function useBowl(make: () => BufferGeometry, deps: unknown[], axis: 'z' | 'y' = 'z') {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(() => bowlShape(make(), axis), deps);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}
/** A flat disc (inner 0) or ring in the bowl's outline. */
function BowlFlat({ inner = 0, outer, y, children }: { inner?: number; outer: number; y: number; children: React.ReactNode }) {
  const g = useBowl(() => inner ? new RingGeometry(inner, outer, 128) : new CircleGeometry(outer, 128), [inner, outer], 'y');
  return <mesh geometry={g} rotation-x={-Math.PI / 2} position={[0, y, 0]} receiveShadow>{children}</mesh>;
}
/** An open band of the bowl's outline: a wall, or a raked tier when the radii differ. */
function BowlBand({ top, bottom, height, y, cast = false, children }: { top: number; bottom: number; height: number; y: number; cast?: boolean; children: React.ReactNode }) {
  const g = useBowl(() => new CylinderGeometry(top, bottom, height, 128, 1, true), [top, bottom, height]);
  return <mesh geometry={g} position={[0, y, 0]} castShadow={cast} receiveShadow>{children}</mesh>;
}

/** A repeatable random sequence, so the same stadium always looks the same. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; };
}

// ── Time of day ─────────────────────────────────────────────────────────────

function useLocalHour(override?: number) {
  const [hour, setHour] = useState(() => override ?? 12);
  useEffect(() => {
    if (override !== undefined) { setHour(override); return; }
    const tick = () => { const d = new Date(); setHour(d.getHours() + d.getMinutes() / 60); };
    tick();
    const t = setInterval(tick, 5 * 60_000);
    return () => clearInterval(t);
  }, [override]);
  return hour;
}

const mix = (a: string, b: string, t: number) => '#' + new Color(a).lerp(new Color(b), Math.max(0, Math.min(1, t))).getHexString();

/** Sky, sun and light for an hour: noon is high and white, sunset low and orange, night dark blue. */
function skyFor(hour: number) {
  const angle = ((hour - 6) / 12) * Math.PI; // sunrise at 6, sunset at 18
  const elevation = Math.sin(angle);
  const night = Math.max(0, Math.min(1, -elevation * 3 + 0.15));
  const golden = Math.max(0, 1 - Math.abs(elevation) * 4); // near the horizon
  const day = '#9fd0ef', dusk = '#f2a46d', dark = '#0b1430';
  const sky = elevation > 0 ? mix(day, dusk, golden) : mix(dusk, dark, Math.min(1, -elevation * 4));
  return {
    sky, night,
    sun: [Math.cos(angle) * 30, Math.max(2, elevation * 30), -12] as [number, number, number],
    sunColor: mix('#ffffff', '#ffb070', golden),
    sunIntensity: Math.max(0, elevation) * 1.7 + 0.08,
    ambient: 0.25 + Math.max(0, elevation) * 0.6,
    lightsOn: night > 0.35 || golden > 0.6,
  };
}

/** Autumn and winter show in the trees. */
function treePalette(): string[] {
  const m = new Date().getMonth();
  if (m >= 8 && m <= 10) return ['#3f7d32', '#c46a1c', '#d99b2b', '#a63f1f', '#5d8a2e'];
  if (m === 11 || m <= 1) return ['#2f5d34', '#3a6b3d', '#7a6a55'];
  return ['#3f7d32', '#4f8f3a', '#2f6b2a', '#5d9a3e'];
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** Grows a child from nothing to full size when it first appears. */
function Rise({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const g = useRef<Group>(null);
  const born = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    born.current ??= clock.elapsedTime + delay;
    const t = Math.min(1, Math.max(0, (clock.elapsedTime - born.current) / 0.9));
    g.current.scale.set(1, Math.max(0.001, 1 - Math.pow(1 - t, 3)), 1);
  });
  return <group ref={g} scale={[1, 0.001, 1]}>{children}</group>;
}

/** Instanced boxes from a list of placements. */
function Boxes({ items, size, color, emissive, emissiveIntensity = 0, cast = true }: {
  items: { x: number; y: number; z: number; ry?: number; sx?: number; sy?: number; sz?: number; c?: string }[];
  size: [number, number, number]; color?: string; emissive?: string; emissiveIntensity?: number; cast?: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const d = new Object3D();
    items.forEach((it, i) => {
      d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.ry ?? 0, 0); d.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
      d.updateMatrix(); m.setMatrixAt(i, d.matrix);
      if (it.c) m.setColorAt(i, new Color(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, items.length]} key={items.length} castShadow={cast} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={items[0].c ? undefined : color} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={0.8} />
    </instancedMesh>
  );
}

const FACADE: Record<StadiumLook['facade'], { wall: string; trim: string; metal: number; rough: number; glass?: boolean }> = {
  concrete: { wall: '#cfcac0', trim: '#9e978a', metal: 0, rough: 0.9 },
  brick: { wall: '#9c4a32', trim: '#e6dccb', metal: 0, rough: 0.95 },
  glass: { wall: '#7fb6db', trim: '#d8e4ec', metal: 0.3, rough: 0.1, glass: true },
  // Kept mostly matte: with nothing in the scene to reflect, real metalness renders black.
  steel: { wall: '#8d98a3', trim: '#d3d9de', metal: 0.3, rough: 0.45 },
};

function seatColors(look: StadiumLook, team: string): [string, string] {
  if (look.seats === 'team') return [mix(team, '#9aa0a6', 0.25), mix(team, '#ffffff', 0.25)];
  if (look.seats === 'mono') return ['#2f3338', '#3a3f45'];
  return ['#8d939b', '#3d6fa8'];
}

function Tier({ inner, height, base, color }: { inner: number; height: number; base: number; color: string }) {
  return (
    <BowlBand top={inner + height * 0.9} bottom={inner} height={height} y={base + height / 2} cast>
      <meshStandardMaterial color={color} side={DoubleSide} roughness={0.85} />
    </BowlBand>
  );
}

function Crowd({ tiers, fill, color }: { tiers: { inner: number; height: number; base: number }[]; fill: number; color: string }) {
  const mesh = useRef<InstancedMesh>(null);
  const seats = useMemo(() => {
    const out: { x: number; y: number; z: number; a: number }[] = [];
    for (const t of tiers) for (let row = 0; row < 5; row++) {
      const f = (row + 0.5) / 5, radius = t.inner + 0.08 + f * t.height * 0.9, per = Math.round(radius * 34);
      for (let i = 0; i < per; i++) {
        const a = (i / per) * Math.PI * 2;
        const [x, z] = around(a, radius);
        out.push({ x, y: t.base + 0.06 + f * t.height, z, a });
      }
    }
    return out;
  }, [tiers]);
  const shown = useMemo(() => { const r = rng(11); return seats.filter(() => r() < Math.max(0.03, fill)); }, [seats, fill]);
  const palette = useMemo(() => [new Color(color), new Color(color).lerp(new Color('#ffffff'), 0.55), new Color('#f2f2f2'), new Color('#2b2b2b')], [color]);
  const dummy = useMemo(() => new Object3D(), []);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const r = rng(3);
    shown.forEach((_, i) => m.setColorAt(i, palette[r() < 0.62 ? 0 : r() < 0.5 ? 1 : r() < 0.7 ? 2 : 3]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [shown, palette]);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    shown.forEach((s, i) => {
      const lift = Math.max(0, Math.cos((s.a - t * 1.6) % (Math.PI * 2))) ** 12 * 0.12; // the wave
      dummy.position.set(s.x, s.y + lift, s.z); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, shown.length)]} key={shown.length}>
      <boxGeometry args={[0.05, 0.09, 0.05]} />
      <meshStandardMaterial roughness={0.7} />
    </instancedMesh>
  );
}

/** The outside of the bowl: wall, columns, four gates with banners, and a canopy. */
function Exterior({ outer, top, look, color, night, canopy }: { outer: number; top: number; look: StadiumLook; color: string; night: number; canopy: boolean }) {
  const f = FACADE[look.facade];
  const columns = useMemo(() => Array.from({ length: 56 }, (_, i) => {
    const a = (i / 56) * Math.PI * 2;
    const [x, z] = around(a, outer + 0.06);
    return { x, y: top / 2, z, ry: -a };
  }), [outer, top]);
  const gates = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  return (
    <group>
      <BowlBand top={outer + 0.04} bottom={outer + 0.04} height={top} y={top / 2} cast>
        {f.glass
          ? <meshPhysicalMaterial color={f.wall} metalness={f.metal} roughness={f.rough} transparent opacity={0.72} side={DoubleSide} emissive="#ffd99a" emissiveIntensity={night * 0.35} />
          : <meshStandardMaterial color={f.wall} metalness={f.metal} roughness={f.rough} side={DoubleSide} />}
      </BowlBand>
      {/* A lit band of windows near the top. */}
      <BowlBand top={outer + 0.05} bottom={outer + 0.05} height={0.12} y={top * 0.78}>
        <meshStandardMaterial color="#1e2a36" emissive="#ffd28a" emissiveIntensity={0.15 + night * 1.2} side={DoubleSide} />
      </BowlBand>
      <Boxes items={columns} size={[0.1, top, 0.1]} color={f.trim} />
      {gates.map((a, i) => (
        <group key={i} position={[Math.cos(a) * (outer + 0.2) * OVAL, 0, Math.sin(a) * (outer + 0.2)]} rotation-y={-a + Math.PI / 2}>
          <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[1.3, 0.9, 0.35]} /><meshStandardMaterial color={f.trim} /></mesh>
          <mesh position={[0, 0.32, 0.18]}><boxGeometry args={[0.7, 0.62, 0.02]} /><meshStandardMaterial color="#1b1d21" emissive="#ffe2a8" emissiveIntensity={night * 0.8} /></mesh>
          <mesh position={[0, 1.05, 0.18]}><boxGeometry args={[1.1, 0.28, 0.03]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25 + night * 0.6} /></mesh>
        </group>
      ))}
      {canopy && (
        <BowlFlat inner={outer - 1.3} outer={outer + 0.18} y={top + 0.04}>
          <meshStandardMaterial color="#eef1f4" side={DoubleSide} transparent opacity={0.9} />
        </BowlFlat>
      )}
    </group>
  );
}

function LightTowers({ radius, height, on }: { radius: number; height: number; on: boolean }) {
  return (
    <>
      {[1, 3, 5, 7].map(k => around((k * Math.PI) / 4, radius)).map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position={[0, height / 2, 0]} castShadow><cylinderGeometry args={[0.04, 0.06, height, 8]} /><meshStandardMaterial color="#9aa1a8" metalness={0.6} roughness={0.4} /></mesh>
          <mesh position={[0, height, 0]}><boxGeometry args={[0.45, 0.25, 0.08]} /><meshStandardMaterial color="#fffbe6" emissive={on ? '#fff3c4' : '#000000'} emissiveIntensity={on ? 2 : 0} /></mesh>
          {on && <pointLight position={[0, height, 0]} intensity={3} distance={12} color="#fff3d1" />}
        </group>
      ))}
    </>
  );
}

function VideoBoard({ level, radius, height, color }: { level: number; radius: number; height: number; color: string }) {
  const screen = useRef<Mesh>(null);
  const w = [0.9, 1.4, 2.2, 3.2][level], h = [0.35, 0.55, 0.85, 1.15][level];
  useFrame(({ clock }) => {
    const mat = screen.current?.material as MeshStandardMaterial | undefined;
    if (mat) mat.emissiveIntensity = 0.9 + Math.sin(clock.elapsedTime * 2.4) * 0.25;
  });
  return (
    <group position={[radius * OVAL - 0.6, height + h / 2 + 0.25, 0]} rotation-y={-Math.PI / 2}>
      <mesh position={[0, -h / 2 - 0.2, 0]}><boxGeometry args={[0.08, 0.5, 0.08]} /><meshStandardMaterial color="#5c6168" /></mesh>
      <mesh><boxGeometry args={[w + 0.12, h + 0.12, 0.12]} /><meshStandardMaterial color="#1b1d21" /></mesh>
      <mesh ref={screen} position={[0, 0, 0.065]}><planeGeometry args={[w, h]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} /></mesh>
    </group>
  );
}

// ── The grounds ─────────────────────────────────────────────────────────────

interface Lot { x: number; z: number; w: number; d: number; rot: number }

/** Where lots go, in the order they are built: north, south, then east and west. */
function lotsFor(level: number, ring: number): Lot[] {
  const at = ring + 2.8;
  const all: Lot[] = [
    { x: 0, z: -at, w: 9, d: 3.2, rot: 0 },
    { x: 0, z: at, w: 9, d: 3.2, rot: 0 },
    { x: at * OVAL + 0.6, z: 0, w: 3.2, d: 7, rot: 0 },
    { x: -(at * OVAL + 0.6), z: 0, w: 3.2, d: 7, rot: 0 },
  ];
  return all.slice(0, Math.min(4, level + 1));
}

/** A lot: asphalt (gravel while small), painted stalls in pairs of rows facing an aisle, cars in them. */
function ParkingLot({ lot, paved, fill, seed }: { lot: Lot; paved: boolean; fill: number; seed: number }) {
  const { stalls, lines, cars, cabins } = useMemo(() => {
    const r = rng(seed);
    const long = lot.w >= lot.d;
    const length = long ? lot.w : lot.d, depth = long ? lot.d : lot.w;
    const sw = 0.34, sd = 0.6, aisle = 0.55;
    const perRow = Math.floor((length - 0.4) / sw);
    const pairs = Math.max(1, Math.floor((depth - 0.2) / (2 * sd + aisle)));
    const stalls: { x: number; z: number; flip: boolean }[] = [];
    for (let p = 0; p < pairs; p++) {
      const band = -depth / 2 + 0.2 + p * (2 * sd + aisle);
      for (const [row, flip] of [[band + sd / 2, false], [band + sd * 1.5 + aisle, true]] as const) {
        for (let i = 0; i < perRow; i++) {
          const a = -length / 2 + 0.2 + sw / 2 + i * sw;
          stalls.push(long ? { x: lot.x + a, z: lot.z + row, flip } : { x: lot.x + row, z: lot.z + a, flip });
        }
      }
    }
    const palette = ['#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#2980b9', '#f1c40f', '#1e1e1e', '#16a085', '#8e44ad'];
    const lines = stalls.map(s => ({ x: s.x + (long ? sw / 2 : 0), y: 0.012, z: s.z + (long ? 0 : sw / 2), ry: long ? 0 : Math.PI / 2 }));
    const parked = stalls.filter(() => r() < Math.min(0.97, 0.15 + fill * 0.9));
    const cars = parked.map(s => ({ x: s.x, y: 0.06, z: s.z, ry: long ? Math.PI / 2 : 0, c: palette[Math.floor(r() * palette.length)] }));
    const cabins = cars.map(c => ({ ...c, y: 0.14, c: '#1d2733' }));
    return { stalls, lines, cars, cabins };
  }, [lot, fill, seed]);
  void stalls;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[lot.x, 0.008, lot.z]} receiveShadow>
        <planeGeometry args={[lot.w, lot.d]} />
        <meshStandardMaterial color={paved ? '#34383d' : '#9a907c'} roughness={0.95} />
      </mesh>
      <Boxes items={lines} size={[0.012, 0.004, 0.55]} color="#e9e6dc" cast={false} />
      <Boxes items={cars} size={[0.5, 0.1, 0.24]} />
      <Boxes items={cabins} size={[0.26, 0.08, 0.2]} />
    </group>
  );
}

function Roads({ ring, lots }: { ring: number; lots: Lot[] }) {
  return (
    <group>
      <BowlFlat inner={ring} outer={ring + 0.7} y={0.006}>
        <meshStandardMaterial color="#3b3f44" roughness={0.95} />
      </BowlFlat>
      {/* Avenues out to the edge of town, past the lots. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.007, -(ring + 16)]} receiveShadow><planeGeometry args={[0.8, 30]} /><meshStandardMaterial color="#3b3f44" /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[ring * OVAL + 16, 0.007, 0]} receiveShadow><planeGeometry args={[30, 0.8]} /><meshStandardMaterial color="#3b3f44" /></mesh>
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[0, 0.01, -(ring + 2 + i * 2)]}><planeGeometry args={[0.05, 0.8]} /><meshStandardMaterial color="#e8c547" /></mesh>
      ))}
      {lots.map((l, i) => <ParkingAccess key={i} lot={l} ring={ring} />)}
    </group>
  );
}

function ParkingAccess({ lot, ring }: { lot: Lot; ring: number }) {
  // A short drive from the ring road to each lot.
  const dx = lot.x, dz = lot.z;
  const len = Math.hypot(dx, dz) - ring - 0.4;
  const a = Math.atan2(dz, dx);
  const mid = ring + 0.35 + len / 2;
  return (
    <mesh rotation-x={-Math.PI / 2} rotation-z={-a} position={[Math.cos(a) * mid * (Math.abs(Math.cos(a)) > 0.5 ? OVAL : 1), 0.007, Math.sin(a) * mid]}>
      <planeGeometry args={[Math.max(0.5, len), 0.6]} />
      <meshStandardMaterial color="#3b3f44" />
    </mesh>
  );
}

function Garage({ ring }: { ring: number }) {
  return (
    <group position={[(ring + 3) * 0.9, 0, -(ring + 3)]}>
      {[0, 1, 2].map(l => (
        <group key={l}>
          <mesh position={[0, 0.25 + l * 0.45, 0]} castShadow receiveShadow><boxGeometry args={[3, 0.08, 2]} /><meshStandardMaterial color="#a7abb0" /></mesh>
          {[[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]].map(([x, z], i) => (
            <mesh key={i} position={[x, l * 0.45 + 0.02, z]}><boxGeometry args={[0.1, 0.45, 0.1]} /><meshStandardMaterial color="#8f9398" /></mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Transit({ ring }: { ring: number }) {
  const z = ring + 6.5;
  return (
    <group>
      <mesh position={[0, 0.06, z]}><boxGeometry args={[40, 0.08, 0.5]} /><meshStandardMaterial color="#6d6d6d" /></mesh>
      {[-0.12, 0.12].map(o => <mesh key={o} position={[0, 0.12, z + o]}><boxGeometry args={[40, 0.03, 0.04]} /><meshStandardMaterial color="#b9b9b9" metalness={0.7} /></mesh>)}
      <mesh position={[2, 0.4, z - 0.6]} castShadow><boxGeometry args={[3, 0.6, 0.6]} /><meshStandardMaterial color="#e8e8e8" /></mesh>
      <mesh position={[2, 0.75, z - 0.6]}><boxGeometry args={[3.3, 0.06, 0.9]} /><meshStandardMaterial color="#c0392b" /></mesh>
    </group>
  );
}

/** Trees around the grounds, kept off the roads, lots and pond. */
function Trees({ ring, lots, pond }: { ring: number; lots: Lot[]; pond: { x: number; z: number; r: number } }) {
  const { trunks, crowns, cones } = useMemo(() => {
    const r = rng(77);
    const colors = treePalette();
    const trunks: { x: number; y: number; z: number; sy?: number }[] = [];
    const crowns: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    const cones: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    const blocked = (x: number, z: number) =>
      reach(x, z) < ring + 1.4
      || Math.abs(x) < 0.9 && z < 0
      || Math.abs(z) < 0.9 && x > 0
      || lots.some(l => Math.abs(x - l.x) < l.w / 2 + 0.6 && Math.abs(z - l.z) < l.d / 2 + 0.6)
      || Math.hypot(x - pond.x, z - pond.z) < pond.r + 0.6
      || Math.abs(z - (ring + 6.5)) < 1 && lots.length >= 4;
    for (let tries = 0; trunks.length < 220 && tries < 3000; tries++) {
      const a = r() * Math.PI * 2, d = ring + 3 + r() * 20;
      const x = Math.cos(a) * d * OVAL * 0.9, z = Math.sin(a) * d;
      if (blocked(x, z)) continue;
      const s = 0.7 + r() * 0.7;
      trunks.push({ x, y: 0.2 * s, z, sy: s });
      if (r() < 0.35) cones.push({ x, y: 0.75 * s, z, sx: s, sy: s, sz: s, c: '#2f5d34' });
      else crowns.push({ x, y: 0.6 * s, z, sx: s, sy: s * 0.9, sz: s, c: colors[Math.floor(r() * colors.length)] });
    }
    return { trunks, crowns, cones };
  }, [ring, lots, pond]);
  return (
    <group>
      <Boxes items={trunks} size={[0.08, 0.4, 0.08]} color="#6b4a2f" />
      <Spheres items={crowns} />
      <Cones items={cones} />
    </group>
  );
}

function Spheres({ items }: { items: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] }) {
  const mesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current; if (!m) return;
    const d = new Object3D();
    items.forEach((it, i) => { d.position.set(it.x, it.y, it.z); d.scale.set(it.sx, it.sy, it.sz); d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, new Color(it.c)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, items.length)]} key={items.length} castShadow><icosahedronGeometry args={[0.35, 1]} /><meshStandardMaterial roughness={0.9} flatShading /></instancedMesh>;
}

function Cones({ items }: { items: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] }) {
  const mesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current; if (!m) return;
    const d = new Object3D();
    items.forEach((it, i) => { d.position.set(it.x, it.y, it.z); d.scale.set(it.sx, it.sy, it.sz); d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, new Color(it.c)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, items.length)]} key={items.length} castShadow><coneGeometry args={[0.3, 0.9, 7]} /><meshStandardMaterial roughness={0.9} flatShading /></instancedMesh>;
}

/** People strolling the plaza: more of them the bigger the crowd. */
function People({ radius, fill, color }: { radius: number; fill: number; color: string }) {
  const mesh = useRef<InstancedMesh>(null);
  const folk = useMemo(() => {
    const r = rng(41);
    const n = Math.round(40 + fill * 120);
    const palette = [color, '#f2f2f2', '#2b2b2b', '#c0392b', '#2980b9', mix(color, '#ffffff', 0.5)];
    return Array.from({ length: n }, () => ({ a: r() * Math.PI * 2, d: radius + 0.2 + r() * 0.9, speed: (r() - 0.5) * 0.12, c: palette[Math.floor(r() * palette.length)] }));
  }, [radius, fill, color]);
  const dummy = useMemo(() => new Object3D(), []);
  useEffect(() => {
    const m = mesh.current; if (!m) return;
    folk.forEach((p, i) => m.setColorAt(i, new Color(p.c)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [folk]);
  useFrame(({ clock }) => {
    const m = mesh.current; if (!m) return;
    const t = clock.elapsedTime;
    folk.forEach((p, i) => {
      const a = p.a + t * p.speed;
      const [x, z] = around(a, p.d);
      dummy.position.set(x, 0.09 + Math.abs(Math.sin(t * 6 + i)) * 0.01, z);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[undefined, undefined, folk.length]} key={folk.length}><capsuleGeometry args={[0.035, 0.1, 3, 6]} /><meshStandardMaterial roughness={0.8} /></instancedMesh>;
}

/** A skyline on the horizon; its windows come on at dusk. */
function Skyline({ night }: { night: number }) {
  const items = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 44 }, (_, i) => {
      const a = Math.PI * 1.05 + (i / 44) * Math.PI * 0.9 + (r() - 0.5) * 0.04;
      const d = 34 + r() * 6, h = 1.5 + r() * r() * 9;
      return { x: Math.cos(a) * d, y: h / 2, z: Math.sin(a) * d, sy: h, sx: 1 + r() * 1.6, sz: 1 + r(), c: mix('#5b6573', '#8a95a3', r()) };
    });
  }, []);
  return <Boxes items={items} size={[1, 1, 1]} emissive="#ffcf7a" emissiveIntensity={night * 0.28} cast={false} />;
}

function Pyro({ radius }: { radius: number }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const t = clock.elapsedTime % 4;
    g.current.children.forEach((c, i) => {
      const local = Math.max(0, t - i * 0.15);
      c.position.y = 0.5 + local * 2.2;
      c.scale.setScalar(local < 1.4 ? 0.6 + local : 0.001);
    });
  });
  return (
    <group ref={g}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const [x, z] = around(a, radius * 0.95);
        return <mesh key={i} position={[x, 0.5, z]}><sphereGeometry args={[0.06, 8, 8]} /><meshStandardMaterial color="#ffb347" emissive="#ff7b00" emissiveIntensity={3} /></mesh>;
      })}
    </group>
  );
}

function Dome({ radius, y, rise, children }: { radius: number; y: number; rise: number; children: React.ReactNode }) {
  const g = useBowl(() => new SphereGeometry(radius, 96, 24, 0, Math.PI * 2, 0, Math.PI / 2), [radius]);
  return <mesh geometry={g} position={[0, y, 0]} scale={[1, rise, 1]}>{children}</mesh>;
}

// ── The scene ───────────────────────────────────────────────────────────────

/** Where the stands begin: the field and its surround fit inside, corners and all. */
const INNER = 2.9;
/** The wall between the field and the first row. */
const PODIUM = 0.12;

function Scene({ facilities: f, fill, color, name, teamName, logo, look: chosen, hour }: StadiumProps & { hour: number }) {
  const look = chosen ?? DEFAULT_LOOK;
  const sky = skyFor(hour);
  const tiers = useMemo(() => {
    const out: { inner: number; height: number; base: number }[] = [];
    let inner = INNER, base = PODIUM;
    for (let i = 0; i < 1 + Math.min(3, f.stadium); i++) {
      const height = 0.55 + 0.12 * f.seating + (i === 0 ? 0.1 : 0);
      out.push({ inner, height, base });
      inner += height * 0.9 + 0.05; base += height + 0.08;
    }
    return out;
  }, [f.stadium, f.seating]);
  const outer = tiers.at(-1)!.inner + tiers.at(-1)!.height * 0.9;
  const top = tiers.at(-1)!.base + tiers.at(-1)!.height;
  const plaza = outer + 1.4;
  const ring = plaza + 0.2;
  const lots = useMemo(() => lotsFor(f.parking, ring), [f.parking, ring]);
  const pond = { x: -(ring + 8) * OVAL * 0.7, z: ring + 5, r: 2.6 };
  const [seatA, seatB] = seatColors(look, color);

  return (
    <group>
      <color attach="background" args={[sky.sky]} />
      <fog attach="fog" args={[sky.sky, 30, 62]} />
      <hemisphereLight args={['#ffffff', '#4a6b3c', sky.ambient]} />
      <directionalLight position={sky.sun} intensity={sky.sunIntensity} color={sky.sunColor} castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} />
      {sky.night > 0.4 && <Stars radius={80} depth={30} count={2500} factor={3} fade speed={0.4} />}

      <mesh rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[70, 64]} /><meshStandardMaterial color="#5f8a4c" /></mesh>
      <BowlFlat outer={plaza} y={0.004}><meshStandardMaterial color="#d5cfc2" /></BowlFlat>
      <mesh rotation-x={-Math.PI / 2} position={[pond.x, 0.01, pond.z]}><circleGeometry args={[pond.r, 48]} /><meshStandardMaterial color="#4f8fb8" roughness={0.15} metalness={0.2} /></mesh>

      <BowlFlat outer={INNER + 0.02} y={0.008}><meshStandardMaterial color={APRON} roughness={0.95} /></BowlFlat>
      <BowlBand top={INNER} bottom={INNER} height={PODIUM} y={PODIUM / 2}><meshStandardMaterial color="#1d2733" side={DoubleSide} roughness={0.7} /></BowlBand>
      <BowlBand top={INNER - 0.005} bottom={INNER - 0.005} height={0.025} y={PODIUM - 0.02}><meshStandardMaterial color={color} side={DoubleSide} /></BowlBand>
      <Gridiron look={look} color={color} team={teamName || name} logo={logo} />
      {tiers.map((t, i) => (
        <Rise key={`${f.stadium}-${f.seating}-${i}`} delay={i * 0.12}><Tier {...t} color={i % 2 ? seatB : seatA} /></Rise>
      ))}
      <Crowd key={`${f.stadium}-${f.seating}`} tiers={tiers} fill={fill} color={color} />
      <Rise key={`ext-${f.stadium}`}><Exterior outer={outer} top={top} look={look} color={color} night={sky.night} canopy={f.stadium === 2} /></Rise>
      {f.suites > 0 && tiers.length > 1 && (
        <Rise key={`s${f.suites}`}>
          <BowlBand top={tiers[1].inner + 0.02} bottom={tiers[1].inner + 0.02} height={0.12 + 0.05 * f.suites} y={tiers[1].base - 0.04}>
            <meshPhysicalMaterial color="#9fd4ff" transparent opacity={0.55} roughness={0.05} side={DoubleSide} emissive="#3a7bd5" emissiveIntensity={0.35 + sky.night} />
          </BowlBand>
        </Rise>
      )}
      {f.stadium >= 3 && (
        <Rise key="dome" delay={0.3}>
          <Dome radius={outer + 0.05} y={top} rise={f.stadium >= 4 ? 0.42 : 0.32}>
            <meshPhysicalMaterial color="#e9f2ff" transparent opacity={f.stadium >= 4 ? 0.28 : 0.38} roughness={0.15} side={DoubleSide} emissive="#ffe7b0" emissiveIntensity={sky.night * 0.3} />
          </Dome>
        </Rise>
      )}
      <LightTowers radius={outer + 0.5} height={top + 1.4} on={sky.lightsOn} />
      {/* With the lights on, the bowl glows. */}
      {sky.lightsOn && <pointLight position={[0, top + 2.5, 0]} intensity={6 + sky.night * 10} distance={14} color="#fff1cf" />}
      {f.videoboard > 0 && <Rise key={`v${f.videoboard}`}><VideoBoard level={f.videoboard} radius={outer} height={top} color={color} /></Rise>}

      {/* Concessions and restrooms line the plaza; the store sits by the west gate. */}
      <Rise key={`c${f.concessions}`}>
        <Boxes items={Array.from({ length: f.concessions * 6 }, (_, i) => {
          const a = (i / Math.max(1, f.concessions * 6)) * Math.PI * 2 + 0.2;
          const [x, z] = around(a, outer + 0.75);
          return { x, y: 0.14, z, ry: -a, c: i % 2 ? '#e4572e' : color };
        })} size={[0.3, 0.28, 0.22]} />
      </Rise>
      <Rise key={`r${f.restrooms}`}>
        <Boxes items={Array.from({ length: f.restrooms * 4 }, (_, i) => {
          const a = (i / Math.max(1, f.restrooms * 4)) * Math.PI * 2 + 0.6;
          const [x, z] = around(a, outer + 1.05);
          return { x, y: 0.12, z, ry: -a };
        })} size={[0.24, 0.24, 0.24]} color="#4a90d9" />
      </Rise>
      {f.store > 0 && (
        <Rise key={`st${f.store}`}>
          <group position={[-(outer + 0.95) * OVAL, 0, 0.9]}>
            <mesh position={[0, 0.18 * f.store, 0]} castShadow><boxGeometry args={[0.7 + 0.25 * f.store, 0.36 * f.store, 0.6]} /><meshStandardMaterial color="#f7f3ec" /></mesh>
            <mesh position={[0.36 + 0.13 * f.store, 0.22 * f.store, 0]}><boxGeometry args={[0.02, 0.16, 0.45]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4 + sky.night} /></mesh>
          </group>
        </Rise>
      )}

      <People radius={outer + 0.2} fill={fill} color={color} />
      <Roads ring={ring} lots={lots} />
      {lots.map((l, i) => <Rise key={`lot${i}`} delay={i * 0.1}><ParkingLot lot={l} paved={f.parking >= 2} fill={fill} seed={13 + i} /></Rise>)}
      {f.parking >= 3 && <Rise key="garage"><Garage ring={ring} /></Rise>}
      {f.parking >= 4 && <Rise key="transit"><Transit ring={ring} /></Rise>}
      <Trees ring={ring} lots={lots} pond={pond} />
      <Skyline night={sky.night} />
      {f.atmosphere >= 3 && <Pyro radius={outer} />}
    </group>
  );
}

function webglOk(): boolean {
  try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export default function Stadium3D(props: StadiumProps) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [ok, setOk] = useState<boolean | null>(null);
  const hour = useLocalHour(props.hour);
  useEffect(() => { setOk(webglOk()); }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '100px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={box} className="h-full w-full">
      {ok === false ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-sky-200 to-emerald-200 text-center dark:from-slate-800 dark:to-emerald-950">
          <p className="px-6 text-sm font-semibold text-foreground/70">{props.name}: the 3D view needs WebGL, which this browser has turned off.</p>
        </div>
      ) : ok ? (
        <Canvas shadows dpr={[1, 2]} frameloop={visible ? 'always' : 'never'} camera={{ position: [19, 7, 19], fov: 38 }}>
          <Scene {...props} hour={hour} />
          <OrbitControls autoRotate autoRotateSpeed={0.4} enablePan={false} minDistance={9} maxDistance={42} maxPolarAngle={Math.PI / 2.15} target={[0, 0.8, 0]} />
        </Canvas>
      ) : null}
    </div>
  );
}
