'use client';

/**
 * A franchise's roster on its stadium's home sideline, when there's no game on: a card for each
 * player, as they wait there in Watch Live (LiveField), but standing in the world rather than
 * laid over it, so the stands hide them like anything else from outside the bowl. Each card is
 * painted on a canvas (photo, position, name, points this season) and turns to face the camera.
 * The starters line the far sideline (-z), the one the stadium's camera looks across to when it
 * first opens, and the bench the near one. Inside the stadium's Canvas.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace, type Group } from 'three';
import { U } from './Gridiron';
import { playerPhoto } from '@/lib/playerPhoto';

export interface RosterPlayer { playerId: string; name: string; position: string; nflTeam: string; points: number | null; starter?: boolean }

// Big enough to read from the stadium's overview: a sideline of them, two deep.
const W = 0.42, H = 0.58;
const CW = 256, CH = Math.round((CW * H) / W);

/** The card, painted the way Watch Live's look: dark, a border in the team's color, the photo on a glow. */
function useCardTexture(p: RosterPlayer, color: string): CanvasTexture | null {
  const invalidate = useThree(st => st.invalidate);
  const [tex, setTex] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.width = CW; c.height = CH;
    const g = c.getContext('2d')!;
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    const font = (w: number, px: number) => `${w} ${px}px system-ui, -apple-system, sans-serif`;
    const paint = (photo: HTMLImageElement | null) => {
      g.clearRect(0, 0, CW, CH);
      const r = 22, bw = 8;
      g.fillStyle = color;
      g.beginPath(); g.roundRect(0, 0, CW, CH, r); g.fill();
      g.fillStyle = '#0f151b';
      g.beginPath(); g.roundRect(bw, bw, CW - bw * 2, CH - bw * 2, r - bw / 2); g.fill();
      // The photo on a glow of the team's color.
      const ph = CH * 0.62;
      const glow = g.createRadialGradient(CW / 2, ph, 10, CW / 2, ph, CW * 0.6);
      glow.addColorStop(0, `${color}cc`); glow.addColorStop(1, 'transparent');
      g.save(); g.beginPath(); g.roundRect(bw, bw, CW - bw * 2, ph - bw, r - bw / 2); g.clip();
      g.fillStyle = glow; g.fillRect(bw, bw, CW - bw * 2, ph);
      if (photo) {
        const h = p.position === 'DEF' ? ph * 0.6 : ph - bw, w = (photo.naturalWidth / photo.naturalHeight) * h;
        g.drawImage(photo, (CW - w) / 2, ph - h - (p.position === 'DEF' ? ph * 0.15 : 0), w, h);
      } else {
        g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = font(900, 64); g.textAlign = 'center';
        g.fillText(p.name.split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase(), CW / 2, ph * 0.62);
      }
      g.restore();
      // Position, top left.
      g.font = font(900, 26); g.textAlign = 'left';
      const pw = g.measureText(p.position || '?').width + 14;
      g.fillStyle = color; g.beginPath(); g.roundRect(16, 16, pw, 34, 7); g.fill();
      g.fillStyle = '#ffffff'; g.fillText(p.position || '?', 23, 42);
      // Name and points.
      const last = p.position === 'DEF' ? p.nflTeam : p.name.split(/\s+/).slice(1).join(' ') || p.name;
      let size = 40;
      g.font = font(800, size);
      while (g.measureText(last).width > CW - 36 && size > 20) { size -= 2; g.font = font(800, size); }
      g.fillStyle = '#ffffff'; g.fillText(last, 18, ph + 46);
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = font(700, 22);
      g.fillText(p.nflTeam, 18, CH - 26);
      g.textAlign = 'right'; g.fillStyle = '#ffffff'; g.font = font(900, 34);
      g.fillText(p.points != null ? p.points.toFixed(1) : '–', CW - 18, CH - 24);
      t.needsUpdate = true;
      invalidate();
    };
    paint(null);
    setTex(t);
    let done = false;
    const url = playerPhoto({ playerId: p.playerId, position: p.position, nflTeam: p.nflTeam });
    if (url) {
      const img = new Image();
      img.onload = () => { if (!done) paint(img); };
      // Through Next's image route, from this site, so the canvas stays readable (75: the quality Next allows).
      img.src = `/_next/image?url=${encodeURIComponent(url)}&w=256&q=75`;
    }
    return () => { done = true; t.dispose(); };
  }, [p, color, invalidate]);
  return tex;
}

function SidelineCard({ p, color, at }: { p: RosterPlayer; color: string; at: [number, number, number] }) {
  const tex = useCardTexture(p, color);
  const g = useRef<Group>(null);
  useFrame(({ camera }) => {
    if (g.current) g.current.rotation.y = Math.atan2(camera.position.x - at[0], camera.position.z - at[2]);
  });
  if (!tex) return null;
  return (
    <group ref={g} position={at}>
      <mesh position={[0, H / 2 + 0.01, 0]}>
        <planeGeometry args={[W, H]} />
        {/* Unlit, like Watch Live's cards: readable at any hour. */}
        <meshBasicMaterial map={tex} transparent alphaTest={0.05} />
      </mesh>
    </group>
  );
}

export default function RosterSideline({ players, color, sidelineZ }: {
  players: RosterPlayer[]; color: string;
  /** How far out the sideline's bench area may go before the wall in front of the stands. */
  sidelineZ: number;
}) {
  const spots = useMemo(() => {
    // One sideline each, along it between the 20s and a bit: a row, or two staggered when there are
    // more than nine, the second a little further back and higher so it shows over the first.
    const front = Math.min(31 * U, sidelineZ - 0.15) - 0.34, back = front + 0.34;
    const line = (list: RosterPlayer[], side: 1 | -1) => {
      const rows = list.length > 9 ? 2 : 1, per = Math.ceil(list.length / rows);
      return list.map((p, i) => {
        const row = rows === 2 && i >= per ? 1 : 0, k = row ? i - per : i, n = row ? list.length - per : per;
        const step = n <= 1 ? 0 : 68 / (n - 1);
        const x = (n <= 1 ? 0 : -34 + k * step + (row ? step / 2 : 0)) * U;
        return { p, at: [Math.min(36 * U, x), row ? 0.14 : 0, side * (row ? back : front)] as [number, number, number] };
      });
    };
    return [...line(players.filter(p => p.starter), -1), ...line(players.filter(p => !p.starter), 1)];
  }, [players, sidelineZ]);
  return <>{spots.map(s => <SidelineCard key={s.p.playerId} p={s.p} color={color} at={s.at} />)}</>;
}
