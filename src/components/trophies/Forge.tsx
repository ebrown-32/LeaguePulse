'use client';

/**
 * Championship rings and the league trophy, built in code (lib/trophyDesign decides how each ring
 * looks), for every season without a hand-made ring model, past or still to be played.
 *
 *   ForgedRing     a championship ring, proportioned like one: a heavy band (smooth, ridged or
 *                  faceted), a wide top (round, octagon, square or shield) in the league's colour,
 *                  a centre stone in prongs and a halo of small ones, the league and season
 *                  engraved round the top, the season and the champion along the shoulders
 *   LeagueTrophy   the league's trophy: an obsidian base with glowing inlays and a turning ring of
 *                  runes, a twisted gold stem round a crystal of light, a fluted chalice with swept
 *                  wing handles, and above it a crystal football floating in two orbiting rings,
 *                  motes of light rising round it. A nameplate for every champion, one each: the
 *                  base gains sides (8, 12, 16) and tiers as titles pile up, with empty plates
 *                  waiting for the seasons to come, so it suits a league of any age.
 *   Showcase       the studio both sit in: reflections from built-in light panels (nothing
 *                  downloaded), a contact shadow, drag to spin, scroll or pinch to zoom, the camera
 *                  fitted to the piece. Full screen, a hype beat plays (lib/trophyBeat). It only
 *                  draws while on screen, and stays still for reduced motion.
 *
 * Engraving is drawn on canvases in the site's own display font, sized to fit the space it's cut
 * into (never cropped), and used as colour and relief, so it reads as cut into the metal.
 */

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bounds, ContactShadows, Environment, Lightformer, OrbitControls, Sparkles, useGLTF } from '@react-three/drei';
import {
  AdditiveBlending, Box3, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, ExtrudeGeometry, IcosahedronGeometry,
  LatheGeometry, MeshPhysicalMaterial, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, RingGeometry, SRGBColorSpace,
  Shape, SpriteMaterial, TorusGeometry, TubeGeometry, Vector2, Vector3, type Group, type Texture,
} from 'three';
import { Maximize2, Volume2, VolumeX, X } from '@/components/icons';
import { METALS, ringDesign, themeAccent, type RingDesign } from '@/lib/trophyDesign';
import { trophyBeat } from '@/lib/trophyBeat';
import { cleanTrophyStyle, DEFAULT_TROPHY, type TrophyStyle } from '@/lib/trophyStyle';

// ── Engraving ───────────────────────────────────────────────────────────────

function displayFont(): string {
  if (typeof document === 'undefined') return 'sans-serif';
  const v = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim();
  return v || '"Space Grotesk", system-ui, sans-serif';
}

/** True once the page's fonts have loaded, so engraving is drawn in the right face. */
function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    (document.fonts?.ready ?? Promise.resolve()).then(() => live && setReady(true));
    return () => { live = false; };
  }, []);
  return ready;
}

function canvas(w: number, h: number) {
  const el = document.createElement('canvas');
  el.width = w; el.height = h;
  return { el, c: el.getContext('2d')! };
}

function toTexture(el: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(el);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A canvas in the metal's colour, lettering cut darker into it. */
function engrave(base: string, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, w = 1024, h = 256): Texture {
  const { el, c } = canvas(w, h);
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  c.globalAlpha = 0.05; c.fillStyle = '#000';
  for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1); // brushed
  c.globalAlpha = 1;
  c.fillStyle = new Color(base).multiplyScalar(0.36).getStyle();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  draw(c, w, h);
  return toTexture(el);
}

/** Text as large as fits: never wider than `maxW`, never taller than `size`. */
function fitText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, weight = 800) {
  c.font = `${weight} ${size}px ${displayFont()}`;
  const w = c.measureText(text).width;
  const s = w > maxW ? Math.max(8, Math.floor(size * (maxW / w))) : size;
  c.font = `${weight} ${s}px ${displayFont()}`;
  c.fillText(text, x, y);
}

/** Letters along the top of an arc, centred, shrunk to the arc they have. */
function arcText(c: CanvasRenderingContext2D, text: string, cx: number, cy: number, radius: number, spread: number, size: number) {
  const chars = [...text];
  const measure = (s: number) => { c.font = `800 ${s}px ${displayFont()}`; return chars.map(ch => c.measureText(ch).width); };
  let widths = measure(size), total = widths.reduce((a, b) => a + b, 0);
  const room = radius * spread;
  if (total > room) { widths = measure(Math.floor(size * room / total)); total = widths.reduce((a, b) => a + b, 0); }
  let a = -Math.PI / 2 - (total / radius) / 2;
  chars.forEach((ch, i) => {
    const half = widths[i] / 2 / radius;
    a += half;
    c.save();
    c.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    c.rotate(a + Math.PI / 2);
    c.fillText(ch, 0, 0);
    c.restore();
    a += half;
  });
}

const metalMaterial = (color: string, roughness: number, map?: Texture) => new MeshPhysicalMaterial({
  color: map ? '#ffffff' : color, map, bumpMap: map, bumpScale: map ? -1.4 : 0,
  metalness: 1, roughness, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 1.4,
});

