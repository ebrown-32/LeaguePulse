'use client';

/**
 * Everything outside the stadium: the plaza, the ring road and the avenues,
 * parking lots laid out in stalls and filled to the crowd, a garage and a
 * transit line when built, and the setting the manager picked:
 *
 *   city        trees and a skyline on the horizon, lit at dusk
 *   park        lawns, lots of trees, rolling hills and houses
 *   waterfront  a bay along the far side with boats, the city across it
 *   mountains   pines, and peaks with snow on them
 *   desert      sand, cacti and red mesas
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { OVAL, type Outline } from '@/lib/franchise/stadiumBlueprint';
import type { StadiumLook } from '@/lib/franchise/model';
import { Boxes, Instanced, Ribbon, Rise, mix, rng, type Item } from './stadiumParts';

type Setting = StadiumLook['setting'];

export const GROUND: Record<Setting, { grass: string; plaza: string }> = {
  city: { grass: '#5f8a4c', plaza: '#d5cfc2' },
  park: { grass: '#6a9a50', plaza: '#dcd6c6' },
  waterfront: { grass: '#5f8a4c', plaza: '#d9d4c9' },
  mountains: { grass: '#587f48', plaza: '#cfcabe' },
  desert: { grass: '#cdb383', plaza: '#e2d3b3' },
};

/** Autumn and winter show in the trees. */
function treePalette(): string[] {
  const m = new Date().getMonth();
  if (m >= 8 && m <= 10) return ['#3f7d32', '#c46a1c', '#d99b2b', '#a63f1f', '#5d8a2e'];
  if (m === 11 || m <= 1) return ['#2f5d34', '#3a6b3d', '#7a6a55'];
  return ['#3f7d32', '#4f8f3a', '#2f6b2a', '#5d9a3e'];
}

interface Lot { x: number; z: number; w: number; d: number }

/** Where lots go, in the order they are built: north, south, then east and west. */
function lotsFor(level: number, ring: number): Lot[] {
  const at = ring + 2.8;
  return [
    { x: 0, z: -at, w: 9, d: 3.2 },
    { x: 0, z: at, w: 9, d: 3.2 },
    { x: at * OVAL + 0.6, z: 0, w: 3.2, d: 7 },
    { x: -(at * OVAL + 0.6), z: 0, w: 3.2, d: 7 },
  ].slice(0, Math.min(4, level + 1));
}

