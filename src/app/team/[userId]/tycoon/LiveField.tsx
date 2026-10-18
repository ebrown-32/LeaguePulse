'use client';

/**
 * A fantasy matchup, played out on the stadium's field (lib/live/liveTypes).
 *
 * The host's starters attack one end zone, the visitors' the other. A starter
 * whose NFL team has the ball stands where that ball really is, with the ball
 * at their feet and arrows toward the end zone; each NFL drive gets its own
 * lane across the field, so a host's three drives don't stack. A team defense
 * stands where the other team's ball is, guarding its end. Before their game,
 * starters warm up on their own half, in loose rows like a team before kickoff.
 * Everyone else waits on their own sideline: the host's on the near side, the
 * visitors' across.
 *
 * Positions are real yards (Gridiron's: x goal line to goal line, ±50; z
 * sideline to sideline, ±26⅔). Big plays set off fireworks over the end zone.
 *
 * Each new play is replayed as it comes in (PlayReel): the ball in the air to
 * a receiver running the route, a runner carrying it, a scorer finishing in
 * the end zone, which lights up in their color. The feed reports a play once
 * it's over (a scorer is already back on the sideline by then), so a replay
 * works from the play itself: its kind, its yards and whether it scored.
 *
 * Cards are tappable: the tapped one comes to the front, a little larger,
 * which is how a crowded phone screen stays readable. Inside the stadium's Canvas.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AdditiveBlending, Color, type Group, type InstancedMesh, Object3D, type MeshBasicMaterial } from 'three';
import { U } from './Gridiron';
import type { LiveMatchup, LivePlay, LivePlayer } from '@/lib/live/liveTypes';
import { initialsOf, playerPhoto } from '@/lib/playerPhoto';

const HALF = 160 / 6;
const SIDELINE = HALF + 4.2;

export interface LiveScene {
  match: LiveMatchup;
  hostColor: string; guestColor: string;
  /** The player cards (fullscreen); without them, just the drives. */
  cards: boolean;
  /** How big the cards draw, 1 by default; smaller on a phone, where the field is narrow. */
  cardScale?: number;
  /**
   * The small preview: each player a headshot pin, sized to the field, rather than a card (a card
   * there is unreadable, and a dozen of them bury the stadium).
   */
  pins?: boolean;
  /** The pins' size on screen, in pixels. */
  pinSize?: number;
  /**
   * Compact cards at a fixed size on screen (a phone, a tablet held upright): the camera there
   * stands far back to fit the field, and cards scaled by distance came out either huge or tiny.
   */
  mini?: boolean;
  /** The latest big play, which sets off fireworks once per id. */
  celebrate?: { id: string; side: 'host' | 'guest'; td: boolean } | null;
  /** The play being replayed right now (one at a time, see useLiveMatchup). */
  reel?: LivePlay | null;
  /**
   * A card tapped: the page shows that player up close, over the stadium (a 3D label can't be
   * trusted to come to the front of a crowd of others). `picked` stays highlighted on the field.
   */
  onPick?: (p: LivePlayer | null) => void;
  picked?: string | null;
}

interface Spot { p: LivePlayer; x: number; z: number; dir: 1 | -1; lane: number }