const gemMaterial = (color: string) => new MeshPhysicalMaterial({
  color, metalness: 0, roughness: 0, transmission: 0.9, thickness: 0.4, ior: 2.4,
  clearcoat: 1, specularIntensity: 1, envMapIntensity: 3.4, flatShading: true,
});

/** A soft round glow, added to whatever's behind it. */
function glowTexture(): Texture {
  const { el, c } = canvas(128, 128);
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  return toTexture(el);
}

// ── The ring ────────────────────────────────────────────────────────────────

const R = 0.6, T = 0.17, W = 0.46; // inner radius, band thickness, band width

/** The band's cross-section, a rounded rectangle, turned round the finger. */
function bandGeometry(style: RingDesign['band']) {
  const pts: Vector2[] = [];
  const cx = R + T / 2, hx = T / 2, hy = W / 2, cr = 0.06;
  const corners = [[hx - cr, hy - cr, 0], [-hx + cr, hy - cr, Math.PI / 2], [-hx + cr, -hy + cr, Math.PI], [hx - cr, -hy + cr, Math.PI * 1.5]] as const;
  for (const [ox, oy, a0] of corners) for (let k = 0; k <= 6; k++) {
    const a = a0 + (k / 6) * (Math.PI / 2);
    pts.push(new Vector2(cx + ox + Math.cos(a) * cr, oy + Math.sin(a) * cr));
  }
  pts.push(pts[0].clone());
  return new LatheGeometry(pts, style === 'faceted' ? 18 : 128);
}

function topGeometry(shape: RingDesign['top'], radius: number, height: number) {
  if (shape === 'shield') {
    const s = new Shape();
    s.moveTo(0, radius * 1.05);
    s.quadraticCurveTo(radius * 0.9, radius * 1.0, radius, radius * 0.5);
    s.quadraticCurveTo(radius * 0.98, -radius * 0.5, 0, -radius * 1.02);
    s.quadraticCurveTo(-radius * 0.98, -radius * 0.5, -radius, radius * 0.5);
    s.quadraticCurveTo(-radius * 0.9, radius * 1.0, 0, radius * 1.05);
    const g = new ExtrudeGeometry(s, { depth: height, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 5, curveSegments: 28 });
    g.rotateX(-Math.PI / 2); g.translate(0, -height / 2, 0);
    return g;
  }
  const seg = shape === 'round' ? 72 : shape === 'octagon' ? 8 : 4;
  const g = new CylinderGeometry(radius, radius * 0.84, height, seg, 1);
  g.rotateY(shape === 'octagon' ? Math.PI / 8 : shape === 'square' ? Math.PI / 4 : 0);
  return g;
}

/** The shoulders: an engraved panel on each side of the band, round its top. */
const SH_IN = R + 0.012, SH_OUT = R + T - 0.006, SH_SPREAD = 2.1;

