'use client';

/**
 * The hero: one matchup's chance to win across a Sunday, the way the product's
 * live forecast moves it.
 *
 * Sample data, modelled rather than drawn by hand: each team has a projection,
 * points arrive with the plays below and a steady trickle as the windows run,
 * and the chance to win is the lead plus the remaining projection, divided by
 * the uncertainty still left in the day. So the curve swings hard early, then
 * settles as fewer players are left to play, which is how a real Sunday feels.
 *
 * Chart rules: one value axis (chance to win, 0 to 100), a neutral 50% line,
 * and a diverging fill, turf above for one team and blue below for the other.
 * Line 2px, event markers 8px with a 2px surface ring, a crosshair and tooltip
 * on hover, and a small table of the plays underneath for anyone not reading
 * the colours.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

const A = { name: 'Gridiron Ghosts', short: 'GHO', proj: 118.6, base: 71 };
const B = { name: 'Fourth & Long Shots', short: 'FLS', proj: 112.2, base: 67 };
/** Validated pair: turf and blue, on white. */
const COLOR_A = '#0a7550';
const COLOR_B = '#2a78d6';

/** Minutes after noon, Eastern. */
const START = 30;   // 12:30
const END = 690;    // 11:30pm

interface Play { t: number; team: 'A' | 'B'; pts: number; label: string }
const PLAYS: Play[] = [
  { t: 78,  team: 'B', pts: 7.4,  label: 'RB, 9-yd TD' },
  { t: 101, team: 'A', pts: 9.0,  label: 'QB, two-TD drive' },
  { t: 130, team: 'A', pts: 10.1, label: 'WR, 41-yd TD' },
  { t: 172, team: 'B', pts: 4.6,  label: 'TE, three catches' },
  { t: 210, team: 'B', pts: 5.0,  label: 'K, 52-yd FG' },
  { t: 280, team: 'A', pts: 3.8,  label: 'RB, 28 rush yds' },
  { t: 315, team: 'B', pts: 12.3, label: 'WR, 63-yd TD' },
  { t: 365, team: 'A', pts: 8.0,  label: 'DEF, pick six' },
  { t: 535, team: 'A', pts: 7.6,  label: 'WR, seven catches' },
  { t: 640, team: 'B', pts: 6.2,  label: 'QB, late TD' },
];

/** Kickoff windows: when, how long, and the share of a lineup playing in each. */
const WINDOWS = [
  { from: 60, to: 255, share: 0.55, label: '1:00' },
  { from: 265, to: 455, share: 0.3, label: '4:25' },
  { from: 500, to: 690, share: 0.15, label: 'SNF' },
];

/** How much of each lineup has played by minute t. */
function played(t: number): number {
  return WINDOWS.reduce((s, w) => s + w.share * Math.max(0, Math.min(1, (t - w.from) / (w.to - w.from))), 0);
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26). */
function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152073) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

function stateAt(t: number) {
  const f = played(t);
  const pa = A.base * f + PLAYS.filter(p => p.team === 'A' && p.t <= t).reduce((s, p) => s + p.pts, 0);
  const pb = B.base * f + PLAYS.filter(p => p.team === 'B' && p.t <= t).reduce((s, p) => s + p.pts, 0);
  const remaining = 1 - f;
  const lead = pa - pb + (A.proj - B.proj) * remaining;
  const sd = 24 * Math.sqrt(remaining) + 0.6;
  return { a: pa, b: pb, p: phi(lead / sd) };
}

const clock = (m: number) => {
  const h = Math.floor(m / 60) + 12, mm = Math.floor(m % 60);
  const h12 = h > 12 ? h - 12 : h;
  return `${h12}:${String(mm).padStart(2, '0')}${h >= 12 && h < 24 ? 'pm' : 'am'}`;
};

// Geometry, in viewBox units.
const W = 640, H = 230, PL = 34, PR = 10, PT = 14, PB = 26;
const x = (t: number) => PL + ((t - START) / (END - START)) * (W - PL - PR);
const y = (p: number) => PT + (1 - p) * (H - PT - PB);

