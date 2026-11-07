'use client';

/**
 * The hero's picture: the app itself, on a phone. The live demo league (demo.<root>, the only
 * site that lets the product site frame it: next.config.js), loaded once the hero is up and drawn
 * at a real phone's width, scaled to the screen. With a mouse it can be used right there; on a
 * touch screen it is a picture of itself with a way into it, so a swipe still scrolls the page.
 *
 * Until it has loaded (and if it can't, or the visitor saves data) the screen shows a drawing of
 * a league's home screen, a live matchup scoring as you watch. Around the phone, the
 * notifications a manager actually gets. Sample league, made up like every other team on this
 * page. Still for reduced motion.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Logomark } from '../marks';
import { useDemoUrl } from './demoUrl';

/** The phone the demo is drawn at, before it is scaled to the screen. */
const DEVICE = { w: 390, h: 844 };
/** How long after the hero to start loading the demo, so it never competes with the page itself. */
const DEMO_DELAY_MS = 1200;
/** After the demo's page has loaded, its own loading screen still plays: this long before it is shown. */
const DEMO_SETTLE_MS = 2200;
/** The strip at the top of the screen the notch sits in. */
const STATUS_BAR = 46;

const START = { home: 96.4, away: 104.8 };
/** What the Ghosts score next, and how the feed says it. */
const PLAYS = [
  { pts: 10.1, who: 'WR', text: 'Your WR, 41-yd TD' },
  { pts: 6.4, who: 'RB', text: 'Your RB, 24-yd run' },
  { pts: 4.0, who: 'K', text: 'Your K, 47-yd field goal' },
  { pts: 7.2, who: 'QB', text: 'Your QB, 2 TD passes' },
];
/** What the labels beside the phone point at, by how far down the phone it sits. */
const CALLOUTS = [
  { label: 'Your league, its own app', at: '10%' },
  { label: 'Every season on record', at: '42%' },
  { label: 'Live odds every Sunday', at: '82%' },
  { label: 'Ask the AI anything', at: '93%' },
];
const chance = (home: number, away: number) => 1 / (1 + Math.exp(-(home - away) / 7));
const ease = [0.22, 1, 0.36, 1] as const;

