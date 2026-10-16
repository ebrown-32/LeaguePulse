'use client';

/**
 * A franchise's stadium in 3D: the style its manager picked, built out to what
 * the franchise has bought (lib/franchise/stadiumBlueprint turns the two into
 * stands, roofs, boards and lights), dressed in the manager's look
 * (lib/franchise/model, StadiumLook), and set in the world at the visitor's
 * own time of day.
 *
 *   The stands   decks of stepped seats in the chosen seat colors, the crowd
 *                filled to the last game's attendance and doing the wave
 *   The building a facade in the chosen material, columns, gates and flags;
 *                the style's own roof (a canopy, a dome, pitched roofs, a
 *                floating roof that opens and closes), its berm and colonnade
 *   The upgrades suites, a press box, boards and ribbon boards, light towers
 *                or roof lights, concessions, restrooms and the store
 *   The grounds  the plaza, roads, parking and the setting (Grounds)
 *   The sky      sun, light and color from the local hour; at night the
 *                stadium lights come on in the chosen color, and the stars
 *
 * Everything is made from primitives (no model files), repeated things are
 * instanced, and nothing renders while off screen.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import {
  BoxGeometry, CanvasTexture, Color, DoubleSide, InstancedBufferAttribute, MeshStandardMaterial, Object3D, SphereGeometry, SRGBColorSpace, Vector3,
  type Group, type InstancedMesh, type Mesh,
} from 'three';
import type { Facilities } from '@/lib/tycoon/catalog';
import { normalizeLook, type StadiumLook } from '@/lib/franchise/model';
import {
  blueprint, outerOf, PODIUM, roofClosed, seatsFilled, seatSpots, topOf, OVAL, TAU, type Blueprint, type Board, type Stand,
} from '@/lib/franchise/stadiumBlueprint';
import { fieldColors, Gridiron, inkOn } from './Gridiron';
import { Grounds, GROUND } from './Grounds';
import { bendToOutline, deckProfile, deckStrip } from './stadiumGeometry';
import { along, Boxes, Ribbon, Rise, luminance, mix, rng, type Item } from './stadiumParts';

export interface StadiumProps {
  facilities: Facilities; fill: number; color: string; name: string;
  /** Painted in the end zones and at midfield; the stadium's name otherwise. */
  teamName?: string;
  /** The team's logo for midfield, same-origin (see Gridiron). */
  logo?: string | null;
  look?: Partial<StadiumLook> | null;
  /** Hour of day, 0 to 24; the visitor's clock when left out. */
  hour?: number;
  /** Where the camera starts and looks, and whether it holds still (for a picture) rather than circling. */
  view?: { position: [number, number, number]; target?: [number, number, number]; fov?: number; still?: boolean };
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
    ambient: 0.35 + Math.max(0, elevation) * 0.75,
    lightsOn: night > 0.35 || golden > 0.6,
  };
}

// ── Colors ──────────────────────────────────────────────────────────────────

const FACADE: Record<StadiumLook['facade'], { wall: string; trim: string; metal: number; rough: number; glass?: boolean }> = {
  concrete: { wall: '#cfcac0', trim: '#9e978a', metal: 0, rough: 0.9 },
  brick: { wall: '#9c4a32', trim: '#e6dccb', metal: 0, rough: 0.95 },
  // Kept matte: with nothing in the scene to reflect, any real metalness renders near black.
  glass: { wall: '#8cc2e3', trim: '#d8e4ec', metal: 0.05, rough: 0.15, glass: true },
  steel: { wall: '#a3adb7', trim: '#d3d9de', metal: 0.05, rough: 0.5 },
  stone: { wall: '#d8ccb2', trim: '#b5a586', metal: 0, rough: 0.92 },
};

const LIGHT: Record<Exclude<StadiumLook['lights'], 'team'>, string> = { warm: '#fff1cf', white: '#eef5ff' };

interface Palette {
  team: string; accent: string; trim: string; light: string;
  seat: (a: number, deck: number) => Color;
  crowd: Color[];
}

function palette(look: StadiumLook, team: string): Palette {
  const accent = look.accent ?? (luminance(team) > 0.6 ? '#1b1d21' : '#f4f4f2');
  const c = (hex: string) => new Color(hex);
  const A = c(mix(team, '#9aa0a6', 0.2)), B = c(mix(team, '#ffffff', 0.22)), X = c(mix(accent, '#9aa0a6', 0.15));
  const blue = c('#3d6fa8'), gray = c('#8d939b'), dark = c('#2f3338'), dark2 = c('#3a3f45');
  const section = (a: number) => Math.floor((((a % TAU) + TAU) % TAU) / (TAU / 36)) % 2;
  const seat = (a: number, deck: number) => {
    if (look.seats === 'split') return section(a) ? X : A;
    if (look.seats === 'classic') return deck === 0 ? blue : gray;
    if (look.seats === 'mono') return deck % 2 ? dark2 : dark;
    return deck % 2 ? B : A;
  };
  const crowd = {
    mixed: [team, team, mix(team, '#ffffff', 0.55), accent, '#f2f2f2', '#2b2b2b'],
    colorout: [team, team, team, mix(team, '#000000', 0.25), accent],
    whiteout: ['#f6f6f4', '#f6f6f4', '#e9e9e6', '#ffffff', team],
    blackout: ['#1b1c1e', '#232427', '#2b2c30', '#1b1c1e', team],
  }[look.crowd].map(c);
  return { team, accent, trim: FACADE[look.facade].trim, light: look.lights === 'team' ? mix(team, '#ffffff', 0.25) : LIGHT[look.lights], seat, crowd };
}

// ── The stands ──────────────────────────────────────────────────────────────

const CONCOURSE = new Color('#9d998f'), CAP = new Color('#8d877c');