/** Where everyone on the field stands, in yards. */
function layout(players: LivePlayer[], anyGameLive = false) {
  const onField = players.filter(p => (p.state === 'driving' || p.state === 'defending') && p.yardsToEndzone != null);
  // One lane per NFL drive (a side and a team), spread across the field.
  const groups = [...new Set(onField.map(p => `${p.side}:${p.nflTeam}`))].sort();
  const lanes = groups.length;
  const spots: Spot[] = [];
  for (const p of onField) {
    const g = groups.indexOf(`${p.side}:${p.nflTeam}`);
    const mates = onField.filter(q => q.side === p.side && q.nflTeam === p.nflTeam);
    const k = mates.indexOf(p);
    // The host attacks +x and defends -x; the visitors the reverse.
    const attack: 1 | -1 = (p.side === 'host') === (p.state === 'driving') ? 1 : -1;
    const ball = attack * (50 - p.yardsToEndzone!);
    const laneZ = lanes === 1 ? 0 : -18 + (g / (lanes - 1)) * 36;
    // Teammates on the same drive line up together at the ball, spread across the field so their cards don't crowd.
    spots.push({ p, dir: attack, lane: g, x: ball, z: laneZ + (k - (mates.length - 1) / 2) * 13 });
  }
  // Warming up before their game: each side on its own half (the end it defends), in rows of four.
  // Only while no NFL game is being played anywhere: once one is on, the field is for live play,
  // and everyone still to play waits on the sideline.
  const live = anyGameLive || onField.length > 0 || players.some(p => p.state === 'sideline');
  const warming = live ? [] : players.filter(p => p.state === 'pregame');
  const warm = (['host', 'guest'] as const).flatMap(side => {
    const list = warming.filter(p => p.side === side);
    const toward = side === 'host' ? -1 : 1;
    return list.map((p, i) => {
      const row = Math.floor(i / 4), col = i % 4, inRow = Math.min(4, list.length - row * 4);
      return { p, x: toward * (14 + row * 14), z: (col - (inRow - 1) / 2) * 13 };
    });
  });
  // The sidelines: the host's near (+z), the visitors' across, spread along the bench area.
  const bench = (side: 'host' | 'guest') => {
    const list = players.filter(p => p.side === side && !onField.includes(p) && !warming.includes(p));
    return list.map((p, i) => ({ p, x: list.length === 1 ? 0 : -34 + (i / (list.length - 1)) * 68, z: (side === 'host' ? 1 : -1) * SIDELINE }));
  };
  return { spots, groups, warm, bench: [...bench('host'), ...bench('guest')] };
}

