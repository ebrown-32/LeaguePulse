'use client';

/**
 * The franchise's legends around its stadium: the three players who have scored the most points
 * for it, all time (lib/archive/franchises), each a monument cast from their player card: the card,
 * many times life size, in a bronze frame on a stone plinth, facing the plaza. The greatest stands
 * by the main gate and a little taller; the next two by the east and back gates (lib/franchise/
 * plazaPlan places them). Tap one (a tap, not a drag of the view) and its story opens over the
 * stadium (LegendCard). While they load, the plinths stand bare; a place with no legend to fill it
 * (a league with no history yet, or fewer than three players who have scored for the franchise) gets
 * the team's own card, waiting for one.
 */

import { useEffect, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { FranchiseLegend } from '@/lib/archive/franchises';
import type { PlazaSpot } from '@/lib/franchise/plazaPlan';
import { playerPhoto } from '@/lib/playerPhoto';

/** Fetched once a page for each franchise: its legends change a week at a time at most. */
const cache = new Map<string, Promise<FranchiseLegend[]>>();
export function useLegends(franchiseId: string | undefined): FranchiseLegend[] | null {
  const [legends, setLegends] = useState<FranchiseLegend[] | null>(null);
  useEffect(() => {
    if (!franchiseId) return;
    let live = true;
    if (!cache.has(franchiseId)) {
      cache.set(franchiseId, fetch(`/api/franchises/${encodeURIComponent(franchiseId)}/legend`)
        .then(r => (r.ok ? r.json() : null)).then(d => (Array.isArray(d?.legends) ? d.legends : [])).catch(() => []));
    }
    cache.get(franchiseId)!.then(l => { if (live) setLegends(l); });
    return () => { live = false; };
  }, [franchiseId]);
  return legends;
}

/**
 * The legend's player card, painted for the monument: the team's color fading to black, the
 * player's photo, their name and their points for the franchise, the way the desk's player cards
 * look. The photo comes through Next's image route, from this site, so it never taints the canvas.
 */
function useLegendCard(legend: FranchiseLegend | null, team: string, accent: string): CanvasTexture | null {
  const invalidate = useThree(st => st.invalidate);
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    if (!legend || typeof document === 'undefined') { setTexture(null); return; }
    const W = 512, H = 720, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const paint = (photo: HTMLImageElement | null) => {
      const bg = g.createLinearGradient(0, 0, W * 0.4, H);
      bg.addColorStop(0, team); bg.addColorStop(0.78, '#0b0f14');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // The points, huge and faint behind everything.
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.font = '900 260px system-ui, -apple-system, sans-serif';
      g.textAlign = 'center';
      g.fillText(String(Math.round(legend.points)), W / 2, 330);
      if (photo) {
        const h = 420, w = (photo.naturalWidth / photo.naturalHeight) * h;
        g.drawImage(photo, (W - w) / 2, 470 - h, w, h);
      } else {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.font = '900 150px system-ui, -apple-system, sans-serif';
        g.fillText(legend.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase(), W / 2, 360);
      }
      // The nameplate.
      g.fillStyle = 'rgba(8,10,14,0.92)'; g.fillRect(0, 462, W, H - 462);
      g.fillStyle = accent; g.fillRect(0, 462, W, 8);
      g.textAlign = 'left';
      const tag = `NO. ${legend.rank} · FRANCHISE LEGEND`;
      g.font = '900 24px system-ui, -apple-system, sans-serif';
      g.fillStyle = '#ffffff'; g.fillRect(34, 30, g.measureText(tag).width + 24, 40);
      g.fillStyle = '#0b0f14';
      g.fillText(tag, 46, 59);
      let size = 58;
      g.font = `900 ${size}px system-ui, -apple-system, sans-serif`;
      while (g.measureText(legend.name.toUpperCase()).width > W - 68 && size > 30) { size -= 2; g.font = `900 ${size}px system-ui, -apple-system, sans-serif`; }
      g.fillStyle = '#ffffff'; g.fillText(legend.name.toUpperCase(), 34, 532);
      g.fillStyle = 'rgba(255,255,255,0.72)'; g.font = '700 24px system-ui, -apple-system, sans-serif';
      g.fillText([legend.position, legend.nflTeam].filter(Boolean).join(' · '), 34, 570);
      g.fillStyle = '#ffffff'; g.font = '900 76px system-ui, -apple-system, sans-serif';
      const pts = legend.points.toLocaleString('en-US', { maximumFractionDigits: 1 });
      g.fillText(pts, 34, 660);
      const pw = g.measureText(pts).width;
      g.fillStyle = 'rgba(255,255,255,0.72)'; g.font = '800 26px system-ui, -apple-system, sans-serif';
      g.fillText('PTS', 44 + pw, 660);
      g.font = '600 22px system-ui, -apple-system, sans-serif';
      g.fillText(`${legend.games} games · ${legend.seasons} season${legend.seasons === 1 ? '' : 's'} with the franchise`, 34, 700);
      // A frame inside the edge, in the accent.
      g.strokeStyle = accent; g.lineWidth = 6; g.strokeRect(14, 14, W - 28, H - 28);
      tex.needsUpdate = true;
      invalidate();
    };
    paint(null);
    setTexture(tex);
    let done = false;
    const url = playerPhoto({ playerId: legend.playerId, position: legend.position ?? '', nflTeam: legend.nflTeam });
    if (url) {
      const img = new Image();
      img.onload = () => { if (!done) paint(img); };
      img.src = `/_next/image?url=${encodeURIComponent(url)}&w=384&q=75`; // 75: the only quality Next allows unless configured
    }
    return () => { done = true; tex.dispose(); };
  }, [legend, team, accent, invalidate]);
  return texture;
}

