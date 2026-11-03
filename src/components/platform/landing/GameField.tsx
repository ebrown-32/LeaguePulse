'use client';

/**
 * The hero's stadium (desktop): a night game in a packed house, and the app all through it.
 *
 *   The house   stands full of fans and camera flashes, a ring of concourse lights, an LED ribbon
 *               board along the end zone, and a jumbotron over the goalposts.
 *   The plays   in turn: a touchdown pass (the routes drawn first, like a telestrator, then the
 *               throw), a sack (the rush, the hit, the shockwave) and a field goal (KickField's
 *               kick, doink and all). Players are glowing tokens, Ghosts in turf, opponents violet.
 *   The app     between plays the jumbotron shows the app: a Desk writer's take, the live win
 *               chance, Game of the Week and the home stadium (the app's own render). Before a
 *               snap, down and distance; on a score, the call. Every score is fantasy points,
 *               reported through `onScore` to the matchup card and scoring alert (HeroGame).
 *
 * The teams, writers and numbers are sample data, made up like every other team on this page.
 *   The sky   follows the visitor's own clock: a starry night with a moon, a sunrise or sunset
 *               glowing behind the stands, or a blue afternoon with clouds and the lights off.
 *               On every score the lights put on a show: the banks strobe, the beams flicker,
 *               spotlights sweep the crowd and the concourse ring chases in team colors.
 *
 * One requestAnimationFrame loop writes straight onto the SVG, only while it is on screen and the
 * tab is visible, at an unhurried PACE. With reduced motion it is one still frame. A click runs
 * the next play now.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Ball, FIELD, GOLD, H, PAPER, POST, SIGNAL, TURF_LIGHT, VX, W, fieldGoalPoints, quad, type Pt } from './KickField';

const VIOLET = '#8B6CFF';
const INK = '#0B1013';
const DISPLAY = { fontFamily: 'var(--font-lp-display), system-ui, sans-serif' } as const;

export interface PlayScore { label: string; points: number; call: string }

/** How slowly the game plays: every phase's time is stretched by this much. */
const PACE = 1.35;

// ── The sky, by the visitor's own clock ──
export type TimeOfDay = 'night' | 'dawn' | 'day' | 'dusk';
export const timeOfDay = (h: number): TimeOfDay => (h >= 20 || h < 5 ? 'night' : h < 8 ? 'dawn' : h < 17 ? 'day' : 'dusk');
/**
 * The visitor's time of day, checked again every few minutes; night until the page is in the
 * browser. `?sky=day` (or dawn, dusk, night) shows another, to preview them.
 */
export function useTimeOfDay(): TimeOfDay {
  const [tod, setTod] = useState<TimeOfDay>('night');
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get('sky');
    const pinned = asked && ['night', 'dawn', 'day', 'dusk'].includes(asked) ? (asked as TimeOfDay) : null;
    const check = () => setTod(pinned ?? timeOfDay(new Date().getHours()));
    check();
    const id = window.setInterval(check, 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  return tod;
}
interface Sky {
  sky: [string, string, string]; turf: [string, string]; lights: number; beams: number; stands: number;
  stars: boolean; sun: { x: number; y: number; r: number; color: string; glow: string; moon?: boolean }; clouds: number;
}
const SKY: Record<TimeOfDay, Sky> = {
  night: { sky: ['#05070A', '#0A1116', '#0B1A15'], turf: ['url(#lp-turf)', '#0D4230'], lights: 0.95, beams: 0.28, stands: 0.9, stars: true, clouds: 0,
    sun: { x: 1335, y: 214, r: 20, color: '#F2EFE4', glow: '#F2EFE4', moon: true } },
  dawn: { sky: ['#243262', '#9A6E8F', '#F5BF94'], turf: ['#155A3D', '#186344'], lights: 0.55, beams: 0.1, stands: 0.55, stars: false, clouds: 2,
    sun: { x: 1300, y: 420, r: 46, color: '#FFD9A3', glow: '#FFB27A' } },
  day: { sky: ['#1B5BA8', '#4A92D6', '#B6DDF6'], turf: ['#1C7748', '#208350'], lights: 0.3, beams: 0, stands: 0.35, stars: false, clouds: 4,
    sun: { x: 1335, y: 214, r: 26, color: '#FFF7DA', glow: '#FFE9A6' } },
  dusk: { sky: ['#19194A', '#753B6B', '#F48D4C'], turf: ['#14593C', '#176243'], lights: 0.95, beams: 0.2, stands: 0.7, stars: false, clouds: 2,
    sun: { x: 1250, y: 420, r: 54, color: '#FFB24F', glow: '#FF7A3D' } },
};
/** Stars that stay put from one render to the next. */
const STARS = (() => { let a = 7; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647); return [...Array(70)].map(() => ({ x: r() * W, y: r() * 400, r: 0.6 + r() * 1.4, d: r() * 4 })); })();
const CLOUDS = [{ x: 140, y: 150, s: 1.1 }, { x: 640, y: 90, s: 0.8 }, { x: 980, y: 300, s: 1.3 }, { x: 1300, y: 330, s: 0.9 }];

// ── The field in perspective: u across (-1 to 1), d downfield (0 near the camera, 1 the end line) ──
const FAR = POST.base, NEAR = H + 40;
/** Where a player stands: a gentler perspective than the stripes', so the far field has room to play in. */
const yOf = (d: number) => FAR + (NEAR - FAR) * (1 - d) ** 1.15;
const halfOf = (y: number) => 260 + ((y - FAR) / (NEAR - FAR)) * 1500;
const at = (u: number, d: number) => { const y = yOf(d); return { x: VX + u * halfOf(y) * 0.36, y, s: 0.5 + 0.7 * (1 - d) }; };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (t: number) => Math.max(0, Math.min(1, t));
type UD = [number, number];
/** A path through keyframes [t, u, d], at time t. */
const along = (keys: [number, number, number][], t: number): UD => {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) {
    const [t1, u1, d1] = keys[i], [t0, u0, d0] = keys[i - 1];
    if (t <= t1) { const k = (t - t0) / (t1 - t0); return [lerp(u0, u1, k), lerp(d0, d1, k)]; }
  }
  const last = keys[keys.length - 1];
  return [last[1], last[2]];
};