export default function LiveField({ live }: { live: LiveScene }) {
  // Pins keep a fixed size on screen (no distance scaling); cards scale with the view.
  const df = live.pins || live.mini ? undefined : 5.2 * (live.cardScale ?? 1);
  const { spots, warm, bench } = useMemo(() => layout(live.match.players, Boolean(live.match.anyGameLive)), [live.match.players, live.match.anyGameLive]);
  const colorOf = (side: 'host' | 'guest') => (side === 'host' ? live.hostColor : live.guestColor);
  // A tapped card: the page shows it up close (onPick). A tap on the field (not a card) lets it go.
  const focus = live.picked ?? null;
  const canvas = useThree(st => st.gl.domElement);
  const pick = live.onPick;
  useEffect(() => {
    if (!pick) return;
    const away = () => pick(null);
    canvas.addEventListener('pointerdown', away);
    return () => canvas.removeEventListener('pointerdown', away);
  }, [canvas, pick]);
  const byId = (id: string) => live.match.players.find(p => p.playerId === id) ?? null;
  const tap = (id: string) => pick?.(focus === id ? null : byId(id));
  const z = (_id: string, base: [number, number]): [number, number] => base;
  // While a player's play is replayed, the replay is them; their usual card steps aside.
  const reel = live.cards ? live.reel ?? null : null;
  const hidden = reel?.playerId ?? null;
  const reelPlayer = reel ? live.match.players.find(p => p.playerId === reel.playerId) ?? null : null;
  const reelSpot = reel ? spots.find(s => s.p.playerId === reel.playerId) ?? null : null;

  /**
   * The labels (drei's Html) only re-measure their size when their spot on screen moves. Opening
   * fullscreen, the canvas sizes itself and the camera settles a moment after they first draw,
   * and they kept that first, wrong size until the view was dragged. So for a couple of seconds
   * after opening, and after any resize (a phone turned), the whole layer is nudged by a hair
   * each frame, far too little to see, which has every label measure itself again.
   */
  const settle = useRef<Group>(null);
  const settleFrames = useRef(120);
  const size = useThree(st => st.size);
  useEffect(() => { settleFrames.current = 120; }, [size.width, size.height]);
  useFrame(() => {
    const g = settle.current;
    if (!g) return;
    if (settleFrames.current > 0) { settleFrames.current--; g.position.y = settleFrames.current % 2 ? 0.0015 : 0; }
    else if (g.position.y !== 0) g.position.y = 0;
  });
  // One ball per drive: the first player of each lane carries it.
  const balls = useMemo(() => {
    const seen = new Set<number>();
    return spots.filter(s => (seen.has(s.lane) ? false : (seen.add(s.lane), true)));
  }, [spots]);

  return (
    <group ref={settle}>
      {balls.map(s => <Drive key={`${s.p.side}${s.p.nflTeam}`} spot={s} color={colorOf(s.p.side)} defending={s.p.state === 'defending'} />)}
      {live.cards && spots.filter(s => s.p.playerId !== hidden).map(s => (
        <Glide key={s.p.playerId} to={[s.x * U, 0.42, s.z * U]}>
        <Html center distanceFactor={df} zIndexRange={z(s.p.playerId, [30, 10])}>
          {live.pins ? <Pin p={s.p} color={colorOf(s.p.side)} size={live.pinSize} focused={focus === s.p.playerId} onTap={live.onPick ? () => tap(s.p.playerId) : undefined} /> : <Card p={s.p} mini={live.mini} color={colorOf(s.p.side)} focused={focus === s.p.playerId} onTap={live.onPick ? () => tap(s.p.playerId) : undefined} />}
        </Html>
        </Glide>
      ))}
      {live.cards && warm.filter(w => w.p.playerId !== hidden).map((w, i) => (
        <Html key={w.p.playerId} position={[w.x * U, 0.3, w.z * U]} center distanceFactor={df} zIndexRange={z(w.p.playerId, [20, 10])}>
          <Warmup delay={(i * 0.37) % 1.4}>{live.pins ? <Pin p={w.p} color={colorOf(w.p.side)} size={live.pinSize} focused={focus === w.p.playerId} onTap={live.onPick ? () => tap(w.p.playerId) : undefined} /> : <Card p={w.p} mini={live.mini} color={colorOf(w.p.side)} focused={focus === w.p.playerId} onTap={live.onPick ? () => tap(w.p.playerId) : undefined} />}</Warmup>
        </Html>
      ))}
      {live.cards && bench.filter(b => b.p.playerId !== hidden).map(b => (
        <Html key={b.p.playerId} position={[b.x * U, 0.22, b.z * U]} center distanceFactor={df} zIndexRange={z(b.p.playerId, [9, 0])}>
          {live.pins ? <Pin p={b.p} color={colorOf(b.p.side)} size={live.pinSize} focused={focus === b.p.playerId} onTap={live.onPick ? () => tap(b.p.playerId) : undefined} /> : <Card p={b.p} mini={live.mini} color={colorOf(b.p.side)} small focused={focus === b.p.playerId} onTap={live.onPick ? () => tap(b.p.playerId) : undefined} />}
        </Html>
      ))}
      {reel && reelPlayer && <PlayReel key={`reel-${reel.id}`} play={reel} player={reelPlayer} spot={reelSpot} color={colorOf(reel.side)} df={df} pin={Boolean(live.pins)} />}
      {live.celebrate && <Fireworks key={`fw-${live.celebrate.id}`} delay={reel && reel.id === live.celebrate.id && reel.kind !== 'other' ? 1.4 : 0}
        x={(live.celebrate.side === 'host' ? 1 : -1) * 55} big={live.celebrate.td} colors={[colorOf(live.celebrate.side), '#f5c542', '#ffffff']} />}
    </group>
  );
}

