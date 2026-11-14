'use client';

/**
 * A stadium dressed for the week (lib/rivalryWeek, api/rivalry-week):
 *
 *   Rivalry week   a ring of flags round the outside in both teams' colours, a drop banner down
 *                  two sides ("RIVALRY WEEK", the opponent and the all-time record), and RIVALRY
 *                  WEEK on the video boards (Stadium3D).
 *   The shame      a week after losing a rivalry game, a little plane circles the stadium towing
 *                  the winner's banner: "{WINNER} OWNS THIS PLACE", in the winner's colour.
 *
 * Read once per franchise per page (`useDressing`). Nothing in a photograph: a picture of a
 * stadium is of the stadium.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, DoubleSide, SRGBColorSpace, type Group, type Mesh } from 'three';
import type { Blueprint } from '@/lib/franchise/stadiumBlueprint';
import type { Dressing } from '@/lib/rivalryWeek';
import { inkOn } from './Gridiron';
import { mix } from './stadiumParts';

const cache = new Map<string, Promise<Dressing | null>>();

export function useDressing(franchiseId: string | undefined, enabled: boolean): Dressing | null {
  const [d, setD] = useState<Dressing | null>(null);
  useEffect(() => {
    if (!franchiseId || !enabled) { setD(null); return; }
    let live = true;
    if (!cache.has(franchiseId)) {
      cache.set(franchiseId, fetch(`/api/rivalry-week?franchise=${encodeURIComponent(franchiseId)}`)
        .then(r => (r.ok ? r.json() : null)).then(x => (x && (x.rivalry || x.shame) ? x as Dressing : null)).catch(() => null));
    }
    cache.get(franchiseId)!.then(x => live && setD(x));
    return () => { live = false; };
  }, [franchiseId, enabled]);
  return d;
}

/** A canvas banner: big words, a smaller line under, a stripe. */
function useBanner(lines: [string, string], bg: string, stripe: string, w = 1024, h = 256) {
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, mix(bg, '#ffffff', 0.1)); grad.addColorStop(1, mix(bg, '#000000', 0.3));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = stripe; g.fillRect(0, 0, w, h * 0.06); g.fillRect(0, h * 0.94, w, h * 0.06);
    const ink = inkOn(bg);
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fit = (text: string, size: number, y: number, weight = 900) => {
      g.font = `${weight} ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
      const m = g.measureText(text).width;
      if (m > w * 0.92) g.font = `${weight} ${size * (w * 0.92) / m}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
      g.fillText(text, w / 2, y);
    };
    fit(lines[0].toUpperCase(), h * 0.42, lines[1] ? h * 0.4 : h * 0.5);
    if (lines[1]) { g.globalAlpha = 0.85; fit(lines[1].toUpperCase(), h * 0.2, h * 0.76, 800); g.globalAlpha = 1; }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [lines[0], lines[1], bg, stripe, w, h]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

/** One flag on its pole, rippling a little. */
function Flag({ at, color, phase }: { at: [number, number]; color: string; phase: number }) {
  const cloth = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const m = cloth.current; if (!m) return;
    m.rotation.y = Math.sin(clock.elapsedTime * 2.1 + phase) * 0.28;
    m.scale.x = 0.92 + Math.sin(clock.elapsedTime * 3.3 + phase) * 0.08;
  });
  const h = 1.6;
  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh position={[0, h / 2, 0]}><cylinderGeometry args={[0.018, 0.024, h, 6]} /><meshStandardMaterial color="#c9ccd1" metalness={0.6} roughness={0.35} /></mesh>
      <mesh position={[0, h + 0.03, 0]}><sphereGeometry args={[0.035, 8, 6]} /><meshStandardMaterial color="#e8c35a" metalness={0.8} roughness={0.25} /></mesh>
      <group position={[0, h - 0.2, 0]}>
        <mesh ref={cloth} position={[0.24, 0, 0]}>
          <planeGeometry args={[0.48, 0.32]} />
          <meshStandardMaterial color={color} side={DoubleSide} roughness={0.8} emissive={color} emissiveIntensity={0.12} />
        </mesh>
      </group>
    </group>
  );
}