// ── The plays ──
/** The receiver's corner route: up the seam, then out to the corner of the end zone. */
const WR: [number, number, number][] = [[0, 0.62, 0.3], [1.0, 0.7, 0.56], [2.0, 1.28, 0.88], [2.5, 1.36, 0.95]];
const PASS = { throwAt: 0.95, catchAt: 1.95, end: 2.55 };
const SACK = { hitAt: 1.15, end: 1.75 };
const KICKS = [
  { kind: 'good' as const, yards: 47, from: { x: 820, y: 770 }, peak: { x: 880, y: 120 }, to: { x: 1062, y: 352 } },
  { kind: 'good' as const, yards: 38, from: { x: 860, y: 778 }, peak: { x: 980, y: 150 }, to: { x: 1050, y: 380 } },
  { kind: 'doink' as const, yards: 52, from: { x: 800, y: 774 }, peak: { x: 860, y: 110 }, to: { x: POST.left + 4, y: 296 } },
];
type Play = 'pass' | 'sack' | 'kick';
const ORDER: Play[] = ['pass', 'sack', 'kick'];
const DOWN: Record<Play, (kick: (typeof KICKS)[number]) => [string, string]> = {
  pass: () => ['2ND & 7', 'OPP 38'],
  sack: () => ['3RD & 9', 'GHOSTS DEFENSE'],
  kick: k => ['FIELD GOAL', `${k.yards} YARDS`],
};
const TAKES = ['Ghosts by ten. Book it.', 'Long Shots should be worried.', 'That trade looks better every week.', 'Game of the year, and it is week 9.'];
/** The scroll, in two parts: the Sleeper logo rides in the gap between them (public/brand/partners). */
const GAP = '\u00a0'.repeat(5);
const RIBBON_HEAD = 'LEAGUEPULSE, FOR ';
const RIBBON = `${RIBBON_HEAD}${GAP}SLEEPER AND ESPN LEAGUES, LIVE WIN ODDS, AI BEAT WRITERS, TRADE GRADES, GAME OF THE WEEK, POWER RANKINGS, `;
const LOGO = 13;
/**
 * The ribbon board: an LED fascia on the front of the stands, standing on the field's edge. Down
 * the left sideline, around the far corner, the length of the end line, around the other corner
 * and down the right sideline; the scroll runs along it and bends round the corners.
 */
const SIDE = 1500 / 336;                                        // the sidelines' run, across per down
const BOARD_DROP = 64;                                          // how far down each sideline it runs
const BOARD = `M${VX - 260 - BOARD_DROP * SIDE} ${POST.base + BOARD_DROP - 8}L${VX - 260} ${POST.base - 8}H${VX + 260}L${VX + 260 + BOARD_DROP * SIDE} ${POST.base + BOARD_DROP - 8}`;

const TOKENS = 9;
const FLASHES = 40;
const JUMBO = { x: 870, y: 150, w: 380, h: 112 };

/** A place in the stands for a camera flash. */
function seatSpot(): Pt {
  if (Math.random() < 0.55) return { x: 600 + Math.random() * 960, y: 440 + Math.random() * 140 };
  const right = Math.random() < 0.6, y = 600 + Math.random() * 280;
  const edge = VX + (right ? 1 : -1) * halfOf(y);
  return { x: edge + (right ? 1 : -1) * (30 + Math.random() * 260), y };
}

/**
 * `hold`: finish the play on, then wait, without starting another (the Vault has the stage).
 * `frame`: `wide`, the whole stadium behind a desktop hero; `phone`, a tall cut of it around the
 * goalposts and the jumbotron, where every play happens.
 */