/** The ball, a line to the end zone, and chevrons pulsing toward it; a ring in the red zone. */
function Drive({ spot, color, defending }: { spot: Spot; color: string; defending: boolean }) {
  const chevrons = useRef<Group>(null);
  const ring = useRef<MeshBasicMaterial>(null);
  const holder = useRef<Group>(null);
  const path = useRef<Group>(null);
  const togo = spot.p.yardsToEndzone ?? 0;
  const ballX = spot.dir * (50 - togo);
  const red = spot.p.redZone;
  // The ball's spot, eased toward the real one: a gain (or a loss) slides there rather than jumps.
  const shown = useRef<number | null>(null);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    shown.current = shown.current == null ? ballX : shown.current + (ballX - shown.current) * Math.min(1, dt * 2.2);
    const x = shown.current, left = Math.max(1, spot.dir * (spot.dir * 50 - x));
    holder.current?.position.set(x * U, 0, 0);
    if (path.current) { path.current.scale.x = left; path.current.position.x = (spot.dir * left / 2) * U; }
    chevrons.current?.children.forEach((c, i) => {
      const m = (c as unknown as { material: MeshBasicMaterial }).material;
      m.opacity = 0.25 + 0.75 * Math.max(0, Math.sin(t * 4 - i * 0.9));
    });
    if (ring.current) ring.current.opacity = 0.35 + 0.35 * Math.sin(t * 6);
  });
  return (
    <group position={[0, 0.02, spot.z * U]}>
      {/* Everything here is drawn from the ball, which glides (above). */}
      <group ref={holder}>
        {/* The path to the end zone, faint: one yard wide in x, stretched to the yards left. */}
        <group ref={path}>
          <mesh rotation-x={-Math.PI / 2}>
            <planeGeometry args={[U, 1.6 * U]} />
            <meshBasicMaterial color={defending ? '#ffffff' : color} transparent opacity={0.22} depthWrite={false} />
          </mesh>
        </group>
        {/* Chevrons ahead of the ball, pointing the way. */}
        {!defending && (
          <group ref={chevrons}>
            {[0, 1, 2].map(i => (
              // A three-sided circle's tip is its local +x, which lying flat is the field's +x: flipped for the other way.
              <mesh key={i} rotation-x={-Math.PI / 2} rotation-z={spot.dir > 0 ? 0 : Math.PI} position={[spot.dir * (2.5 + i * 2.6) * U, 0.004, 0]}>
                <circleGeometry args={[1.3 * U, 3]} />
                <meshBasicMaterial color={red ? '#ff4d4d' : color} transparent opacity={0.6} depthWrite={false} />
              </mesh>
            ))}
          </group>
        )}
        {/* The ball. */}
        <mesh position={[0, 0.35 * U, 0]} scale={[1.7, 1, 1]} castShadow><sphereGeometry args={[0.5 * U, 14, 10]} /><meshStandardMaterial color="#7a3d17" roughness={0.6} /></mesh>
        {red && !defending && (
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]}>
            <ringGeometry args={[2.2 * U, 3 * U, 32]} />
            <meshBasicMaterial ref={ring} color="#ff3b3b" transparent opacity={0.5} depthWrite={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}

/** A group that eases toward its spot: a player's card slides down the field with their drive. */
function Glide({ to, children }: { to: [number, number, number]; children: React.ReactNode }) {
  const g = useRef<Group>(null);
  const placed = useRef(false);
  useFrame((_, dt) => {
    const o = g.current;
    if (!o) return;
    if (!placed.current) { o.position.set(...to); placed.current = true; return; }
    const k = Math.min(1, dt * 2.2);
    o.position.x += (to[0] - o.position.x) * k;
    o.position.y += (to[1] - o.position.y) * k;
    o.position.z += (to[2] - o.position.z) * k;
  });
  return <group ref={g}>{children}</group>;
}

/** The pin in the small preview: their headshot ringed in their team's color, lit while they're on the field. */
function Pin({ p, color, size = 14, focused = false, onTap }: { p: LivePlayer; color: string; size?: number; focused?: boolean; onTap?: () => void }) {
  const photo = playerPhoto(p);
  const live = p.state === 'driving' || p.state === 'defending' || focused;
  return (
    <div onPointerDown={onTap ? e => e.stopPropagation() : undefined} onClick={onTap} role={onTap ? 'button' : undefined}
      className={`relative select-none overflow-hidden rounded-full bg-[#0f151b] ${onTap ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
      style={{ width: size, height: size, borderWidth: size > 18 ? 2 : 1.5, borderStyle: 'solid', borderColor: focused ? '#ffffff' : color, boxShadow: live ? `0 0 7px ${color}, 0 0 0 1px #ffffffaa` : '0 1px 3px rgba(0,0,0,0.6)', opacity: live || p.state === 'pregame' ? 1 : 0.8 }}>
      {photo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photo} alt="" className={`absolute left-1/2 -translate-x-1/2 ${p.position === 'DEF' ? 'top-1/2 h-[70%] -translate-y-1/2' : 'bottom-0 h-full'} w-auto`} />
        : <span className="absolute inset-0 flex items-center justify-center text-[5px] font-black text-white">{initialsOf(p.name)}</span>}
    </div>
  );
}

/** A slow, slight float, out of step with the next player's: loose and easy before the game. */
function Warmup({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <div style={{ animation: `lp-warmup 3.2s ease-in-out ${delay * 2.2}s infinite` }}>
      <style>{'@keyframes lp-warmup { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-1.5px) } }'}</style>
      {children}
    </div>
  );
}

/** A player, on the field or the sideline: photo, name, points, and what they're doing. */
function Card({ p, color, small = false, mini = false, focused = false, highlight = false, onTap }: {
  p: LivePlayer; color: string; small?: boolean;
  /** The compact card for a phone: photo, position, name and points; the rest is a tap away. */
  mini?: boolean;
  /** Tapped: in front of the rest, larger, its game spelled out. */
  focused?: boolean;
  /** Making the play being replayed. */
  highlight?: boolean;
  onTap?: () => void;
}) {
  const photo = playerPhoto(p);
  const last = p.position === 'DEF' ? p.nflTeam : p.name.split(/\s+/).slice(1).join(' ') || p.name;
  const status = p.state === 'driving' ? (p.redZone ? 'Red zone' : p.downDistance?.split(' at ')[0] ?? 'Driving')
    : p.state === 'defending' ? 'On defense'
    : p.state === 'bye' ? 'Bye' : p.state === 'final' ? 'Final'
    : p.state === 'pregame' ? 'Warming up' : 'Sideline';
  const live = p.state === 'driving' || p.state === 'defending';
  if (mini) {
    return (
      <div onPointerDown={e => e.stopPropagation()} onClick={onTap} role={onTap ? 'button' : undefined}
        className={`w-[38px] select-none ${onTap ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} ${live || focused || highlight ? '' : 'opacity-90'}`}
        style={{ transform: highlight ? 'scale(1.18)' : undefined }}>
        <div className="overflow-hidden rounded-md text-white shadow-[0_4px_10px_rgba(0,0,0,0.55)]"
          style={{ background: '#0f151b', border: `1.5px solid ${highlight || focused ? '#ffffff' : color}`, boxShadow: highlight ? `0 0 0 2px ${color}, 0 0 18px ${color}` : live || focused ? `0 0 12px ${color}` : undefined }}>
          <div className="relative" style={{ height: 22, background: `radial-gradient(90% 100% at 50% 100%, ${color}88, transparent 70%)` }}>
            {photo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={photo} alt="" className={`absolute left-1/2 -translate-x-1/2 ${p.position === 'DEF' ? 'bottom-1 h-[68%]' : 'bottom-0 h-full'} w-auto`} />
              : <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white/80">{initialsOf(p.name)}</span>}
            <span className="absolute left-px top-px rounded-sm px-[2px] text-[6px] font-black leading-[9px]" style={{ background: color }}>{p.position}</span>
          </div>
          <div className="px-[3px] pb-[2px]">
            <div className="truncate text-[7px] font-extrabold leading-[9px]">{last}</div>
            <div className="text-right text-[8px] font-black leading-[9px] tabular-nums">{p.points != null ? p.points.toFixed(1) : '0.0'}</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div onPointerDown={e => e.stopPropagation()} onClick={onTap} role={onTap ? 'button' : undefined}
      className={`select-none transition-transform duration-200 ${onTap ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} ${small ? 'w-[58px]' : 'w-[74px]'} ${live || focused || highlight ? '' : 'opacity-90'}`}
      style={{ fontFamily: 'inherit', transform: highlight ? 'scale(1.18)' : undefined }}>
      <div className="overflow-hidden rounded-lg text-white shadow-[0_6px_14px_rgba(0,0,0,0.55)]"
        style={{ background: '#0f151b', border: `2px solid ${highlight || focused ? '#ffffff' : color}`, boxShadow: highlight ? `0 0 0 3px ${color}, 0 0 28px ${color}, 0 0 46px #ffd44d88` : live || focused ? `0 0 0 2px ${color}55, 0 0 18px ${color}` : undefined }}>
        <div className="relative" style={{ height: small ? 34 : 44, background: `radial-gradient(90% 100% at 50% 100%, ${color}88, transparent 70%)` }}>
          {photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photo} alt="" className={`absolute bottom-0 left-1/2 -translate-x-1/2 ${p.position === 'DEF' ? 'bottom-1 h-[70%]' : 'h-full'} w-auto`} />
            : <span className="absolute inset-0 flex items-center justify-center text-[13px] font-black text-white/80">{initialsOf(p.name)}</span>}
          <span className="absolute left-0.5 top-0.5 rounded px-0.5 text-[7px] font-black" style={{ background: color }}>{p.position}</span>
          {/* Where to watch them: their game's network, while it's on or coming up. */}
          {p.channel && (p.state !== 'final' && p.state !== 'bye') && (
            <span className="absolute right-0.5 top-0.5 rounded bg-black/75 px-0.5 text-[6.5px] font-black tracking-wide text-white ring-1 ring-white/25">{p.channel}{p.when ? ` · ${p.when}` : ''}</span>
          )}
        </div>
        <div className="px-1 pb-0.5 pt-px">
          <div className={`truncate font-extrabold leading-tight ${small ? 'text-[8px]' : 'text-[9.5px]'}`}>{last}</div>
          <div className="flex items-baseline justify-between gap-1">
            <span className={`truncate font-semibold uppercase ${small ? 'text-[6.5px]' : 'text-[7.5px]'} ${p.redZone && live ? 'text-red-300' : 'text-white/60'}`}>{status}</span>
            <span className={`font-black tabular-nums ${small ? 'text-[9px]' : 'text-[11px]'}`}>{p.points != null ? p.points.toFixed(1) : '0.0'}</span>
          </div>
        </div>
      </div>
      {/* On the field, a pin down to the turf. */}
      {!small && <div className="mx-auto h-3 w-px" style={{ background: color }} />}
    </div>
  );
}

/** Fireworks over an end zone: a few shells bursting into sparks that fall and fade. */
function Fireworks({ x, big, colors, delay = 0 }: { x: number; big: boolean; colors: string[]; delay?: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const born = useRef<number | null>(null);
  const shells = big ? 5 : 2, per = 46;
  const sparks = useMemo(() => Array.from({ length: shells * per }, (_, i) => {
    const s = Math.floor(i / per);
    const theta = Math.random() * Math.PI * 2, phi = Math.acos(2 * Math.random() - 1), speed = 0.9 + Math.random() * 0.6;
    return {
      origin: [x * U + (Math.random() - 0.5) * 1.2, 2.4 + Math.random() * 0.9, (s - (shells - 1) / 2) * 1.1],
      v: [Math.sin(phi) * Math.cos(theta) * speed, Math.cos(phi) * speed, Math.sin(phi) * Math.sin(theta) * speed],
      delay: s * 0.28, color: new Color(colors[s % colors.length]),
    };
  }), [x, shells, colors]);
  const dummy = useMemo(() => new Object3D(), []);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    born.current ??= clock.elapsedTime;
    const age = clock.elapsedTime - born.current - delay;
    sparks.forEach((s, i) => {
      const t = Math.max(0, age - s.delay);
      const alive = age > s.delay && t < 1.8;
      dummy.position.set(s.origin[0] + s.v[0] * t, s.origin[1] + s.v[1] * t - 0.9 * t * t, s.origin[2] + s.v[2] * t);
      dummy.scale.setScalar(alive ? 0.05 * (1 - t / 1.8) + 0.01 : 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, s.color);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, sparks.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 5]} />
      <meshBasicMaterial toneMapped={false} blending={AdditiveBlending} transparent depthWrite={false} />
    </instancedMesh>
  );
}

/** Seconds into a replay when the ball arrives (a catch made, a run ended, the end zone reached). */
const ARRIVE = 1.4;
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/**
 * One play, replayed. The play is reported once it's over, so it is drawn from what it says:
 * where it ended (the player's ball now, or the end zone on a touchdown) less the yards gained
 * is where it began. A catch: the ball thrown from behind the line in an arc to the receiver
 * finishing the route. A throw: from the passer's hand downfield. A run: the ball at the
 * carrier's feet. On arrival the points pop; a touchdown lights the end zone and the scorer
 * stays there, bouncing, until the next play.
 */
function PlayReel({ play, player, spot, color, df, pin = false }: { play: LivePlay; player: LivePlayer; spot: Spot | null; color: string; df: number | undefined; pin?: boolean }) {
  const dir: 1 | -1 = play.side === 'host' ? 1 : -1;
  const yards = Math.max(1, Math.min(99, Math.abs(play.yards ?? 12)));
  // The end: in the end zone on a score, else where their ball is now, else a gain from their own 40.
  const end = play.scoring ? dir * 55 : spot && player.yardsToEndzone != null ? dir * (50 - player.yardsToEndzone) : dir * (-10 + yards);
  const start = play.scoring ? dir * (50 - Math.min(yards, 99)) : end - dir * yards;
  const laneZ = spot?.z ?? ((parseInt(player.playerId.replace(/\D/g, '').slice(-3) || '0', 10) % 30) - 15);
  const pocket = start - dir * 6;
  const runner = play.kind === 'throw' ? null : play.kind; // the card that moves

  const card = useRef<Group>(null);
  const ball = useRef<Group>(null);
  const trail = useRef<Group>(null);
  const glow = useRef<MeshBasicMaterial>(null);
  const born = useRef<number | null>(null);
  const [arrived, setArrived] = useState(false);
  const flight = (t: number) => {
    // The ball's position at t: in the air for a catch or a throw, carried for a run.
    if (play.kind === 'run') { const k = ease(Math.min(1, Math.max(0, t / ARRIVE))); return { x: start + (end - start) * k, y: 0.06 }; }
    const k = Math.min(1, Math.max(0, (t - 0.3) / (ARRIVE - 0.3)));
    const from = pocket, to = end;
    const d = Math.abs(to - from) * U;
    return { x: from + (to - from) * k, y: 0.14 + Math.sin(Math.PI * k) * (0.25 + d * 0.32) };
  };
  useFrame(({ clock }) => {
    born.current ??= clock.elapsedTime;
    const t = clock.elapsedTime - born.current;
    // The card: the route or the run to the end; then, after a score, a bounce in the end zone.
    if (card.current) {
      let x = play.kind === 'throw' ? pocket : start + (end - start) * ease(Math.min(1, t / ARRIVE));
      let y = 0.42;
      if (t > ARRIVE && play.scoring) { y += Math.abs(Math.sin((t - ARRIVE) * 6)) * 0.08; x = end + Math.sin((t - ARRIVE) * 2.2) * 1.5; }
      card.current.position.set(x * U, y, laneZ * U);
    }
    if (ball.current) {
      const b = flight(t);
      ball.current.visible = t >= (play.kind === 'run' ? 0 : 0.3) && !(play.kind !== 'run' && t > ARRIVE + 0.15);
      ball.current.position.set(b.x * U, b.y, laneZ * U);
      const ahead = flight(t + 0.03);
      ball.current.rotation.z = Math.atan2(ahead.y - b.y, (ahead.x - b.x) * U);
    }
    // A short trail behind the ball in the air.
    trail.current?.children.forEach((c, i) => {
      const b = flight(t - (i + 1) * 0.045);
      c.position.set(b.x * U, b.y, laneZ * U);
      c.visible = play.kind !== 'run' && t > 0.35 + i * 0.045 && t < ARRIVE + 0.1;
    });
    if (glow.current) glow.current.opacity = t > ARRIVE ? 0.22 + 0.16 * Math.sin((t - ARRIVE) * 5) : 0;
    if (!arrived && t >= ARRIVE) setArrived(true);
  });

  return (
    <group>
      {/* The end zone, lit in the scorer's color. */}
      {play.scoring && (
        <mesh rotation-x={-Math.PI / 2} position={[dir * 55 * U, 0.02, 0]}>
          <planeGeometry args={[10 * U, 2 * HALF * U]} />
          <meshBasicMaterial ref={glow} color={color} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <group ref={ball} visible={false}>
        {/* Drawn larger than life, with a glow, so it reads from the stands. */}
        <mesh scale={[1.7, 1, 1]}><sphereGeometry args={[1.3 * U, 16, 12]} /><meshStandardMaterial color="#8a4419" emissive="#c2621f" emissiveIntensity={0.55} /></mesh>
        <mesh><sphereGeometry args={[2.6 * U, 16, 12]} /><meshBasicMaterial color="#ffd44d" transparent opacity={0.28} depthWrite={false} toneMapped={false} /></mesh>
      </group>
      <group ref={trail}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <mesh key={i} visible={false}><sphereGeometry args={[(0.9 - i * 0.12) * U, 8, 6]} /><meshBasicMaterial color="#ffe9a8" transparent opacity={0.5 - i * 0.07} depthWrite={false} toneMapped={false} /></mesh>
        ))}
      </group>
      <group ref={card}>
        <Html center distanceFactor={df} zIndexRange={[500, 450]}>
          <div className="relative">
            {arrived && !pin && (
              <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-center" style={{ animation: 'lp-pop 0.5s cubic-bezier(.2,1.6,.4,1)' }}>
                <style>{'@keyframes lp-pop { from { transform: translate(-50%, 8px) scale(0.5); opacity: 0 } to { transform: translate(-50%, 0) scale(1); opacity: 1 } }'}</style>
                <span className="rounded-md px-1.5 py-0.5 text-[10px] font-black text-black shadow-lg" style={{ background: play.scoring ? '#ffd44d' : '#ffffff' }}>
                  {play.scoring ? 'TOUCHDOWN' : play.kind === 'catch' ? 'CATCH' : play.kind === 'run' ? `${yards} YDS` : 'COMPLETE'}{play.points != null ? ` +${play.points.toFixed(1)}` : ''}
                </span>
              </div>
            )}
            {pin
              ? <Pin p={{ ...player, state: 'driving' }} color={color} />
              : <Card p={{ ...player, state: runner ? 'driving' : player.state }} color={color} highlight />}
          </div>
        </Html>
      </group>
    </group>
  );
}