function Stands({ bp, p, fascia, wall }: { bp: Blueprint; p: Palette; fascia: string; wall: string }) {
  const fasciaColor = useMemo(() => new Color(fascia), [fascia]);
  const capColor = useMemo(() => new Color(wall), [wall]);
  return (
    <group>
      {bp.stands.map(s => {
        const count = s.decks((s.from + s.to) / 2).length;
        return Array.from({ length: count }, (_, d) => (
          <Ribbon key={`${s.id}${d}`} o={bp.outline} from={s.from} to={s.to} cast
            profile={a => deckProfile(s.decks(a)[d], s.rows)}
            k={`${bp.style}${s.id}${d}${s.decks(s.from)[d]?.height}${s.decks(s.from)[d]?.floor}${fascia}${wall}${p.seat(0.1, d).getHexString()}${p.seat(0.3, d).getHexString()}`}
            opts={{
              caps: true,
              color: (a, k) => {
                const deck = s.decks(a)[d];
                switch (deckStrip(deck, k)) {
                  case 'tread': return p.seat(a, d);
                  case 'riser': return p.seat(a, d).clone().lerp(CAP, 0.55).multiplyScalar(0.8);
                  case 'concourse': return CONCOURSE;
                  case 'fascia': return fasciaColor;
                  default: return capColor;
                }
              },
            }}>
            <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.85} />
          </Ribbon>
        ));
      })}
    </group>
  );
}

/**
 * The crowd, one figure a seat sold: as full as the last game's attendance,
 * the best seats taken first (seatsFilled). The wave runs in the shader, so a
 * full house costs nothing extra.
 */
function Crowd({ bp, fill, colors }: { bp: Blueprint; fill: number; colors: Color[] }) {
  const spots = useMemo(() => seatSpots(bp), [bp]);
  const shown = useMemo(() => seatsFilled(bp, spots, Math.max(0.03, fill)), [bp, spots, fill]);
  const time = useMemo(() => ({ value: 0 }), []);
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ roughness: 0.7 });
    m.onBeforeCompile = shader => {
      shader.uniforms.uTime = time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAngle;\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += pow(max(0.0, cos(aAngle - uTime * 1.6)), 12.0) * 0.12;');
    };
    m.customProgramCacheKey = () => 'lp-crowd-wave';
    return m;
  }, [time]);
  const geometry = useMemo(() => {
    const g = new BoxGeometry(0.05, 0.09, 0.05);
    g.setAttribute('aAngle', new InstancedBufferAttribute(new Float32Array(shown.map(s => s.a)), 1));
    return g;
  }, [shown]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  const mesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const d = new Object3D(), r = rng(3);
    shown.forEach((s, i) => {
      d.position.set(s.x, s.y, s.z); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, colors[Math.floor(r() * colors.length)]);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [shown, colors]);
  useFrame(({ clock }) => { time.value = clock.elapsedTime; });
  if (!shown.length) return null;
  return <instancedMesh ref={mesh} args={[geometry, material, shown.length]} key={shown.length} />;
}

// ── The building ────────────────────────────────────────────────────────────

const outerAt = (s: Stand, a: number) => outerOf(s.decks(a));
const topAt = (s: Stand, a: number) => topOf(s.decks(a));

function Facades({ bp, look, p, night }: { bp: Blueprint; look: StadiumLook; p: Palette; night: number }) {
  const f = FACADE[look.facade];
  const o = bp.outline;
  const walled = bp.stands.filter(s => s.wallFrom !== null);
  const { columns, poles, flags } = useMemo(() => {
    const columns: Item[] = [], poles: Item[] = [], flags: Item[] = [];
    for (const s of walled) {
      const from = s.wallFrom ?? 0;
      for (const pt of along(o, s.from, s.to, a => outerAt(s, a) + 0.08, 0.42)) {
        const h = topAt(s, pt.a) - from;
        columns.push({ x: pt.x, y: from + h / 2, z: pt.z, ry: -pt.a, sy: h });
      }
      if (look.style === 'dome') continue;
      along(o, s.from, s.to, a => outerAt(s, a) + 0.02, 1.1).forEach((pt, i) => {
        const t = topAt(s, pt.a);
        poles.push({ x: pt.x, y: t + 0.22, z: pt.z });
        flags.push({ x: pt.x + Math.cos(pt.a) * 0.001, y: t + 0.37, z: pt.z, ry: -pt.a + Math.PI / 2, c: i % 2 ? p.accent : p.team });
      });
    }
    return { columns, poles, flags };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bp, look.style, p.team, p.accent]);
  const gates = useMemo(() => {
    if (bp.berm) return [];
    const out: { x: number; z: number; ry: number }[] = [];
    for (const s of walled) for (const a of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI, TAU]) {
      if (a < s.from + 0.1 || a > s.to - 0.1 || topAt(s, a) < 0.95 || (a === TAU && s.from < 0.1)) continue;
      const [x, z] = o.around(a, outerAt(s, a) + 0.2);
      out.push({ x, z, ry: -a + Math.PI / 2 });
    }
    return out;
  }, [bp, walled, o]);

  return (
    <group>
      {walled.map(s => (
        <group key={s.id}>
          <Ribbon o={o} from={s.from} to={s.to} cast k={`${bp.style}${s.id}${topAt(s, s.from)}${outerAt(s, s.from)}`}
            profile={a => [[outerAt(s, a) + 0.04, s.wallFrom ?? 0], [outerAt(s, a) + 0.04, topAt(s, a)]]}>
            {f.glass
              ? <meshPhysicalMaterial color={f.wall} metalness={f.metal} roughness={f.rough} transparent opacity={0.72} side={DoubleSide} emissive="#ffd99a" emissiveIntensity={night * 0.35} />
              : <meshStandardMaterial color={f.wall} metalness={f.metal} roughness={f.rough} side={DoubleSide} />}
          </Ribbon>
          {/* A lit band of windows near the top. */}
          <Ribbon o={o} from={s.from} to={s.to} k={`win${bp.style}${s.id}${topAt(s, s.from)}${outerAt(s, s.from)}`}
            profile={a => { const t = topAt(s, a), y = (s.wallFrom ?? 0) + (t - (s.wallFrom ?? 0)) * 0.76; return [[outerAt(s, a) + 0.05, y], [outerAt(s, a) + 0.05, y + 0.1]]; }}>
            <meshStandardMaterial color="#1e2a36" emissive="#ffd28a" emissiveIntensity={0.15 + night * 1.2} side={DoubleSide} />
          </Ribbon>
        </group>
      ))}
      <Boxes items={columns} size={[0.1, 1, 0.1]} color={f.trim} />
      <Boxes items={poles} size={[0.02, 0.44, 0.02]} color="#c9ced3" cast={false} />
      <Boxes items={flags} size={[0.22, 0.13, 0.01]} cast={false} />
      {gates.map((g, i) => (
        <group key={i} position={[g.x, 0, g.z]} rotation-y={g.ry}>
          <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[1.3, 0.9, 0.35]} /><meshStandardMaterial color={f.trim} /></mesh>
          <mesh position={[0, 0.32, 0.18]}><boxGeometry args={[0.7, 0.62, 0.02]} /><meshStandardMaterial color="#1b1d21" emissive="#ffe2a8" emissiveIntensity={night * 0.8} /></mesh>
          <mesh position={[0, 1.05, 0.18]}><boxGeometry args={[1.1, 0.28, 0.03]} /><meshStandardMaterial color={p.team} emissive={p.team} emissiveIntensity={0.25 + night * 0.6} /></mesh>
          <mesh position={[0, 1.05, 0.196]}><boxGeometry args={[1.1, 0.04, 0.005]} /><meshStandardMaterial color={p.accent} /></mesh>
        </group>
      ))}
    </group>
  );
}