export function ForgedRing({ design, season, champion, league }: { design: RingDesign; season: string; champion?: string | null; league: string }) {
  const ready = useFontsReady();
  const metal = METALS[design.metal];
  const topR = design.top === 'square' ? 0.66 : 0.6, topH = 0.3;
  const y0 = R + T - 0.04 + topH / 2;
  const crown = y0 + topH / 2;

  const mats = useMemo(() => {
    // Round the top: the league and the season, twice, stretched to meet itself exactly.
    const rim = engrave(metal.color, (c, w, h) => {
      const unit = `${league.toUpperCase()}  ★  ${season}  ★  `;
      const reps = 2;
      c.font = `800 ${h * 0.62}px ${displayFont()}`;
      const natural = c.measureText(unit).width;
      c.save(); c.scale((w / reps) / natural, 1);
      for (let k = 0; k < reps; k++) c.fillText(unit, natural / 2 + k * natural, h / 2);
      c.restore();
    }, 2048, 160);
    rim.wrapS = RepeatWrapping;
    // The shoulders, drawn for the panel's own shape: words along its arc.
    // One line along the band's side, as tall as the band is deep.
    const shoulder = (text: string) => engrave(new Color(metal.color).multiplyScalar(0.92).getStyle(), (c, w) => {
      const s = w / (2 * SH_OUT), mid = ((SH_IN + SH_OUT) / 2) * s;
      c.textBaseline = 'middle';
      arcText(c, text, w / 2, w / 2, mid, SH_SPREAD * 0.94, (SH_OUT - SH_IN) * 0.78 * s);
    }, 1024, 1024);
    return {
      plain: metalMaterial(metal.color, metal.roughness),
      faceted: metalMaterial(metal.color, metal.roughness + 0.04),
      rim: metalMaterial(metal.color, metal.roughness, rim),
      left: metalMaterial(metal.color, metal.roughness, shoulder(`${season} CHAMPIONS`)),
      right: metalMaterial(metal.color, metal.roughness, shoulder((champion || `${season} · To be won`).toUpperCase())),
    };
    // `ready`: drawn again once the display font has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, season, champion, league, ready]);

  const geo = useMemo(() => ({
    band: bandGeometry(design.band),
    ridge: new TorusGeometry(R + T + 0.004, 0.016, 8, 160),
    top: topGeometry(design.top, topR, topH),
    field: topGeometry(design.top, topR * 0.8, 0.02),
    tier: new CylinderGeometry(topR * 0.44, topR * 0.5, 0.08, 48),
    halo: new IcosahedronGeometry(0.036, 0),
    stone: new LatheGeometry([new Vector2(0, -0.15), new Vector2(0.21, 0), new Vector2(0.155, 0.07), new Vector2(0, 0.08)], 10),
    prong: new CylinderGeometry(0.017, 0.022, 0.2, 8),
    shoulder: new RingGeometry(SH_IN, SH_OUT, 64, 1, Math.PI / 2 - SH_SPREAD / 2, SH_SPREAD),
  }), [design, topR]);

  const enamel = useMemo(() => new MeshPhysicalMaterial({ color: design.enamel, roughness: 0.2, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 }), [design.enamel]);
  const gem = useMemo(() => gemMaterial(design.stone), [design.stone]);
  const diamond = useMemo(() => gemMaterial('#F6FAFF'), []);
  const fieldTop = crown + 0.01;
  const stoneBase = fieldTop + (design.tiered ? 0.08 : 0.01);
  const haloR = topR * (design.tiered ? 0.64 : 0.58);

  return (
    <group>
      <mesh geometry={geo.band} rotation-x={Math.PI / 2} material={design.band === 'faceted' ? mats.faceted : mats.plain} />
      {design.band === 'ridged' && [-1, 1].map(s => <mesh key={s} geometry={geo.ridge} position-z={s * W * 0.3} material={mats.plain} />)}
      <mesh geometry={geo.top} position-y={y0} material={design.top === 'shield' ? mats.plain : [mats.rim, mats.plain, mats.plain]} />
      <mesh geometry={geo.field} position-y={fieldTop} material={enamel} />
      {design.tiered && <mesh geometry={geo.tier} position-y={fieldTop + 0.04} material={mats.plain} />}
      {Array.from({ length: design.halo }, (_, i) => {
        const a = (i / design.halo) * Math.PI * 2;
        return <mesh key={i} geometry={geo.halo} material={diamond} position={[Math.cos(a) * haloR, fieldTop + 0.035, Math.sin(a) * haloR]} />;
      })}
      <mesh geometry={geo.stone} material={gem} position-y={stoneBase + 0.15} />
      {Array.from({ length: design.prongs }, (_, i) => {
        const a = (i / design.prongs) * Math.PI * 2 + Math.PI / design.prongs;
        return <mesh key={i} geometry={geo.prong} material={mats.plain} position={[Math.cos(a) * 0.185, stoneBase + 0.12, Math.sin(a) * 0.185]} rotation={[Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25]} />;
      })}
      {/* The shoulders: the season on one side, the champion on the other, each read from its own side. */}
      <mesh geometry={geo.shoulder} position-z={W / 2 + 0.003} material={mats.left} />
      <mesh geometry={geo.shoulder} rotation-y={Math.PI} position-z={-W / 2 - 0.003} material={mats.right} />
    </group>
  );
}

// ── The trophy ──────────────────────────────────────────────────────────────

export interface Champion { season: string; name: string }

/** How the base is laid out for a number of champions: sides per tier, tiers, and room to grow. */
export function trophyLayout(champions: number) {
  const sides = champions <= 8 ? 8 : champions <= 24 ? 12 : 16;
  const tiers = Math.max(1, Math.min(6, Math.ceil((champions + 1) / sides)));
  return { sides, tiers, plates: sides * tiers };
}

/** Turns slowly, bobs gently: the floating part of the trophy. */
function Float({ children, y, still }: { children: ReactNode; y: number; still: boolean }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!g.current || still) return;
    const t = clock.elapsedTime;
    g.current.position.y = y + Math.sin(t * 1.3) * 0.05;
    g.current.rotation.y = t * 0.6;
  });
  return <group ref={g} position-y={y}>{children}</group>;
}

/** A flame of light that flickers: the eternal flame crown. */
function Flame({ geometry, material, still }: { geometry: LatheGeometry; material: MeshStandardMaterial; still: boolean }) {
  const m = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!m.current || still) return;
    const t = clock.elapsedTime;
    m.current.scale.set(1 + Math.sin(t * 9) * 0.05, 1 + Math.sin(t * 6.3) * 0.1, 1 + Math.cos(t * 8.1) * 0.05);
  });
  return (
    <group ref={m} position-y={-0.3}>
      <mesh geometry={geometry} material={material} />
      <mesh geometry={geometry} material={material} scale={0.6} position-y={0.04} rotation-y={1} />
    </group>
  );
}

function Spin({ children, speed, axis = 'y', still }: { children: ReactNode; speed: number; axis?: 'x' | 'y' | 'z'; still: boolean }) {
  const g = useRef<Group>(null);
  useFrame((_, dt) => { if (g.current && !still) g.current.rotation[axis] += dt * speed; });
  return <group ref={g}>{children}</group>;
}

