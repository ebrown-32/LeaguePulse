'use client';

/**
 * The football field inside the stadium, a regulation gridiron to scale (a yard
 * is U world units). The ground is painted on one canvas: turf, the white
 * border, goal lines, yard lines, hash marks, the try lines, yard numbers with
 * their arrows, end zones with the team's name, the team's logo at midfield
 * (its initials until the logo loads, or when it has none), and the team
 * areas. What stands on it is 3D: pylons, goalposts, benches, both sidelines,
 * both teams lined up at the line of scrimmage, the officials and the chain crew.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { CanvasTexture, Color, Object3D, SRGBColorSpace, type InstancedMesh } from 'three';
import type { StadiumLook } from '@/lib/franchise/model';

/** World units per yard. */
export const U = 0.058;
/** The painted ground in yards: the field (120 by 53⅓) and room around it for the team areas. */
export const PAINTED = { long: 126, wide: 68 };
/** The turf around the field, shared with the bowl's floor so the two meet without a seam. */
export const APRON = '#2f6f35';

const HALF = 160 / 6; // half the field's width, 26⅔ yards
const PX = 20; // canvas pixels per yard
const WHITE = '#f6f6f1';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; };
}
const luminance = (hex: string) => { const c = new Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
const initials = (name: string) => name.split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 3).map(w => w[0].toUpperCase()).join('') || 'LP';