function Suites({ bp, night }: { bp: Blueprint; night: number }) {
  return (
    <group>
      {bp.suites.map((su, i) => {
        const s = bp.stands.find(x => x.id === su.stand);
        if (!s) return null;
        return (
          <Ribbon key={i} o={bp.outline} from={Math.max(s.from, su.from)} to={Math.min(s.to, su.to)} k={`suite${bp.style}${i}${s.decks(su.from)[su.deck]?.base}`}
            profile={a => { const d = s.decks(a)[su.deck]; return [[d.inner - 0.012, (d.floor ?? d.base - 0.1) + 0.012], [d.inner - 0.012, d.base - 0.006]]; }}>
            <meshPhysicalMaterial color="#9fd4ff" transparent opacity={0.6} roughness={0.05} side={DoubleSide} emissive="#3a7bd5" emissiveIntensity={0.35 + night} />
          </Ribbon>
        );
      })}
    </group>
  );
}

function PressBox({ bp, p, night }: { bp: Blueprint; p: Palette; night: number }) {
  const pb = bp.pressBox, s = pb && bp.stands.find(x => x.id === pb.stand);
  if (!pb || !s) return null;
  const from = s.from + 0.12, to = s.to - 0.12, H = pb.height, o = bp.outline;
  const k = `pb${H}${topAt(s, from)}`;
  return (
    <group>
      <Ribbon o={o} from={from} to={to} k={k} profile={a => [[outerAt(s, a) - 0.42, topAt(s, a)], [outerAt(s, a) - 0.42, topAt(s, a) + H]]}>
        <meshPhysicalMaterial color="#a8d8ff" transparent opacity={0.65} roughness={0.05} side={DoubleSide} emissive="#ffd89a" emissiveIntensity={0.2 + night * 0.9} />
      </Ribbon>
      <Ribbon o={o} from={from} to={to} k={`${k}s`} cast profile={a => [[outerAt(s, a) - 0.48, topAt(s, a) + H], [outerAt(s, a) + 0.06, topAt(s, a) + H]]}>
        <meshStandardMaterial color={p.trim} side={DoubleSide} />
      </Ribbon>
      <Ribbon o={o} from={from} to={to} k={`${k}b`} profile={a => [[outerAt(s, a) + 0.04, topAt(s, a)], [outerAt(s, a) + 0.04, topAt(s, a) + H]]}>
        <meshStandardMaterial color={p.trim} side={DoubleSide} />
      </Ribbon>
    </group>
  );
}

// ── Roofs ───────────────────────────────────────────────────────────────────

function Canopy({ bp, span, p, lightsOn }: { bp: Blueprint; span: number; p: Palette; lightsOn: boolean }) {
  const s = bp.stands[0], o = bp.outline;
  const masts = useMemo(() => along(o, 0, TAU, a => outerAt(s, a) + 0.05, 1.5).map(pt => ({ x: pt.x, y: topAt(s, pt.a) + 0.2, z: pt.z })), [o, s]);
  const k = `canopy${span}${topAt(s, 0)}`;
  return (
    <group>
      <Ribbon o={o} k={k} cast profile={a => [[outerAt(s, a) + 0.06, topAt(s, a) + 0.3], [outerAt(s, a) - span, topAt(s, a) + 0.44]]}>
        <meshStandardMaterial color="#eef1f4" side={DoubleSide} transparent opacity={0.92} />
      </Ribbon>
      <Ribbon o={o} k={`${k}e`} profile={a => [[outerAt(s, a) - span, topAt(s, a) + 0.38], [outerAt(s, a) - span, topAt(s, a) + 0.46]]}>
        <meshStandardMaterial color={lightsOn ? p.light : p.trim} emissive={p.light} emissiveIntensity={lightsOn ? 2 : 0} side={DoubleSide} />
      </Ribbon>
      <Boxes items={masts} size={[0.06, 0.4, 0.06]} color="#c9ced3" />
    </group>
  );
}

function Dome({ bp, rise, p, night }: { bp: Blueprint; rise: number; p: Palette; night: number }) {
  const R = bp.footprint + 0.05;
  const shell = useMemo(() => bendToOutline(new SphereGeometry(R, 96, 24, 0, TAU, 0, Math.PI / 2), bp.outline), [R, bp.outline]);
  const ribs = useMemo(() => bendToOutline(new SphereGeometry(R + 0.01, 24, 7, 0, TAU, 0, Math.PI / 2), bp.outline), [R, bp.outline]);
  useEffect(() => () => { shell.dispose(); ribs.dispose(); }, [shell, ribs]);
  return (
    <group position={[0, bp.top, 0]} scale={[1, rise, 1]}>
      <mesh geometry={shell}>
        <meshPhysicalMaterial color="#e9f2ff" transparent opacity={0.3} roughness={0.15} side={DoubleSide} emissive={p.light} emissiveIntensity={night * 0.35} depthWrite={false} />
      </mesh>
      <mesh geometry={ribs}><meshBasicMaterial color={mix(p.trim, '#ffffff', 0.3)} wireframe transparent opacity={0.55} /></mesh>
    </group>
  );
}