/** A lot: asphalt (gravel while small), painted stalls in pairs of rows facing an aisle, cars in them. */
function ParkingLot({ lot, paved, fill, seed }: { lot: Lot; paved: boolean; fill: number; seed: number }) {
  const { lines, cars, cabins } = useMemo(() => {
    const r = rng(seed);
    const long = lot.w >= lot.d;
    const length = long ? lot.w : lot.d, depth = long ? lot.d : lot.w;
    const sw = 0.34, sd = 0.6, aisle = 0.55;
    const perRow = Math.floor((length - 0.4) / sw);
    const pairs = Math.max(1, Math.floor((depth - 0.2) / (2 * sd + aisle)));
    const stalls: { x: number; z: number }[] = [];
    for (let p = 0; p < pairs; p++) {
      const band = -depth / 2 + 0.2 + p * (2 * sd + aisle);
      for (const row of [band + sd / 2, band + sd * 1.5 + aisle]) {
        for (let i = 0; i < perRow; i++) {
          const a = -length / 2 + 0.2 + sw / 2 + i * sw;
          stalls.push(long ? { x: lot.x + a, z: lot.z + row } : { x: lot.x + row, z: lot.z + a });
        }
      }
    }
    const palette = ['#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#2980b9', '#f1c40f', '#1e1e1e', '#16a085', '#8e44ad'];
    const lines = stalls.map(s => ({ x: s.x + (long ? sw / 2 : 0), y: 0.012, z: s.z + (long ? 0 : sw / 2), ry: long ? 0 : Math.PI / 2 }));
    const parked = stalls.filter(() => r() < Math.min(0.97, 0.15 + fill * 0.9));
    const cars = parked.map(s => ({ x: s.x, y: 0.06, z: s.z, ry: long ? Math.PI / 2 : 0, c: palette[Math.floor(r() * palette.length)] }));
    const cabins = cars.map(c => ({ ...c, y: 0.14, c: '#1d2733' }));
    return { lines, cars, cabins };
  }, [lot, fill, seed]);
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

const ASPHALT = '#3b3f44';

function Roads({ o, ring, lots, north }: { o: Outline; ring: number; lots: Lot[]; north: boolean }) {
  return (
    <group>
      <Ribbon o={o} profile={() => [[ring, 0.006], [ring + 0.7, 0.006]]} k={`road${ring}`}><meshStandardMaterial color={ASPHALT} roughness={0.95} /></Ribbon>
      {/* Avenues out to the edge of town, past the lots. */}
      {north && <mesh rotation-x={-Math.PI / 2} position={[0, 0.007, -(ring + 16)]} receiveShadow><planeGeometry args={[0.8, 30]} /><meshStandardMaterial color={ASPHALT} /></mesh>}
      <mesh rotation-x={-Math.PI / 2} position={[ring * OVAL + 16, 0.007, 0]} receiveShadow><planeGeometry args={[30, 0.8]} /><meshStandardMaterial color={ASPHALT} /></mesh>
      {north && <Boxes items={Array.from({ length: 14 }, (_, i) => ({ x: 0, y: 0.01, z: -(ring + 2 + i * 2) }))} size={[0.05, 0.002, 0.8]} color="#e8c547" cast={false} />}
      {lots.map((l, i) => {
        // A short drive from the ring road to each lot.
        const a = Math.atan2(l.z, l.x), len = Math.hypot(l.x, l.z) - ring - 0.4, mid = ring + 0.35 + len / 2;
        return (
          <mesh key={i} rotation-x={-Math.PI / 2} rotation-z={-a} position={[Math.cos(a) * mid * (Math.abs(Math.cos(a)) > 0.5 ? OVAL : 1), 0.007, Math.sin(a) * mid]}>
            <planeGeometry args={[Math.max(0.5, len), 0.6]} /><meshStandardMaterial color={ASPHALT} />
          </mesh>
        );
      })}
    </group>
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
      {[-0.12, 0.12].map(off => <mesh key={off} position={[0, 0.12, z + off]}><boxGeometry args={[40, 0.03, 0.04]} /><meshStandardMaterial color="#b9b9b9" metalness={0.7} /></mesh>)}
      <mesh position={[2, 0.4, z - 0.6]} castShadow><boxGeometry args={[3, 0.6, 0.6]} /><meshStandardMaterial color="#e8e8e8" /></mesh>
      <mesh position={[2, 0.75, z - 0.6]}><boxGeometry args={[3.3, 0.06, 0.9]} /><meshStandardMaterial color="#c0392b" /></mesh>
    </group>
  );
}

/** Where the bay starts on the waterfront: past the north lot. */
const shoreOf = (ring: number) => -(ring + 5.4);

/** Trees, or cacti in the desert, kept off the roads, lots, pond and water. */
function Greenery({ o, ring, lots, pond, setting }: { o: Outline; ring: number; lots: Lot[]; pond: { x: number; z: number; r: number } | null; setting: Setting }) {
  const { trunks, crowns, cones, cacti, arms } = useMemo(() => {
    const r = rng(77);
    const colors = treePalette();
    const trunks: Item[] = [], crowns: Item[] = [], cones: Item[] = [], cacti: Item[] = [], arms: Item[] = [];
    const want = { city: 220, park: 340, waterfront: 180, mountains: 300, desert: 90 }[setting];
    const pine = setting === 'mountains' ? 0.8 : 0.35;
    const blocked = (x: number, z: number) =>
      o.reach(x, z) < ring + 1.4
      || Math.abs(x) < 0.9 && z < 0
      || Math.abs(z) < 0.9 && x > 0
      || lots.some(l => Math.abs(x - l.x) < l.w / 2 + 0.6 && Math.abs(z - l.z) < l.d / 2 + 0.6)
      || (pond !== null && Math.hypot(x - pond.x, z - pond.z) < pond.r + 0.6)
      || (setting === 'waterfront' && z < shoreOf(ring) + 0.6)
      || Math.abs(z - (ring + 6.5)) < 1 && lots.length >= 4;
    for (let tries = 0; trunks.length + cacti.length < want && tries < 4000; tries++) {
      const a = r() * Math.PI * 2, d = ring + 3 + r() * 20;
      const x = Math.cos(a) * d * OVAL * 0.9, z = Math.sin(a) * d;
      if (blocked(x, z)) continue;
      const s = 0.7 + r() * 0.7;
      if (setting === 'desert') {
        cacti.push({ x, y: 0.3 * s, z, sy: s, c: '#5f8a4a' });
        if (r() < 0.7) arms.push({ x: x + 0.1 * s, y: 0.36 * s, z, sy: s * 0.5, c: '#5f8a4a' }, { x: x - 0.1 * s, y: 0.3 * s, z, sy: s * 0.4, c: '#5f8a4a' });
        continue;
      }
      trunks.push({ x, y: 0.2 * s, z, sy: s });
      if (r() < pine) {
        const snow = setting === 'mountains' && r() < 0.25;
        cones.push({ x, y: 0.75 * s, z, sx: s, sy: s, sz: s, c: snow ? '#dfe7ea' : '#2f5d34' });
      } else crowns.push({ x, y: 0.6 * s, z, sx: s, sy: s * 0.9, sz: s, c: colors[Math.floor(r() * colors.length)] });
    }
    return { trunks, crowns, cones, cacti, arms };
  }, [o, ring, lots, pond, setting]);
  return (
    <group>
      <Boxes items={trunks} size={[0.08, 0.4, 0.08]} color="#6b4a2f" />
      <Instanced items={crowns} roughness={0.9} flat><icosahedronGeometry args={[0.35, 1]} /></Instanced>
      <Instanced items={cones} roughness={0.9} flat><coneGeometry args={[0.3, 0.9, 7]} /></Instanced>
      <Instanced items={cacti} roughness={0.9}><capsuleGeometry args={[0.06, 0.5, 3, 8]} /></Instanced>
      <Instanced items={arms} roughness={0.9}><capsuleGeometry args={[0.04, 0.22, 3, 6]} /></Instanced>
    </group>
  );
}

/** A skyline on the far horizon; its windows come on at dusk. */
function Skyline({ night, distance = 34 }: { night: number; distance?: number }) {
  const items = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 44 }, (_, i) => {
      const a = Math.PI * 1.05 + (i / 44) * Math.PI * 0.9 + (r() - 0.5) * 0.04;
      const d = distance + r() * 6, h = 1.5 + r() * r() * 9;
      return { x: Math.cos(a) * d, y: h / 2, z: Math.sin(a) * d, sy: h, sx: 1 + r() * 1.6, sz: 1 + r(), c: mix('#5b6573', '#8a95a3', r()) };
    });
  }, [distance]);
  return <Boxes items={items} size={[1, 1, 1]} emissive="#ffcf7a" emissiveIntensity={night * 0.28} cast={false} />;
}