const TROPHY_METAL: Record<TrophyStyle['metal'], { color: string; roughness: number }> = {
  gold: METALS.gold, silver: METALS.white, rose: METALS.rose, black: { color: '#3a3b44', roughness: 0.12 },
};

/** A marble's veins, drawn once. */
function marbleTexture(): Texture {
  const { el, c } = canvas(512, 512);
  c.fillStyle = '#eceae6'; c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 14; i++) {
    c.strokeStyle = `rgba(120,118,125,${0.18 + Math.random() * 0.25})`; c.lineWidth = 1 + Math.random() * 3;
    c.beginPath(); let x = Math.random() * 512, y = 0; c.moveTo(x, y);
    while (y < 512) { x += (Math.random() - 0.5) * 60; y += 20 + Math.random() * 30; c.lineTo(x, y); }
    c.stroke();
  }
  return toTexture(el);
}

export function LeagueTrophy({ league, champions, accent: leagueAccent, still = false, style = DEFAULT_TROPHY }: { league: string; champions: Champion[]; accent: string; still?: boolean; style?: TrophyStyle }) {
  const ready = useFontsReady();
  const gold = TROPHY_METAL[style.metal];
  const accent = style.glow === 'league' ? leagueAccent : style.glow;
  const plateBase = new Color(gold.color).lerp(new Color('#ffffff'), style.metal === 'black' ? 0.35 : 0.1).getStyle();
  const { sides, tiers, plates } = trophyLayout(champions.length);
  const tierH = 0.36, baseR = sides === 8 ? 1.05 : sides === 12 ? 1.25 : 1.5;
  const baseTop = tierH * tiers + 0.16;

  const mats = useMemo(() => {
    const sorted = [...champions].sort((a, b) => a.season.localeCompare(b.season));
    // One champion a plate: the year large, the name under it, both sized to the plate.
    const plate = (m?: Champion) => metalMaterial(gold.color, 0.26, engrave(plateBase, (c, w, h) => {
      c.strokeStyle = new Color(plateBase).multiplyScalar(0.55).getStyle(); c.lineWidth = 6;
      c.strokeRect(10, 10, w - 20, h - 20);
      if (!m) { c.globalAlpha = 0.35; fitText(c, '★', w / 2, h / 2, w * 0.3, h * 0.4); return; }
      fitText(c, m.season, w / 2, h * 0.36, w * 0.8, h * 0.4);
      fitText(c, m.name.toUpperCase(), w / 2, h * 0.72, w * 0.86, h * 0.24, 700);
    }, 512, 256));
    const plaque = engrave(gold.color, (c, w, h) => {
      fitText(c, 'CHAMPIONS', w / 2, h * 0.24, w * 0.6, h * 0.16, 700);
      fitText(c, (style.name || league).toUpperCase(), w / 2, h * 0.6, w * 0.92, h * 0.38);
    }, 1024, 512);
    // The runes: a ring of marks round the plinth, glowing in the league's colour.
    const { el, c } = canvas(1024, 1024);
    c.translate(512, 512); c.strokeStyle = '#fff'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, 470, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(0, 0, 380, 0, Math.PI * 2); c.stroke();
    const marks = 24;
    for (let i = 0; i < marks; i++) {
      c.save(); c.rotate((i / marks) * Math.PI * 2);
      c.beginPath();
      const k = i % 4;
      if (k === 0) { c.moveTo(0, -455); c.lineTo(0, -395); c.moveTo(-14, -440); c.lineTo(14, -410); }
      else if (k === 1) { c.moveTo(-16, -450); c.lineTo(0, -400); c.lineTo(16, -450); }
      else if (k === 2) { c.arc(0, -425, 18, 0, Math.PI * 2); }
      else { c.moveTo(-16, -405); c.lineTo(16, -405); c.moveTo(0, -455); c.lineTo(0, -405); c.moveTo(-10, -440); c.lineTo(10, -440); }
      c.stroke(); c.restore();
    }
    return {
      plain: metalMaterial(gold.color, 0.12),
      plates: Array.from({ length: plates }, (_, i) => plate(sorted[i])),
      plaque: metalMaterial(gold.color, 0.14, plaque),
      runes: toTexture(el),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, champions, plates, ready, style.metal, style.name]);

  // The base: obsidian, marble or walnut.
  const obsidian = useMemo(() => style.base === 'marble'
    ? new MeshPhysicalMaterial({ map: marbleTexture(), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 })
    : style.base === 'walnut'
      ? new MeshStandardMaterial({ color: '#3b2416', roughness: 0.38, metalness: 0.05 })
      : new MeshPhysicalMaterial({ color: '#0b0b12', roughness: 0.06, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 }), [style.base]);
  const glow = useMemo(() => new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2.6, toneMapped: false }), [accent]);
  const crystal = useMemo(() => new MeshPhysicalMaterial({
    color: new Color(accent).lerp(new Color('#ffffff'), 0.55), emissive: accent, emissiveIntensity: 0.55,
    roughness: 0.02, metalness: 0, transmission: 0.75, thickness: 0.6, ior: 1.7, iridescence: 1, iridescenceIOR: 1.4,
    clearcoat: 1, envMapIntensity: 2.6,
  }), [accent]);
  const runeMat = useMemo(() => new MeshStandardMaterial({ map: mats.runes, transparent: true, color: accent, emissive: accent, emissiveMap: mats.runes, emissiveIntensity: 2.2, toneMapped: false, depthWrite: false }), [mats.runes, accent]);
  const halo = useMemo(() => new SpriteMaterial({ map: glowTexture(), color: accent, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.85 }), [accent]);

  const geo = useMemo(() => {
    const p = (x: number, y: number) => new Vector2(x, y);
    // The chalice: a bowl with a flared lip and a slender waist.
    const prof = [[0.14, 0], [0.3, 0.08], [0.5, 0.26], [0.62, 0.52], [0.66, 0.8], [0.64, 0.98], [0.74, 1.08], [0.73, 1.12], [0.6, 1.08], [0.57, 0.86], [0.52, 0.56], [0.32, 0.28], [0.001, 0.18]];
    const helix = (phase: number) => new TubeGeometry(new CatmullRomCurve3(Array.from({ length: 40 }, (_, i) => {
      const t = i / 39, a = phase + t * Math.PI * 3;
      return new Vector3(Math.cos(a) * 0.16, t * 0.95, Math.sin(a) * 0.16);
    })), 120, 0.032, 10, false);
    // A wing handle: out from the bowl's waist, up, and back in under the lip.
    const wing = (s: 1 | -1) => new TubeGeometry(new CatmullRomCurve3([
      new Vector3(s * 0.5, 0.42, 0), new Vector3(s * 0.86, 0.38, 0), new Vector3(s * 1.08, 0.66, 0), new Vector3(s * 1.02, 1.06, 0),
      new Vector3(s * 0.84, 1.26, 0), new Vector3(s * 0.7, 1.02, 0),
    ]), 64, 0.045, 12, false);
    return {
      tier: (i: number) => new CylinderGeometry(baseR - i * 0.06, baseR - i * 0.06 + 0.05, tierH, sides, 1),
      inlay: (i: number) => new TorusGeometry(baseR - i * 0.06 + 0.012, 0.012, 6, sides * 8),
      plinth: new CylinderGeometry(baseR - tiers * 0.06 - 0.02, baseR - tiers * 0.06 + 0.02, 0.16, 64),
      runes: new PlaneGeometry(baseR * 1.7, baseR * 1.7),
      shaft: new CylinderGeometry(0.075, 0.075, 0.95, 24),
      helixA: helix(0), helixB: helix(Math.PI),
      collar: new TorusGeometry(0.2, 0.05, 16, 48),
      foot: new LatheGeometry([p(0.001, 0), p(0.5, 0), p(0.5, 0.05), p(0.22, 0.14), p(0.2, 0.18), p(0.001, 0.18)], 64),
      bowl: new LatheGeometry(prof.map(([x, y]) => p(x, y)), 128),
      flutes: new CylinderGeometry(0.035, 0.02, 0.62, 8),
      band: new TorusGeometry(0.665, 0.03, 16, 128),
      plaque: new CylinderGeometry(0.632, 0.632, 0.36, 48, 1, true, -0.62, 1.24),
      wingL: wing(-1), wingR: wing(1),
      ball: new IcosahedronGeometry(0.22, 5),
      loop: new TorusGeometry(0.3, 0.045, 16, 48, Math.PI),
      crownBand: new CylinderGeometry(0.26, 0.22, 0.16, 48, 1, true),
      crownSpike: new CylinderGeometry(0.001, 0.06, 0.2, 12),
      crownGem: new IcosahedronGeometry(0.035, 0),
      star: (() => {
        const sh = new Shape();
        for (let k = 0; k < 10; k++) {
          const r = k % 2 ? 0.13 : 0.32, a = (k / 10) * Math.PI * 2 + Math.PI / 2;
          if (k === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        sh.closePath();
        const g = new ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 3 });
        g.translate(0, 0, -0.04);
        return g;
      })(),
      flame: new LatheGeometry([new Vector2(0.001, 0), new Vector2(0.16, 0.06), new Vector2(0.2, 0.2), new Vector2(0.14, 0.38), new Vector2(0.05, 0.56), new Vector2(0.001, 0.64)], 32),
      orbit: new TorusGeometry(0.46, 0.012, 8, 128),
      plate: (i: number) => {
        const r = baseR - i * 0.06 + 0.025, face = 2 * r * Math.sin(Math.PI / sides);
        return new PlaneGeometry(face * 0.84, tierH * 0.72);
      },
    };
  }, [sides, tiers, baseR]);

  const stemY = baseTop + 0.08;
  const cupY = stemY + 0.18 + 0.95;
  const orbY = cupY + 1.6;
  return (
    <group>
      {/* The base: a tier for every row of champions, an inlay of light along each edge. */}
      {Array.from({ length: tiers }, (_, i) => {
        const y = tierH * i + tierH / 2;
        // On the face, just proud of it: the tier's middle radius, to its flat, plus a hair.
        const r = baseR - i * 0.06 + 0.025;
        const apothem = r * Math.cos(Math.PI / sides) + 0.012;
        return (
          <group key={i}>
            <mesh geometry={geo.tier(i)} position-y={y} material={obsidian} />
            <mesh geometry={geo.inlay(i)} rotation-x={Math.PI / 2} position-y={y + tierH / 2} material={glow} />
            {Array.from({ length: sides }, (_, k) => {
              const a = (k + 0.5) * (2 * Math.PI / sides);
              const plate = mats.plates[i * sides + k];
              return plate ? <mesh key={k} geometry={geo.plate(i)} material={plate} position={[Math.sin(a) * apothem, y, Math.cos(a) * apothem]} rotation-y={a} /> : null;
            })}
          </group>
        );
      })}
      <mesh geometry={geo.plinth} position-y={tierH * tiers + 0.08} material={mats.plain} />
      {style.runes && (
        <Spin speed={0.15} still={still}>
          <mesh geometry={geo.runes} rotation-x={-Math.PI / 2} position-y={baseTop + 0.004} material={runeMat} />
        </Spin>
      )}

      {/* The stem: two strands of gold twisted round a shaft of light. */}
      <group position-y={stemY}>
        <mesh geometry={geo.foot} material={mats.plain} />
        <group position-y={0.18}>
          <mesh geometry={geo.shaft} position-y={0.475} material={crystal} />
          <mesh geometry={geo.helixA} material={mats.plain} />
          <mesh geometry={geo.helixB} material={mats.plain} />
          <mesh geometry={geo.collar} rotation-x={Math.PI / 2} position-y={0.95} material={mats.plain} />
        </group>
      </group>

      {/* The chalice. */}
      <group position-y={cupY}>
        <mesh geometry={geo.bowl} material={mats.plain} />
        {Array.from({ length: 16 }, (_, k) => {
          const a = (k / 16) * Math.PI * 2;
          return <mesh key={k} geometry={geo.flutes} material={mats.plain} position={[Math.sin(a) * 0.53, 0.5, Math.cos(a) * 0.53]} rotation={[Math.cos(a) * 0.38, 0, -Math.sin(a) * 0.38]} />;
        })}
        <mesh geometry={geo.band} rotation-x={Math.PI / 2} position-y={0.98} material={glow} />
        <mesh geometry={geo.plaque} position-y={0.68} material={mats.plaque} />
        {style.handles === 'wings' && <><mesh geometry={geo.wingL} material={mats.plain} /><mesh geometry={geo.wingR} material={mats.plain} /></>}
        {style.handles === 'loops' && <>
          <mesh geometry={geo.loop} rotation-z={-Math.PI / 2} position={[0.66, 0.66, 0]} material={mats.plain} />
          <mesh geometry={geo.loop} rotation-z={Math.PI / 2} position={[-0.66, 0.66, 0]} material={mats.plain} />
        </>}
      </group>

      {/* Above it all: a crystal football, floating, in two rings of light. */}
      <Float y={orbY} still={still}>
        <sprite material={halo} scale={style.crown === 'flame' ? 2.3 : 1.9} />
        {style.crown === 'football' && <mesh geometry={geo.ball} scale={[1.5, 1, 1]} rotation-z={0.3} material={crystal} />}
        {style.crown === 'orb' && <mesh geometry={geo.ball} scale={1.25} material={crystal} />}
        {style.crown === 'star' && <mesh geometry={geo.star} material={mats.plain} />}
        {style.crown === 'crown' && (
          <group position-y={-0.06}>
            <mesh geometry={geo.crownBand} material={mats.plain} />
            {Array.from({ length: 6 }, (_, k) => {
              const a = (k / 6) * Math.PI * 2;
              return (
                <group key={k} position={[Math.cos(a) * 0.245, 0.17, Math.sin(a) * 0.245]}>
                  <mesh geometry={geo.crownSpike} material={mats.plain} />
                  <mesh geometry={geo.crownGem} position-y={0.12} material={crystal} />
                </group>
              );
            })}
          </group>
        )}
        {style.crown === 'flame' && <Flame geometry={geo.flame} material={glow} still={still} />}
        <pointLight color={accent} intensity={6} distance={4} />
        {style.orbits && <>
          <Spin speed={0.9} axis="z" still={still}>
            <mesh geometry={geo.orbit} rotation-x={1.15} material={glow} />
          </Spin>
          <Spin speed={-0.7} axis="x" still={still}>
            <mesh geometry={geo.orbit} rotation-y={1.2} scale={0.86} material={glow} />
          </Spin>
        </>}
      </Float>
      <sprite material={halo} position-y={baseTop + 0.1} scale={[baseR * 2.6, 0.7, 1]} />
      {!still && style.motes && <Sparkles count={40} scale={[baseR * 2, orbY + 0.5, baseR * 2]} position-y={(orbY + 0.5) / 2} size={3} speed={0.35} opacity={0.9} color={accent} noise={0.6} />}
    </group>
  );
}