function Gables({ bp, stands, lift, p, lightsOn }: { bp: Blueprint; stands: string[]; lift: number; p: Palette; lightsOn: boolean }) {
  const o = bp.outline;
  const roofColor = mix(p.team, '#2b2f33', 0.5);
  const { posts, masts, glows } = useMemo(() => {
    const posts: Item[] = [], glows: [number, number, number][] = [];
    const masts: { x: number; y: number; z: number; ry: number; h: number }[] = [];
    for (const id of stands) {
      const s = bp.stands.find(x => x.id === id);
      if (!s) continue;
      // Posts hold up the roof's front edge, from the top deck's concourse to the underside of the roof.
      for (const pt of along(o, s.from + 0.03, s.to - 0.03, a => s.decks(a).at(-1)!.inner - 0.1, 0.75)) {
        const last = s.decks(pt.a).at(-1)!, front = last.inner - 0.2, back = outerAt(s, pt.a) + 0.12, Y = topAt(s, pt.a) + lift;
        const under = Y + 0.3 - (0.3 * (last.inner - 0.1 - front)) / (back - front) - 0.02;
        const foot = last.floor ?? last.base;
        posts.push({ x: pt.x, y: (foot + under) / 2, z: pt.z, sy: under - foot });
      }
      // Floodlight masts rise from the back of the roof, three along each stand, their lamps tilted at the field.
      for (const f of [0.18, 0.5, 0.82]) {
        const a = s.from + (s.to - s.from) * f;
        const [x, z] = o.around(a, outerAt(s, a) + 0.05);
        masts.push({ x, z, y: topAt(s, a) + lift, ry: Math.atan2(-x, -z), h: 0.95 });
      }
      const mid = (s.from + s.to) / 2, [gx, gz] = o.around(mid, s.decks(mid)[0].inner);
      glows.push([gx, topAt(s, mid) + lift + 0.9, gz]);
    }
    return { posts, masts, glows };
  }, [bp, stands, lift, o]);
  const lamp = lightsOn ? p.light : '#000000';
  return (
    <group>
      {stands.map(id => {
        const s = bp.stands.find(x => x.id === id);
        if (!s) return null;
        return (
          <Ribbon key={id} o={o} from={s.from - 0.02} to={s.to + 0.02} cast k={`gable${id}${lift}${topAt(s, s.from)}`} opts={{ caps: false }}
            profile={a => { const last = s.decks(a).at(-1)!, Y = topAt(s, a) + lift; return [[last.inner - 0.2, Y + 0.3], [outerAt(s, a) + 0.12, Y]]; }}>
            <meshStandardMaterial color={roofColor} side={DoubleSide} roughness={0.7} />
          </Ribbon>
        );
      })}
      <Boxes items={posts} size={[0.05, 1, 0.05]} color="#d9dcdf" />
      {masts.map((m, i) => (
        <group key={i} position={[m.x, m.y, m.z]} rotation-y={m.ry}>
          <mesh position={[0, m.h / 2, 0]} castShadow><cylinderGeometry args={[0.025, 0.035, m.h, 8]} /><meshStandardMaterial color="#9aa1a8" roughness={0.5} /></mesh>
          {/* The bank: a frame of lamps in two rows, aimed down at the field. */}
          <group position={[0, m.h, 0.04]} rotation-x={0.42}>
            <mesh castShadow><boxGeometry args={[0.66, 0.3, 0.05]} /><meshStandardMaterial color="#3a3f45" roughness={0.6} /></mesh>
            {[-0.24, -0.08, 0.08, 0.24].flatMap(x => [-0.065, 0.065].map(y => (
              <mesh key={`${x}${y}`} position={[x, y, 0.028]}>
                <planeGeometry args={[0.12, 0.1]} />
                <meshStandardMaterial color="#fffbe6" emissive={lamp} emissiveIntensity={lightsOn ? 2.4 : 0} />
              </mesh>
            )))}
          </group>
        </group>
      ))}
      {lightsOn && glows.map((g, i) => <pointLight key={i} position={g} intensity={6} distance={13} color={p.light} />)}
    </group>
  );
}

/** A roof over every seat, open over the field; panels slide over the opening when it closes. */
function Membrane({ bp, moving, closed, p, lightsOn }: { bp: Blueprint; moving: boolean; closed: boolean; p: Palette; lightsOn: boolean }) {
  const s = bp.stands[0], o = bp.outline;
  const Y = bp.top + 0.6, edge = bp.inner + 0.35;
  const X = edge * OVAL, Z = edge;
  const left = useRef<Group>(null), right = useRef<Group>(null);
  useFrame((_, dt) => {
    const want = closed ? X / 2 : X / 2 + X * 0.92;
    for (const [g, side] of [[left.current, -1], [right.current, 1]] as const) {
      if (g) g.position.x += (side * want - g.position.x) * Math.min(1, dt * 1.6);
    }
  });
  const k = `mem${Y}${edge}${topAt(s, 0)}`;
  // Steel ribs from the back of the stands out to the roof's edge.
  const ribs = useMemo(() => along(o, 0, TAU, a => outerAt(s, a), 0.75).map(pt => {
    const [bx, bz] = o.around(pt.a, outerAt(s, pt.a) + 0.1), [ex, ez] = o.around(pt.a, edge);
    const back = new Vector3(bx, topAt(s, pt.a) + 0.33, bz), front = new Vector3(ex, Y + 0.03, ez), d = new Object3D();
    d.position.copy(back).add(front).multiplyScalar(0.5); d.lookAt(front);
    return { position: d.position.toArray() as [number, number, number], quaternion: d.quaternion.toArray() as [number, number, number, number], length: back.distanceTo(front) };
  }), [o, s, edge, Y]);
  return (
    <group>
      <Ribbon o={o} k={k} cast profile={a => [[outerAt(s, a) + 0.1, topAt(s, a) + 0.3], [edge, Y]]}>
        <meshStandardMaterial color="#f2f4f6" side={DoubleSide} transparent opacity={0.62} roughness={0.4} depthWrite={false} />
      </Ribbon>
      {ribs.map((r, i) => (
        <mesh key={i} position={r.position} quaternion={r.quaternion} castShadow>
          <boxGeometry args={[0.04, 0.05, r.length]} /><meshStandardMaterial color="#c9ced3" roughness={0.5} />
        </mesh>
      ))}
      <Ribbon o={o} k={`${k}e`} profile={() => [[edge, Y - 0.08], [edge, Y]]}>
        <meshStandardMaterial color={lightsOn ? p.light : p.trim} emissive={p.light} emissiveIntensity={lightsOn ? 2.2 : 0} side={DoubleSide} />
      </Ribbon>
      {moving && (
        <group>
          {[-1, 1].map(z => <mesh key={z} position={[0, Y + 0.07, z * (Z + 0.12)]} castShadow><boxGeometry args={[X * 4.1, 0.1, 0.08]} /><meshStandardMaterial color="#c9ced3" /></mesh>)}
          {[left, right].map((ref, i) => (
            <group key={i} ref={ref} position={[(i ? 1 : -1) * X / 2, Y + 0.04, 0]}>
              <mesh castShadow><boxGeometry args={[X, 0.04, 2 * Z + 0.2]} /><meshStandardMaterial color="#e7eef4" transparent opacity={0.82} roughness={0.2} /></mesh>
              {[-0.3, 0, 0.3].map(f => <mesh key={f} position={[f * X, 0.03, 0]}><boxGeometry args={[0.05, 0.03, 2 * Z + 0.2]} /><meshStandardMaterial color="#aeb5bc" /></mesh>)}
            </group>
          ))}
        </group>
      )}
    </group>
  );
}

