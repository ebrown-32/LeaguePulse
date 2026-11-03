'use client';

/**
 * Night game: a field under the lights, and a football kicked end over end through the uprights,
 * over and over. Behind the landing page's hero (and, smaller, its last call).
 *
 * One SVG, drawn by hand: the field in perspective with mowing stripes and yard lines running to
 * golden goalposts, two floodlights, and the ball, which leaves a trail like the logo's heartbeat.
 * A kick sails through ("IT'S GOOD", its fantasy points by distance, confetti); every third one clangs off the upright and
 * drops through anyway ("DOINK." then "STILL GOOD."). A tap on the field kicks the next one now.
 *
 * Animated by hand in one requestAnimationFrame loop that writes attributes straight onto the SVG,
 * never through React state, and only while the field is on screen and the tab is visible. With
 * reduced motion it is one still frame: the ball between the uprights.
 */

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export const W = 1440, H = 900;
export const VX = 1060;                                   // the vanishing point, between the uprights
export const POST = { left: 1012, right: 1108, bar: 432, top: 270, base: 604 };
export const GOLD = '#F5C542', TURF_LIGHT = '#3DD598', SIGNAL = '#EE5A2E', PAPER = '#F7F6F2';

export type Pt = { x: number; y: number };
export const quad = (a: Pt, c: Pt, b: Pt, t: number): Pt => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});

/** A kick: where the ball goes, whether it finds the upright first, and from how far (for fantasy points). */
type Kick = { kind: 'good' | 'doink'; yards: number; from: Pt; peak: Pt; to: Pt };
/** From just behind the camera, right of the hero's words, so the whole flight is in view. */
const KICKS: Kick[] = [
  { kind: 'good', yards: 47, from: { x: 780, y: 770 }, peak: { x: 860, y: 40 }, to: { x: 1062, y: 352 } },
  { kind: 'good', yards: 38, from: { x: 840, y: 778 }, peak: { x: 980, y: 90 }, to: { x: 1050, y: 380 } },
  { kind: 'doink', yards: 52, from: { x: 760, y: 774 }, peak: { x: 840, y: 30 }, to: { x: POST.left + 4, y: 296 } },
];

/** The field in perspective: the stripes, and the yard lines between them, nearer ones farther apart. */
function field() {
  const far = POST.base, near = H + 40, n = 11;
  const yAt = (k: number) => far + (near - far) * (k / n) ** 1.9;
  const half = (y: number) => 260 + ((y - far) / (near - far)) * 1500;   // half-width at y
  const stripes: string[] = [], lines: string[] = [];
  for (let k = 0; k < n; k++) {
    const y0 = yAt(k), y1 = yAt(k + 1);
    stripes.push(`M${VX - half(y0)} ${y0}H${VX + half(y0)}L${VX + half(y1)} ${y1}H${VX - half(y1)}Z`);
    if (k > 0) lines.push(`M${VX - half(y0)} ${y0}H${VX + half(y0)}`);
  }
  return { stripes, lines, side: [`M${VX - half(far)} ${far}L${VX - half(near)} ${near}`, `M${VX + half(far)} ${far}L${VX + half(near)} ${near}`] };
}
export const FIELD = field();

/** The football: leather, two stripes, laces. Drawn twice, so it can pass in front of the posts or behind. */
/** `leather`: the id of the gradient to fill it with (each stadium names its own). */
export function Ball({ which, leather = 'lp-leather' }: { which: 'front' | 'back'; leather?: string }) {
  return (
    <g data-ball={which} style={{ opacity: which === 'front' ? 1 : 0 }}>
      <ellipse rx="34" ry="20" fill={`url(#${leather})`} stroke="#3B1D0E" strokeWidth="1.5" />
      <path d="M-22 -14Q-26 0 -22 14M22 -14Q26 0 22 14" stroke={PAPER} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M-11 -1H11" stroke={PAPER} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M-7 -5V3M-2 -5V3M3 -5V3M8 -5V3" stroke={PAPER} strokeWidth="2" strokeLinecap="round" />
      <ellipse rx="22" ry="7" cy="-9" fill="#fff" opacity="0.12" />
    </g>
  );
}

/** Fantasy points for a made field goal, by distance, as most leagues score them. */
export const fieldGoalPoints = (yards: number) => (yards >= 50 ? 5 : yards >= 40 ? 4 : 3);
export interface Score { kind: 'good' | 'doink'; yards: number; points: number }