export default function HeroPhone() {
  const reduce = useReducedMotion();
  const [home, setHome] = useState(START.home);
  const [n, setN] = useState(0);
  // Which label is pointing now: one at a time, round and round.
  const [pointing, setPointing] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setPointing(k => (k + 1) % CALLOUTS.length), 2600);
    return () => clearInterval(id);
  }, [reduce]);

  useEffect(() => {
    if (reduce) return;
    let k = 0, score = START.home;
    const id = window.setInterval(() => {
      const play = PLAYS[k++ % PLAYS.length];
      // Once the Ghosts have it well won, the next week starts.
      score = score + play.pts > START.away + 22 ? START.home : Math.round((score + play.pts) * 10) / 10;
      setHome(score); setN(k);
    }, 3200);
    return () => clearInterval(id);
  }, [reduce]);

  const p = chance(home, START.away);

  // The live demo, inside the screen.
  const demoUrl = useDemoUrl();
  const screen = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.72);
  const [mountDemo, setMountDemo] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [touch, setTouch] = useState(true);
  useEffect(() => {
    const el = screen.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / DEVICE.w));
    ro.observe(el);
    setTouch(!window.matchMedia('(hover: hover) and (pointer: fine)').matches);
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const id = saveData ? 0 : window.setTimeout(() => setMountDemo(true), DEMO_DELAY_MS);
    return () => { ro.disconnect(); clearTimeout(id); };
  }, []);

  return (
    // Out of session replays: always moving, and the demo inside is a site of its own.
    <div data-mp-block className="mx-auto flex w-fit flex-col items-center">
    <div className="flex">
    <div className="relative w-[272px] sm:w-[300px]">
      {/* The glow it stands in. */}
      <div aria-hidden className="absolute -inset-16 -z-10 rounded-full bg-[radial-gradient(closest-side,hsl(var(--turf-light)/0.28),transparent)] blur-2xl" />

      <motion.div initial={{ opacity: 0, y: 40, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.9, ease, delay: 0.25 }}
        className="relative rounded-[46px] bg-[#05080A] p-[9px] shadow-[0_60px_120px_-40px_rgba(0,0,0,0.95),inset_0_0_0_1px_rgba(255,255,255,0.12)]">
        <div ref={screen} className="relative overflow-hidden rounded-[38px] bg-[#0E1316] text-white" style={{ aspectRatio: `${DEVICE.w} / ${DEVICE.h}` }}>
          {mountDemo && (
            // Below the status bar, as on a real phone: the notch never covers the app's own bar.
            <div className={cn('absolute left-0 origin-top-left', touch && 'pointer-events-none')}
              style={{ top: STATUS_BAR * scale, width: DEVICE.w, height: DEVICE.h - STATUS_BAR, transform: `scale(${scale})` }}>
              <iframe src={demoUrl} title="The LeaguePulse demo league" width={DEVICE.w} height={DEVICE.h - STATUS_BAR} onLoad={() => window.setTimeout(() => setLoaded(true), DEMO_SETTLE_MS)}
                tabIndex={touch ? -1 : 0} className="h-full w-full border-0 bg-[#0E1316]" />
            </div>
          )}
          {/* The drawing, until the real thing has loaded. */}
          <motion.div aria-hidden={loaded} initial={false} animate={{ opacity: loaded ? 0 : 1 }} transition={{ duration: 0.6 }}
            className={cn('absolute inset-0 px-3.5 pb-4 pt-9', loaded && 'pointer-events-none')}>

          {/* The league's home screen. */}
          <div className="flex items-center gap-2">
            <Logomark size={26} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-bold">Sunday Scaries</p>
              <p className="text-[10.5px] text-white/50">Week 9, live</p>
            </div>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0A7550] text-[10px] font-black">GG</span>
          </div>

          <div className="mt-3.5 rounded-2xl bg-white/[0.06] p-3">
            <div className="flex items-center justify-between text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/45">
              <span>Your matchup</span><span className="text-[hsl(var(--signal))]">Live</span>
            </div>
            {([['GG', 'Ghosts', home, '#0A7550', true], ['FL', 'Long Shots', START.away, '#6D4AFF', false]] as const).map(([init, name, pts, color, mine]) => (
              <div key={name} className="mt-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-black" style={{ background: color }}>{init}</span>
                <span className="flex-1 text-[13px] font-semibold">{name}</span>
                {mine
                  ? <motion.span key={pts} initial={{ scale: 1.25, color: '#3DD598' }} animate={{ scale: 1, color: '#FFFFFF' }} transition={{ duration: 0.7 }} className="lp-num text-[18px] font-black tabular-nums">{pts.toFixed(1)}</motion.span>
                  : <span className="lp-num text-[18px] font-black tabular-nums text-white/75">{pts.toFixed(1)}</span>}
              </div>
            ))}
            <div className="mt-3 flex items-center gap-2 text-[10.5px] text-white/55">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full bg-[hsl(var(--turf-light))]" animate={{ width: `${Math.round(p * 100)}%` }} transition={{ type: 'spring', stiffness: 110, damping: 20 }} />
              </div>
              <span className="lp-num font-black text-white">{Math.round(p * 100)}%</span>
            </div>
          </div>

          <div className="mt-2.5 flex gap-2.5 rounded-2xl bg-white/[0.06] p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--signal))] text-[12px] font-black">D</span>
            <div className="min-w-0 leading-snug">
              <p className="text-[10.5px] font-bold text-[hsl(var(--turf-light))]">The Desk</p>
              <p className="text-[12.5px] font-semibold">Ghosts by ten. Book it. The Long Shots&apos; bench is a crime scene.</p>
            </div>
          </div>

          <div className="mt-2.5 rounded-2xl bg-white/[0.06] p-3">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/45">Standings</p>
            {[['1', 'Ghosts', '7-2'], ['2', 'Hail Marys', '6-3'], ['3', 'Long Shots', '6-3']].map(([r, t, rec]) => (
              <div key={t} className="mt-1.5 flex items-center gap-2 text-[12.5px]">
                <span className="lp-num w-3 text-white/45">{r}</span><span className="flex-1 font-semibold">{t}</span><span className="lp-num font-bold text-white/75">{rec}</span>
              </div>
            ))}
          </div>

          <div className="mt-3.5 flex justify-around text-white/35" aria-hidden>
            {[0, 1, 2, 3].map(i => <span key={i} className={cn('h-1.5 w-6 rounded-full', i === 0 ? 'bg-[hsl(var(--turf-light))]' : 'bg-white/20')} />)}
          </div>
          </motion.div>
          <span aria-hidden className="pointer-events-none absolute left-1/2 top-2.5 z-10 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black" />
        </div>
      </motion.div>

      {/* A ring that breathes a few times as the phone arrives: there's something to touch here. */}
      {!reduce && (
        <motion.span aria-hidden className="pointer-events-none absolute -inset-1.5 rounded-[52px] ring-2 ring-[hsl(var(--turf-light))]"
          initial={{ opacity: 0, scale: 1 }} animate={{ opacity: [0, 0.6, 0], scale: [1, 1.035, 1.06] }}
          transition={{ delay: 2.2, duration: 1.6, repeat: 2, repeatDelay: 0.6, ease: 'easeOut' }} />
      )}
    </div>

    {/* What's on the screen, named from beside it: a line and a dot at the phone's edge for each. */}
    <ol className="relative ml-2 hidden w-[196px] sm:block" aria-label="What's in the app">
      {CALLOUTS.map((c, i) => {
        const on = i === pointing;
        return (
          <motion.li key={c.label} className="absolute left-0 right-0 flex -translate-y-1/2 items-center" style={{ top: c.at }}
            initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 + i * 0.18, duration: 0.6, ease }}>
            <span aria-hidden className="relative -ml-4 flex h-3 w-3 shrink-0 items-center justify-center">
              {on && !reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--turf-light))] opacity-70" />}
              <span className={cn('relative h-2.5 w-2.5 rounded-full ring-2 ring-[#101214] transition-colors duration-500', on ? 'bg-[hsl(var(--turf-light))]' : 'bg-white/35')} />
            </span>
            <span aria-hidden className={cn('h-px w-7 shrink-0 transition-colors duration-500', on ? 'bg-[hsl(var(--turf-light))]' : 'bg-white/20')} />
            <span className={cn('ml-2 text-[13.5px] font-semibold leading-tight transition-colors duration-500', on ? 'text-white' : 'text-white/45')}>{c.label}</span>
          </motion.li>
        );
      })}
    </ol>
    </div>

    {/* It's the real thing: say so. With a mouse, use it right here; on a touch screen, open it. */}
    {touch ? (
      <a href={demoUrl} target="_blank" rel="noopener"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[14px] font-bold text-black shadow-[0_12px_30px_-10px_rgba(0,0,0,0.7)] transition active:scale-[0.98]">
        Explore the live demo
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </a>
    ) : (
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6, duration: 0.6, ease }}
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-[13px] font-semibold text-white/80 backdrop-blur">
        <motion.svg viewBox="0 0 24 24" className="h-4 w-4 text-[hsl(var(--turf-light))]" fill="currentColor" aria-hidden
          animate={reduce ? undefined : { x: [0, 3, 0], y: [0, -3, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
          <path d="M5 3.5 19 11l-6.2 1.6L10 19Z" />
        </motion.svg>
        It&apos;s the real app. Click around.
      </motion.p>
    )}
    </div>
  );
}