// ── Coliseum pieces ─────────────────────────────────────────────────────────

function Berm({ bp, setting }: { bp: Blueprint; setting: StadiumLook['setting'] }) {
  const b = bp.berm!;
  return (
    <Ribbon o={bp.outline} k={`berm${b.r}${b.h}`} profile={() => [[b.r - 0.02, b.h], [b.r + 0.12, b.h], [b.r + b.run, 0.004]]}>
      <meshStandardMaterial color={mix(GROUND[setting].grass, '#2f4a25', 0.15)} roughness={1} side={DoubleSide} />
    </Ribbon>
  );
}

/** The colonnade's stone, to go with the facade. */
const stoneOf = (look: StadiumLook) => (look.facade === 'brick' ? '#b9654a' : look.facade === 'glass' || look.facade === 'steel' ? '#d6dadf' : '#e3d7bd');

function Colonnade({ bp, look, p }: { bp: Blueprint; look: StadiumLook; p: Palette }) {
  const c = bp.colonnade!, o = bp.outline;
  const stone = stoneOf(look);
  const columns = useMemo(() => along(o, c.from, c.to, () => c.r, 0.3).map(pt => ({ x: pt.x, y: c.base + c.h / 2, z: pt.z, sy: c.h })), [o, c]);
  const k = `col${c.r}${c.h}${c.base}`;
  const [ax, az] = o.around(0, c.r);
  return (
    <group>
      <Ribbon o={o} from={c.from - 0.02} to={c.to + 0.02} k={`${k}p`} cast opts={{ caps: true }}
        profile={() => [[c.r - 0.18, c.base], [c.r + 0.18, c.base]]}>
        <meshStandardMaterial color={stone} side={DoubleSide} />
      </Ribbon>
      <Boxes items={columns} size={[0.11, 1, 0.11]} color={stone} />
      <Ribbon o={o} from={c.from - 0.02} to={c.to + 0.02} k={`${k}b`} cast opts={{ caps: true }}
        profile={() => [[c.r - 0.13, c.base + c.h], [c.r - 0.13, c.base + c.h + 0.22], [c.r + 0.13, c.base + c.h + 0.22], [c.r + 0.13, c.base + c.h]]}>
        <meshStandardMaterial color={stone} side={DoubleSide} />
      </Ribbon>
      <Ribbon o={o} from={c.from} to={c.to} k={`${k}s`} profile={() => [[c.r - 0.135, c.base + c.h + 0.05], [c.r - 0.135, c.base + c.h + 0.15]]}>
        <meshStandardMaterial color={p.team} side={DoubleSide} />
      </Ribbon>
      {/* The great arch at the center. */}
      <mesh position={[ax, c.base + c.h - 0.02, az]} rotation-y={Math.PI / 2}>
        <torusGeometry args={[c.h * 0.36, 0.08, 8, 24, Math.PI]} />
        <meshStandardMaterial color={stone} />
      </mesh>
    </group>
  );
}

function Torch({ at }: { at: [number, number, number] }) {
  const flame = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    flame.current?.scale.set(1 + Math.sin(t * 9) * 0.08, 1 + Math.sin(t * 13) * 0.18, 1 + Math.cos(t * 11) * 0.08);
  });
  return (
    <group position={at}>
      <mesh><cylinderGeometry args={[0.16, 0.07, 0.16, 16]} /><meshStandardMaterial color="#8c6a3a" metalness={0.4} roughness={0.5} /></mesh>
      <mesh ref={flame} position={[0, 0.24, 0]}><coneGeometry args={[0.12, 0.38, 10]} /><meshStandardMaterial color="#ffb347" emissive="#ff7b00" emissiveIntensity={3} transparent opacity={0.9} /></mesh>
      <pointLight position={[0, 0.4, 0]} intensity={2.5} distance={7} color="#ff9a3c" />
    </group>
  );
}

// ── Boards and lights ───────────────────────────────────────────────────────