// ── The studio ──────────────────────────────────────────────────────────────

function useOnScreen<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

/** Light panels for reflections, built here: a studio without downloading one. */
function StudioLight({ dark }: { dark?: boolean }) {
  return (
    <Environment resolution={256} frames={1}>
      {/* Polished metal shows what's round it: a dark room makes gold black. */}
      <color attach="background" args={[dark ? '#3a3540' : '#6d655c']} />
      <Lightformer form="rect" intensity={5} position={[0, 6, 1]} scale={[10, 3, 1]} rotation-x={Math.PI / 2} />
      <Lightformer form="rect" intensity={3.5} position={[-6, 1.5, 1]} scale={[3, 8, 1]} rotation-y={Math.PI / 2} />
      <Lightformer form="rect" intensity={3.5} position={[6, 1.5, -1]} scale={[3, 8, 1]} rotation-y={-Math.PI / 2} />
      <Lightformer form="rect" intensity={2.5} position={[0, 1, 7]} scale={[6, 4, 1]} />
      <Lightformer form="rect" intensity={1.5} position={[0, 1, -7]} scale={[8, 4, 1]} rotation-y={Math.PI} />
      <Lightformer form="ring" color="#ffd27a" intensity={3} position={[0, -4, 0]} scale={6} rotation-x={-Math.PI / 2} />
    </Environment>
  );
}