/** Paints the ground. x runs goal to goal, z sideline to sideline; (0, 0) is midfield. */
function paint(turf: StadiumLook['turf'], color: string, team: string, logo: HTMLImageElement | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PAINTED.long * PX; canvas.height = PAINTED.wide * PX;
  const g = canvas.getContext('2d')!;
  const X = (x: number) => (x + PAINTED.long / 2) * PX, Z = (z: number) => (z + PAINTED.wide / 2) * PX;
  const rect = (x0: number, z0: number, x1: number, z1: number, fill: string) => { g.fillStyle = fill; g.fillRect(X(x0), Z(z0), (x1 - x0) * PX, (z1 - z0) * PX); };
  const line = (x: number, z0: number, z1: number, w: number) => rect(x - w / 2, z0, x + w / 2, z1, WHITE);
  const ink = luminance(color) > 0.55 ? '#15181c' : '#ffffff';

  // Turf: mowed in five-yard bands, checks, or plain grass.
  rect(-PAINTED.long / 2, -PAINTED.wide / 2, PAINTED.long / 2, PAINTED.wide / 2, APRON);
  rect(-60, -HALF, 60, HALF, '#3a8a3e');
  const alt = '#317a36';
  for (let k = 0; k < 20; k++) {
    if (turf === 'stripes' && k % 2) rect(-50 + k * 5, -HALF, -45 + k * 5, HALF, alt);
    if (turf === 'checker') for (let j = 0; j < 6; j++) if ((k + j) % 2) rect(-50 + k * 5, -HALF + (j * HALF) / 3, -45 + k * 5, -HALF + ((j + 1) * HALF) / 3, alt);
  }
  const r = rng(9);
  for (let i = 0; i < 70_000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
    g.fillRect(r() * canvas.width, r() * canvas.height, 2, 2);
  }

  // End zones: the team's color with its name, or grass with old-school diagonals.
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -60 : 50;
    g.save();
    g.beginPath(); g.rect(X(x0), Z(-HALF), 10 * PX, 2 * HALF * PX); g.clip();
    if (turf !== 'classic') rect(x0, -HALF, x0 + 10, HALF, color);
    else {
      g.strokeStyle = color; g.lineWidth = 0.7 * PX;
      for (let t = -HALF - 12; t < HALF + 12; t += 3.2) {
        g.beginPath(); g.moveTo(X(x0), Z(t)); g.lineTo(X(x0 + 10), Z(t + 10 * s)); g.stroke();
      }
    }
    g.restore();
    // The name reads upright from the field, its tops toward the end line.
    g.save();
    g.translate(X(x0 + 5), Z(0)); g.rotate((s * Math.PI) / 2);
    const word = team.toUpperCase();
    let size = 6.4 * PX;
    const font = () => `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    g.font = font();
    const w = g.measureText(word).width;
    if (w > 46 * PX) { size *= (46 * PX) / w; g.font = font(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (turf === 'classic') {
      g.lineWidth = 0.45 * PX; g.strokeStyle = WHITE; g.lineJoin = 'round';
      g.strokeText(word, 0, 0); g.fillStyle = color; g.fillText(word, 0, 0);
    } else { g.fillStyle = ink; g.fillText(word, 0, 0); }
    g.restore();
  }

  // The border, goal lines, yard lines, the try lines and the hash marks.
  rect(-62, -HALF - 2, 62, -HALF, WHITE); rect(-62, HALF, 62, HALF + 2, WHITE);
  rect(-62, -HALF, -60, HALF, WHITE); rect(60, -HALF, 62, HALF, WHITE);
  for (const s of [-1, 1]) { line(50 * s, -HALF, HALF, 0.22); line(48 * s, -0.5, 0.5, 0.11); }
  for (let x = -45; x <= 45; x += 5) line(x, -HALF + 0.25, HALF - 0.25, 0.11);
  for (let x = -49; x <= 49; x++) {
    if (x % 5 === 0) continue;
    for (const s of [-1, 1]) {
      line(x, s > 0 ? HALF - 1 : -HALF + 0.33, s > 0 ? HALF - 0.33 : -HALF + 1, 0.11); // along the sidelines
      line(x, s > 0 ? 3.08 : -3.75, s > 0 ? 3.75 : -3.08, 0.11); // the inbounds hashes
    }
  }

  // Midfield: the team's logo in a ring, or its initials.
  const R = 6 * PX;
  g.beginPath(); g.arc(X(0), Z(0), R, 0, Math.PI * 2);
  g.fillStyle = color; g.fill();
  if (logo) {
    g.save(); g.beginPath(); g.arc(X(0), Z(0), R, 0, Math.PI * 2); g.clip();
    const k = Math.max((2 * R) / logo.naturalWidth, (2 * R) / logo.naturalHeight); // cover the circle
    const w = logo.naturalWidth * k, h = logo.naturalHeight * k;
    g.drawImage(logo, X(0) - w / 2, Z(0) - h / 2, w, h);
    g.restore();
  } else {
    const mark = initials(team);
    g.font = `900 ${(mark.length > 2 ? 3.6 : 4.6) * PX}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(mark, X(0), Z(0) + 0.2 * PX);
  }
  g.beginPath(); g.arc(X(0), Z(0), R, 0, Math.PI * 2);
  g.lineWidth = 0.5 * PX; g.strokeStyle = WHITE; g.stroke();

  // Yard numbers, 12 yards in from each sideline, read from that sideline, with arrows toward the nearer goal.
  g.font = `700 ${2.7 * PX}px "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif`;
  g.fillStyle = WHITE; g.textBaseline = 'middle';
  for (let x = -40; x <= 40; x += 10) {
    const v = String(50 - Math.abs(x));
    for (const side of [1, -1]) {
      g.save();
      g.translate(X(x), Z(side * (HALF - 13))); if (side < 0) g.rotate(Math.PI);
      g.textAlign = 'right'; g.fillText(v[0], -0.35 * PX, 0);
      g.textAlign = 'left'; g.fillText(v[1], 0.35 * PX, 0);
      if (x) {
        const dir = Math.sign(x) * side;
        const edge = dir * (g.measureText(v[1]).width + 0.75 * PX);
        g.beginPath();
        g.moveTo(edge + dir * 0.75 * PX, -0.55 * PX);
        g.lineTo(edge, -0.95 * PX); g.lineTo(edge, -0.15 * PX); g.closePath(); g.fill();
      }
      g.restore();
    }
  }

  // The team areas between the 32s: the coaching box's dashed yellow line and the bench area.
  for (const s of [-1, 1]) {
    g.strokeStyle = '#f4d03f'; g.lineWidth = 0.18 * PX; g.setLineDash([0.9 * PX, 0.7 * PX]);
    g.beginPath(); g.moveTo(X(-18), Z(s * (HALF + 4))); g.lineTo(X(18), Z(s * (HALF + 4))); g.stroke();
    g.setLineDash([]); g.strokeStyle = WHITE; g.lineWidth = 0.15 * PX;
    const z0 = s * (HALF + 4.6), z1 = s * (HALF + 7.6);
    g.strokeRect(X(-18), Z(Math.min(z0, z1)), 36 * PX, 3 * PX);
  }
  return canvas;
}