export default function WinChance() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: '-60px' });
  const [now, setNow] = useState(reduce ? END : START);
  const [hover, setHover] = useState<number | null>(null);

  // The afternoon plays out in about fourteen seconds, holds, then replays.
  useEffect(() => {
    if (reduce || !inView) return;
    let raf = 0, last = performance.now(), hold = 0;
    const step = (ts: number) => {
      const dt = ts - last; last = ts;
      setNow(n => {
        if (n >= END) { hold += dt; if (hold > 4500) { hold = 0; return START; } return END; }
        return Math.min(END, n + dt * 0.047);
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduce, inView]);

  const series = useMemo(() => {
    const pts: { t: number; p: number }[] = [];
    for (let t = START; t <= END; t += 3) pts.push({ t, p: stateAt(t).p });
    return pts;
  }, []);

  const visible = series.filter(s => s.t <= now);
  const line = visible.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s.p).toFixed(1)}`).join('');
  const area = visible.length > 1
    ? `${line}L${x(visible[visible.length - 1].t).toFixed(1)},${y(0.5)}L${x(visible[0].t).toFixed(1)},${y(0.5)}Z`
    : '';
  const cur = stateAt(now);
  const shownPlays = PLAYS.filter(p => p.t <= now);
  const latest = shownPlays[shownPlays.length - 1];
  const live = now < END;

  const hovered = hover != null ? { t: hover, ...stateAt(hover) } : null;
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    const t = START + ((vx - PL) / (W - PL - PR)) * (END - START);
    setHover(t < START || t > now ? null : Math.round(t));
  };

  return (
    <div ref={ref} className="relative rounded-[22px] border border-border bg-card p-4 shadow-[0_1px_0_hsl(var(--border)),0_30px_60px_-30px_hsl(var(--foreground)/0.25)] sm:p-6">
      {/* Scoreboard */}
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span>Week 9 · Sunday</span>
        <span className={cn('inline-flex items-center gap-1.5', live ? 'text-[hsl(var(--signal))]' : '')}>
          {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--signal))]" />}
          {live ? clock(now) : 'Final'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <Side team={A} pts={cur.a} p={cur.p} color={COLOR_A} />
        <span className="pb-2 text-[11px] font-bold text-muted-foreground">vs</span>
        <Side team={B} pts={cur.b} p={1 - cur.p} color={COLOR_B} right />
      </div>

      {/* Chart */}
      <div className="relative mt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-none select-none" role="img"
          aria-label={`Chance to win across Sunday. ${A.name} ${Math.round(cur.p * 100)}%.`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <defs>
            <clipPath id="wc-above"><rect x="0" y="0" width={W} height={y(0.5)} /></clipPath>
            <clipPath id="wc-below"><rect x="0" y={y(0.5)} width={W} height={H} /></clipPath>
          </defs>
          {/* Kickoff windows */}
          {WINDOWS.map(w => (
            <g key={w.label}>
              <rect x={x(w.from)} y={PT} width={x(w.to) - x(w.from)} height={H - PT - PB} fill="hsl(var(--foreground) / 0.025)" />
              <text x={x(w.from) + 4} y={H - 8} fontSize="10.5" fill="hsl(var(--muted-foreground))" fontWeight={600}>{w.label}</text>
            </g>
          ))}
          {/* Axis: 0, 50, 100 */}
          {[0, 0.5, 1].map(v => (
            <g key={v}>
              <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="hsl(var(--border))" strokeWidth={1}
                strokeDasharray={v === 0.5 ? '3 4' : undefined} />
              <text x={PL - 6} y={y(v) + 3.5} fontSize="10.5" textAnchor="end" fill="hsl(var(--muted-foreground))">{v * 100}%</text>
            </g>
          ))}
          {/* Diverging fill */}
          {area && <path d={area} fill={COLOR_A} opacity={0.14} clipPath="url(#wc-above)" />}
          {area && <path d={area} fill={COLOR_B} opacity={0.14} clipPath="url(#wc-below)" />}
          <path d={line} fill="none" stroke="hsl(var(--foreground))" strokeWidth={2} strokeLinejoin="round" />
          {/* Plays */}
          {shownPlays.map(pl => {
            const s = stateAt(pl.t);
            return (
              <motion.circle key={pl.t} cx={x(pl.t)} cy={y(s.p)} r={4} fill={pl.team === 'A' ? COLOR_A : COLOR_B}
                stroke="hsl(var(--card))" strokeWidth={2}
                initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                style={{ transformOrigin: `${x(pl.t)}px ${y(s.p)}px` }} />
            );
          })}
          {/* Now */}
          {live && visible.length > 0 && (
            <circle cx={x(now)} cy={y(cur.p)} r={5} fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth={2} />
          )}
          {/* Crosshair */}
          {hovered && (
            <g pointerEvents="none">
              <line x1={x(hovered.t)} x2={x(hovered.t)} y1={PT} y2={H - PB} stroke="hsl(var(--foreground) / 0.35)" strokeWidth={1} />
              <circle cx={x(hovered.t)} cy={y(hovered.p)} r={4.5} fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth={2} />
            </g>
          )}
        </svg>
        {hovered && (
          <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11.5px] shadow-lg"
            style={{ left: `${(x(hovered.t) / W) * 100}%` }}>
            <p className="font-semibold text-foreground">{clock(hovered.t)}</p>
            <p className="tabular-nums text-muted-foreground"><span className="font-semibold text-foreground">{Math.round(hovered.p * 100)}%</span> {A.short}</p>
            <p className="tabular-nums text-muted-foreground">{hovered.a.toFixed(1)} to {hovered.b.toFixed(1)}</p>
          </div>
        )}
      </div>

      {/* Latest play, as a ticker line */}
      <div className="mt-3 flex min-h-[22px] items-center gap-2 text-[12.5px]">
        {latest ? (
          <motion.p key={latest.t} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: latest.team === 'A' ? COLOR_A : COLOR_B }} />
            <span className="truncate"><span className="font-semibold">{latest.team === 'A' ? A.short : B.short}</span> {latest.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">+{latest.pts.toFixed(1)}</span>
          </motion.p>
        ) : <span className="text-muted-foreground">Waiting on the 1:00 kickoffs</span>}
      </div>
    </div>
  );
}

function Side({ team, pts, p, color, right }: { team: typeof A; pts: number; p: number; color: string; right?: boolean }) {
  return (
    <div className={cn('min-w-0', right && 'text-right')}>
      <p className={cn('flex items-center gap-1.5 truncate text-[13px] font-semibold', right && 'justify-end')}>
        {!right && <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />}
        <span className="truncate">{team.name}</span>
        {right && <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />}
      </p>
      <p className="lp-num mt-1 text-[38px] font-extrabold leading-none sm:text-[46px]">{pts.toFixed(1)}</p>
      <p className="mt-1 text-[12px] font-semibold tabular-nums text-muted-foreground">{Math.round(p * 100)}% to win</p>
    </div>
  );
}
