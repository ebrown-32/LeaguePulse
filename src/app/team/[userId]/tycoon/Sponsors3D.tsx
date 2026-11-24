'use client';

/**
 * A franchise's sponsors, in its stadium (lib/tycoon/sponsors): what each deal buys, built.
 *
 *   Sideline boards   the brand along both sidelines, on the wall in front of the stands
 *   The blimp         the brand's own blimp, circling high over the bowl, its name down both sides
 *   Naming rights     the building's new name, lit, on the rim over both ends
 *   Video boards      the screens cut to the brand between the team's own cards (Stadium3D, Boards)
 *
 * Every mark is drawn here from the brand's colours and name (a made-up brand has no logo file).
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, DoubleSide, SRGBColorSpace, type Group } from 'three';
import type { Blueprint } from '@/lib/franchise/stadiumBlueprint';
import { BRAND, type Brand, type SlotId } from '@/lib/tycoon/sponsors';
import { mix } from './stadiumParts';

export type Partners = Partial<Record<SlotId, string>>;
export const brandOf = (id: string | undefined): Brand | null => (id ? BRAND[id] ?? null : null);

/** The brand's mark, drawn: one of a few shapes in its second colour. */
function drawMark(g: CanvasRenderingContext2D, brand: Brand, cx: number, cy: number, r: number) {
  g.save();
  g.fillStyle = brand.accent; g.strokeStyle = brand.accent; g.lineWidth = r * 0.22;
  g.beginPath();
  switch (brand.mark) {
    case 'ring': g.arc(cx, cy, r * 0.8, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(cx, cy, r * 0.3, 0, Math.PI * 2); g.fill(); break;
    case 'shield': g.moveTo(cx - r * 0.8, cy - r * 0.8); g.lineTo(cx + r * 0.8, cy - r * 0.8); g.lineTo(cx + r * 0.8, cy + r * 0.1); g.quadraticCurveTo(cx + r * 0.7, cy + r * 0.8, cx, cy + r); g.quadraticCurveTo(cx - r * 0.7, cy + r * 0.8, cx - r * 0.8, cy + r * 0.1); g.closePath(); g.fill(); break;
    case 'bolt': g.moveTo(cx + r * 0.25, cy - r); g.lineTo(cx - r * 0.6, cy + r * 0.15); g.lineTo(cx - r * 0.05, cy + r * 0.15); g.lineTo(cx - r * 0.3, cy + r); g.lineTo(cx + r * 0.6, cy - r * 0.2); g.lineTo(cx + r * 0.05, cy - r * 0.2); g.closePath(); g.fill(); break;
    case 'hex': for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i + Math.PI / 6; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); } g.closePath(); g.fill(); break;
    case 'star': for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2, k = i % 2 ? 0.42 : 1; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k); } g.closePath(); g.fill(); break;
    case 'wave': for (const dy of [-0.45, 0, 0.45]) { g.beginPath(); g.moveTo(cx - r, cy + dy * r); g.bezierCurveTo(cx - r * 0.4, cy + dy * r - r * 0.5, cx + r * 0.4, cy + dy * r + r * 0.5, cx + r, cy + dy * r); g.stroke(); } break;
  }
  g.restore();
}

