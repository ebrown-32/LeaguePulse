'use client';

/** Small pieces the stadium and its grounds share. */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Object3D, type Group, type InstancedMesh, type Matrix4 } from 'three';
import { TAU, type Outline } from '@/lib/franchise/stadiumBlueprint';
import { ribbonGeometry, type Pt, type RibbonOptions } from './stadiumGeometry';

/** A repeatable random sequence, so the same stadium always looks the same. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; };
}

export const mix = (a: string, b: string, t: number) => '#' + new Color(a).lerp(new Color(b), Math.max(0, Math.min(1, t))).getHexString();
export const luminance = (hex: string) => { const c = new Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };

/**
 * A ribbon around the outline (stadiumGeometry). `k` names everything the
 * profile depends on: the geometry is rebuilt only when it changes.
 */
export function Ribbon({ o, from = 0, to = TAU, profile, k, opts, cast = false, position, children }: {
  o: Outline; from?: number; to?: number; profile: (a: number) => Pt[]; k: string; opts?: RibbonOptions; cast?: boolean;
  position?: [number, number, number]; children: React.ReactNode;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(() => ribbonGeometry(o, from, to, profile, opts), [o, from, to, k]);
  useEffect(() => () => g.dispose(), [g]);
  return <mesh geometry={g} castShadow={cast} receiveShadow position={position}>{children}</mesh>;
}

export interface Item { x: number; y: number; z: number; ry?: number; sx?: number; sy?: number; sz?: number; c?: string }

/** Instances of one geometry (the child) from a list of placements, each its own color when it has one. */
export function Instanced({ items, children, color, emissive, emissiveIntensity = 0, roughness = 0.8, cast = true, flat = false, fog = true }: {
  items: Item[]; children: React.ReactNode; color?: string; emissive?: string; emissiveIntensity?: number; roughness?: number; cast?: boolean; flat?: boolean;
  /** False for the far horizon, which shows through the haze as a silhouette instead of vanishing in it. */
  fog?: boolean;
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
    m.computeBoundingSphere(); // or it keeps the bounds of the last placements, and may be culled while in view
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, items.length]} key={items.length} castShadow={cast} receiveShadow>
      {children}
      <meshStandardMaterial color={items[0].c ? undefined : color} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={roughness} flatShading={flat} fog={fog} />
    </instancedMesh>
  );
}

const tmp = new Object3D();
/** A placement (position, Euler rotation, scale) inside `parent`'s, as a matrix: for building up Placed lists. */
export function mat(parent: Matrix4 | null, p: [number, number, number], r: [number, number, number] = [0, 0, 0], sc: [number, number, number] = [1, 1, 1]): Matrix4 {
  tmp.position.set(...p); tmp.rotation.set(...r); tmp.scale.set(...sc); tmp.updateMatrix();
  return parent ? parent.clone().multiply(tmp.matrix) : tmp.matrix.clone();
}

/**
 * One geometry and material (the children) drawn at every matrix in one draw
 * call: for repeated pieces too intricate for Instanced's position, turn and
 * scale (a lamp on a tilted bank on a turned mast).
 */
export function Placed({ matrices, colors, children, cast = false }: { matrices: Matrix4[]; colors?: string[]; children: React.ReactNode; cast?: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    matrices.forEach((x, i) => m.setMatrixAt(i, x));
    if (colors) { colors.forEach((c, i) => m.setColorAt(i, new Color(c))); if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices, colors]);
  if (!matrices.length) return null;
  return <instancedMesh ref={mesh} args={[undefined, undefined, matrices.length]} key={matrices.length} castShadow={cast} receiveShadow>{children}</instancedMesh>;
}

export function Boxes({ size, ...rest }: Omit<Parameters<typeof Instanced>[0], 'children'> & { size: [number, number, number] }) {
  return <Instanced {...rest}><boxGeometry args={size} /></Instanced>;
}

/** Grows a child from nothing to full height when it first appears. */
export function Rise({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const g = useRef<Group>(null);
  // Its own age, frame by frame: not the canvas clock, which starts again from 0 each time the view
  // scrolls back into sight (and would leave anything built later flattened until it caught up).
  const age = useRef(0);
  useFrame((_, delta) => {
    if (!g.current || age.current > delay + 1) return;
    age.current += Math.min(delta, 0.1);
    const t = Math.min(1, Math.max(0, (age.current - delay) / 0.9));
    g.current.scale.set(1, Math.max(0.001, 1 - Math.pow(1 - t, 3)), 1);
  });
  return <group ref={g} scale={[1, 0.001, 1]}>{children}</group>;
}

/** Points spaced about `step` apart along a sweep of the outline at size r(a). */
/**
 * Points evenly spaced along a sweep, each with `ry`: the turn that points a box's local x straight out
 * from the wall (its local z along it), on any outline, square or round.
 */
export function along(o: Outline, from: number, to: number, r: (a: number) => number, step: number): { x: number; z: number; a: number; ry: number }[] {
  // Measure the sweep's length first, then place evenly by length, between the samples (on a squarish
  // outline most of a straight side's length falls in a few of them, so snapping to one bunches things up).
  const N = 800, pts: { x: number; z: number; a: number; s: number }[] = [];
  let s = 0, prev: [number, number] | null = null;
  for (let i = 0; i <= N; i++) {
    const a = from + ((to - from) * i) / N;
    const p = o.around(a, r(a));
    if (prev) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    pts.push({ x: p[0], z: p[1], a, s }); prev = p;
  }
  const count = Math.max(1, Math.round(s / step));
  const out: { x: number; z: number; a: number; ry: number }[] = [];
  let j = 0;
  for (let n = 0; n < count; n++) {
    const want = ((n + 0.5) / count) * s;
    while (j < pts.length - 2 && pts[j + 1].s < want) j++;
    const p = pts[j], q = pts[j + 1] ?? p, t = q.s > p.s ? (want - p.s) / (q.s - p.s) : 0;
    const x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t;
    // Outward: perpendicular to the wall, away from the middle.
    let nx = q.z - p.z, nz = -(q.x - p.x);
    if (nx * x + nz * z < 0) { nx = -nx; nz = -nz; }
    out.push({ x, z, a: p.a + (q.a - p.a) * t, ry: Math.atan2(-nz, nx) });
  }
  return out;
}
