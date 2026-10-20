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
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor, Stars } from '@react-three/drei';
import LiveField, { type LiveScene } from './LiveField';
import {
  BoxGeometry, CanvasTexture, Color, DoubleSide, Plane, type Material, InstancedBufferAttribute, MeshStandardMaterial, Object3D, SphereGeometry, SRGBColorSpace, Vector3,
  type Group, type InstancedMesh, type Matrix4, type Mesh,
} from 'three';
import type { Facilities } from '@/lib/tycoon/catalog';
import { normalizeLook, type StadiumLook } from '@/lib/franchise/model';
import { accentOf, FACADE, stadiumColors } from '@/lib/franchise/stadiumColors';
import {
  blueprint, outerOf, PODIUM, roofClosed, seatsFilled, seatSpots, topOf, OVAL, TAU, type Blueprint, type Board, type Stand,
} from '@/lib/franchise/stadiumBlueprint';
import { fieldColors, Gridiron, inkOn, type FieldScene } from './Gridiron';
import { Grounds, GROUND } from './Grounds';
import { HAZE } from './campusLook';
import { detectQuality, type Quality } from './quality';
import { bendToOutline, deckProfile, deckStrip } from './stadiumGeometry';
import { along, Boxes, Instanced, mat, Placed, Ribbon, Rise, mix, rng, type Item } from './stadiumParts';

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
  view?: {
    position: [number, number, number]; target?: [number, number, number]; fov?: number; still?: boolean;
    /**
     * Watching the field (a live matchup): nothing may stand between the camera and the field, so
     * whatever is nearer than the field's nearest corner (near stands, a roof, a dome) is cut away,
     * from any angle. Changing the view glides the camera there.
     */
    broadcast?: boolean;
    /** Seconds a change of view takes to glide there (the broadcast view; 1.1 by default). */
    glide?: number;
  };
  /**
   * How full the lots and the plaza are, 0 to 1, when it differs from the stands:
   * on game day the tailgates fill up hours before the seats do (see lib/franchise/venue).
   */
  lots?: number;
  /** The visiting team's color, worn by a share of the crowd and by its players. */
  visitors?: string;
  /** What's on the field (see Gridiron). */
  field?: FieldScene;
  /**
   * For a photograph rather than a view: the picture kept after each frame so it can be
   * read back (see components/desk/StadiumPhoto), full quality, and nothing that adapts.
   */
  photo?: boolean;
  /**
   * Frames a second to draw while on screen, 60 by default (a 120Hz screen would otherwise draw
   * twice as many, for no difference anyone sees). A small preview passes fewer; touching or
   * dragging the stadium always gets 60.
   */
  fps?: number;
  /**
   * A fantasy matchup, live (see LiveField): the score on the boards, the starters on the field
   * where their drives really are, the rest on the sidelines.
   */
  live?: LiveScene | null;
  /** Called once the stadium has drawn its first frames, for a loader to step aside. */
  onReady?: () => void;
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
  // Deeper overhead: blue by day, violet at dusk, near black at night.
  const zenith = elevation > 0 ? mix('#3d7fc7', '#5b5f9e', golden) : mix('#5b5f9e', '#050a1e', Math.min(1, -elevation * 4));
  return {
    sky, zenith, night,
    sun: [Math.cos(angle) * 30, Math.max(2, elevation * 30), -12] as [number, number, number],
    sunColor: mix('#ffffff', '#ffb070', golden),
    sunIntensity: Math.max(0, elevation) * 1.7 + 0.08,
    ambient: 0.35 + Math.max(0, elevation) * 0.75,
    // On while the sun is low: from late afternoon, well before sunset, until after sunrise.
    lightsOn: elevation < 0.35,
  };
}

// ── Colors ──────────────────────────────────────────────────────────────────

interface Palette {
  team: string; accent: string; trim: string; light: string;
  /** The manager's paint over each part's own color (lib/franchise/stadiumColors). */
  wall: string; roof: string | null; steel: string; podium: string; boards: string | null;
  seat: (a: number, deck: number) => Color;
  crowd: Color[];
}