/** The card on a plinth with no legend yet: the team's name, and the place waiting for one. */
function useWaitingCard(teamName: string, team: string, accent: string, on: boolean): CanvasTexture | null {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    if (!on || typeof document === 'undefined') { setTexture(null); return; }
    const W = 512, H = 720, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const font = (w: number, px: number) => `${w} ${px}px system-ui, -apple-system, sans-serif`;
    const bg = g.createLinearGradient(0, 0, W * 0.4, H);
    bg.addColorStop(0, team); bg.addColorStop(0.8, '#0b0f14');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.textAlign = 'left';
    g.font = font(900, 24);
    g.fillStyle = '#ffffff'; g.fillRect(34, 30, g.measureText('FRANCHISE LEGEND').width + 24, 40);
    g.fillStyle = '#0b0f14'; g.fillText('FRANCHISE LEGEND', 46, 59);
    // A silhouette where the photo will be.
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.arc(W / 2, 250, 78, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(W / 2, 470, 160, 130, 0, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(8,10,14,0.92)'; g.fillRect(0, 462, W, H - 462);
    g.fillStyle = accent; g.fillRect(0, 462, W, 8);
    let size = 52;
    g.font = font(900, size);
    const name = teamName.toUpperCase();
    while (g.measureText(name).width > W - 68 && size > 26) { size -= 2; g.font = font(900, size); }
    g.fillStyle = '#ffffff'; g.fillText(name, 34, 540);
    g.fillStyle = 'rgba(255,255,255,0.72)'; g.font = font(700, 26);
    g.fillText('This spot is waiting', 34, 610);
    g.fillText('to be earned.', 34, 646);
    g.strokeStyle = accent; g.lineWidth = 6; g.strokeRect(14, 14, W - 28, H - 28);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    setTexture(t);
    return () => t.dispose();
  }, [teamName, team, accent, on]);
  return texture;
}

export function LegendStatues({ spots, franchiseId, teamName, team, accent, onPick }: {
  spots: PlazaSpot[]; franchiseId?: string; teamName: string; team: string; accent: string;
  /** Opens a legend's story; left out (a photograph), the statues can't be tapped. */
  onPick?: (legend: FranchiseLegend) => void;
}) {
  const legends = useLegends(franchiseId);
  return (
    <>
      {spots.map((at, i) => (
        <LegendStatue key={i} at={at} legend={legends?.[i] ?? null} loading={!legends && Boolean(franchiseId)} teamName={teamName}
          scale={i === 0 ? 1 : 0.86} team={team} accent={accent} onPick={onPick} />
      ))}
    </>
  );
}

function LegendStatue({ at, legend, loading, teamName, scale, team, accent, onPick }: {
  at: PlazaSpot; legend: FranchiseLegend | null; loading: boolean; teamName: string; scale: number; team: string; accent: string; onPick?: (l: FranchiseLegend) => void;
}) {
  const card = useLegendCard(legend, team, accent);
  const waiting = useWaitingCard(teamName, team, accent, !legend && !loading);
  const invalidate = useThree(st => st.invalidate);
  const [hover, setHover] = useState(false);
  useEffect(() => () => { if (hover) document.body.style.cursor = ''; }, [hover]);
  const tappable = Boolean(card && legend && onPick);
  const face = card ?? waiting;
  const handlers = tappable ? {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      // A drag of the view that ends on a statue isn't a tap.
      if (e.delta > 6) return;
      e.stopPropagation();
      onPick!(legend!);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; invalidate(); },
    onPointerOut: () => { setHover(false); document.body.style.cursor = ''; invalidate(); },
  } : {};
  const bronze = <meshStandardMaterial color="#8c6a3a" metalness={0.35} roughness={0.45} />;
  const stone = <meshStandardMaterial color="#d6d0c4" roughness={0.85} />;
  // Facing out to the plaza: the spot's local x points away from the stadium, a plane faces its +z.
  const ry = at.ry + Math.PI / 2;
  if (face) {
    const W = 0.46, H = 0.64, base = 0.16;
    return (
      <group position={[at.x, 0, at.z]} rotation-y={ry} scale={scale * (hover ? 1.04 : 1)} {...handlers}>
        <mesh position={[0, 0.04, 0]} castShadow receiveShadow><boxGeometry args={[0.62, 0.08, 0.36]} />{stone}</mesh>
        <mesh position={[0, 0.12, 0]} castShadow><boxGeometry args={[0.54, 0.08, 0.24]} />{stone}</mesh>
        <mesh position={[0, base + H / 2 + 0.02, 0]} castShadow><boxGeometry args={[W + 0.05, H + 0.05, 0.045]} />{bronze}</mesh>
        <mesh position={[0, base + H / 2 + 0.02, 0.024]}>
          <planeGeometry args={[W, H]} />
          {/* Unlit, like a lit sign: readable by day and by night. */}
          <meshBasicMaterial map={face} />
        </mesh>
        {/* The back: the team's color in the bronze frame. */}
        <mesh position={[0, base + H / 2 + 0.02, -0.024]} rotation-y={Math.PI}><planeGeometry args={[W, H]} /><meshStandardMaterial color={team} roughness={0.6} /></mesh>
        <mesh position={[0, 0.12, 0.122]}><planeGeometry args={[0.3, 0.05]} /><meshStandardMaterial color={team} /></mesh>
      </group>
    );
  }
  // Loading: the plinth, bare for a moment.
  return (
    <group position={[at.x, 0, at.z]} rotation-y={ry} scale={scale}>
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow><boxGeometry args={[0.62, 0.08, 0.36]} />{stone}</mesh>
      <mesh position={[0, 0.12, 0]} castShadow><boxGeometry args={[0.54, 0.08, 0.24]} />{stone}</mesh>
    </group>
  );
}