/** Peaks on the far horizon, snow on the tall ones. */
function Mountains() {
  const { peaks, caps } = useMemo(() => {
    const r = rng(19);
    const peaks: Item[] = [], caps: Item[] = [];
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * 0.95 + (i / 16) * Math.PI * 1.1 + (r() - 0.5) * 0.1;
      const d = 44 + r() * 10, h = 7 + r() * 11, w = 6 + r() * 6;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      peaks.push({ x, y: h / 2, z, sx: w, sy: h, sz: w, c: mix('#4d5c58', '#6d7a72', r()) });
      // A little proud of the slope: drawn exactly on it, the cap and the peak fight over the same pixels and flicker.
      const cap = h * 0.24;
      if (h > 10) caps.push({ x, y: h - cap / 2 + h * 0.012, z, sx: w * 0.24 * 1.12, sy: cap, sz: w * 0.24 * 1.12, c: '#eef3f5' });
    }
    return { peaks, caps };
  }, []);
  return (
    <group>
      <Instanced items={peaks} cast={false} roughness={1} flat><coneGeometry args={[1, 1, 7]} /></Instanced>
      <Instanced items={caps} cast={false} roughness={0.8} flat><coneGeometry args={[1, 1, 7]} /></Instanced>
    </group>
  );
}

/** Red mesas on the far horizon. */
function Mesas() {
  const items = useMemo(() => {
    const r = rng(29);
    return Array.from({ length: 10 }, (_, i) => {
      const a = Math.PI * 0.95 + (i / 10) * Math.PI * 1.1 + (r() - 0.5) * 0.12;
      const d = 52 + r() * 10, h = 1.6 + r() * 3, w = 4 + r() * 6;
      return { x: Math.cos(a) * d, y: h / 2, z: Math.sin(a) * d, sx: w, sy: h, sz: w * (0.5 + r() * 0.4), ry: r() * Math.PI, c: mix('#b0623b', '#c98a5a', r()) };
    });
  }, []);
  // Flat tops over sloping sides.
  return <Instanced items={items} cast={false} roughness={1} flat><cylinderGeometry args={[0.72, 1, 1, 7]} /></Instanced>;
}

/** Hills and a scatter of houses with pitched roofs. */
function Suburbs({ ring, night }: { ring: number; night: number }) {
  const { hills, houses, roofs } = useMemo(() => {
    const r = rng(31);
    const hills: Item[] = Array.from({ length: 9 }, (_, i) => {
      const a = Math.PI * 0.95 + (i / 9) * Math.PI * 1.1;
      const d = 46 + r() * 8, w = 14 + r() * 10;
      return { x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, sx: w, sy: 3 + r() * 3, sz: w * 0.7, c: mix('#5d8c47', '#7aa65a', r()) };
    });
    const houses: Item[] = [], roofs: Item[] = [];
    for (let tries = 0; houses.length < 70 && tries < 600; tries++) {
      const a = r() * Math.PI * 2, d = ring + 14 + r() * 14;
      const x = Math.cos(a) * d * OVAL * 0.9, z = Math.sin(a) * d;
      if (Math.abs(x) < 1.2 || Math.abs(z) < 1.2) continue;
      const ry = r() * Math.PI;
      houses.push({ x, y: 0.22, z, ry, c: mix('#e8e1d3', '#c9b79c', r()) });
      roofs.push({ x, y: 0.56, z, ry: ry + Math.PI / 4, c: mix('#7a3b2e', '#4b4f57', r()) });
    }
    return { hills, houses, roofs };
  }, [ring]);
  return (
    <group>
      <Instanced items={hills} cast={false} roughness={1}><sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></Instanced>
      <Boxes items={houses} size={[0.6, 0.44, 0.5]} emissive="#ffd79a" emissiveIntensity={night * 0.25} />
      <Instanced items={roofs}><coneGeometry args={[0.48, 0.26, 4]} /></Instanced>
    </group>
  );
}

