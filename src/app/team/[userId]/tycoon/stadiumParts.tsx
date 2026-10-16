'use client';

/** Small pieces the stadium and its grounds share. */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Object3D, type Group, type InstancedMesh } from 'three';
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
export function Instanced({ items, children, color, emissive, emissiveIntensity = 0, roughness = 0.8, cast = true, flat = false }: {
  items: Item[]; children: React.ReactNode; color?: string; emissive?: string; emissiveIntensity?: number; roughness?: number; cast?: boolean; flat?: boolean;
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
      {children}
      <meshStandardMaterial color={items[0].c ? undefined : color} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={roughness} flatShading={flat} />
    </instancedMesh>
  );
}

export function Boxes({ size, ...rest }: Omit<Parameters<typeof Instanced>[0], 'children'> & { size: [number, number, number] }) {
  return <Instanced {...rest}><boxGeometry args={size} /></Instanced>;
}

/** Grows a child from nothing to full height when it first appears. */
export function Rise({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
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

/** Points spaced about `step` apart along a sweep of the outline at size r(a). */
export function along(o: Outline, from: number, to: number, r: (a: number) => number, step: number): { x: number; z: number; a: number }[] {
  // Measure the sweep's length first, then place evenly by length.
  const N = 200, pts: { x: number; z: number; a: number; s: number }[] = [];
  let s = 0, prev: [number, number] | null = null;
  for (let i = 0; i <= N; i++) {
    const a = from + ((to - from) * i) / N;
    const p = o.around(a, r(a));
    if (prev) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    pts.push({ x: p[0], z: p[1], a, s }); prev = p;
  }
  const count = Math.max(1, Math.round(s / step));
  const out: { x: number; z: number; a: number }[] = [];
  let j = 0;
  for (let n = 0; n < count; n++) {
    const want = ((n + 0.5) / count) * s;
    while (j < pts.length - 1 && pts[j + 1].s < want) j++;
    out.push(pts[j]);
  }
  return out;
}