export default function GameField({ className, winChance = 0.5, onScore, tod = 'night', hold = false, frame = 'wide' }: {
  className?: string; winChance?: number; onScore?: (s: PlayScore) => void; tod?: TimeOfDay; hold?: boolean; frame?: 'wide' | 'phone';
}) {
  const reduce = useReducedMotion();
  // Its own names for its gradients and clips: the page holds two stadiums (desktop and phone), one
  // always hidden, and a reference into a hidden one paints nothing.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const u = (name: string) => `${name}-${uid}`;
  const sky = SKY[tod];
  // Placed for the frame: the phone's tall cut keeps its own light banks, and its sun or moon
  // smaller and up in the open sky beside the jumbotron (the wide stadium's would sit by the posts).
  const phoneFrame = frame === 'phone';
  const BANKS = phoneFrame ? [VX - 318, VX + 186] : [24, W - 156];
  const BY = phoneFrame ? 118 : 100;
  const cel = phoneFrame ? { ...sky.sun, x: VX - 232, y: sky.sun.y < 300 ? 312 : 418, r: sky.sun.r * 0.72 } : sky.sun;
  const skyRef = useRef(sky);
  useEffect(() => { skyRef.current = sky; }, [sky]);
  const holdRef = useRef(hold);
  useEffect(() => { holdRef.current = hold; }, [hold]);
  const svg = useRef<SVGSVGElement>(null);
  const runNow = useRef<() => void>(() => {});
  const scored = useRef(onScore);
  const chance = useRef(winChance);
  useEffect(() => { scored.current = onScore; chance.current = winChance; }, [onScore, winChance]);

  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
    const qa = <T extends Element>(sel: string) => [...root.querySelectorAll(sel)] as T[];
    const scene = q<SVGGElement>('[data-scene]');
    const front = q<SVGGElement>('[data-ball=front]'), back = q<SVGGElement>('[data-ball=back]');
    const trail = q<SVGPolylineElement>('[data-trail]');
    const route = q<SVGPolylineElement>('[data-route]'), route2 = q<SVGPolylineElement>('[data-route2]');
    const toks = qa<SVGGElement>('[data-tok]');
    const rings = qa<SVGCircleElement>('[data-ring]');
    const glow = q<SVGGElement>('[data-glow]');
    const pts = q<SVGGElement>('[data-pts]'), ptsText = q<SVGTextElement>('[data-pts-text]');
    const bits = qa<SVGRectElement>('[data-bit]');
    const flashes = qa<SVGCircleElement>('[data-flash]');
    const boardText = q<SVGTextPathElement>('[data-board]'), boardFill = q<SVGTextElement>('[data-board-text]');
    // One pass of the scroll, measured, so it loops without a seam; and where in it the logo's gap falls.
    const lap = (q<SVGTextElement>('[data-board-lap]')?.getComputedTextLength() || 1100);
    const head = q<SVGTextElement>('[data-board-head]')?.getComputedTextLength() || 120;
    const gap = q<SVGTextElement>('[data-board-gap]')?.getComputedTextLength() || 30;
    const boardPath = q<SVGPathElement>('[data-board-path]'), boardLen = boardPath.getTotalLength();
    const logos = qa<SVGGElement>('[data-board-logo]');
    /** Each copy of the logo at its gap in the scroll, turned to the board's slope there. */
    const placeLogos = () => logos.forEach((g, k) => {
      // The measured head drops its trailing space's letter-spacing: a few units on, to sit centered.
      const at = boardX + k * lap + head + gap / 2 + 7;
      if (at < LOGO || at > boardLen - LOGO) { g.style.opacity = '0'; return; }
      const p = boardPath.getPointAtLength(at), p2 = boardPath.getPointAtLength(Math.min(boardLen, at + 1));
      const deg = (Math.atan2(p2.y - p.y, p2.x - p.x) * 180) / Math.PI;
      g.style.opacity = '1';
      g.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${deg})`);
    });
    const bulbs = qa<SVGCircleElement>('[data-bulb]'), beams = qa<SVGPathElement>('[data-beam]');
    const sweeps = qa<SVGPathElement>('[data-sweep]'), ringLights = qa<SVGCircleElement>('[data-cl]');
    const clouds = qa<SVGGElement>('[data-cloud]');
    const jumbo = Object.fromEntries(qa<SVGGElement>('[data-j]').map(g => [g.dataset.j!, g]));
    const jDown = q<SVGTextElement>('[data-j-down]'), jDownSub = q<SVGTextElement>('[data-j-downsub]');
    const jCall = q<SVGTextElement>('[data-j-call]'), jCallBg = q<SVGRectElement>('[data-j-callbg]');
    const jTake = q<SVGTextElement>('[data-j-take]'), jOdds = q<SVGTextElement>('[data-j-odds]'), jBar = q<SVGRectElement>('[data-j-bar]');

    const showJumbo = (name: string) => { for (const [k, g] of Object.entries(jumbo)) g.style.opacity = k === name ? '1' : '0'; };
    const placeBall = (p: Pt, s: number, spin: number, behind: boolean, alpha = 1) => {
      const t = `translate(${p.x} ${p.y}) rotate(${spin}) scale(${s})`;
      front.setAttribute('transform', t); back.setAttribute('transform', t);
      front.style.opacity = behind ? '0' : String(alpha); back.style.opacity = behind ? String(alpha) : '0';
    };
    const hideBall = () => { front.style.opacity = '0'; back.style.opacity = '0'; };
    const tok = (i: number, ud: UD | null, color = TURF_LIGHT, label = '', fall = 0) => {
      const g = toks[i];
      if (!ud) { g.style.opacity = '0'; return; }
      const p = at(ud[0], ud[1]);
      g.style.opacity = String(1 - fall * 0.45);
      g.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${p.s}) rotate(${fall * 75}) scale(1 ${1 - fall * 0.35})`);
      g.querySelectorAll<SVGElement>('[data-team]').forEach(c => c.setAttribute('fill', color));
      const tag = g.querySelector('text')!;
      if (tag.textContent !== label) tag.textContent = label;
      (g.querySelector('[data-key]') as SVGElement).style.opacity = label ? '1' : '0';
    };
    const line = (el: SVGPolylineElement, pts: UD[], progress: number) => {
      el.setAttribute('points', pts.map(([u, d]) => { const p = at(u, d); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' '));
      el.style.strokeDashoffset = String(1 - progress);
    };
    const bez = (a: UD, c: UD, b: UD, t: number): UD => [
      (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
    ];
    const RUSH: [UD, UD, UD] = [[0.78, 0.6], [0.82, 0.42], [0.3, 0.405]];

    // Flashes in the stands: a few a second, a storm after a score.
    const flashUntil = new Array(FLASHES).fill(0);
    let frenzyUntil = 0;
    const flash = (now: number) => {
      const rate = now < frenzyUntil ? 2.2 : 0.18;
      let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
      for (let i = 0; i < FLASHES && n > 0; i++) {
        if (flashUntil[i] < now) {
          const s = seatSpot(); flashes[i].setAttribute('cx', String(s.x)); flashes[i].setAttribute('cy', String(s.y));
          flashUntil[i] = now + 90 + Math.random() * 90; n--;
        }
      }
      for (let i = 0; i < FLASHES; i++) flashes[i].style.opacity = flashUntil[i] > now ? '1' : '0';
    };

    if (reduce) {
      showJumbo('stadium');
      placeBall({ x: 1062, y: 330 }, 0.5, 30, false);
      return;
    }

    // ── The loop ──
    let n = 0, play: Play = 'pass', kickN = 0, phase: 'idle' | 'art' | 'live' | 'cheer' = 'idle', t0 = performance.now();
    let raf = 0, running = false, appCard = 0, trailPts: Pt[] = [], shakeUntil = 0, boardX = 0, last = performance.now();
    const kick = () => KICKS[kickN % KICKS.length];
    const parts = bits.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0 }));
    let ptsFrom: Pt = { x: VX, y: 300 };
    const burst = (at: Pt) => parts.forEach(p => {
      p.x = at.x; p.y = at.y; p.vx = (Math.random() - 0.5) * 460; p.vy = -160 - Math.random() * 340; p.r = Math.random() * 360; p.vr = (Math.random() - 0.5) * 900;
    });
    const score = (s: PlayScore, where: Pt, now: number) => {
      phase = 'cheer'; t0 = now; frenzyUntil = now + 1400; burst(where); ptsFrom = where;
      jCall.textContent = s.call; jCall.setAttribute('font-size', s.call.length > 9 ? '33' : '44'); ptsText.textContent = `+${s.points.toFixed(1)}`;
      showJumbo('call');
      scored.current?.(s);
    };
    const resetPlay = () => {
      trailPts = []; trail.setAttribute('points', ''); trail.style.opacity = '1';
      route.setAttribute('points', ''); route2.setAttribute('points', '');
      for (let i = 0; i < TOKENS; i++) tok(i, null);
      rings.forEach(r => { r.style.opacity = '0'; });
    };

    const frame = (now: number) => {
      const el = (now - t0) / 1000 / PACE, dt = Math.min(0.05, (now - last) / 1000); last = now;
      flash(now);
      // The lights: steady, or on a score, a show.
      const sk = skyRef.current, show = phase === 'cheer' && el < 2.2;
      const showIn = show ? Math.min(1, el * 3) * (1 - Math.max(0, el - 1.8) / 0.4) : 0;
      bulbs.forEach((b, i) => { b.style.opacity = show ? ((Math.floor(el * 9) + i) % 3 === 0 ? '1' : '0.1') : String(sk.lights); });
      beams.forEach(b => { b.style.opacity = show ? String(0.12 + Math.random() * 0.38) : String(sk.beams); });
      sweeps.forEach((w, i) => {
        w.style.opacity = String(0.42 * showIn);
        w.setAttribute('transform', `rotate(${(i ? -1 : 1) * (Math.sin(el * 3.2 + i * 1.7) * 30)} ${w.dataset.px} ${w.dataset.py})`);
      });
      ringLights.forEach((c, i) => {
        c.setAttribute('fill', show ? ((i + Math.floor(el * 8)) % 2 ? GOLD : TURF_LIGHT) : '#FFF3D1');
        c.style.opacity = show ? '1' : String(Math.max(0.35, sk.lights));
      });
      boardFill.setAttribute('fill', show ? (Math.floor(el * 6) % 2 ? GOLD : '#fff') : SIGNAL);
      clouds.forEach((c, i) => c.setAttribute('transform', `translate(${(((now / 1000) * (5 + i * 2) + i * 420) % 1800) - 200} 0)`));
      boardX = (boardX - dt * 40) % lap; boardText.setAttribute('startOffset', String(boardX)); placeLogos();
      jOdds.textContent = `${Math.round(chance.current * 100)}%`;
      jBar.setAttribute('width', String(Math.max(4, 300 * chance.current)));
      scene.setAttribute('transform', now < shakeUntil ? `translate(${(Math.random() - 0.5) * 9} ${(Math.random() - 0.5) * 6})` : '');

      if (phase === 'idle') {
        if (el > 2.4 && !holdRef.current) {
          play = ORDER[n % ORDER.length]; resetPlay();
          const [down, sub] = DOWN[play](kick()); jDown.textContent = down; jDownSub.textContent = sub; showJumbo('down');
          phase = 'art'; t0 = now;
        }
      } else if (phase === 'art' || phase === 'live') {
        const pre = phase === 'art', t = pre ? 0 : el;
        const draw = pre ? clamp(el / 0.8) : 1;
        if (play === 'pass') {
          const qb: UD = [-0.1, lerp(0.27, 0.2, clamp(t / 0.7))];
          tok(0, qb, TURF_LIGHT, 'QB');
          [-0.32, -0.1, 0.12].forEach((u, i) => tok(1 + i, [u + Math.sin(now / 90 + i) * 0.004, 0.31], TURF_LIGHT));
          [-0.21, 0.01].forEach((u, i) => tok(4 + i, [u, lerp(0.35, 0.33, clamp(t / 1.2))], VIOLET));
          const wr = along(WR, t), cb = along(WR, Math.max(0, t - 0.22));
          tok(6, wr, TURF_LIGHT, 'WR'); tok(7, [cb[0] - 0.09, cb[1] - 0.03], VIOLET);
          line(route, WR.map(k => [k[1], k[2]] as UD), draw);
          line(route2, [[0.6, 0.38], [0.64, 0.56], [1.18, 0.86]], pre ? draw * 0.7 : 0.7);
          if (t < PASS.throwAt) placeBall({ x: at(...qb).x + 8, y: at(...qb).y - 14 }, at(...qb).s * 0.55, -30, false);
          else if (t < PASS.catchAt) {
            const k = (t - PASS.throwAt) / (PASS.catchAt - PASS.throwAt);
            const a = at(...qb), b = at(...along(WR, PASS.catchAt));
            const p = { x: lerp(a.x, b.x, k), y: lerp(a.y - 14, b.y - 12, k) - Math.sin(Math.PI * k) * 130 };
            placeBall(p, lerp(a.s, b.s, k) * 0.55, -40 + k * 30, false);
            trailPts.push(p); if (trailPts.length > 30) trailPts.shift();
            trail.setAttribute('points', trailPts.map(z => `${z.x.toFixed(1)},${z.y.toFixed(1)}`).join(' '));
          } else { const w = at(...wr); placeBall({ x: w.x + 6, y: w.y - 10 }, w.s * 0.5, -20, false); }
          if (!pre && t >= PASS.end) score({ label: 'GHO WR, 38-yd TD catch', points: 10.8, call: 'TOUCHDOWN!' }, at(...wr), now);
        } else if (play === 'sack') {
          const hit = clamp((t - SACK.hitAt) / 0.35);
          const qb: UD = [0.28, lerp(0.48, 0.405, clamp(t / 0.8))];
          tok(0, qb, VIOLET, '', hit);
          [0.08, 0.28, 0.48].forEach((u, i) => tok(1 + i, [u, 0.53], VIOLET));
          [0.18, 0.38].forEach((u, i) => tok(4 + i, [u + Math.sin(now / 70 + i) * 0.006, 0.56], TURF_LIGHT));
          const de = t < SACK.hitAt ? bez(RUSH[0], RUSH[1], RUSH[2], clamp(t / SACK.hitAt)) : RUSH[2];
          tok(6, de, TURF_LIGHT, 'DE'); tok(7, null);
          line(route, [...Array(13)].map((_, i) => bez(RUSH[0], RUSH[1], RUSH[2], i / 12)), draw);
          route2.setAttribute('points', '');
          const q2 = at(...qb);
          if (t < SACK.hitAt) placeBall({ x: q2.x + 8, y: q2.y - 14 }, q2.s * 0.55, -30, false);
          else {
            if (rings[0].style.opacity === '0') shakeUntil = now + 320;
            rings.forEach((r, i) => {
              const k = clamp((t - SACK.hitAt - i * 0.12) / 0.55);
              r.setAttribute('cx', String(q2.x)); r.setAttribute('cy', String(q2.y)); r.setAttribute('r', String(10 + k * 120));
              r.style.opacity = String(k > 0 && k < 1 ? 1 - k : 0);
            });
            placeBall({ x: q2.x + 18 * hit, y: q2.y - 10 + 18 * hit }, q2.s * 0.5, -30 + hit * 160, false);
          }
          if (!pre && t >= SACK.end) score({ label: 'GHO D/ST, sack', points: 1, call: 'SACK!' }, q2, now);
        } else {
          const k = kick();
          if (pre || t < 0.001) {
            placeBall(k.from, 1.1, -18 + Math.sin(now / 110) * 3, false);
          } else {
            const dur = 1.35, end = k.kind === 'doink' ? 1.12 : 1.05, f = Math.min(end, t / dur);
            let p: Pt, s: number, behind: boolean, alpha = 1;
            if (k.kind === 'doink' && f > 1) {
              const v = Math.min(1, (f - 1) / 0.12);
              p = quad(k.to, { x: k.to.x + 30, y: k.to.y - 40 }, { x: VX + 4, y: 392 }, v);
              s = 0.36 - v * 0.1; behind = v > 0.5; alpha = 1 - Math.max(0, v - 0.7) * 2.5;
            } else {
              p = quad(k.from, k.peak, k.to, f);
              s = 1.1 - f * 0.75; behind = k.kind === 'good' && f > 0.97; alpha = f > 1 ? 1 - (f - 1) / 0.05 : 1;
            }
            placeBall(p, Math.max(0.26, s), -18 + f * 700, behind, alpha);
            trailPts.push(p); if (trailPts.length > 26) trailPts.shift();
            trail.setAttribute('points', trailPts.map(z => `${z.x.toFixed(1)},${z.y.toFixed(1)}`).join(' '));
            if (f >= end) {
              glow.style.opacity = '0.9';
              score({ label: `GHO K, ${k.yards}-yd field goal${k.kind === 'doink' ? ', off the upright' : ''}`, points: fieldGoalPoints(k.yards), call: k.kind === 'doink' ? 'STILL GOOD.' : "IT'S GOOD!" }, { x: VX, y: 300 }, now);
            }
          }
        }
        if (pre && el > 1.0) { phase = 'live'; t0 = now; }
      } else if (phase === 'cheer') {
        const pop = clamp(el / 0.22);
        jCall.style.transform = `scale(${0.7 + 0.3 * (1 - (1 - pop) ** 3)})`;
        jCallBg.style.opacity = String(el < 0.5 ? (Math.floor(el * 12) % 2 ? 0.95 : 0.55) : 0.85);
        pts.style.opacity = String(el < 1.4 ? clamp(el / 0.2) : Math.max(0, 1 - (el - 1.4) / 0.3));
        pts.setAttribute('transform', `translate(${ptsFrom.x} ${ptsFrom.y - 30 - el * 34})`);
        glow.style.opacity = String(Math.max(0, Number(glow.style.opacity || 0) - dt * 0.6));
        trail.style.opacity = String(Math.max(0, 1 - el * 1.4));
        parts.forEach((p, i) => {
          p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
          bits[i].setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${p.r})`);
          bits[i].style.opacity = String(Math.max(0, 1 - el / 1.8));
        });
        if (play === 'kick') hideBall();
        if (el > 2.0) {
          if (play === 'kick') kickN++;
          n++; phase = 'idle'; t0 = now; pts.style.opacity = '0'; glow.style.opacity = '0';
          appCard = (appCard + 1) % 4;
          const card = ['desk', 'odds', 'stadium', 'gotw'][appCard];
          if (card === 'desk') jTake.textContent = TAKES[(n / 3 | 0) % TAKES.length];
          showJumbo(card); resetPlay(); hideBall();
        }
      }
      raf = requestAnimationFrame(frame);
    };

    runNow.current = () => { if (phase === 'idle') t0 = performance.now() - 2400 * PACE * 1.01; };
    showJumbo('desk'); jTake.textContent = TAKES[0];

    const start = () => { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    let visible = false;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !document.hidden) start(); else stop(); });
    io.observe(root);
    const onVis = () => { if (document.hidden) stop(); else if (visible) start(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [reduce]);

  const J = JUMBO;
  return (
    <svg ref={svg} viewBox={frame === 'phone' ? `${VX - 330} 96 660 ${H - 96}` : `0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice" role="img"
      aria-label="A game in a packed stadium: a touchdown pass, a sack and a field goal, with the app on the jumbotron"
      onPointerDown={() => runNow.current()}
      className={cn('h-full w-full cursor-pointer select-none [&_[data-j-call]]:[transform-box:fill-box] [&_[data-j-call]]:origin-center', className)}>
      <defs>
        <linearGradient id={u('gf-sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.sky[0]} /><stop offset="0.55" stopColor={sky.sky[1]} /><stop offset="1" stopColor={sky.sky[2]} />
        </linearGradient>
        <radialGradient id={u('gf-sunglow')} cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor={sky.sun.glow} stopOpacity="0.55" /><stop offset="1" stopColor={sky.sun.glow} stopOpacity="0" /></radialGradient>
        <linearGradient id={u('gf-sweep-a')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={TURF_LIGHT} stopOpacity="0.9" /><stop offset="1" stopColor={TURF_LIGHT} stopOpacity="0" /></linearGradient>
        <linearGradient id={u('gf-sweep-b')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={GOLD} stopOpacity="0.9" /><stop offset="1" stopColor={GOLD} stopOpacity="0" /></linearGradient>
        <radialGradient id={u('lp-flood')} cx="0.5" cy="0" r="0.9"><stop offset="0" stopColor="#fff" stopOpacity="0.2" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <radialGradient id={u('lp-leather')} cx="0.4" cy="0.32" r="0.8"><stop offset="0" stopColor="#B4622F" /><stop offset="0.6" stopColor="#7A3A17" /><stop offset="1" stopColor="#4A220C" /></radialGradient>
        <linearGradient id={u('lp-turf')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0E4A33" /><stop offset="1" stopColor="#0A2E21" /></linearGradient>
        <radialGradient id={u('lp-goalglow')} cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor={GOLD} stopOpacity="0.55" /><stop offset="1" stopColor={GOLD} stopOpacity="0" /></radialGradient>
        {/* The crowd: a few thousand fans in muted jerseys, the home turf among them. */}
        <pattern id={u('gf-crowd')} width="15" height="11" patternUnits="userSpaceOnUse">
          <rect width="15" height="11" fill="#0E1418" />
          <circle cx="3" cy="3" r="2.4" fill="#2C3A41" /><circle cx="10.5" cy="2.6" r="2.4" fill="#16533C" />
          <circle cx="6.5" cy="8.2" r="2.4" fill="#3A2F4A" /><circle cx="13" cy="8.6" r="2.4" fill="#24453A" />
        </pattern>
        <linearGradient id={u('gf-standfade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#06080B" stopOpacity={sky.stands} /><stop offset="0.35" stopColor="#06080B" stopOpacity={sky.stands * 0.28} /><stop offset="1" stopColor="#06080B" stopOpacity={sky.stands * 0.6} />
        </linearGradient>
        <linearGradient id={u('gf-screen')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0E171C" /><stop offset="1" stopColor="#081013" /></linearGradient>
        <path id={u('gf-board')} d={BOARD} />
        <clipPath id={u('gf-logo')}><rect x={-LOGO / 2} y={-LOGO / 2} width={LOGO} height={LOGO} rx="3.5" /></clipPath>
        <clipPath id={u('gf-jumbo')}><rect x={J.x} y={J.y} width={J.w} height={J.h} rx="8" /></clipPath>
        <clipPath id={u('gf-thumb')}><rect x={J.x + 14} y={J.y + 14} width="150" height={J.h - 28} rx="6" /></clipPath>
      </defs>

      <g data-scene>
        <rect width={W} height={H} fill={`url(#${u('gf-sky')})`} />
        {/* The sky's own light: stars, the moon or the sun, and clouds by day. */}
        {sky.stars && STARS.map((st, i) => <circle key={i} className="gf-twinkle" cx={st.x} cy={st.y} r={st.r} fill="#fff" style={{ animationDelay: `${st.d}s` }} />)}
        <circle cx={cel.x} cy={cel.y} r={cel.r * 3.2} fill={`url(#${u('gf-sunglow')})`} />
        <circle cx={cel.x} cy={cel.y} r={cel.r} fill={cel.color} />
        {/* A full moon: its seas, faintly. */}
        {cel.moon && <><circle cx={cel.x - cel.r * 0.3} cy={cel.y - cel.r * 0.2} r={cel.r * 0.25} fill="#D9D4C3" /><circle cx={cel.x + cel.r * 0.3} cy={cel.y + cel.r * 0.3} r={cel.r * 0.17} fill="#D9D4C3" /></>}
        {CLOUDS.slice(0, sky.clouds).map((c, i) => (
          <g key={i} data-cloud>
            <g transform={`translate(${c.x} ${c.y}) scale(${c.s})`} fill="#fff" opacity={tod === 'day' ? 0.75 : 0.35}>
              <ellipse cx="0" cy="0" rx="70" ry="18" /><ellipse cx="-30" cy="-12" rx="34" ry="20" /><ellipse cx="22" cy="-16" rx="40" ry="24" />
            </g>
          </g>
        ))}

        {/* The stands: the far end and both sides, packed, under a ring of concourse lights. */}
        <rect x="0" y="418" width={W} height={H - 418} fill={`url(#${u('gf-crowd')})`} />
        <rect x="0" y="418" width={W} height={H - 418} fill={`url(#${u('gf-standfade')})`} />
        <path d={`M-40 430Q${VX} 380 ${W + 40} 430`} stroke="#F5E6B8" strokeOpacity="0.5" strokeWidth="3" fill="none" />
        {[...Array(26)].map((_, i) => { const x = -20 + i * 60; const y = 430 - Math.sin((i / 25) * Math.PI) * 40; return <circle key={i} data-cl cx={x} cy={y} r="2.6" fill="#FFF3D1" />; })}
        {[...Array(FLASHES)].map((_, i) => <circle key={i} data-flash r="2.4" fill="#fff" style={{ opacity: 0 }} />)}

        {/* Floodlights, their beams, and the spotlights that sweep the crowd on a score. */}
        {BANKS.map((x, i) => {
          const cx = x + 66, top = BY + 20;
          return (
            <g key={x}>
              <path data-beam d={i ? `M${cx} ${top}L${cx - 370} ${H}H${cx + 250}Z` : `M${cx} ${top}L${cx - 250} ${H}H${cx + 370}Z`} fill={`url(#${u('lp-flood')})`} style={{ opacity: sky.beams }} />
              <path data-sweep data-px={cx} data-py={top} d={i ? `M${cx} ${top}L${cx - 430} ${H}H${cx - 240}Z` : `M${cx} ${top}L${cx + 240} ${H}H${cx + 430}Z`}
                fill={`url(#${u(`gf-sweep-${i ? 'b' : 'a'}`)})`} style={{ opacity: 0, mixBlendMode: 'screen' }} />
            </g>
          );
        })}
        {BANKS.map(x => (
          <g key={x}>
            <rect x={x} y={BY} width="132" height="44" rx="6" fill="#1B2228" />
            {[0, 1].map(r => [0, 1, 2, 3, 4].map(c => <circle key={`${r}${c}`} data-bulb cx={x + 18 + c * 24} cy={BY + 12 + r * 20} r="7" fill="#FFFDF2" style={{ opacity: sky.lights }} />))}
          </g>
        ))}

        {/* The jumbotron, on two legs into the stands. */}
        <path d={`M${J.x + 70} ${J.y + J.h}V430M${J.x + J.w - 70} ${J.y + J.h}V430`} stroke="#1B2228" strokeWidth="10" />
        <rect x={J.x - 8} y={J.y - 8} width={J.w + 16} height={J.h + 16} rx="12" fill="#151C21" stroke="#2A353C" />
        <rect x={J.x} y={J.y} width={J.w} height={J.h} rx="8" fill={`url(#${u('gf-screen')})`} />
        <g clipPath={`url(#${u('gf-jumbo')})`} style={DISPLAY}>
          {/* The Desk: a writer's take. */}
          <g data-j="desk" style={{ opacity: 0, transition: 'opacity .35s' }}>
            <circle cx={J.x + 46} cy={J.y + 56} r="25" fill={SIGNAL} />
            <text x={J.x + 46} y={J.y + 64} textAnchor="middle" fill="#fff" fontSize="22" fontWeight="900">D</text>
            <text x={J.x + 88} y={J.y + 34} fill={TURF_LIGHT} fontSize="12" fontWeight="800" letterSpacing="2">THE DESK, @PRESSBOX</text>
            <text data-j-take x={J.x + 88} y={J.y + 66} fill="#fff" fontSize="19" fontWeight="800">Ghosts by ten. Book it.</text>
            <text x={J.x + 88} y={J.y + 90} fill="#fff" fillOpacity="0.5" fontSize="12" fontWeight="600">AI beat writer, 2m</text>
          </g>
          {/* The live win chance, from the matchup card. */}
          <g data-j="odds" style={{ opacity: 0, transition: 'opacity .35s' }}>
            <text x={J.x + 24} y={J.y + 32} fill={TURF_LIGHT} fontSize="12" fontWeight="800" letterSpacing="2">GHOSTS WIN CHANCE, LIVE</text>
            <text data-j-odds x={J.x + 24} y={J.y + 78} fill="#fff" fontSize="44" fontWeight="900">50%</text>
            <rect x={J.x + 24} y={J.y + 90} width="300" height="8" rx="4" fill="#fff" fillOpacity="0.12" />
            <rect data-j-bar x={J.x + 24} y={J.y + 90} width="150" height="8" rx="4" fill={TURF_LIGHT} />
          </g>
          {/* The home stadium: the app's own 3D render. */}
          <g data-j="stadium" style={{ opacity: 0, transition: 'opacity .35s' }}>
            <image href="/landing/stadiums/cantilever-thumb.webp" x={J.x + 14} y={J.y + 14} width="150" height={J.h - 28} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${u('gf-thumb')})`} />
            <text x={J.x + 182} y={J.y + 34} fill={TURF_LIGHT} fontSize="12" fontWeight="800" letterSpacing="2">FRANCHISE HQ</text>
            <text x={J.x + 182} y={J.y + 64} fill="#fff" fontSize="22" fontWeight="900">GHOSTS FIELD</text>
            <text x={J.x + 182} y={J.y + 88} fill="#fff" fillOpacity="0.6" fontSize="13" fontWeight="700">71,204 tonight, sold out</text>
          </g>
          {/* Game of the Week. */}
          <g data-j="gotw" style={{ opacity: 0, transition: 'opacity .35s' }}>
            <text x={J.x + 24} y={J.y + 32} fill={GOLD} fontSize="12" fontWeight="800" letterSpacing="2">GAME OF THE WEEK</text>
            <text x={J.x + 24} y={J.y + 68} fill="#fff" fontSize="26" fontWeight="900">GHOSTS vs LONG SHOTS</text>
            <text x={J.x + 24} y={J.y + 92} fill="#fff" fillOpacity="0.6" fontSize="13" fontWeight="700">Scored 84 out of 100, rivalry game</text>
          </g>
          {/* Down and distance, before the snap. */}
          <g data-j="down" style={{ opacity: 0, transition: 'opacity .25s' }}>
            <text data-j-down x={J.x + J.w / 2} y={J.y + 62} textAnchor="middle" fill="#fff" fontSize="40" fontWeight="900" style={{ fontStretch: '120%' }}>2ND & 7</text>
            <text data-j-downsub x={J.x + J.w / 2} y={J.y + 90} textAnchor="middle" fill={TURF_LIGHT} fontSize="13" fontWeight="800" letterSpacing="3">OPP 38</text>
          </g>
          {/* The call. */}
          <g data-j="call" style={{ opacity: 0 }}>
            <rect data-j-callbg x={J.x} y={J.y} width={J.w} height={J.h} fill={SIGNAL} opacity="0.85" />
            <text data-j-call x={J.x + J.w / 2} y={J.y + 72} textAnchor="middle" fill="#fff" fontSize="46" fontWeight="900" style={{ fontStretch: '125%' }}>TOUCHDOWN!</text>
          </g>
        </g>

        {/* The field. */}
        <g>
          {FIELD.stripes.map((d, i) => <path key={d} d={d} fill={(i % 2 ? sky.turf[1] : sky.turf[0]).replace('url(#lp-turf)', `url(#${u('lp-turf')})`)} />)}
          {FIELD.lines.map(d => <path key={d} d={d} stroke={PAPER} strokeOpacity="0.16" strokeWidth="2" />)}
          {FIELD.side.map(d => <path key={d} d={d} stroke={PAPER} strokeOpacity="0.3" strokeWidth="3" />)}
          <path d={`M${VX - 260} ${POST.base}H${VX + 260}`} stroke={PAPER} strokeOpacity="0.45" strokeWidth="3" />
          {/* The end zone, painted. */}
          <path d={`M${at(-1.6, 0.98).x} ${yOf(0.98)}H${at(1.6, 0.98).x}L${at(1.6, 0.9).x} ${yOf(0.9)}H${at(-1.6, 0.9).x}Z`} fill={TURF_LIGHT} opacity="0.12" />
        </g>

        {/* The ribbon board, wrapped round the front of the stands. */}
        <path data-board-path d={BOARD} fill="none" stroke="#04080A" strokeWidth="17" strokeLinejoin="round" />
        <path d={BOARD} fill="none" stroke="#fff" strokeOpacity="0.07" strokeWidth="17" strokeLinejoin="round" transform="translate(0 -0.5)" style={{ mixBlendMode: 'screen' }} />
        <text data-board-text dy="3.8" fill={SIGNAL} fontSize="10.5" fontWeight="800" letterSpacing="2" style={DISPLAY}>
          <textPath data-board href={`#${u('gf-board')}`} startOffset="0">{RIBBON.repeat(3)}</textPath>
        </text>
        {[...Array(3)].map((_, k) => (
          <g key={k} data-board-logo style={{ opacity: 0 }}>
            <image href="/brand/partners/sleeper.png" x={-LOGO / 2} y={-LOGO / 2} width={LOGO} height={LOGO} clipPath={`url(#${u('gf-logo')})`} />
          </g>
        ))}
        {/* For measuring: one pass, and the part before the logo's gap. */}
        <g aria-hidden style={{ visibility: 'hidden' }} fontSize="10.5" fontWeight="800" letterSpacing="2">
          <text data-board-lap x="0" y="-50" style={DISPLAY}>{RIBBON}</text>
          <text data-board-head x="0" y="-50" style={DISPLAY}>{RIBBON_HEAD}</text>
          <text data-board-gap x="0" y="-50" style={DISPLAY}>{GAP}</text>
        </g>

        <Ball which="back" leather={u('lp-leather')} />
        <g data-glow style={{ opacity: 0 }}><ellipse cx={VX} cy={POST.bar - 60} rx="190" ry="170" fill={`url(#${u('lp-goalglow')})`} /></g>
        <g stroke={GOLD} strokeLinecap="round" fill="none">
          <path d={`M${VX} ${POST.base}V${POST.bar}`} strokeWidth="9" />
          <path d={`M${POST.left} ${POST.bar}H${POST.right}`} strokeWidth="8" />
          <path d={`M${POST.left} ${POST.bar}V${POST.top}M${POST.right} ${POST.bar}V${POST.top}`} strokeWidth="6" />
        </g>
        {/* A wind flag on top of each upright, both blowing the same way. */}
        {[POST.left, POST.right].map(x => <path key={x} d={`M${x} ${POST.top}l14 6v10l-14 -6Z`} fill={SIGNAL} />)}

        {/* The play art: routes and rushes, drawn in before the snap. */}
        <polyline data-route2 points="" pathLength={1} fill="none" stroke={VIOLET} strokeOpacity="0.55" strokeWidth="3" strokeDasharray="1 1" strokeLinecap="round" />
        <polyline data-route points="" pathLength={1} fill="none" stroke={SIGNAL} strokeWidth="4" strokeDasharray="1 1" strokeLinecap="round" strokeLinejoin="round" />

        {/* The players. */}
        {[...Array(TOKENS)].map((_, i) => (
          <g key={i} data-tok style={{ opacity: 0 }}>
            <ellipse cy="14" rx="15" ry="5" fill="#000" opacity="0.45" />
            <circle data-team r="25" fill={TURF_LIGHT} opacity="0.18" />
            <circle data-team r="15" fill={TURF_LIGHT} stroke={INK} strokeWidth="3" />
            <circle r="5" cy="-3" fill="#fff" opacity="0.35" />
            <g data-key style={{ opacity: 0 }}>
              <rect x="-17" y="-44" width="34" height="18" rx="5" fill={INK} stroke="#fff" strokeOpacity="0.3" />
              <text y="-31" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="900" style={DISPLAY} />
            </g>
          </g>
        ))}

        {[0, 1].map(i => <circle key={i} data-ring r="10" fill="none" stroke={GOLD} strokeWidth={i ? 3 : 6} style={{ opacity: 0 }} />)}
        <polyline data-trail points="" fill="none" stroke={TURF_LIGHT} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
        <Ball which="front" leather={u('lp-leather')} />

        {[...Array(28)].map((_, i) => <rect key={i} data-bit x="-5" y="-3" width="10" height="6" rx="1.5" style={{ opacity: 0 }} fill={[GOLD, TURF_LIGHT, SIGNAL, PAPER][i % 4]} />)}
        <g data-pts style={{ opacity: 0 }}>
          <rect x="-58" y="-26" width="116" height="44" rx="11" fill={SIGNAL} />
          <text data-pts-text x="-8" y="6" textAnchor="middle" fill="#fff" fontSize="25" fontWeight="900" style={{ ...DISPLAY, fontStretch: '110%' }}>+0.0</text>
          <text x="36" y="3" textAnchor="middle" fill="#fff" fillOpacity="0.8" fontSize="10.5" fontWeight="800" letterSpacing="1" style={DISPLAY}>PTS</text>
        </g>
      </g>
    </svg>
  );
}