/** What the screens show: the team's name on its colors. */
function useScreen(team: string, accent: string, text: string) {
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 200;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, mix(team, '#ffffff', 0.12)); grad.addColorStop(1, mix(team, '#000000', 0.35));
    g.fillStyle = grad; g.fillRect(0, 0, 512, 200);
    g.fillStyle = accent; g.fillRect(0, 168, 512, 10); g.fillRect(0, 22, 512, 4);
    const word = text.toUpperCase();
    let size = 92;
    g.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    const w = g.measureText(word).width;
    if (w > 470) { size *= 470 / w; g.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`; }
    g.fillStyle = inkOn(team); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(word, 256, 100);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [team, accent, text]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

/**
 * The video boards, each held up the way its blueprint says (posts, a tower,
 * a truss on the stands, cables from the roof, stone piers on the colonnade)
 * and framed in its style's own way. Their backs carry the team's name too,
 * for everyone outside.
 */
function Boards({ bp, p, text, look }: { bp: Blueprint; p: Palette; text: string; look: StadiumLook }) {
  const screen = useScreen(p.team, p.accent, text);
  const mats = useRef<MeshStandardMaterial[]>([]);
  useFrame(({ clock }) => { for (const m of mats.current) if (m) m.emissiveIntensity = 0.85 + Math.sin(clock.elapsedTime * 2.4) * 0.2; });
  const wall = FACADE[look.facade].wall, stone = stoneOf(look);
  const FRAME: Record<Board['frame'], string> = { steel: '#2a2e33', team: mix(p.team, '#15181c', 0.35), classic: '#1f3b2d', glass: '#e4e9ee', stone };
  const steel = <meshStandardMaterial color="#8d949b" roughness={0.5} />;
  let n = 0;
  const face = (w: number, h: number, z: number, ry = 0, key?: string, dim = false) => {
    const i = n++;
    return (
      <mesh key={key} position={[Math.sin(ry) * z, 0, Math.cos(ry) * z]} rotation-y={ry}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial ref={m => { if (m && !dim) mats.current[i] = m; }} map={screen} emissiveMap={screen} emissive="#ffffff" emissiveIntensity={dim ? 0.35 : 0.9} />
      </mesh>
    );
  };

  /** What holds a board up. */
  const mount = (b: Board) => {
    const { w, h, reach } = b, below = -h / 2 - reach / 2;
    switch (b.mount) {
      case 'posts':
        return [-0.3, 0.3].map(x => (
          <group key={x}>
            <mesh position={[x * w, below, -0.04]} castShadow><boxGeometry args={[0.1, reach, 0.1]} /><meshStandardMaterial color="#5c6168" roughness={0.6} /></mesh>
            <mesh position={[x * w, -h / 2 - reach + 0.04, -0.04]}><boxGeometry args={[0.22, 0.08, 0.22]} /><meshStandardMaterial color="#b7b1a6" /></mesh>
          </group>
        ));
      case 'tower':
        return (
          <group>
            <mesh position={[0, below, -0.18]} castShadow><boxGeometry args={[w * 0.55, reach, 0.5]} /><meshStandardMaterial color={wall} /></mesh>
            <mesh position={[0, below, 0.075]}><boxGeometry args={[0.08, reach * 0.9, 0.02]} /><meshStandardMaterial color={p.team} /></mesh>
          </group>
        );
      case 'truss':
        // Two legs down onto the stands, a beam under the board and braces between.
        return (
          <group position={[0, 0, -0.08]}>
            {[-0.32, 0.32].map(x => <mesh key={x} position={[x * w, below, 0]} castShadow><boxGeometry args={[0.06, reach, 0.06]} />{steel}</mesh>)}
            <mesh position={[0, -h / 2 - 0.03, 0]}><boxGeometry args={[w * 0.8, 0.05, 0.06]} />{steel}</mesh>
            {[-1, 1].map(sx => (
              <mesh key={sx} position={[sx * w * 0.16, below, 0]} rotation-z={sx * Math.atan2(w * 0.32, reach)}>
                <boxGeometry args={[0.03, Math.hypot(w * 0.32, reach), 0.03]} />{steel}
              </mesh>
            ))}
          </group>
        );
      case 'cables':
        return [-0.35, 0.35].map(x => <mesh key={x} position={[x * w, h / 2 + reach / 2, 0]}><cylinderGeometry args={[0.008, 0.008, reach, 4]} /><meshStandardMaterial color="#555" /></mesh>);
      case 'piers':
        return [-0.42, 0.42].map(x => <mesh key={x} position={[x * w, below, -0.02]} castShadow><boxGeometry args={[0.14, reach, 0.16]} /><meshStandardMaterial color={stone} /></mesh>);
    }
  };

  const one = (b: Board, i: number) => {
    const { w, h } = b;
    if (b.kind === 'cube') {
      return (
        <group key={i} position={[b.x, b.y, b.z]}>
          <mesh><boxGeometry args={[w + 0.08, h + 0.08, w + 0.08]} /><meshStandardMaterial color="#1b1d21" /></mesh>
          {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((ry, j) => face(w, h, w / 2 + 0.045, ry, `f${j}`))}
          {/* A ring of team color under it, and the cables up to the crown. */}
          <mesh position={[0, -h / 2 - 0.06, 0]}><boxGeometry args={[w * 0.8, 0.08, w * 0.8]} /><meshStandardMaterial color={p.team} emissive={p.team} emissiveIntensity={0.6} /></mesh>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], j) => (
            <mesh key={j} position={[x * w * 0.35, h / 2 + b.reach / 2, z * w * 0.35]}><cylinderGeometry args={[0.008, 0.008, b.reach, 4]} /><meshStandardMaterial color="#555" /></mesh>
          ))}
        </group>
      );
    }
    if (b.kind === 'scoreboard') {
      // An old-school board: amber scores, a name plate, a little pitched roof and a clock on top.
      const roof = mix(p.team, '#2b2f33', 0.5);
      return (
        <group key={i} position={[b.x, b.y, b.z]} rotation-y={b.ry}>
          {mount(b)}
          <mesh castShadow><boxGeometry args={[w, h, 0.14]} /><meshStandardMaterial color={FRAME.classic} /></mesh>
          {[-0.26, 0.26].map(x => (
            <mesh key={x} position={[x * w, -0.04 * h, 0.075]}><planeGeometry args={[w * 0.3, h * 0.42]} /><meshStandardMaterial color="#2a1a05" emissive="#ffb43a" emissiveIntensity={1.1} /></mesh>
          ))}
          <mesh position={[0, h * 0.32, 0.075]}><planeGeometry args={[w * 0.7, h * 0.18]} /><meshStandardMaterial color={p.team} emissive={p.team} emissiveIntensity={0.4} /></mesh>
          {[-1, 1].map(sz => (
            <mesh key={sz} position={[0, h / 2 + 0.07, sz * 0.07]} rotation-x={sz * 0.6} castShadow><boxGeometry args={[w + 0.16, 0.03, 0.2]} /><meshStandardMaterial color={roof} /></mesh>
          ))}
          <mesh position={[0, h / 2 + 0.32, 0]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.13, 0.13, 0.05, 20]} /><meshStandardMaterial color="#f4f1e8" /></mesh>
          <mesh position={[0, h / 2 + 0.17, 0]}><boxGeometry args={[0.04, 0.12, 0.04]} /><meshStandardMaterial color="#5c6168" /></mesh>
        </group>
      );
    }
    const pad = b.frame === 'glass' ? 0.05 : b.frame === 'stone' ? 0.28 : 0.12;
    const depth = b.frame === 'stone' ? 0.16 : 0.12;
    return (
      <group key={i} position={[b.x, b.y, b.z]} rotation-y={b.ry}>
        {mount(b)}
        <mesh castShadow><boxGeometry args={[w + pad, h + pad, depth]} /><meshStandardMaterial color={FRAME[b.frame]} roughness={b.frame === 'glass' ? 0.2 : 0.7} /></mesh>
        {b.frame === 'team' && <mesh position={[0, h / 2 + pad / 2 + 0.02, 0]}><boxGeometry args={[w + pad, 0.04, 0.13]} /><meshStandardMaterial color={p.accent} /></mesh>}
        {b.frame === 'stone' && <mesh position={[0, h / 2 + pad / 2 + 0.03, 0]}><boxGeometry args={[w + pad + 0.14, 0.06, 0.24]} /><meshStandardMaterial color={stone} /></mesh>}
        {/* The screen sits just proud of its frame, which is deeper in stone than in steel. */}
        {face(w, h, depth / 2 + 0.005)}
        {face(w * 0.9, h * 0.9, depth / 2 + 0.005, Math.PI, undefined, true)}
      </group>
    );
  };
  return <group>{bp.boards.map(one)}</group>;
}

function LightTowers({ at, color, on }: { at: [number, number, number][]; color: string; on: boolean }) {
  return (
    <>
      {at.map(([x, z, h]) => (
        <group key={`${x}${z}`} position={[x, 0, z]} rotation-y={Math.atan2(-x, -z)}>
          <mesh position={[0, h / 2, 0]} castShadow><cylinderGeometry args={[0.04, 0.06, h, 8]} /><meshStandardMaterial color="#9aa1a8" metalness={0.6} roughness={0.4} /></mesh>
          <mesh position={[0, h, 0]}><boxGeometry args={[0.45, 0.25, 0.08]} /><meshStandardMaterial color="#fffbe6" emissive={on ? color : '#000000'} emissiveIntensity={on ? 2 : 0} /></mesh>
          {on && <pointLight position={[0, h, 0]} intensity={3} distance={12} color={color} />}
        </group>
      ))}
    </>
  );
}

/** People strolling the plaza: more of them the bigger the crowd. */
function People({ bp, fill, colors }: { bp: Blueprint; fill: number; colors: Color[] }) {
  const mesh = useRef<InstancedMesh>(null);
  const radius = bp.footprint + 0.2, o = bp.outline;
  const folk = useMemo(() => {
    const r = rng(41);
    const n = Math.round(40 + fill * 120);
    return Array.from({ length: n }, () => ({ a: r() * TAU, d: radius + 0.2 + r() * 0.9, speed: (r() - 0.5) * 0.12, c: colors[Math.floor(r() * colors.length)] }));
  }, [radius, fill, colors]);
  const dummy = useMemo(() => new Object3D(), []);
  useEffect(() => {
    const m = mesh.current; if (!m) return;
    folk.forEach((f, i) => m.setColorAt(i, f.c));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [folk]);
  useFrame(({ clock }) => {
    const m = mesh.current; if (!m) return;
    const t = clock.elapsedTime;
    folk.forEach((f, i) => {
      const [x, z] = o.around(f.a + t * f.speed, f.d);
      dummy.position.set(x, 0.09 + Math.abs(Math.sin(t * 6 + i)) * 0.01, z);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[undefined, undefined, folk.length]} key={folk.length}><capsuleGeometry args={[0.035, 0.1, 3, 6]} /><meshStandardMaterial roughness={0.8} /></instancedMesh>;
}

function Pyro({ bp }: { bp: Blueprint }) {
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
        const [x, z] = bp.outline.around((i / 8) * TAU, bp.inner + 0.3);
        return <mesh key={i} position={[x, 0.5, z]}><sphereGeometry args={[0.06, 8, 8]} /><meshStandardMaterial color="#ffb347" emissive="#ff7b00" emissiveIntensity={3} /></mesh>;
      })}
    </group>
  );
}

// ── The scene ───────────────────────────────────────────────────────────────

function Scene({ facilities: f, fill, color, name, teamName, logo, look: chosen, hour }: StadiumProps & { hour: number }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const look = useMemo(() => normalizeLook(chosen), [JSON.stringify(chosen ?? null)]);
  const sky = skyFor(hour);
  const bp = useMemo(() => blueprint(look.style, f), [look.style, f]);
  const p = useMemo(() => palette(look, color), [look, color]);
  const o = bp.outline;
  const team = teamName || name;
  const build = `${look.style}-${f.stadium}-${f.seating}-${f.suites}`;
  const apron = fieldColors(look, color).apron;
  const closed = roofClosed(look.roof, sky.night);
  const indoors = bp.roof?.kind === 'dome' || (bp.roof?.kind === 'membrane' && bp.roof.moving && closed);
  const lightsOn = sky.lightsOn || indoors;
  const fascia = look.style === 'cantilever' ? mix(color, '#1b1d21', 0.2) : p.trim;
  const plaza = bp.footprint;

  // A fragment, not a group: the sky color and the fog attach to their parent, and only the scene draws them.
  return (
    <>
      <color attach="background" args={[sky.sky]} />
      <fog attach="fog" args={[sky.sky, 30, 66]} />
      <hemisphereLight args={['#ffffff', mix(GROUND[look.setting].grass, '#b9b4a8', 0.45), sky.ambient]} />
      <directionalLight position={sky.sun} intensity={sky.sunIntensity} color={sky.sunColor} castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} />
      {sky.night > 0.4 && <Stars radius={80} depth={30} count={2500} factor={3} fade speed={0.4} />}

      <Grounds o={o} footprint={bp.footprint} parking={f.parking} fill={fill} night={sky.night} setting={look.setting} />

      {/* The floor of the bowl, the wall around the field with a stripe, and the field. */}
      <Ribbon o={o} k={`floor${bp.inner}${apron}`} profile={() => [[0, 0.008], [bp.inner + 0.02, 0.008]]}><meshStandardMaterial color={apron} roughness={0.95} /></Ribbon>
      <Ribbon o={o} k={`podium${bp.inner}`} profile={() => [[bp.inner, 0], [bp.inner, PODIUM]]}><meshStandardMaterial color="#1d2733" side={DoubleSide} roughness={0.7} /></Ribbon>
      <Ribbon o={o} k={`stripe${bp.inner}`} profile={() => [[bp.inner - 0.005, PODIUM - 0.025], [bp.inner - 0.005, PODIUM - 0.005]]}><meshStandardMaterial color={p.team} side={DoubleSide} /></Ribbon>
      {bp.ribbon && (
        <Ribbon o={o} k={`ribbon${bp.inner}`} profile={() => [[bp.inner - 0.006, 0.02], [bp.inner - 0.006, PODIUM - 0.035]]}>
          <meshStandardMaterial color={p.team} emissive={p.team} emissiveIntensity={0.9} side={DoubleSide} />
        </Ribbon>
      )}
      <Gridiron look={look} color={color} team={team} logo={logo} />

      {bp.berm && <Berm bp={bp} setting={look.setting} />}
      <Rise key={build}><Stands bp={bp} p={p} fascia={fascia} wall={FACADE[look.facade].wall} /></Rise>
      <Crowd key={`crowd${build}`} bp={bp} fill={fill} colors={p.crowd} />
      <Rise key={`ext${build}`} delay={0.1}><Facades bp={bp} look={look} p={p} night={sky.night} /></Rise>
      {bp.suites.length > 0 && <Rise key={`s${build}`}><Suites bp={bp} night={sky.night} /></Rise>}
      {bp.pressBox && <Rise key={`pb${build}`}><PressBox bp={bp} p={p} night={sky.night} /></Rise>}
      {bp.colonnade && <Rise key={`col${build}`} delay={0.2}><Colonnade bp={bp} look={look} p={p} /></Rise>}
      {bp.torch && <Torch at={bp.torch} />}

      {bp.roof?.kind === 'canopy' && <Rise key={`roof${build}`} delay={0.3}><Canopy bp={bp} span={bp.roof.span} p={p} lightsOn={lightsOn} /></Rise>}
      {bp.roof?.kind === 'dome' && <Rise key={`roof${build}`} delay={0.3}><Dome bp={bp} rise={bp.roof.rise} p={p} night={sky.night} /></Rise>}
      {bp.roof?.kind === 'gable' && <Rise key={`roof${build}`} delay={0.3}><Gables bp={bp} stands={bp.roof.stands} lift={bp.roof.lift} p={p} lightsOn={lightsOn} /></Rise>}
      {bp.roof?.kind === 'membrane' && <Rise key={`roof${build}`} delay={0.3}><Membrane bp={bp} moving={bp.roof.moving} closed={closed} p={p} lightsOn={lightsOn} /></Rise>}

      {bp.boards.length > 0 && <Rise key={`b${build}-${f.videoboard}`}><Boards bp={bp} p={p} text={look.endZoneText || team} look={look} /></Rise>}
      <LightTowers at={bp.towers} color={p.light} on={lightsOn} />
      {/* With the lights on, the bowl glows. */}
      {lightsOn && <pointLight position={[0, indoors ? bp.top * 0.85 : bp.top + 2.5, 0]} intensity={6 + sky.night * 10} distance={14} color={p.light} />}

      {/* Concessions and restrooms line the plaza; the store sits by the west gate. */}
      <Rise key={`c${f.concessions}${build}`}>
        <Boxes items={Array.from({ length: f.concessions * 6 }, (_, i) => {
          const a = (i / Math.max(1, f.concessions * 6)) * TAU + 0.2;
          const [x, z] = o.around(a, plaza + 0.75);
          return { x, y: 0.14, z, ry: -a, c: i % 2 ? p.accent : color };
        })} size={[0.3, 0.28, 0.22]} />
      </Rise>
      <Rise key={`r${f.restrooms}${build}`}>
        <Boxes items={Array.from({ length: f.restrooms * 4 }, (_, i) => {
          const a = (i / Math.max(1, f.restrooms * 4)) * TAU + 0.6;
          const [x, z] = o.around(a, plaza + 1.05);
          return { x, y: 0.12, z, ry: -a };
        })} size={[0.24, 0.24, 0.24]} color="#4a90d9" />
      </Rise>
      {f.store > 0 && (
        <Rise key={`st${f.store}${build}`}>
          <group position={[-(plaza + 0.95) * OVAL, 0, 0.9]}>
            <mesh position={[0, 0.18 * f.store, 0]} castShadow><boxGeometry args={[0.7 + 0.25 * f.store, 0.36 * f.store, 0.6]} /><meshStandardMaterial color="#f7f3ec" /></mesh>
            <mesh position={[0.36 + 0.13 * f.store, 0.22 * f.store, 0]}><boxGeometry args={[0.02, 0.16, 0.45]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4 + sky.night} /></mesh>
          </group>
        </Rise>
      )}
      <People bp={bp} fill={fill} colors={p.crowd} />
      {f.atmosphere >= 3 && <Pyro bp={bp} />}
    </>
  );
}

/** Whether the browser can draw WebGL; the test context is released at once, so it never counts against the browser's limit. */
function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch { return false; }
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
        <Canvas shadows dpr={[1, 2]} frameloop={visible ? 'always' : 'never'} camera={{ position: props.view?.position ?? [19, 7, 19], fov: props.view?.fov ?? 38 }}>
          <Scene {...props} hour={hour} />
          <OrbitControls autoRotate={!props.view?.still} autoRotateSpeed={0.4} enablePan={false} minDistance={props.view ? 3 : 9} maxDistance={42} maxPolarAngle={Math.PI / 2.15} target={props.view?.target ?? [0, 0.8, 0]} />
        </Canvas>
      ) : null}
    </div>
  );
}