/** `onScore`: each made kick, as it goes through (the hero's live matchup and scoring alert follow it). */
export default function KickField({ className, compact = false, onScore }: { className?: string; compact?: boolean; onScore?: (s: Score) => void }) {
  const reduce = useReducedMotion();
  const svg = useRef<SVGSVGElement>(null);
  const CALL = compact ? { x: POST.right + 34, y: 330 } : { x: VX, y: 190 };
  const PLUS = compact ? { x: POST.right + 34, y: 350 } : { x: VX + 120, y: 240 };
  const kickNow = useRef<() => void>(() => {});
  const scored = useRef(onScore);
  useEffect(() => { scored.current = onScore; }, [onScore]);

  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
    const front = $<SVGGElement>('[data-ball=front]'), back = $<SVGGElement>('[data-ball=back]');
    const trail = $<SVGPolylineElement>('[data-trail]');
    const shadow = $<SVGEllipseElement>('[data-shadow]');
    const say = $<SVGGElement>('[data-say]'), sayText = $<SVGTextElement>('[data-say-text]');
    const plus = $<SVGGElement>('[data-plus]'), plusText = $<SVGTextElement>('[data-plus-text]');
    const glow = $<SVGGElement>('[data-glow]');
    const bits = [...root.querySelectorAll<SVGRectElement>('[data-bit]')];

    const place = (p: Pt, s: number, spin: number, behind: boolean, alpha = 1) => {
      const t = `translate(${p.x} ${p.y}) rotate(${spin}) scale(${s})`;
      front.setAttribute('transform', t); back.setAttribute('transform', t);
      front.style.opacity = behind ? '0' : String(alpha);
      back.style.opacity = behind ? String(alpha) : '0';
    };
    const show = (el: SVGGElement, on: number, scale = 1) => {
      el.style.opacity = String(on);
      el.style.transform = `scale(${scale})`;
    };

    if (reduce) {
      // One still frame: the ball between the uprights, on its way through.
      place({ x: 1062, y: 330 }, 0.5, 30, false);
      return;
    }

    let kickIndex = 0, phase: 'aim' | 'flight' | 'cheer' | 'rest' = 'aim', t0 = performance.now(), raf = 0, running = false;
    let trailPts: Pt[] = [];
    const parts = bits.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0 }));
    const kick = () => KICKS[kickIndex % KICKS.length];
    let words: [string, string] = ["IT'S GOOD!", ''];

    const burst = () => {
      parts.forEach(p => {
        p.x = VX; p.y = 300; p.vx = (Math.random() - 0.5) * 520; p.vy = -180 - Math.random() * 380;
        p.r = Math.random() * 360; p.vr = (Math.random() - 0.5) * 900;
      });
    };

    const frame = (now: number) => {
      const el = (now - t0) / 1000;
      const k = kick();
      if (phase === 'aim') {
        // On the tee, a breath before the kick.
        place(k.from, 1.35, -18 + Math.sin(el * 9) * 3, false);
        shadow.setAttribute('cx', String(k.from.x)); shadow.setAttribute('cy', String(k.from.y + 26));
        shadow.style.opacity = '0.5';
        trail.setAttribute('points', '');
        show(say, 0); show(plus, 0); glow.style.opacity = '0';
        if (el > 0.7) { phase = 'flight'; t0 = now; trailPts = []; }
      } else if (phase === 'flight') {
        // A good kick fades just past the posts; a doink has its bounce to play out.
        const dur = 1.35, end = k.kind === 'doink' ? 1.12 : 1.05, t = Math.min(end, el / dur);
        let p: Pt, s: number, behind: boolean, alpha = 1;
        if (k.kind === 'doink' && t > 1) {
          // Off the upright, in and over the bar.
          const u = Math.min(1, (t - 1) / 0.12);
          p = quad(k.to, { x: k.to.x + 30, y: k.to.y - 40 }, { x: VX + 4, y: 392 }, u);
          s = 0.42 - u * 0.12; behind = u > 0.5; alpha = 1 - Math.max(0, u - 0.7) * 2.5;
        } else {
          p = quad(k.from, k.peak, k.to, t);
          s = 1.35 - t * 0.92; behind = k.kind === 'good' && t > 0.97; alpha = t > 1 ? 1 - (t - 1) / 0.05 : 1;
        }
        place(p, Math.max(0.28, s), -18 + t * 700, behind, alpha);
        shadow.style.opacity = String(Math.max(0, 0.5 - t * 1.5));
        trailPts.push(p); if (trailPts.length > 26) trailPts.shift();
        trail.setAttribute('points', trailPts.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '));
        if (k.kind === 'doink' && t >= 1 && words[0] !== 'DOINK.') { words = ['DOINK.', '']; sayText.textContent = 'DOINK.'; show(say, 1, 1); }
        if (el / dur >= end) {
          phase = 'cheer'; t0 = now; burst();
          words = k.kind === 'doink' ? ['STILL GOOD.', ''] : ["IT'S GOOD!", '']; sayText.textContent = words[0];
          // Fantasy points, not the scoreboard's three: by distance.
          const points = fieldGoalPoints(k.yards);
          plusText.textContent = `+${points}.0`;
          scored.current?.({ kind: k.kind, yards: k.yards, points });
        }
      } else if (phase === 'cheer') {
        const pop = Math.min(1, el / 0.25);
        show(say, el < 1.6 ? 1 : Math.max(0, 1 - (el - 1.6) / 0.3), 0.6 + 0.4 * (1 - (1 - pop) ** 3));
        plus.style.opacity = String(el < 1.4 ? Math.min(1, el / 0.2) : Math.max(0, 1 - (el - 1.4) / 0.3));
        plus.style.transform = `translateY(${-el * 26}px)`;
        glow.style.opacity = String(Math.max(0, 0.9 - el * 0.6));
        trail.style.opacity = String(Math.max(0, 1 - el * 1.4));
        const dt = 1 / 60;
        parts.forEach((q, i) => {
          q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.r += q.vr * dt;
          bits[i].setAttribute('transform', `translate(${q.x} ${q.y}) rotate(${q.r})`);
          bits[i].style.opacity = String(Math.max(0, 1 - el / 1.8));
        });
        if (el > 1.9) { phase = 'rest'; t0 = now; }
      } else {
        // Between kicks: the last flight's trail cleared, ready for the next.
        show(say, 0); plus.style.opacity = '0'; trail.setAttribute('points', ''); trail.style.opacity = '1';
        if (el > (compact ? 1.4 : 1.1)) { kickIndex++; words = ["IT'S GOOD!", '']; phase = 'aim'; t0 = now; }
      }
      raf = requestAnimationFrame(frame);
    };

    kickNow.current = () => {
      if (phase === 'aim' || phase === 'rest') { if (phase === 'rest') kickIndex++; phase = 'flight'; t0 = performance.now(); trailPts = []; words = ["IT'S GOOD!", '']; }
    };

    const start = () => { if (!running) { running = true; t0 = performance.now(); raf = requestAnimationFrame(frame); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    let visible = false;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !document.hidden) start(); else stop(); });
    io.observe(root);
    const onVis = () => { if (document.hidden) stop(); else if (visible) start(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [reduce, compact]);

  return (
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} // `compact` (a shorter band) frames the middle of the field, so the posts and the call stay in view.
      preserveAspectRatio={compact ? 'xMidYMid slice' : 'xMidYMax slice'} role="img"
      aria-label="A football kicked through the goalposts under stadium lights"
      onPointerDown={() => kickNow.current()}
      className={cn('h-full w-full cursor-pointer select-none [&_[data-say]]:[transform-box:view-box] [&_[data-plus]]:[transform-box:view-box]', className)}>
      <defs>
        <linearGradient id="lp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#07090C" />
          <stop offset="0.62" stopColor="#0C1417" />
          <stop offset="1" stopColor="#0B231A" />
        </linearGradient>
        <radialGradient id="lp-flood" cx="0.5" cy="0" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lp-leather" cx="0.4" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#B4622F" />
          <stop offset="0.6" stopColor="#7A3A17" />
          <stop offset="1" stopColor="#4A220C" />
        </radialGradient>
        <linearGradient id="lp-turf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0E4A33" />
          <stop offset="1" stopColor="#0A2E21" />
        </linearGradient>
        <radialGradient id="lp-goalglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={GOLD} stopOpacity="0.55" />
          <stop offset="1" stopColor={GOLD} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width={W} height={H} fill="url(#lp-sky)" />
      {/* Floodlights: a bank in each top corner, and their beams. */}
      <path d={`M90 120L-160 ${H}H460Z`} fill="url(#lp-flood)" opacity="0.3" />
      <path d={`M${W - 90} 120L${W - 460} ${H}H${W + 160}Z`} fill="url(#lp-flood)" opacity="0.3" />
      {[24, W - 156].map(x => (
        <g key={x}>
          <rect x={x} y="100" width="132" height="44" rx="6" fill="#1B2228" />
          {[0, 1].map(r => [0, 1, 2, 3, 4].map(c => (
            <circle key={`${r}${c}`} cx={x + 18 + c * 24} cy={112 + r * 20} r="7" fill="#FFFDF2" opacity="0.95" />
          )))}
        </g>
      ))}

      {/* The field. */}
      <g>
        {FIELD.stripes.map((d, i) => <path key={d} d={d} fill={i % 2 ? '#0D4230' : 'url(#lp-turf)'} />)}
        {FIELD.lines.map(d => <path key={d} d={d} stroke={PAPER} strokeOpacity="0.16" strokeWidth="2" />)}
        {FIELD.side.map(d => <path key={d} d={d} stroke={PAPER} strokeOpacity="0.3" strokeWidth="3" />)}
        <path d={`M${VX - 260} ${POST.base}H${VX + 260}`} stroke={PAPER} strokeOpacity="0.45" strokeWidth="3" />
      </g>

      {/* The ball, when it has gone through: behind the posts. */}
      <Ball which="back" />

      {/* The goalposts, and their glow when a kick is good. */}
      <g data-glow style={{ opacity: 0 }}>
        <ellipse cx={VX} cy={POST.bar - 60} rx="190" ry="170" fill="url(#lp-goalglow)" />
      </g>
      <g stroke={GOLD} strokeLinecap="round" fill="none">
        <path d={`M${VX} ${POST.base}V${POST.bar}`} strokeWidth="9" />
        <path d={`M${POST.left} ${POST.bar}H${POST.right}`} strokeWidth="8" />
        <path d={`M${POST.left} ${POST.bar}V${POST.top}M${POST.right} ${POST.bar}V${POST.top}`} strokeWidth="6" />
      </g>
      {/* A wind flag on top of each upright, both blowing the same way. */}
        {[POST.left, POST.right].map(x => <path key={x} d={`M${x} ${POST.top}l14 6v10l-14 -6Z`} fill={SIGNAL} />)}

      {/* The trail: a heartbeat across the night, like the logo. */}
      <polyline data-trail points="" fill="none" stroke={TURF_LIGHT} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <ellipse data-shadow cx="450" cy="872" rx="44" ry="9" fill="#000" opacity="0.5" />
      <Ball which="front" />

      {/* Confetti. */}
      {Array.from({ length: 28 }, (_, i) => (
        <rect key={i} data-bit x="-5" y="-3" width="10" height="6" rx="1.5" style={{ opacity: 0 }}
          fill={[GOLD, TURF_LIGHT, SIGNAL, PAPER][i % 4]} />
      ))}

      {/* The call. */}
      {/* Above the posts; in the shorter band, beside them, so a nav or the band's edge never covers it. */}
      <g data-say style={{ opacity: 0, transformOrigin: `${CALL.x}px ${CALL.y}px` }}>
        <text data-say-text x={CALL.x} y={CALL.y} textAnchor={compact ? 'start' : 'middle'} fill={GOLD}
          style={{ fontFamily: 'var(--font-lp-display), system-ui, sans-serif', fontWeight: 900, fontStretch: '125%', fontSize: compact ? 31 : 64, letterSpacing: '0.02em' }}>
          IT&apos;S GOOD!
        </text>
      </g>
      <g data-plus style={{ opacity: 0 }}>
        <rect x={PLUS.x} y={PLUS.y} width="140" height="52" rx="12" fill={SIGNAL} />
        <text data-plus-text x={PLUS.x + 54} y={PLUS.y + 37} textAnchor="middle" fill="#fff"
          style={{ fontFamily: 'var(--font-lp-display), system-ui, sans-serif', fontWeight: 900, fontStretch: '110%', fontSize: 30 }}>+4.0</text>
        <text x={PLUS.x + 114} y={PLUS.y + 33} textAnchor="middle" fill="#fff" fillOpacity="0.8"
          style={{ fontFamily: 'var(--font-lp-display), system-ui, sans-serif', fontWeight: 800, fontSize: 12, letterSpacing: '0.08em' }}>PTS</text>
      </g>
    </svg>
  );
}