function palette(look: StadiumLook, team: string): Palette {
  const k = stadiumColors(look, team), accent = accentOf(look, team);
  const c = (hex: string) => new Color(hex);
  const A = c(k.seats), B = c(k.seats2);
  const section = (a: number) => Math.floor((((a % TAU) + TAU) % TAU) / (TAU / 36)) % 2;
  // Fading up the decks: a few steps from the first color to the second.
  const fade = [0, 1, 2, 3].map(d => c(mix(k.seats, k.seats2, d / 3)));
  const seat = (a: number, deck: number) => {
    switch (look.seats) {
      case 'split': return section(a) ? B : A;
      case 'checker': return (section(a) + deck) % 2 ? B : A;
      case 'ombre': return fade[Math.min(3, deck)];
      case 'classic': return deck === 0 ? A : B;
      default: return deck % 2 ? B : A;
    }
  };
  // The crowd in the team's colors, or in the shirt color the manager picked.
  const shirt = k.crowd;
  const crowd = {
    mixed: [shirt, shirt, mix(shirt, '#ffffff', 0.55), accent, '#f2f2f2', '#2b2b2b'],
    colorout: [shirt, shirt, shirt, mix(shirt, '#000000', 0.25), accent],
    whiteout: ['#f6f6f4', '#f6f6f4', '#e9e9e6', '#ffffff', shirt],
    blackout: ['#1b1c1e', '#232427', '#2b2c30', '#1b1c1e', shirt],
  }[look.crowd].map(c);
  const painted = look.colors ?? {};
  return {
    team, accent, trim: k.trim, light: k.lights, seat, crowd,
    wall: k.walls, roof: painted.roof ?? null, steel: k.steel, podium: k.podium, boards: painted.boards ?? null,
  };
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
/**
 * The crowd's moods, one after another, each held for a stretch and crossfaded into the next:
 * the wave going round the bowl, towels swinging overhead, everyone jumping (out of step, as a
 * real crowd does), and settled, swaying a little. A big play overrides the lot: the whole
 * place jumps and swings its towels.
 */
const MOODS = ['wave', 'towels', 'jump', 'settled'] as const;
const MOOD_SECONDS = 9;

/** How much of each mood is on at time t: a smooth crossfade between stretches. */
function moodWeights(t: number, cheer: boolean) {
  if (cheer) return { wave: 0, towels: 1, jump: 1, settled: 0 };
  const seg = Math.floor(t / MOOD_SECONDS), k = (t % MOOD_SECONDS) / MOOD_SECONDS;
  // A shuffled order, the same for everyone watching at the same moment.
  const pick = (n: number) => MOODS[Math.floor(Math.abs(Math.sin(n * 12.9898) * 43758.5453) % MOODS.length)];
  const now = pick(seg), next = pick(seg + 1);
  const fade = Math.max(0, Math.min(1, (k - 0.88) / 0.12));
  const w = { wave: 0, towels: 0, jump: 0, settled: 0 };
  w[now] += 1 - fade; w[next] += fade;
  return w;
}

const CROWD_VERTEX = `
  float bob = 0.0;
  bob += pow(max(0.0, cos(aAngle - uTime * 1.6)), 12.0) * 0.12 * uWave;
  bob += abs(sin(uTime * 7.0 + aPhase * 6.2831)) * 0.07 * uJump * step(0.25, aPhase);
  bob += sin(uTime * 1.2 + aPhase * 6.2831) * 0.006 * uSettled;
  bob += sin(uTime * 5.0 + aPhase * 6.2831) * 0.012 * uTowels;
  transformed.y += bob;
`;

function Crowd({ bp, fill, colors, towel = '#ffffff', cheer = false }: { bp: Blueprint; fill: number; colors: Color[]; towel?: string; cheer?: boolean }) {
  // A game-day preview can have the stands truly empty; otherwise a stadium always shows a few fans.
  const spots = useMemo(() => seatSpots(bp), [bp]);
  const shown = useMemo(() => seatsFilled(bp, spots, fill), [bp, spots, fill]);
  const u = useMemo(() => ({ uTime: { value: 0 }, uWave: { value: 1 }, uTowels: { value: 0 }, uJump: { value: 0 }, uSettled: { value: 0 } }), []);
  const cheerRef = useRef(cheer);
  cheerRef.current = cheer;
  const head = `#include <common>\nattribute float aAngle;\nattribute float aPhase;\nuniform float uTime;\nuniform float uWave;\nuniform float uTowels;\nuniform float uJump;\nuniform float uSettled;`;
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ roughness: 0.7 });
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', head).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + CROWD_VERTEX);
    };
    m.customProgramCacheKey = () => 'lp-crowd-moods';
    return m;
  }, [u]); // eslint-disable-line react-hooks/exhaustive-deps
  // The towels: a small cloth over each fan's head, swung side to side, shown only in towel mood.
  const towelMaterial = useMemo(() => {
    const m = new MeshStandardMaterial({ color: towel, roughness: 0.8, side: DoubleSide });
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', head).replace('#include <begin_vertex>', `#include <begin_vertex>
        ${CROWD_VERTEX}
        float swing = sin(uTime * 9.0 + aPhase * 6.2831);
        transformed.x += swing * 0.035 * position.y * 12.0;
        transformed *= step(0.35, aPhase) * uTowels;
      `);
    };
    m.customProgramCacheKey = () => 'lp-crowd-towels';
    return m;
  }, [u, towel]); // eslint-disable-line react-hooks/exhaustive-deps
  const attrs = useMemo(() => {
    const r = rng(11);
    return {
      angle: new InstancedBufferAttribute(new Float32Array(shown.map(s => s.a)), 1),
      phase: new InstancedBufferAttribute(new Float32Array(shown.map(() => r())), 1),
    };
  }, [shown]);
  const geometry = useMemo(() => {
    const g = new BoxGeometry(0.05, 0.09, 0.05);
    g.setAttribute('aAngle', attrs.angle); g.setAttribute('aPhase', attrs.phase);
    return g;
  }, [attrs]);
  const towelGeometry = useMemo(() => {
    // Above the head; its own origin at the fan's hands so it swings from there.
    const g = new BoxGeometry(0.045, 0.035, 0.004).translate(0, 0.075, 0);
    g.setAttribute('aAngle', attrs.angle); g.setAttribute('aPhase', attrs.phase);
    return g;
  }, [attrs]);
  useEffect(() => () => { geometry.dispose(); towelGeometry.dispose(); }, [geometry, towelGeometry]);
  useEffect(() => () => { material.dispose(); towelMaterial.dispose(); }, [material, towelMaterial]);
  const mesh = useRef<InstancedMesh>(null);
  const towels = useRef<InstancedMesh>(null);
  useEffect(() => {
    const d = new Object3D(), r = rng(3);
    for (const m of [mesh.current, towels.current]) {
      if (!m) continue;
      shown.forEach((s, i) => {
        d.position.set(s.x, s.y, s.z); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
        if (m === mesh.current) m.setColorAt(i, colors[Math.floor(r() * colors.length)]);
      });
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere(); // its bounds from where the pieces now are, or it can be culled while in view
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }, [shown, colors]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    u.uTime.value = t;
    const w = moodWeights(t, cheerRef.current);
    // Eased toward the target, so a big play builds rather than snaps.
    const ease = (cur: number, to: number) => cur + (to - cur) * 0.06;
    u.uWave.value = ease(u.uWave.value, w.wave);
    u.uTowels.value = ease(u.uTowels.value, w.towels);
    u.uJump.value = ease(u.uJump.value, w.jump);
    u.uSettled.value = ease(u.uSettled.value, w.settled);
  });
  if (!shown.length) return null;
  return (
    <>
      <instancedMesh ref={mesh} args={[geometry, material, shown.length]} key={`c${shown.length}`} />
      <instancedMesh ref={towels} args={[towelGeometry, towelMaterial, shown.length]} key={`t${shown.length}`} frustumCulled={false} />
    </>
  );
}

// ── The building ────────────────────────────────────────────────────────────

const outerAt = (s: Stand, a: number) => outerOf(s.decks(a));
const topAt = (s: Stand, a: number) => topOf(s.decks(a));

/** Memorial's stone and brick, whatever facade is picked: the look is the style's own. */
const LIMESTONE = '#dccba6', BRICK = '#9a4632';
/** How high the brick ground floor runs on a wall this tall. */
const brickBand = (h: number) => Math.min(0.95, Math.max(0.42, h * 0.3));

/** Memorial's stone pavilions: square towers with windows, under pyramid caps. */
function Pavilions({ at, night }: { at: [number, number, number, number][]; night: number }) {
  return (
    <group>
      {at.map(([x, z, h, ry], i) => (
        <group key={i} position={[x, 0, z]} rotation-y={ry}>
          <mesh position={[0, h / 2, 0]} castShadow><boxGeometry args={[0.52, h, 0.5]} /><meshStandardMaterial color={LIMESTONE} roughness={0.9} /></mesh>
          <mesh position={[0, Math.min(0.9, h * 0.3) / 2, 0.255]}><boxGeometry args={[0.53, Math.min(0.9, h * 0.3), 0.01]} /><meshStandardMaterial color={BRICK} roughness={0.95} /></mesh>
          {/* A tall window up the face, toward the field and away from it. */}
          {[0.256, -0.256].map(zz => (
            <mesh key={zz} position={[0, h * 0.62, zz]}><boxGeometry args={[0.16, h * 0.42, 0.01]} /><meshStandardMaterial color="#39404a" emissive="#ffd59a" emissiveIntensity={0.05 + night * 1.1} /></mesh>
          ))}
          <mesh position={[0, h + 0.03, 0]}><boxGeometry args={[0.62, 0.06, 0.6]} /><meshStandardMaterial color="#efe5cf" /></mesh>
          <mesh position={[0, h + 0.2, 0]} rotation-y={Math.PI / 4}><coneGeometry args={[0.42, 0.3, 4]} /><meshStandardMaterial color="#cbb88f" roughness={0.8} /></mesh>
        </group>
      ))}
    </group>
  );
}

function Facades({ bp, look, p, night }: { bp: Blueprint; look: StadiumLook; p: Palette; night: number }) {
  const f = { ...FACADE[look.facade], wall: p.wall, trim: p.trim };
  // A stand with a building behind it (bp.bulk): its outside is the building's, further out.
  const outW = (s: Blueprint['stands'][number], a: number) => outerAt(s, a) + (bp.bulk[s.id] ?? 0);
  const o = bp.outline;
  const walled = bp.stands.filter(s => s.wallFrom !== null);
  const { columns, poles, flags } = useMemo(() => {
    const columns: Item[] = [], poles: Item[] = [], flags: Item[] = [];
    for (const s of walled) {
      const from = s.wallFrom ?? 0;
      for (const pt of along(o, s.from, s.to, a => outW(s, a) + 0.08, 0.42)) {
        const h = topAt(s, pt.a) - from;
        columns.push({ x: pt.x, y: from + h / 2, z: pt.z, ry: pt.ry, sy: h });
      }
      // Flags fly from the rim, except under a roof, which they'd poke through.
      const roofed = bp.roof && (bp.roof.kind === 'gable' ? bp.roof.stands.includes(s.id) : true);
      // Memorial's stone and brick fly no flags along the rim.
      if (look.style === 'dome' || roofed || bp.arches) continue;
      along(o, s.from, s.to, a => outW(s, a) + 0.02, 1.1).forEach((pt, i) => {
        const t = topAt(s, pt.a);
        poles.push({ x: pt.x, y: t + 0.22, z: pt.z });
        flags.push({ x: pt.x + Math.cos(pt.a) * 0.001, y: t + 0.37, z: pt.z, ry: -pt.a + Math.PI / 2, c: i % 2 ? p.accent : p.team });
      });
    }
    return { columns, poles, flags };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bp, look.style, p.team, p.accent]);
  // Memorial's outside: limestone, over a red brick ground floor with an arched opening in every
  // bay, and rows of windows in the stone above; all lit from inside at night.
  const arches = useMemo(() => {
    const panes: Item[] = [], crowns: Item[] = [], windows: Item[] = [];
    if (!bp.arches) return { panes, crowns, windows };
    for (const s of walled) {
      const from = s.wallFrom ?? 0;
      // Midway between each pair of columns (placed as the columns are, along the same wall).
      const cols = along(o, s.from, s.to, a => outW(s, a) + 0.07, 0.42);
      for (const pt of cols.slice(1).map((c, i) => ({ x: (c.x + cols[i].x) / 2, z: (c.z + cols[i].z) / 2, a: (c.a + cols[i].a) / 2, ry: c.ry }))) {
        const h = topAt(s, pt.a) - from;
        if (h < 0.5) continue;
        const band = brickBand(h), ph = band * 0.62, y = from + 0.04 + ph / 2;
        panes.push({ x: pt.x, y, z: pt.z, ry: pt.ry, sy: ph });
        crowns.push({ x: pt.x, y: y + ph / 2 + 0.03, z: pt.z, ry: pt.ry });
        // Windows in the stone: a row every so often up the wall, two to a bay, side by side along it.
        const tx = Math.sin(pt.ry), tz = Math.cos(pt.ry);
        for (let wy = from + band + 0.22; wy < from + h * 0.86; wy += 0.32) {
          for (const off of [-0.1, 0.1]) windows.push({ x: pt.x + tx * off, y: wy, z: pt.z + tz * off, ry: pt.ry });
        }
      }
    }
    return { panes, crowns, windows };
  }, [bp, walled, o]);
  // The ends of each building, closing it between the seats and its outside wall.
  const bulkEnds = useMemo(() => {
    const out: Item[] = [];
    for (const s of walled) {
      const d = bp.bulk[s.id] ?? 0;
      if (!d) continue;
      // Each end in two: full height behind the seats, where the building is; and under the decks,
      // from their front down to the ground, only as high as the seats begin, so nothing pokes above them.
      for (const a of [s.from, s.to]) {
        const decks = s.decks(a), [dx, dz] = o.dir(a), len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz);
        const slab = (r0: number, r1: number, h: number) => {
          const [x, z] = o.around(a, (r0 + r1) / 2);
          out.push({ x, y: h / 2, z, ry, sy: h, sz: (r1 - r0) * len });
        };
        const back = outerAt(s, a);
        slab(back - 0.02, back + d + 0.04, topAt(s, a) - 0.04);
        slab(decks[0].inner - 0.32, back - 0.02, decks[0].floor ?? decks[0].base);
      }
    }
    return out;
  }, [bp, walled, o]);
  const gates = useMemo(() => {
    if (bp.berm) return [];
    const out: { x: number; z: number; ry: number }[] = [];
    for (const s of walled) for (const a of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI, TAU]) {
      if (a < s.from + 0.1 || a > s.to - 0.1 || topAt(s, a) < 0.95 || (a === TAU && s.from < 0.1)) continue;
      const [x, z] = o.around(a, outW(s, a) + 0.2);
      out.push({ x, z, ry: -a + Math.PI / 2 });
    }
    return out;
  }, [bp, walled, o]);

  return (
    <group>
      {walled.map(s => (
        <group key={s.id}>
          <Ribbon o={o} from={s.from} to={s.to} cast k={`${bp.style}${s.id}${topAt(s, s.from)}${outW(s, s.from)}`}
            profile={a => [[outW(s, a) + 0.04, s.wallFrom ?? 0], [outW(s, a) + 0.04, topAt(s, a)]]}>
            {bp.arches
              ? <meshStandardMaterial color={LIMESTONE} roughness={0.92} side={DoubleSide} />
              : f.glass
              ? <meshPhysicalMaterial color={f.wall} metalness={f.metal} roughness={f.rough} transparent opacity={0.72} side={DoubleSide} emissive="#ffd99a" emissiveIntensity={night * 0.35} />
              : <meshStandardMaterial color={f.wall} metalness={f.metal} roughness={f.rough} side={DoubleSide} />}
          </Ribbon>
          {/* A building's roof, from the back of the seats out to its outside wall. */}
          {(bp.bulk[s.id] ?? 0) > 0 && (
            <Ribbon o={o} from={s.from} to={s.to} cast k={`bulkroof${bp.style}${s.id}${topAt(s, s.from)}${outW(s, s.from)}`}
              profile={a => [[outerAt(s, a) - 0.02, topAt(s, a) - 0.04], [outW(s, a) + 0.06, topAt(s, a) - 0.04]]}>
              <meshStandardMaterial color={bp.arches ? '#cbb994' : f.trim} side={DoubleSide} />
            </Ribbon>
          )}
          {/* A lit band of windows near the top. */}
          <Ribbon o={o} from={s.from} to={s.to} k={`win${bp.style}${s.id}${topAt(s, s.from)}${outW(s, s.from)}`}
            profile={a => { const t = topAt(s, a), y = (s.wallFrom ?? 0) + (t - (s.wallFrom ?? 0)) * 0.76; return [[outW(s, a) + 0.05, y], [outW(s, a) + 0.05, y + 0.1]]; }}>
            <meshStandardMaterial color="#1e2a36" emissive="#ffd28a" emissiveIntensity={0.15 + night * 1.2} side={DoubleSide} />
          </Ribbon>
        </group>
      ))}
      <Boxes items={columns} size={[0.1, 1, 0.1]} color={bp.arches ? '#ece2cb' : f.trim} />
      {bulkEnds.length > 0 && <Boxes items={bulkEnds} size={[0.06, 1, 1]} color={bp.arches ? '#dccba6' : f.wall} />}
      {arches.panes.length > 0 && (
        <>
          {/* The brick ground floor, with a limestone sill along its top. */}
          {walled.map(s => (
            <group key={`brick${s.id}`}>
              <Ribbon o={o} from={s.from} to={s.to} k={`brick${bp.style}${s.id}${topAt(s, s.from)}`}
                profile={a => { const from = s.wallFrom ?? 0, h = topAt(s, a) - from; return [[outW(s, a) + 0.05, from], [outW(s, a) + 0.05, from + brickBand(h)]]; }}>
                <meshStandardMaterial color={BRICK} roughness={0.95} side={DoubleSide} />
              </Ribbon>
              <Ribbon o={o} from={s.from} to={s.to} k={`sill${bp.style}${s.id}${topAt(s, s.from)}`}
                profile={a => { const from = s.wallFrom ?? 0, y = from + brickBand(topAt(s, a) - from); return [[outW(s, a) + 0.08, y], [outW(s, a) + 0.08, y + 0.05]]; }}>
                <meshStandardMaterial color="#efe5cf" side={DoubleSide} />
              </Ribbon>
            </group>
          ))}
          <Instanced items={arches.windows} emissive="#ffd59a" emissiveIntensity={0.05 + night * 1.1} color="#3a4048"><boxGeometry args={[0.03, 0.13, 0.1]} /></Instanced>
          <Instanced items={arches.panes} emissive="#ffcf87" emissiveIntensity={0.1 + night * 1.1} color="#2a2420"><boxGeometry args={[0.03, 1, 0.2]} /></Instanced>
          {/* A stepped top over each window: the arch, in brick. */}
          <Instanced items={arches.crowns} emissive="#ffcf87" emissiveIntensity={0.1 + night * 1.1} color="#2a2420"><boxGeometry args={[0.03, 0.07, 0.12]} /></Instanced>
          {/* The cornice: a stone band along the top of the brick. */}
          {walled.map(s => (
            <Ribbon key={`cornice${s.id}`} o={o} from={s.from} to={s.to} k={`cornice${bp.style}${s.id}${topAt(s, s.from)}`}
              profile={a => [[outW(s, a) + 0.09, topAt(s, a) - 0.12], [outW(s, a) + 0.09, topAt(s, a) - 0.02]]}>
              <meshStandardMaterial color={f.trim} side={DoubleSide} />
            </Ribbon>
          ))}
        </>
      )}
      <Boxes items={poles} size={[0.02, 0.44, 0.02]} color={p.steel} cast={false} />
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

function PressBox({ bp, pb, p, night }: { bp: Blueprint; pb: Blueprint['pressBoxes'][number]; p: Palette; night: number }) {
  const s = bp.stands.find(x => x.id === pb.stand);
  const from = (s?.from ?? 0) + 0.12, to = (s?.to ?? 0) - 0.12, H = pb.height, o = bp.outline;
  // A building on the back of the stand: solid all round, sitting down into the top rows, a glass
  // front facing the field, a roof slab with a lip, and a wall at each end.
  const D = 0.5, sink = 0.22, wall = bp.arches ? '#dccba6' : p.trim;
  const ends = useMemo(() => (s ? [from, to].map(a => {
    const [x, z] = o.around(a, outerAt(s, a) - D / 2 + 0.03), t = topAt(s, a);
    return { x, y: t - sink + (H + sink) / 2, z, ry: -a, sy: H + sink };
  }) : []), [o, s, from, to, H]);
  if (!s) return null;
  const k = `pb${H}${topAt(s, from)}${outerAt(s, from)}`;
  return (
    <group>
      <Ribbon o={o} from={from} to={to} k={`${k}w`} cast
        profile={a => { const r = outerAt(s, a), t = topAt(s, a); return [[r - D + 0.05, t - sink], [r - D + 0.05, t + H], [r + 0.05, t + H], [r + 0.05, t - sink], [r - D + 0.05, t - sink]]; }}>
        <meshStandardMaterial color={wall} side={DoubleSide} />
      </Ribbon>
      <Ribbon o={o} from={from + 0.01} to={to - 0.01} k={`${k}g`}
        profile={a => { const r = outerAt(s, a), t = topAt(s, a); return [[r - D + 0.04, t + 0.05], [r - D + 0.04, t + H - 0.06]]; }}>
        <meshPhysicalMaterial color="#a8d8ff" transparent opacity={0.8} roughness={0.05} side={DoubleSide} emissive="#ffd89a" emissiveIntensity={0.2 + night * 0.9} />
      </Ribbon>
      <Ribbon o={o} from={from - 0.01} to={to + 0.01} k={`${k}r`} cast
        profile={a => { const r = outerAt(s, a), t = topAt(s, a); return [[r - D - 0.02, t + H], [r - D - 0.02, t + H + 0.05], [r + 0.09, t + H + 0.05], [r + 0.09, t + H]]; }}>
        <meshStandardMaterial color={p.trim} side={DoubleSide} />
      </Ribbon>
      <Boxes items={ends} size={[0.05, 1, D]} color={wall} />
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
        <meshStandardMaterial color={p.roof ?? '#eef1f4'} side={DoubleSide} transparent opacity={0.92} />
      </Ribbon>
      <Ribbon o={o} k={`${k}e`} profile={a => [[outerAt(s, a) - span, topAt(s, a) + 0.38], [outerAt(s, a) - span, topAt(s, a) + 0.46]]}>
        <meshStandardMaterial color={lightsOn ? p.light : p.trim} emissive={p.light} emissiveIntensity={lightsOn ? 2 : 0} side={DoubleSide} />
      </Ribbon>
      <Boxes items={masts} size={[0.06, 0.4, 0.06]} color={p.steel} />
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
        <meshPhysicalMaterial color={p.roof ?? '#e9f2ff'} transparent opacity={p.roof ? 0.55 : 0.3} roughness={0.15} side={DoubleSide} emissive={p.light} emissiveIntensity={night * 0.35} depthWrite={false} />
      </mesh>
      <mesh geometry={ribs}><meshBasicMaterial color={mix(p.trim, '#ffffff', 0.3)} wireframe transparent opacity={0.55} /></mesh>
    </group>
  );
}

function Gables({ bp, stands, lift, p, lightsOn }: { bp: Blueprint; stands: string[]; lift: number; p: Palette; lightsOn: boolean }) {
  const o = bp.outline;
  const roofColor = p.roof ?? mix(p.team, '#2b2f33', 0.5);
  const { posts, masts } = useMemo(() => {
    const posts: Item[] = [];
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
    }
    return { posts, masts };
  }, [bp, stands, lift, o]);
  // Each mast, its bank and the bank's eight lamps, as three instanced draws for all the masts together.
  const rigs = useMemo(() => {
    const poles: Matrix4[] = [], banks: Matrix4[] = [], lamps: Matrix4[] = [];
    for (const m of masts) {
      const g = mat(null, [m.x, m.y, m.z], [0, m.ry, 0]);
      poles.push(mat(g, [0, m.h / 2, 0]));
      const bank = mat(g, [0, m.h, 0.04], [0.42, 0, 0]); // aimed down at the field
      banks.push(bank);
      for (const x of [-0.24, -0.08, 0.08, 0.24]) for (const y of [-0.065, 0.065]) lamps.push(mat(bank, [x, y, 0.028]));
    }
    return { poles, banks, lamps };
  }, [masts]);
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
      <Boxes items={posts} size={[0.05, 1, 0.05]} color={mix(p.steel, '#ffffff', 0.3)} />
      <Placed matrices={rigs.poles} cast><cylinderGeometry args={[0.025, 0.035, 0.95, 8]} /><meshStandardMaterial color={mix(p.steel, '#000000', 0.15)} roughness={0.5} /></Placed>
      <Placed matrices={rigs.banks} cast><boxGeometry args={[0.66, 0.3, 0.05]} /><meshStandardMaterial color="#3a3f45" roughness={0.6} /></Placed>
      <Placed matrices={rigs.lamps}><planeGeometry args={[0.12, 0.1]} /><meshStandardMaterial color="#fffbe6" emissive={lamp} emissiveIntensity={lightsOn ? 2.4 : 0} /></Placed>
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
    d.scale.set(1, 1, back.distanceTo(front)); d.updateMatrix();
    return d.matrix.clone();
  }), [o, s, edge, Y]);
  return (
    <group>
      <Ribbon o={o} k={k} cast profile={a => [[outerAt(s, a) + 0.1, topAt(s, a) + 0.3], [edge, Y]]}>
        <meshStandardMaterial color={p.roof ?? '#f2f4f6'} side={DoubleSide} transparent opacity={p.roof ? 0.85 : 0.62} roughness={0.4} depthWrite={false} />
      </Ribbon>
      <Placed matrices={ribs} cast><boxGeometry args={[0.04, 0.05, 1]} /><meshStandardMaterial color={p.steel} roughness={0.5} /></Placed>
      <Ribbon o={o} k={`${k}e`} profile={() => [[edge, Y - 0.08], [edge, Y]]}>
        <meshStandardMaterial color={lightsOn ? p.light : p.trim} emissive={p.light} emissiveIntensity={lightsOn ? 2.2 : 0} side={DoubleSide} />
      </Ribbon>
      {moving && (
        <group>
          {[-1, 1].map(z => <mesh key={z} position={[0, Y + 0.07, z * (Z + 0.12)]} castShadow><boxGeometry args={[X * 4.1, 0.1, 0.08]} /><meshStandardMaterial color={p.steel} /></mesh>)}
          {[left, right].map((ref, i) => (
            <group key={i} ref={ref} position={[(i ? 1 : -1) * X / 2, Y + 0.04, 0]}>
              <mesh castShadow><boxGeometry args={[X, 0.04, 2 * Z + 0.2]} /><meshStandardMaterial color={p.roof ?? '#e7eef4'} transparent opacity={0.82} roughness={0.2} /></mesh>
              {[-0.3, 0, 0.3].map(f => <mesh key={f} position={[f * X, 0.03, 0]}><boxGeometry args={[0.05, 0.03, 2 * Z + 0.2]} /><meshStandardMaterial color={mix(p.steel, '#000000', 0.12)} /></mesh>)}
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
    <Ribbon o={bp.outline} k={`berm${b.r}${b.h}`} profile={() => [[b.r - 0.02, b.h], [b.r + 0.12, b.h], [b.r + b.run, 0.007]]}>
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

/** The scoreboard in a live matchup: both teams in their colors, the score, and a flash for a big play. */
export interface ScoreScreen { host: { name: string; score: number; color: string }; guest: { name: string; score: number; color: string }; status: string; flash?: string | null }

function useScoreScreen(score: ScoreScreen | null) {
  const key = score ? JSON.stringify(score) : '';
  const tex = useMemo(() => {
    if (!score || typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 200;
    const g = c.getContext('2d')!;
    g.fillStyle = '#07090c'; g.fillRect(0, 0, 512, 200);
    const font = (px: number) => `900 ${px}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    const half = (x: number, t: ScoreScreen['host']) => {
      const grad = g.createLinearGradient(0, 0, 0, 200);
      grad.addColorStop(0, mix(t.color, '#ffffff', 0.1)); grad.addColorStop(1, mix(t.color, '#000000', 0.45));
      g.fillStyle = grad; g.fillRect(x + 6, 34, 238, 160);
      g.fillStyle = inkOn(t.color); g.textAlign = 'center'; g.textBaseline = 'middle';
      let size = 26; g.font = font(size);
      const name = t.name.toUpperCase();
      const w = g.measureText(name).width;
      if (w > 220) { size *= 220 / w; g.font = font(size); }
      g.fillText(name, x + 125, 58);
      g.font = font(70); g.fillText(t.score.toFixed(1), x + 125, 128);
    };
    half(0, score.host); half(256, score.guest);
    g.fillStyle = '#ffb43a'; g.font = font(22); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(score.status.toUpperCase(), 256, 17);
    if (score.flash) {
      g.fillStyle = 'rgba(0,0,0,0.72)'; g.fillRect(0, 70, 512, 76);
      g.fillStyle = '#ffd44d'; let size = 54; g.font = font(size);
      const w = g.measureText(score.flash).width;
      if (w > 490) { size *= 490 / w; g.font = font(size); }
      g.fillText(score.flash, 256, 110);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

/**
 * The video boards, each held up the way its blueprint says (posts, a tower,
 * a truss on the stands, cables from the roof, stone piers on the colonnade)
 * and framed in its style's own way. Their backs carry the team's name too,
 * for everyone outside.
 */
function Boards({ bp, p, text, look, score = null }: { bp: Blueprint; p: Palette; text: string; look: StadiumLook; score?: ScoreScreen | null }) {
  const named = useScreen(p.team, p.accent, text);
  const scored = useScoreScreen(score);
  // In a live matchup the screens show the score; otherwise the team's name.
  const screen = scored ?? named;
  const mats = useRef<MeshStandardMaterial[]>([]);
  useFrame(({ clock }) => { for (const m of mats.current) if (m) m.emissiveIntensity = 0.85 + Math.sin(clock.elapsedTime * 2.4) * 0.2; });
  const wall = p.wall, stone = stoneOf(look);
  const FRAME: Record<Board['frame'], string> = { steel: '#2a2e33', team: mix(p.team, '#15181c', 0.35), classic: '#1f3b2d', glass: '#e4e9ee', stone };
  const steel = <meshStandardMaterial color={mix(p.steel, '#000000', 0.3)} roughness={0.5} />;
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
          {scored ? (
            <mesh position={[0, 0, 0.075]}><planeGeometry args={[w * 0.92, h * 0.86]} /><meshStandardMaterial map={scored} emissiveMap={scored} emissive="#ffffff" emissiveIntensity={0.9} /></mesh>
          ) : (
            <>
              {[-0.26, 0.26].map(x => (
                <mesh key={x} position={[x * w, -0.04 * h, 0.075]}><planeGeometry args={[w * 0.3, h * 0.42]} /><meshStandardMaterial color="#2a1a05" emissive="#ffb43a" emissiveIntensity={1.1} /></mesh>
              ))}
              <mesh position={[0, h * 0.32, 0.075]}><planeGeometry args={[w * 0.7, h * 0.18]} /><meshStandardMaterial color={p.team} emissive={p.team} emissiveIntensity={0.4} /></mesh>
            </>
          )}
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
        <mesh castShadow><boxGeometry args={[w + pad, h + pad, depth]} /><meshStandardMaterial color={p.boards ?? FRAME[b.frame]} roughness={b.frame === 'glass' ? 0.2 : 0.7} /></mesh>
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

/** The twin towers at the gates (Twin Towers): white, with a flag pole on each dome. */
function TwinTowers({ at, p, night }: { at: [number, number, number][]; p: Palette; night: number }) {
  return (
    <group>
      {at.map(([x, z, h], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, h * 0.3, 0]} castShadow><boxGeometry args={[0.95, h * 0.6, 0.95]} /><meshStandardMaterial color="#f1ede4" roughness={0.9} /></mesh>
          <mesh position={[0, h * 0.72, 0]} castShadow><cylinderGeometry args={[0.36, 0.44, h * 0.24, 8]} /><meshStandardMaterial color="#f1ede4" roughness={0.9} /></mesh>
          {/* Windows down the face, lit at night. */}
          <mesh position={[0, h * 0.38, 0.48]}><boxGeometry args={[0.22, h * 0.36, 0.02]} /><meshStandardMaterial color="#2a2f36" emissive="#ffd59a" emissiveIntensity={night * 1.2} /></mesh>
          <mesh position={[0, h * 0.84 + 0.02, 0]}><sphereGeometry args={[0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#e8e2d4" roughness={0.6} /></mesh>
          <mesh position={[0, h * 0.84 + 0.5, 0]}><cylinderGeometry args={[0.012, 0.012, 0.55, 6]} /><meshStandardMaterial color="#c8ccd0" /></mesh>
          <mesh position={[0.12, h * 0.84 + 0.68, 0]}><boxGeometry args={[0.22, 0.13, 0.01]} /><meshStandardMaterial color={i ? p.accent : p.team} /></mesh>
        </group>
      ))}
    </group>
  );
}

function LightTowers({ at, color, on }: { at: [number, number, number][]; color: string; on: boolean }) {
  // The glow is the lamps' own: a point light per tower would cost every pixel on screen four more lights.
  const { poles, heads } = useMemo(() => {
    const poles: Matrix4[] = [], heads: Matrix4[] = [];
    for (const [x, z, h] of at) {
      const g = mat(null, [x, 0, z], [0, Math.atan2(-x, -z), 0]);
      poles.push(mat(g, [0, h / 2, 0], [0, 0, 0], [1, h, 1]));
      heads.push(mat(g, [0, h, 0]));
    }
    return { poles, heads };
  }, [at]);
  return (
    <>
      <Placed matrices={poles} cast><cylinderGeometry args={[0.04, 0.06, 1, 8]} /><meshStandardMaterial color="#9aa1a8" metalness={0.6} roughness={0.4} /></Placed>
      <Placed matrices={heads}><boxGeometry args={[0.45, 0.25, 0.08]} /><meshStandardMaterial color="#fffbe6" emissive={on ? color : '#000000'} emissiveIntensity={on ? 2 : 0} /></Placed>
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
  return <instancedMesh ref={mesh} args={[undefined, undefined, folk.length]} key={folk.length} frustumCulled={false}><capsuleGeometry args={[0.035, 0.1, 3, 6]} /><meshStandardMaterial roughness={0.8} /></instancedMesh>;
}

/**
 * The pyro cannons around the bowl. On a franchise's own page they fire on a loop, showing off the
 * upgrade; during a live game (`once`) they fire a single volley, mounted afresh for each score.
 */
function Pyro({ bp, once = false }: { bp: Blueprint; once?: boolean }) {
  const g = useRef<Group>(null);
  const start = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    start.current ??= clock.elapsedTime;
    const since = clock.elapsedTime - start.current;
    // Two volleys for a score, then quiet.
    if (once && since >= 8) { g.current.visible = false; return; }
    const t = since % 4;
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

/**
 * Shadows drawn only when something has changed, not every frame: the light
 * barely moves, and nothing that moves casts one. After a change (a build, a
 * new look, another hour) they redraw for a few seconds while the pieces
 * grow in or the roof slides, then hold.
 */
function ShadowRig({ dirty }: { dirty: string }) {
  const gl = useThree(s => s.gl);
  const clock = useRef(0), until = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    until.current = clock.current + 4;
  }, [gl, dirty]);
  useFrame((_, delta) => {
    clock.current += delta;
    if (clock.current < until.current) gl.shadowMap.needsUpdate = true;
  });
  return null;
}

/**
 * Development only: a camera on rails, for filming (the trailer's stadium shots).
 * When the page sets `window.__lpCam` to { from, to, dur, start } (each pose an
 * orbit around a target: radius, azimuth and elevation in radians, the target,
 * a field of view), the camera eases from one pose to the other instead of
 * following the orbit controls. Never in production builds.
 */
type CamPose = { r: number; az: number; el: number; target: [number, number, number]; fov?: number };
type CamShot = { from: CamPose; to: CamPose; dur: number; start: number };
const scripted = () => process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && !!(window as unknown as { __lpCam?: CamShot }).__lpCam;

/** A photograph's camera: exactly where it was put, looking at its subject, at any height (the orbit controls keep above 15 degrees). */
/** Where the field's corners are, for the broadcast cut: the painted ground, a little beyond the sidelines. */
/** How far the broadcast view can slide (two fingers, or a right drag): either goal line, a little either side of midfield. */
const PAN_LIMIT = { x: 3.5, z: 1.2 };
const FIELD_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => new Vector3(x * 3.7, 0, z * 2.05));

/**
 * The broadcast view: glides the camera to a new view when it changes, and keeps the field in plain
 * sight from any angle. Everything that is both nearer the camera than the field's nearest corner
 * and above the ground is cut away (two clipping planes, intersected): the near stands, a roof, a
 * dome, a light tower. The ground in front stays, so the cut never leaves a hole in the picture.
 */
function BroadcastRig({ view }: { view: NonNullable<StadiumProps['view']> }) {
  const camera = useThree(st => st.camera);
  const gl = useThree(st => st.gl);
  const scene = useThree(st => st.scene);
  const controls = useThree(st => st.controls) as unknown as { target: Vector3; update: () => void } | null;
  const glide = useRef<{ from: Vector3; to: Vector3; fromT: Vector3; toT: Vector3; fromF: number; toF: number; dur: number; t: number } | null>(null);
  const key = JSON.stringify([view.position, view.target, view.fov]);
  const lens = camera as unknown as { fov?: number; updateProjectionMatrix: () => void };
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    glide.current = {
      from: camera.position.clone(), to: new Vector3(...view.position),
      fromT: controls?.target.clone() ?? new Vector3(), toT: new Vector3(...(view.target ?? [0, 0, 0])),
      fromF: lens.fov ?? 38, toF: view.fov ?? lens.fov ?? 38, dur: view.glide ?? 1.1, t: 0,
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kept: farther than the field (the near plane), or at ground level (the ground plane).
  const planes = useMemo(() => [new Plane(), new Plane(new Vector3(0, -1, 0), 0.14)], []);
  const dressed = useRef(new Set<Material>());
  useEffect(() => {
    gl.localClippingEnabled = true;
    const set = dressed.current;
    return () => {
      for (const m of set) { m.clippingPlanes = null; m.clipIntersection = false; m.needsUpdate = true; }
      set.clear();
    };
  }, [gl]);

  const forward = useMemo(() => new Vector3(), []);
  const tmp = useMemo(() => new Vector3(), []);
  const frames = useRef(0);
  useFrame((_, dt) => {
    const g = glide.current;
    if (g) {
      g.t = Math.min(1, g.t + dt / g.dur);
      // A quick cut eases out; a long move eases in and out, as a camera operator would.
      const e = g.dur > 2 ? g.t * g.t * (3 - 2 * g.t) : 1 - Math.pow(1 - g.t, 3);
      camera.position.lerpVectors(g.from, g.to, e);
      controls?.target.lerpVectors(g.fromT, g.toT, e);
      if (lens.fov != null && g.fromF !== g.toF) { lens.fov = g.fromF + (g.toF - g.fromF) * e; lens.updateProjectionMatrix(); }
      controls?.update();
      if (g.t >= 1) glide.current = null;
    } else if (controls) {
      // Slid too far: back to the edge, camera and all, so the field never leaves the picture.
      const t = controls.target;
      const x = Math.max(-PAN_LIMIT.x, Math.min(PAN_LIMIT.x, t.x)), z = Math.max(-PAN_LIMIT.z, Math.min(PAN_LIMIT.z, t.z));
      if (x !== t.x || z !== t.z) {
        camera.position.x += x - t.x; camera.position.z += z - t.z;
        t.x = x; t.z = z;
        controls.update();
      }
    }
    // The near plane: square to the line of sight, just short of the field's nearest corner.
    camera.getWorldDirection(forward);
    let nearest = Infinity;
    for (const c of FIELD_CORNERS) nearest = Math.min(nearest, tmp.copy(c).sub(camera.position).dot(forward));
    const depth = Math.max(0.1, nearest - 0.35);
    planes[0].normal.copy(forward);
    planes[0].constant = -(forward.dot(camera.position) + depth);
    // Every so often, dress anything new in the scene (a part rising into place) with the cut.
    if (frames.current++ % 30 === 0) {
      scene.traverse(o => {
        const mats = (o as { material?: Material | Material[] }).material;
        if (!mats) return;
        for (const m of Array.isArray(mats) ? mats : [mats]) {
          if (dressed.current.has(m)) continue;
          m.clippingPlanes = planes; m.clipIntersection = true; m.needsUpdate = true;
          dressed.current.add(m);
        }
      });
    }
  });
  return null;
}

/**
 * Draws the scene `fps` times a second (the Canvas renders on demand): a stadium drawing every
 * refresh of a 120Hz screen, or a small preview drawing 60 times a second, was the bulk of the
 * battery the app used.
 */
function Pace({ fps }: { fps: number }) {
  const invalidate = useThree(st => st.invalidate);
  useEffect(() => {
    // A little slack, so a 60Hz screen asked for 30 gets every other refresh, never a stutter.
    const gap = 1000 / fps - 2;
    let raf = 0, last = 0;
    const tick = (t: number) => {
      if (t - last >= gap) { last = t; invalidate(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps, invalidate]);
  return null;
}

/** Calls back once a few frames are drawn: the scene is built, its textures up, the stands rising. */
function ReadySignal({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current || ++frames.current < 20) return;
    done.current = true;
    onReady();
  });
  return null;
}

function FixedCamera({ target }: { target: [number, number, number] }) {
  const camera = useThree(s => s.camera);
  useEffect(() => { camera.lookAt(...target); camera.updateProjectionMatrix(); }, [camera, target]);
  return null;
}

function ScriptedCamera() {
  useFrame(({ camera }) => {
    const shot = (window as unknown as { __lpCam?: CamShot }).__lpCam;
    if (!shot) return;
    const k = Math.min(1, Math.max(0, (performance.now() - shot.start) / (shot.dur * 1000)));
    const t = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // ease in and out
    const lerp = (a: number, b: number) => a + (b - a) * t;
    const { from: a, to: b } = shot;
    const r = lerp(a.r, b.r), az = lerp(a.az, b.az), el = lerp(a.el, b.el);
    const target = [0, 1, 2].map(i => lerp(a.target[i], b.target[i])) as [number, number, number];
    camera.position.set(target[0] + r * Math.cos(el) * Math.cos(az), target[1] + r * Math.sin(el), target[2] + r * Math.cos(el) * Math.sin(az));
    camera.lookAt(...target);
    const fov = lerp(a.fov ?? 38, b.fov ?? 38);
    if ('fov' in camera && Math.abs((camera as unknown as { fov: number }).fov - fov) > 1e-3) { (camera as unknown as { fov: number }).fov = fov; camera.updateProjectionMatrix(); }
  });
  return null;
}

function Scene({ facilities: f, fill, lots: lotsFill, visitors, field, color, name, teamName, logo, look: chosen, hour, quality, live }: StadiumProps & { hour: number; quality: Quality }) {
  const lots = lotsFill ?? fill;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const look = useMemo(() => normalizeLook(chosen), [JSON.stringify(chosen ?? null)]);
  const sky = skyFor(hour);
  const tone = useMemo(() => ({ horizon: sky.sky, zenith: sky.zenith, sun: sky.sun, glow: sky.sunColor, night: sky.night }), [hour]); // eslint-disable-line react-hooks/exhaustive-deps
  const bp = useMemo(() => blueprint(look.style, f), [look.style, f]);
  const p = useMemo(() => palette(look, color), [look, color]);
  // The visitors' fans: about one in five, in their team's color.
  const crowdColors = useMemo(() => (visitors ? [...p.crowd, ...Array.from({ length: Math.max(1, Math.round(p.crowd.length / 4)) }, () => new Color(visitors))] : p.crowd), [p, visitors]);
  const crowdHex = useMemo(() => crowdColors.map(c => `#${c.getHexString()}`), [crowdColors]);
  const o = bp.outline;
  const team = teamName || name;
  const build = `${look.style}-${f.stadium}-${f.seating}-${f.suites}`;
  const apron = fieldColors(look, color).apron;
  const closed = roofClosed(look.roof, sky.night);
  const indoors = bp.roof?.kind === 'dome' || (bp.roof?.kind === 'membrane' && bp.roof.moving && closed);
  const lightsOn = sky.lightsOn || indoors;
  const fascia = look.style === 'cantilever' ? mix(color, '#1b1d21', 0.2) : p.trim;
  const plaza = bp.footprint;
  // The live matchup's score for the boards, with the latest big play flashed across them.
  const liveScore = useMemo<ScoreScreen | null>(() => (live ? {
    host: { name: live.match.host.name, score: live.match.host.score, color: live.hostColor },
    guest: { name: live.match.guest.name, score: live.match.guest.score, color: live.guestColor },
    status: live.match.demo ? 'Demo' : live.match.phase === 'final' ? 'Final' : live.match.phase === 'live' ? `Live · Week ${live.match.week}` : `Week ${live.match.week}`,
    flash: live.celebrate ? (live.celebrate.td ? 'TOUCHDOWN!' : 'BIG PLAY!') : null,
  } : null), [live]);

  // A fragment, not a group: the sky color and the fog attach to their parent, and only the scene draws them.
  return (
    <>
      <color attach="background" args={[sky.sky]} />
      <fogExp2 attach="fog" args={[sky.sky, HAZE]} />
      <hemisphereLight args={['#ffffff', mix(GROUND[look.setting].grass, '#b9b4a8', 0.45), sky.ambient]} />
      <directionalLight position={sky.sun} intensity={sky.sunIntensity} color={sky.sunColor} castShadow={quality.shadows > 0}
        shadow-mapSize={[quality.shadows || 512, quality.shadows || 512]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} />
      {quality.shadows > 0 && <ShadowRig dirty={`${build}|${JSON.stringify(look)}|${Math.round(hour * 4)}|${f.parking}|${Math.round(fill * 20)}|${Math.round(lots * 20)}|${closed}`} />}
      {sky.night > 0.4 && <Stars radius={80} depth={30} count={Math.round(2500 * quality.detail)} factor={3} fade speed={0.4} />}

      <Grounds o={o} footprint={bp.footprint} parking={f.parking} fill={lots} night={sky.night} sky={tone} detail={quality.detail} look={look} team={p.team} accent={p.accent} crowd={crowdHex} />

      {/* The floor of the bowl, the wall around the field with a stripe, and the field. */}
      <Ribbon o={o} k={`floor${bp.inner}${apron}`} profile={() => [[0, 0.008], [bp.inner + 0.02, 0.008]]}><meshStandardMaterial color={apron} roughness={0.95} /></Ribbon>
      <Ribbon o={o} k={`podium${bp.inner}`} profile={() => [[bp.inner, 0], [bp.inner, PODIUM]]}><meshStandardMaterial color={p.podium} side={DoubleSide} roughness={0.7} /></Ribbon>
      <Ribbon o={o} k={`stripe${bp.inner}`} profile={() => [[bp.inner - 0.005, PODIUM - 0.025], [bp.inner - 0.005, PODIUM - 0.005]]}><meshStandardMaterial color={p.team} side={DoubleSide} /></Ribbon>
      {bp.ribbon && (
        <Ribbon o={o} k={`ribbon${bp.inner}`} profile={() => [[bp.inner - 0.006, 0.02], [bp.inner - 0.006, PODIUM - 0.035]]}>
          <meshStandardMaterial color={p.team} emissive={p.team} emissiveIntensity={0.9} side={DoubleSide} />
        </Ribbon>
      )}
      <Gridiron look={look} color={color} team={team} logo={logo} visitors={visitors} scene={field} />

      {bp.berm && <Berm bp={bp} setting={look.setting} />}
      <Rise key={build}><Stands bp={bp} p={p} fascia={fascia} wall={p.wall} /></Rise>
      <Crowd key={`crowd${build}`} bp={bp} fill={fill} colors={crowdColors} towel={p.accent} cheer={Boolean(live?.celebrate)} />
      <Rise key={`ext${build}`} delay={0.1}><Facades bp={bp} look={look} p={p} night={sky.night} /></Rise>
      {bp.suites.length > 0 && <Rise key={`s${build}`}><Suites bp={bp} night={sky.night} /></Rise>}
      {bp.pressBoxes.map(pb => <Rise key={`pb${pb.stand}${build}`}><PressBox bp={bp} pb={pb} p={p} night={sky.night} /></Rise>)}
      {bp.twinTowers.length > 0 && <Rise key={`tt${build}`} delay={0.2}><TwinTowers at={bp.twinTowers} p={p} night={sky.night} /></Rise>}
      {bp.pavilions.length > 0 && <Rise key={`pav${build}`} delay={0.2}><Pavilions at={bp.pavilions} night={sky.night} /></Rise>}
      {bp.colonnade && <Rise key={`col${build}`} delay={0.2}><Colonnade bp={bp} look={look} p={p} /></Rise>}
      {bp.torch && <Torch at={bp.torch} />}

      {bp.roof?.kind === 'canopy' && <Rise key={`roof${build}`} delay={0.3}><Canopy bp={bp} span={bp.roof.span} p={p} lightsOn={lightsOn} /></Rise>}
      {bp.roof?.kind === 'dome' && <Rise key={`roof${build}`} delay={0.3}><Dome bp={bp} rise={bp.roof.rise} p={p} night={sky.night} /></Rise>}
      {bp.roof?.kind === 'gable' && <Rise key={`roof${build}`} delay={0.3}><Gables bp={bp} stands={bp.roof.stands} lift={bp.roof.lift} p={p} lightsOn={lightsOn} /></Rise>}
      {bp.roof?.kind === 'membrane' && <Rise key={`roof${build}`} delay={0.3}><Membrane bp={bp} moving={bp.roof.moving} closed={closed} p={p} lightsOn={lightsOn} /></Rise>}

      {bp.boards.length > 0 && <Rise key={`b${build}-${f.videoboard}`}><Boards bp={bp} p={p} text={look.endZoneText || team} look={look} score={liveScore} /></Rise>}
      {live && live.match.phase !== 'upcoming' && <LiveField live={live} />}
      <LightTowers at={bp.towers} color={p.light} on={lightsOn} />
      {/* With the lights on, the bowl glows. */}
      {/* Always there, only dimmed by day: adding or removing a light recompiles every material in the scene, a visible hitch. */}
      <pointLight position={[0, indoors ? bp.top * 0.85 : bp.top + 2.5, 0]} intensity={lightsOn ? 9 + sky.night * 12 : 0} distance={16} color={p.light} />

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
      <People bp={bp} fill={lots} colors={crowdColors} />
      {/* Watching a game, the cannons only go off for a score. */}
      {f.atmosphere >= 3 && (live
        ? live.celebrate?.td && <Pyro key={`pyro-${live.celebrate.id}`} bp={bp} once />
        : <Pyro bp={bp} />)}
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
  const [quality, setQuality] = useState<Quality | null>(null);
  const [dpr, setDpr] = useState(1);
  const hour = useLocalHour(props.hour);
  useEffect(() => {
    setOk(webglOk());
    const q = props.photo ? { ...detectQuality(), tier: 'high' as const, maxDpr: 1, minDpr: 1, shadows: 2048 as const, detail: 1, antialias: true } : detectQuality();
    setQuality(q);
    setDpr(Math.min(window.devicePixelRatio || 1, q.maxDpr));
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '100px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Touching or dragging the stadium: full frame rate for that, and a moment after.
  const [handled, setHandled] = useState(false);
  const calm = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handle = () => {
    setHandled(true);
    if (calm.current) clearTimeout(calm.current);
    calm.current = setTimeout(() => setHandled(false), 1500);
  };
  useEffect(() => () => { if (calm.current) clearTimeout(calm.current); }, []);
  const fps = handled ? 60 : Math.min(60, props.fps ?? 60);

  return (
    // A stacking context of its own (`isolate`): the 3D labels (live cards and pins) set their own
    // z-index, and without this they'd rise above whatever the page lays over the stadium.
    <div ref={box} className="relative isolate h-full w-full" onPointerDown={handle} onWheel={handle}
      onPointerMove={e => { if (e.buttons) handle(); }}>
      {ok === false ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-sky-200 to-emerald-200 text-center dark:from-slate-800 dark:to-emerald-950">
          <p className="px-6 text-sm font-semibold text-foreground/70">{props.name}: the 3D view needs WebGL, which this browser has turned off.</p>
        </div>
      ) : ok && quality ? (
        <Canvas shadows={quality.shadows > 0} dpr={dpr} frameloop={props.photo ? 'always' : visible ? 'demand' : 'never'}
          // The default GPU: asking for the high-performance one wakes a laptop's discrete graphics.
          gl={{ antialias: quality.antialias, powerPreference: 'default', stencil: false, preserveDrawingBuffer: !!props.photo }}
          camera={{ position: props.view?.position ?? [19, 7, 19], fov: props.view?.fov ?? 38, near: 0.5, far: 400 }}>
          {/* Fewer pixels when frames start to drop, more again once there's room. */}
          {!props.photo && visible && <Pace fps={fps} />}
          {/* Measured against the pace it's held to, so a stadium held to 30 isn't taken for a slow one. */}
          {!scripted() && !props.photo && <PerformanceMonitor key={fps} bounds={() => [fps - 8, fps + 30]} flipflops={4} onDecline={() => setDpr(d => Math.max(quality.minDpr, +(d - 0.25).toFixed(2)))}
            onIncline={() => setDpr(d => Math.min(Math.min(window.devicePixelRatio || 1, quality.maxDpr), +(d + 0.25).toFixed(2)))} />}
          <Scene {...props} hour={hour} quality={quality} />
          {props.onReady && <ReadySignal onReady={props.onReady} />}
          {scripted() ? <ScriptedCamera /> : props.photo ? <FixedCamera target={props.view?.target ?? [0, 0.8, 0]} /> : <OrbitControls makeDefault autoRotate={!props.view?.still} autoRotateSpeed={0.4 * (60 / fps)} enablePan={Boolean(props.view?.broadcast)} screenSpacePanning={false} minDistance={props.view ? (props.view.broadcast ? 2 : 3) : 9} maxDistance={34} maxPolarAngle={props.view?.broadcast ? 1.45 : 1.3} target={props.view?.target ?? [0, 0.8, 0]} />}
          {props.view?.broadcast && !props.photo && !scripted() && <BroadcastRig view={props.view} />}
        </Canvas>
      ) : null}
    </div>
  );
}