/** A brand's wordmark as a texture: its field, its mark, its name (and a line under it, if given). */
export function useWordmark(brand: Brand | null, w = 1024, h = 256, text?: string, sub?: string) {
  const tex = useMemo(() => {
    if (!brand || typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, mix(brand.bg, '#ffffff', 0.08)); grad.addColorStop(1, mix(brand.bg, '#000000', 0.22));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = brand.accent; g.fillRect(0, h * 0.93, w, h * 0.07);
    const r = h * 0.3, words = (text ?? brand.name).toUpperCase();
    let size = h * (sub ? 0.36 : 0.46);
    g.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    const room = w - r * 2.6 - h * 0.25;
    const m = g.measureText(words).width;
    if (m > room) { size *= room / m; g.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`; }
    const tw = Math.min(room, g.measureText(words).width), x0 = (w - (r * 2.4 + tw)) / 2;
    drawMark(g, brand, x0 + r, h * 0.47, r);
    g.fillStyle = brand.ink; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(words, x0 + r * 2.4, h * (sub ? 0.38 : 0.48));
    if (sub) { g.globalAlpha = 0.85; g.font = `700 ${h * 0.15}px "Helvetica Neue", Arial, sans-serif`; g.fillText(sub.toUpperCase(), x0 + r * 2.4, h * 0.7); g.globalAlpha = 1; }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
    return t;
  }, [brand, w, h, text, sub]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

/** Their name along both sidelines, on the wall in front of the first row. */
export function SidelineBoards({ bp, brand, wallTop }: { bp: Blueprint; brand: Brand; wallTop: number }) {
  const tex = useWordmark(brand, 768, 128);
  const panels = useMemo(() => [Math.PI / 2, -Math.PI / 2].flatMap(mid => [-2, -1, 0, 1, 2].map(k => {
    const a = mid + k * 0.2;
    const [x, z] = bp.outline.around(a, bp.inner - 0.03);
    return { x, z, ry: Math.atan2(-x, -z) };
  })), [bp]);
  if (!tex) return null;
  const h = Math.max(0.16, wallTop * 0.72), w = h * 6;
  return (
    <group>
      {panels.map((p, i) => (
        <mesh key={i} position={[p.x, wallTop * 0.5, p.z]} rotation-y={p.ry}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** The building's name, lit, on the rim over both ends. */
export function NamingSign({ bp, brand, name }: { bp: Blueprint; brand: Brand; name: string }) {
  const tex = useWordmark(brand, 1536, 256, name);
  const spots = useMemo(() => [0, Math.PI].map(a => {
    const [x, z] = bp.outline.around(a, bp.footprint - 0.05);
    return { x, z, ry: Math.atan2(x, z) };
  }), [bp]);
  if (!tex) return null;
  const h = Math.max(0.7, bp.top * 0.3), w = h * 6;
  return (
    <group>
      {spots.map((s, i) => (
        <group key={i} position={[s.x, bp.top + h * 0.75, s.z]} rotation-y={s.ry}>
          <mesh><boxGeometry args={[w + 0.16, h + 0.16, 0.12]} /><meshStandardMaterial color="#17191e" roughness={0.5} /></mesh>
          <mesh position={[0, 0, 0.065]}><planeGeometry args={[w, h]} /><meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.9} /></mesh>
          <mesh position={[0, 0, -0.065]} rotation-y={Math.PI}><planeGeometry args={[w, h]} /><meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.5} /></mesh>
          {[-0.38, 0.38].map(k => <mesh key={k} position={[k * w, -h * 0.75, 0]}><boxGeometry args={[0.08, h * 0.6, 0.08]} /><meshStandardMaterial color="#2b2e33" metalness={0.5} roughness={0.5} /></mesh>)}
        </group>
      ))}
    </group>
  );
}

/** The brand's blimp: slow and high, its name down both sides, a light blinking under it. */
export function Blimp({ bp, brand }: { bp: Blueprint; brand: Brand }) {
  const rig = useRef<Group>(null);
  const tex = useWordmark(brand, 1024, 256);
  // High enough to clear the roof and the planes, low enough to be in the picture from the usual view.
  const radius = bp.footprint + 3.4, alt = bp.top + 4.3;
  useFrame(({ clock }) => {
    const g = rig.current; if (!g) return;
    // The other way round from the planes below it, and slower.
    const t = -clock.elapsedTime * 0.045 + 1.2;
    g.position.set(Math.cos(t) * radius, alt + Math.sin(clock.elapsedTime * 0.3) * 0.2, Math.sin(t) * radius);
    g.rotation.set(0, -t + Math.PI, 0);
  });
  const L = 3.6, R = 0.72;
  return (
    <group ref={rig}>
      {/* Nose along +z. */}
      <mesh scale={[R, R, L / 2]} castShadow><sphereGeometry args={[1, 28, 18]} /><meshStandardMaterial color={brand.bg} roughness={0.45} metalness={0.1} /></mesh>
      <mesh scale={[R * 1.003, R * 0.16, (L / 2) * 1.003]}><sphereGeometry args={[1, 28, 8]} /><meshStandardMaterial color={brand.accent} roughness={0.5} /></mesh>
      {tex && [1, -1].map(side => (
        <mesh key={side} position={[side * (R + 0.012), 0.04, 0.1]} rotation-y={side * Math.PI / 2}>
          <planeGeometry args={[L * 0.56, L * 0.14]} />
          <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.7} side={DoubleSide} />
        </mesh>
      ))}
      {/* Fins, gondola, the light. */}
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map(a => (
        <mesh key={a} position={[Math.sin(a) * R * 0.62, Math.cos(a) * R * 0.62, -L * 0.42]} rotation-z={-a}><boxGeometry args={[0.04, R * 0.9, 0.55]} /><meshStandardMaterial color={mix(brand.bg, '#000000', 0.25)} /></mesh>
      ))}
      <mesh position={[0, -R - 0.1, 0.25]}><boxGeometry args={[0.26, 0.2, 0.7]} /><meshStandardMaterial color="#e9e9e6" roughness={0.4} /></mesh>
      <mesh position={[0, -R - 0.22, 0.25]}><sphereGeometry args={[0.05, 8, 6]} /><meshStandardMaterial color="#ff3b30" emissive="#ff3b30" emissiveIntensity={2} /></mesh>
    </group>
  );
}