function stillMotion() {
  return typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced';
}

function Stage({ children, dark }: { children: (still: boolean) => ReactNode; dark?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const visible = useOnScreen(host);
  const still = stillMotion();
  return (
    <div ref={host} className="h-full w-full">
      <Canvas camera={{ position: [0, 0.9, 6], fov: 30 }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}
        frameloop={visible && !still ? 'always' : 'demand'}>
        <ambientLight intensity={0.25} />
        <directionalLight position={[3, 5, 4]} intensity={1.1} />
        <Suspense fallback={null}>
          {/* The camera framed to the piece, whatever its size: a trophy with six tiers fits too. */}
          <Bounds fit clip observe margin={1.12}>{children(still)}</Bounds>
          <ContactShadows position={[0, -0.02, 0]} opacity={0.35} scale={6} blur={2.6} far={3} frames={1} />
          <StudioLight dark={dark} />
        </Suspense>
        <OrbitControls makeDefault autoRotate={!still} autoRotateSpeed={1.2} enablePan={false} enableZoom zoomSpeed={1.1} minPolarAngle={0.25} maxPolarAngle={2.0} />
      </Canvas>
    </div>
  );
}

/**
 * A 3D piece in its own little studio. Full screen it gets the room to itself, and a beat
 * (lib/trophyBeat), started by the tap that opened it, with a button to turn it off.
 */
export function Showcase({ children, height = 200, label, dark }: { children: (still: boolean) => ReactNode; height?: number; label: string; dark?: boolean }) {
  const [full, setFull] = useState(false);
  const [muted, setMuted] = useState(false);
  const open = () => { setFull(true); setMuted(trophyBeat.muted); trophyBeat.start(); };
  const close = () => { setFull(false); trophyBeat.stop(); };
  useEffect(() => () => trophyBeat.stop(), []);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);
  return (
    <>
      <div className="relative w-full overflow-hidden rounded-xl bg-card/60" style={{ height }} aria-label={label} role="img">
        <Stage dark={dark}>{children}</Stage>
        <button onClick={open} aria-label="View fullscreen"
          className="absolute right-2 top-2 rounded-lg bg-background/60 p-1.5 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background/90 hover:text-foreground">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {full && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md" onClick={close}>
          <div className={`relative mx-4 w-full max-w-2xl overflow-hidden rounded-2xl border border-border shadow-2xl ${dark ? 'bg-[#0b0b12]' : 'bg-card'}`} style={{ height: 'min(84vh, 720px)' }} onClick={e => e.stopPropagation()}>
            <Stage dark={dark}>{children}</Stage>
            <p className="pointer-events-none absolute inset-x-0 bottom-3 px-4 text-center text-[12px] font-semibold text-muted-foreground">{label}. Drag to turn it, scroll or pinch to zoom.</p>
            <button onClick={() => { trophyBeat.setMuted(!muted); setMuted(!muted); }} aria-label={muted ? 'Sound on' : 'Sound off'} aria-pressed={!muted}
              className="absolute left-3 top-3 rounded-xl bg-background/60 p-2 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background/90 hover:text-foreground">
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button onClick={close} aria-label="Close"
              className="absolute right-3 top-3 rounded-xl bg-background/60 p-2 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background/90 hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** The league's colour, read once the page has its theme. */
function useAccent(): string | null {
  const [accent, setAccent] = useState<string | null>(null);
  useEffect(() => { setAccent(themeAccent()); }, []);
  return accent;
}

/** A season's ring, built for it. */
export function RingView({ season, league, champion, height = 160 }: { season: string; league: string; champion?: string | null; height?: number }) {
  const accent = useAccent();
  const design = useMemo(() => ringDesign(season, league, accent), [season, league, accent]);
  return (
    <Showcase height={height} label={`The ${season} championship ring${champion ? `, ${champion}` : ''}`}>
      {() => <ForgedRing design={design} season={season} champion={champion} league={league} />}
    </Showcase>
  );
}

/** The league's trophy design (api/trophy), fetched once a page. */
let styleOnce: Promise<TrophyStyle> | null = null;
function useTrophyStyle(): TrophyStyle {
  const [style, setStyle] = useState<TrophyStyle>(DEFAULT_TROPHY);
  useEffect(() => {
    styleOnce ??= fetch('/api/trophy').then(r => r.json()).then(d => cleanTrophyStyle(d?.style)).catch(() => DEFAULT_TROPHY);
    let live = true;
    styleOnce.then(s => live && setStyle(s));
    return () => { live = false; };
  }, []);
  return style;
}

const trophyLabel = (league: string, style: TrophyStyle) => style.name || `${/^the /i.test(league) ? league : `The ${league}`} trophy`;

/** The league's trophy, as its admin designed it, every champion on its base. */
export function TrophyView({ league, champions, height = 320 }: { league: string; champions: Champion[]; height?: number }) {
  const accent = useAccent() ?? '#3BE0B0';
  const style = useTrophyStyle();
  return (
    <Showcase height={height} dark label={trophyLabel(league, style)}>
      {still => <LeagueTrophy league={league} champions={champions} accent={accent} still={still} style={style} />}
    </Showcase>
  );
}

/** The admin's preview, as they change it (admin panel, Trophy tab). */
export function TrophyPreview({ league, champions, style, height = 420 }: { league: string; champions: Champion[]; style: TrophyStyle; height?: number }) {
  const accent = useAccent() ?? '#3BE0B0';
  return (
    <Showcase height={height} dark label={trophyLabel(league, style)}>
      {still => <LeagueTrophy league={league} champions={champions} accent={accent} still={still} style={style} />}
    </Showcase>
  );
}

// ── In a story ──────────────────────────────────────────────────────────────

/** A hand-made ring model (public/models/rings), sized and centred like a built one. */
function ModelRing({ path }: { path: string }) {
  const { scene } = useGLTF(path);
  const obj = useMemo(() => {
    const clone = scene.clone(true);
    const box = new Box3().setFromObject(clone), size = new Vector3();
    box.getSize(size);
    clone.scale.setScalar(1.9 / Math.max(size.x, size.y, size.z, 0.001));
    box.setFromObject(clone);
    const c = new Vector3(); box.getCenter(c);
    clone.position.sub(c);
    return clone;
  }, [scene]);
  return <primitive object={obj} />;
}

/**
 * A piece on its own, turning by itself, for a story slide (League Wrapped): no buttons, and taps
 * pass through to the story (it's tap to advance there), so nothing to drag.
 */
function Piece({ children, height, dark }: { children: (still: boolean) => ReactNode; height: number; dark?: boolean }) {
  return <div className="pointer-events-none w-full" style={{ height }}><Stage dark={dark}>{children}</Stage></div>;
}

/** A season's ring in a story: the hand-made model where the season has one (`model`), else built. */
export function RingPiece({ season, league, champion, model, height = 280 }: { season: string; league: string; champion?: string | null; model?: boolean; height?: number }) {
  const accent = useAccent();
  const design = useMemo(() => ringDesign(season, league, accent), [season, league, accent]);
  return (
    <Piece height={height}>
      {() => (model ? <ModelRing path={`/models/rings/ring-${season}.glb`} /> : <ForgedRing design={design} season={season} champion={champion} league={league} />)}
    </Piece>
  );
}

/** The trophy in a story. */
export function TrophyPiece({ league, champions, height = 340 }: { league: string; champions: Champion[]; height?: number }) {
  const accent = useAccent() ?? '#3BE0B0';
  const style = useTrophyStyle();
  return <Piece height={height} dark>{still => <LeagueTrophy league={league} champions={champions} accent={accent} still={still} style={style} />}</Piece>;
}

/** Pick'em's own trophy: a silver cup on marble, a crystal orb (the all-seeing kind), every winner on its base. */
const PICKEM_CUP: TrophyStyle = { ...DEFAULT_TROPHY, name: 'The Pick\'em Cup', metal: 'silver', base: 'marble', crown: 'orb', handles: 'loops', glow: '#7CC4FF' };
export function PickemCup({ league, champions, height = 300 }: { league: string; champions: Champion[]; height?: number }) {
  const accent = useAccent() ?? '#3BE0B0';
  return (
    <Showcase height={height} dark label="The Pick'em Cup">
      {still => <LeagueTrophy league={league} champions={champions} accent={accent} still={still} style={PICKEM_CUP} />}
    </Showcase>
  );
}