interface Piece { x: number; y: number; z: number; c: string; sy?: number }

/** Instanced boxes in yards, each its own color. */
function Pieces({ items, size, cast = true }: { items: Piece[]; size: [number, number, number]; cast?: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const d = new Object3D();
    items.forEach((it, i) => {
      d.position.set(it.x * U, it.y * U, it.z * U); d.scale.set(1, it.sy ?? 1, 1);
      d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, new Color(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, items.length)]} key={items.length} castShadow={cast} receiveShadow>
      <boxGeometry args={[size[0] * U, size[1] * U, size[2] * U]} />
      <meshStandardMaterial roughness={0.7} />
    </instancedMesh>
  );
}

/** A goalpost: the gooseneck behind the end line, the crossbar 10 feet up over it, uprights 18½ feet apart. */
function Goalpost({ side, color }: { side: number; color: string }) {
  const yellow = <meshStandardMaterial color="#f2c81b" roughness={0.45} metalness={0.2} />;
  const rad = 0.2 * U;
  const back = (62.2 * side - 60 * side) * U;
  return (
    <group position={[60 * side * U, 0, 0]}>
      <mesh position={[back, 1.5 * U, 0]} castShadow><cylinderGeometry args={[rad * 1.3, rad * 1.3, 3 * U, 8]} />{yellow}</mesh>
      <mesh position={[back, 1 * U, 0]}><cylinderGeometry args={[rad * 2.6, rad * 2.6, 2 * U, 10]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
      <mesh position={[back / 2, 3 * U, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[rad, rad, Math.abs(back), 8]} />{yellow}</mesh>
      <mesh position={[0, 3.17 * U, 0]}><cylinderGeometry args={[rad, rad, 0.34 * U, 8]} />{yellow}</mesh>
      <mesh position={[0, 3.33 * U, 0]} rotation-x={Math.PI / 2} castShadow><cylinderGeometry args={[rad, rad, 6.17 * U, 8]} />{yellow}</mesh>
      {[-1, 1].map(z => (
        <group key={z} position={[0, 0, z * 3.08 * U]}>
          <mesh position={[0, (3.33 + 5.83) * U, 0]} castShadow><cylinderGeometry args={[rad * 0.85, rad * 0.85, 11.67 * U, 8]} />{yellow}</mesh>
          <mesh position={[0, 15.4 * U, 0]}><boxGeometry args={[0.15 * U, 1.3 * U, 0.5 * U]} /><meshStandardMaterial color="#e8541f" /></mesh>
        </group>
      ))}
    </group>
  );
}

const SCRIMMAGE = -15; // the offense on its own 35, going toward +x

/**
 * `logo` must be same-origin (the franchise's logo route, or a picture through
 * Next's image route): a picture from another site would taint the canvas and
 * WebGL would refuse it.
 */
export function Gridiron({ look, color, team, logo }: { look: StadiumLook; color: string; team: string; logo?: string | null }) {
  const aniso = useThree(s => s.gl.capabilities.getMaxAnisotropy());
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImage(null);
    if (!logo) return;
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = logo;
    return () => { img.onload = null; };
  }, [logo]);
  const texture = useMemo(() => {
    const t = new CanvasTexture(paint(look.turf, color, team, image));
    t.colorSpace = SRGBColorSpace; t.anisotropy = aniso;
    return t;
  }, [look.turf, color, team, image, aniso]);
  useEffect(() => () => texture.dispose(), [texture]);

  const { bodies, helmets, pylons, sticks, benches } = useMemo(() => {
    const r = rng(23);
    const home = color, homeHelmet = `#${new Color(color).multiplyScalar(0.55).getHexString()}`;
    const bodies: Piece[] = [], helmets: Piece[] = [];
    const person = (x: number, z: number, jersey: string, helmet: string) => {
      bodies.push({ x, y: 0.75, z, c: jersey }); helmets.push({ x, y: 1.7, z, c: helmet });
    };
    // Eleven on each side of the ball.
    const offense: [number, number][] = [[-0.6, 0], [-0.8, 1.3], [-0.8, -1.3], [-1, 2.6], [-1, -2.6], [-1, 3.9], [-0.8, 20], [-0.8, -20], [-1.5, -14], [-5, 0], [-5.5, 1.6]];
    const defense: [number, number][] = [[1, 1], [1, -1], [1, 3.2], [1, -3.2], [5, 2.2], [5, -2.2], [6, 20], [6, -20], [5, -14], [12, 8], [12, -8]];
    for (const [dx, z] of offense) person(SCRIMMAGE + dx, z, home, homeHelmet);
    for (const [dx, z] of defense) person(SCRIMMAGE + dx, z, '#f2f2f2', '#8a9099');
    // The officials, in stripes that read gray from the stands.
    for (const [x, z] of [[-27, 2], [-8, -3.5], [SCRIMMAGE, HALF + 0.8], [SCRIMMAGE, -HALF - 0.8], [2, 0], [5, 18], [5, -18]] as [number, number][]) person(x, z, '#a3a3a3', '#141414');
    // Both sidelines, the home team on the near side.
    for (const s of [1, -1]) for (let i = 0; i < 40; i++) {
      person(-17 + r() * 34, s * (HALF + 4.4 + r() * 2.8), s > 0 ? home : '#f2f2f2', s > 0 ? homeHelmet : '#8a9099');
    }
    const pylons: Piece[] = [];
    for (const x of [-60, -50, 50, 60]) for (const z of [-HALF, HALF]) pylons.push({ x, y: 0.5, z, c: '#ff6a1a' });
    // The chain crew on the far sideline: the rods ten yards apart, the down box at the ball.
    const sticks: Piece[] = [SCRIMMAGE, SCRIMMAGE + 10, SCRIMMAGE].map((x, i) => ({ x, y: 1.4, z: -HALF - 2.6 - (i === 2 ? 0.8 : 0), c: '#ff6a1a' }));
    const benches: Piece[] = [];
    for (const s of [1, -1]) for (let k = 0; k < 6; k++) benches.push({ x: -13.5 + k * 5.4, y: 0.3, z: s * (HALF + 7.4), c: s > 0 ? color : '#5b6470' });
    return { bodies, helmets, pylons, sticks, benches };
  }, [color]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} receiveShadow>
        <planeGeometry args={[PAINTED.long * U, PAINTED.wide * U]} />
        <meshStandardMaterial map={texture} roughness={0.95} />
      </mesh>
      <Pieces items={bodies} size={[0.55, 1.4, 0.42]} />
      <Pieces items={helmets} size={[0.4, 0.42, 0.4]} />
      {/* Pylons are drawn a little larger than life so they read from the stands. */}
      <Pieces items={pylons} size={[0.3, 1, 0.3]} />
      <Pieces items={sticks} size={[0.12, 2.8, 0.12]} />
      <Pieces items={benches} size={[4.8, 0.6, 0.9]} />
      <mesh position={[SCRIMMAGE * U, 0.2 * U, 0]} scale={[1.6, 1, 1]}><sphereGeometry args={[0.16 * U, 10, 8]} /><meshStandardMaterial color="#7a3d17" /></mesh>
      <Goalpost side={1} color={color} />
      <Goalpost side={-1} color={color} />
    </group>
  );
}