/** Rivalry week: flags round the outside, a drop banner down two sides. */
export function RivalryDress({ bp, home, rival, opponent, record }: { bp: Blueprint; home: string; rival: string; opponent: string; record: string }) {
  const r = bp.footprint + 0.55;
  const flags = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    return { at: bp.outline.around(a, r) as [number, number], color: i % 2 ? rival : home, phase: i * 0.7 };
  }), [bp, r, home, rival]);
  const tex = useBanner(['Rivalry week', `vs ${opponent}  ·  all-time ${record}`], home, rival);
  const bh = Math.max(0.7, bp.top * 0.42), bw = bh * 4;
  const drops = useMemo(() => [Math.PI / 2, -Math.PI / 2].map(a => {
    const [x, z] = bp.outline.around(a, bp.footprint + 0.06);
    return { x, z, ry: Math.atan2(x, z) };
  }), [bp]);
  return (
    <group>
      {flags.map((f, i) => <Flag key={i} {...f} />)}
      {tex && drops.map((d, i) => (
        <group key={i} position={[d.x, bp.top * 0.55, d.z]} rotation-y={d.ry}>
          <mesh><planeGeometry args={[bw, bh]} /><meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.35} side={DoubleSide} roughness={0.7} /></mesh>
          {/* The rod it hangs from. */}
          <mesh position={[0, bh / 2 + 0.03, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.025, 0.025, bw + 0.12, 6]} /><meshStandardMaterial color="#2b2e33" metalness={0.5} /></mesh>
        </group>
      ))}
    </group>
  );
}

/** A little banner plane, circling the stadium of a team that lost its rivalry game. */
export function ShameFlyover({ bp, by, color }: { bp: Blueprint; by: string; color: string }) {
  const rig = useRef<Group>(null);
  const banner = useRef<Mesh>(null);
  const prop = useRef<Mesh>(null);
  const tex = useBanner([`${by} owns this place`, ''], color, '#ffffff', 1024, 160);
  const radius = bp.footprint + 2.4, alt = bp.top + 3.2;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.12;
    const g = rig.current; if (!g) return;
    g.position.set(Math.cos(t) * radius, alt + Math.sin(t * 3) * 0.25, Math.sin(t) * radius);
    // Nose along the circle, banked into the turn.
    g.rotation.set(0, -t, 0);
    g.rotateZ(0.12);
    if (banner.current) banner.current.rotation.x = Math.sin(clock.elapsedTime * 4) * 0.08;
    if (prop.current) prop.current.rotation.x = clock.elapsedTime * 40;
  });
  const bw = 4.2, bh = 0.66;
  return (
    <group ref={rig}>
      {/* Facing +z along the circle: the plane, then the tow line, then the banner trailing behind. */}
      <group>
        <mesh rotation-x={Math.PI / 2}><capsuleGeometry args={[0.09, 0.5, 4, 8]} /><meshStandardMaterial color="#f2f2f0" roughness={0.4} /></mesh>
        <mesh position={[0, 0.02, 0.06]}><boxGeometry args={[1.0, 0.025, 0.16]} /><meshStandardMaterial color="#f2f2f0" /></mesh>
        <mesh position={[0, 0.02, 0.06]}><boxGeometry args={[1.0, 0.012, 0.03]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0, 0.03, -0.3]}><boxGeometry args={[0.36, 0.02, 0.1]} /><meshStandardMaterial color="#f2f2f0" /></mesh>
        <mesh position={[0, 0.1, -0.31]}><boxGeometry args={[0.02, 0.16, 0.1]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0, 0.04, 0.12]}><sphereGeometry args={[0.06, 8, 6]} /><meshStandardMaterial color="#1c2a3a" metalness={0.4} roughness={0.2} /></mesh>
        <mesh ref={prop} position={[0, 0, 0.36]}><boxGeometry args={[0.01, 0.3, 0.03]} /><meshStandardMaterial color="#333" /></mesh>
      </group>
      <mesh position={[0, 0, -0.95]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.004, 0.004, 1.2, 3]} /><meshStandardMaterial color="#888" /></mesh>
      {tex && (
        <mesh ref={banner} position={[0, -0.05, -1.55 - bw / 2]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[bw, bh]} />
          <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.45} side={DoubleSide} roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}