/** The bay: water past the north lot, a beach, and boats bobbing on it. */
function Bay({ ring, night }: { ring: number; night: number }) {
  const shore = shoreOf(ring);
  const boats = useRef<Group>(null);
  const fleet = useMemo(() => {
    const r = rng(53);
    return Array.from({ length: 9 }, () => ({ x: (r() - 0.5) * 50, z: shore - 4 - r() * 18, ry: r() * Math.PI, s: 0.7 + r() * 0.8 }));
  }, [shore]);
  useFrame(({ clock }) => {
    boats.current?.children.forEach((b, i) => { b.position.y = 0.05 + Math.sin(clock.elapsedTime * 1.3 + i) * 0.03; });
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, shore - 40]}><planeGeometry args={[150, 80]} /><meshStandardMaterial color={mix('#3f7fa6', '#14243a', night)} roughness={0.12} metalness={0.25} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, shore + 0.3]}><planeGeometry args={[150, 0.9]} /><meshStandardMaterial color="#e3d3a6" /></mesh>
      <group ref={boats}>
        {fleet.map((b, i) => (
          <group key={i} position={[b.x, 0.05, b.z]} rotation-y={b.ry} scale={b.s}>
            <mesh castShadow><boxGeometry args={[0.9, 0.14, 0.3]} /><meshStandardMaterial color="#f4f4f2" /></mesh>
            <mesh position={[-0.1, 0.14, 0]}><boxGeometry args={[0.35, 0.14, 0.22]} /><meshStandardMaterial color="#d9dee3" emissive="#ffd79a" emissiveIntensity={night * 0.8} /></mesh>
            {i % 2 === 0 && <mesh position={[0.15, 0.45, 0]}><coneGeometry args={[0.18, 0.6, 3]} /><meshStandardMaterial color="#fafafa" /></mesh>}
          </group>
        ))}
      </group>
    </group>
  );
}

export function Grounds({ o, footprint, parking, fill, night, setting }: {
  o: Outline; footprint: number; parking: number; fill: number; night: number; setting: Setting;
}) {
  const plaza = footprint + 1.4;
  const ring = plaza + 0.2;
  const lots = useMemo(() => lotsFor(parking, ring), [parking, ring]);
  const pond = useMemo(() => (setting === 'desert' || setting === 'waterfront' ? null : { x: -(ring + 8) * OVAL * 0.7, z: ring + 5, r: 2.6 }), [ring, setting]);
  const ground = GROUND[setting];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[70, 64]} /><meshStandardMaterial color={ground.grass} /></mesh>
      <Ribbon o={o} profile={() => [[0, 0.004], [plaza, 0.004]]} k={`plaza${plaza}`}><meshStandardMaterial color={ground.plaza} /></Ribbon>
      {pond && <mesh rotation-x={-Math.PI / 2} position={[pond.x, 0.01, pond.z]}><circleGeometry args={[pond.r, 48]} /><meshStandardMaterial color="#4f8fb8" roughness={0.15} metalness={0.2} /></mesh>}
      <Roads o={o} ring={ring} lots={lots} north={setting !== 'waterfront'} />
      {lots.map((l, i) => <Rise key={`lot${i}`} delay={i * 0.1}><ParkingLot lot={l} paved={parking >= 2} fill={fill} seed={13 + i} /></Rise>)}
      {parking >= 3 && <Rise key="garage"><Garage ring={ring} /></Rise>}
      {parking >= 4 && <Rise key="transit"><Transit ring={ring} /></Rise>}
      <Greenery o={o} ring={ring} lots={lots} pond={pond} setting={setting} />
      {setting === 'city' && <Skyline night={night} />}
      {setting === 'waterfront' && <><Bay ring={ring} night={night} /><Skyline night={night} distance={44} /></>}
      {setting === 'park' && <Suburbs ring={ring} night={night} />}
      {setting === 'mountains' && <Mountains />}
      {setting === 'desert' && <Mesas />}
    </group>
  );
}
