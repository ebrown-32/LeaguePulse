'use client';

/**
 * "Install it as an app", shown rather than told: a phone runs through the
 * real sequence on a loop. The league site in the browser, the Share sheet,
 * Add to Home Screen, the icon landing on the home screen, then the app
 * opening full screen with no browser bars. Tap a step to jump to it.
 *
 * Everything on the phone is drawn here: generic home-screen tiles (no real
 * apps' logos), a sample league, and the LeaguePulse app icon.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LP_L, LP_P, LP_PULSE } from '../marks';

const STAGES = [
  { key: 'browse', label: 'Open your league', ms: 2400 },
  { key: 'share', label: 'Share', ms: 2200 },
  { key: 'add', label: 'Add to Home Screen', ms: 2600 },
  { key: 'open', label: 'Open the app', ms: 3200 },
] as const;
type Stage = (typeof STAGES)[number]['key'];

const LEAGUE = 'The League';
const ADDRESS = 'theleague.leaguepulse.io';

/** The LeaguePulse app icon, as it sits on a home screen. */
function AppIcon({ size = 52 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="drop-shadow-sm">
      <rect width="64" height="64" rx="14" fill="#F7F6F2" />
      <g transform="translate(8.3 8.3) scale(0.74)">
        <path d={LP_L} fill="#121417" />
        <path d={LP_P} fill="#EE5A2E" />
        <path d={LP_PULSE} fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** A tap: a ring that grows and fades where a finger would land. */
function Tap({ className }: { className: string }) {
  return (
    <motion.span className={cn('pointer-events-none absolute h-10 w-10 rounded-full border-2 border-white/90 bg-white/30', className)}
      initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: [0.4, 1, 1.25], opacity: [0, 1, 0] }}
      transition={{ duration: 0.9, delay: 0.7, repeat: 1, repeatDelay: 0.2 }} />
  );
}

/** The league site as it looks in a browser, and as the app. */
function LeagueScreen({ app }: { app?: boolean }) {
  return (
    <div className="flex h-full flex-col bg-[#F7F6F2]">
      <div className={cn('flex items-center gap-2 px-3 pb-2', app ? 'bg-[#121417] pt-9 text-white' : 'pt-9')}>
        <AppIcon size={22} />
        <span className="text-[11px] font-extrabold tracking-tight">{LEAGUE}</span>
        <span className={cn('ml-auto rounded-full px-1.5 py-0.5 text-[8px] font-bold', app ? 'bg-white/15' : 'bg-[#EE5A2E]/15 text-[#EE5A2E]')}>LIVE</span>
      </div>
      <div className="flex-1 space-y-1.5 overflow-hidden px-2.5 pt-2">
        <div className="rounded-xl bg-white p-2.5 shadow-sm">
          <p className="text-[7.5px] font-bold uppercase tracking-wider text-[#585D66]">Week 9 · Sunday</p>
          <div className="mt-1 flex items-end justify-between">
            <div><p className="text-[8.5px] font-semibold">Ghosts</p><p className="text-[17px] font-extrabold leading-none">112.4</p></div>
            <div className="text-right"><p className="text-[8.5px] font-semibold">Long Shots</p><p className="text-[17px] font-extrabold leading-none text-[#585D66]">104.9</p></div>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#EDEBE5]"><div className="h-full w-[71%] rounded-full bg-[#0A7550]" /></div>
        </div>
        {['Ghosts stay No. 1. The bench outscored two lineups.', 'C minus for Long Shots. Generously.', 'Ten thousand seasons: Ghosts make it 97% of the time.'].map((t, i) => (
          <div key={i} className="flex gap-1.5 rounded-xl bg-white p-2 shadow-sm">
            <span className={cn('h-5 w-5 shrink-0 rounded-md', ['bg-[#121417]', 'bg-[#EE5A2E]', 'bg-[#0A7550]'][i])} />
            <p className="text-[8.5px] leading-snug text-[#121417]">{t}</p>
          </div>
        ))}
      </div>
      {!app && (
        // Safari's bottom toolbar, with the address and the Share button.
        <div className="border-t border-black/10 bg-white/90 px-3 pb-5 pt-2 backdrop-blur">
          <div className="rounded-lg bg-[#EDEBE5] px-2 py-1 text-center text-[8.5px] text-[#585D66]">{ADDRESS}</div>
          <div className="mt-2 flex justify-between px-2 text-[#2a78d6]">
            {['‹', '›'].map(c => <span key={c} className="text-[13px] leading-none">{c}</span>)}
            <span data-share className="relative flex h-4 w-4 items-center justify-center">
              <svg width="13" height="14" viewBox="0 0 24 26" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15V2M7 7l5-5 5 5M5 11v12h14V11" />
              </svg>
            </span>
            <span className="text-[11px] leading-none">▢</span>
            <span className="text-[11px] leading-none">⧉</span>
          </div>
        </div>
      )}
    </div>
  );
}

const TILES = ['#2a78d6', '#eda100', '#4a3aa7', '#1baf7a', '#e34948', '#585D66', '#e87ba4', '#0a7550', '#eb6834', '#121417', '#9085e9', '#c98500'];

function HomeScreen({ landed }: { landed: boolean }) {
  return (
    <div className="relative h-full bg-[linear-gradient(160deg,#0a7550,#123528_55%,#121417)] px-4 pt-12">
      <p className="text-center text-[30px] font-light leading-none text-white/90 tabular-nums">9:41</p>
      <p className="mt-1 text-center text-[9px] font-medium text-white/70">Sunday, 1:02 PM kickoff</p>
      <div className="mt-6 grid grid-cols-4 gap-x-3 gap-y-3.5">
        {TILES.map((c, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[12px]" style={{ background: c }}>
              <span className={cn('bg-white/80', i % 3 === 0 ? 'h-4 w-4 rounded-full' : i % 3 === 1 ? 'h-3.5 w-3.5 rounded-[3px]' : 'h-1.5 w-5 rounded-full')} />
            </span>
            <span className="h-1 w-7 rounded-full bg-white/35" />
          </div>
        ))}
        <div className="flex flex-col items-center gap-1">
          <AnimatePresence>
            {landed && (
              <motion.div initial={{ scale: 0, y: -60, rotate: -20 }} animate={{ scale: 1, y: 0, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.25 }}>
                <AppIcon size={46} />
              </motion.div>
            )}
          </AnimatePresence>
          {landed && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            className="text-[8px] font-semibold text-white">{LEAGUE}</motion.span>}
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-4 flex justify-around rounded-[20px] bg-white/15 px-3 py-2.5 backdrop-blur">
        {['#2a78d6', '#1baf7a', '#eda100', '#e34948'].map(c => <span key={c} className="h-9 w-9 rounded-[10px]" style={{ background: c }} />)}
      </div>
    </div>
  );
}

function ShareSheet() {
  const rows = [['Copy', false], ['Add to Reading List', false], ['Add to Home Screen', true], ['Print', false]] as const;
  return (
    <motion.div className="absolute inset-x-0 bottom-0 rounded-t-[22px] bg-[#F2F1EC] px-3 pb-6 pt-2.5 shadow-[0_-12px_30px_rgba(0,0,0,0.18)]"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
      <span className="mx-auto block h-1 w-8 rounded-full bg-black/15" />
      <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-white p-2">
        <AppIcon size={26} />
        <div className="min-w-0"><p className="truncate text-[9.5px] font-bold">{LEAGUE}</p><p className="truncate text-[8px] text-[#585D66]">{ADDRESS}</p></div>
      </div>
      <div className="mt-2 divide-y divide-black/5 overflow-hidden rounded-xl bg-white">
        {rows.map(([label, hit]) => (
          <div key={label} className={cn('relative flex items-center justify-between px-2.5 py-2 text-[9.5px]', hit && 'font-semibold')}>
            {hit && <motion.span className="absolute inset-0 bg-[#0a7550]/12" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1] }} transition={{ delay: 0.9, duration: 0.6 }} />}
            <span className="relative">{label}</span>
            <span className={cn('relative h-3 w-3 rounded-[3px] border', hit ? 'border-[#0a7550]' : 'border-black/25')} />
            {hit && <Tap className="right-10 top-1/2 -translate-y-1/2" />}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Phone({ stage }: { stage: Stage }) {
  return (
    <div className="relative mx-auto h-[560px] w-[272px] rounded-[46px] bg-[#121417] p-[10px] shadow-[0_40px_80px_-30px_rgba(18,20,23,0.55),inset_0_0_0_1.5px_#2c3036]">
      <div className="relative h-full w-full overflow-hidden rounded-[37px] bg-black">
        <AnimatePresence mode="popLayout" initial={false}>
          {(stage === 'browse' || stage === 'share') && (
            <motion.div key="browser" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.35 }}>
              <LeagueScreen />
              {stage === 'browse' && <Tap className="bottom-[22px] left-1/2 -translate-x-1/2" />}
            </motion.div>
          )}
          {stage === 'add' && (
            <motion.div key="home" className="absolute inset-0" initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              <HomeScreen landed />
            </motion.div>
          )}
          {stage === 'open' && (
            // The app opens out of its icon: no address bar, no browser toolbar.
            <motion.div key="app" className="absolute inset-0 overflow-hidden"
              initial={{ clipPath: 'inset(64% 10% 18% 72% round 12px)' }} animate={{ clipPath: 'inset(0% 0% 0% 0% round 0px)' }}
              exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}>
              <LeagueScreen app />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>{stage === 'share' && <ShareSheet key="sheet" />}</AnimatePresence>
        {/* The island and the home bar. */}
        <span className="absolute left-1/2 top-2.5 h-[22px] w-[78px] -translate-x-1/2 rounded-full bg-black" />
        <span className={cn('absolute bottom-1.5 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full', stage === 'add' ? 'bg-white/70' : 'bg-black/40')} />
      </div>
    </div>
  );
}

export default function InstallApp() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-120px' });
  const [i, setI] = useState(reduce ? 2 : 0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduce || !inView || paused) return;
    const t = setTimeout(() => setI(n => (n + 1) % STAGES.length), STAGES[i].ms);
    return () => clearTimeout(t);
  }, [i, reduce, inView, paused]);

  const pick = (n: number) => { setI(n); setPaused(true); setTimeout(() => setPaused(false), 6000); };

  return (
    <div ref={ref} className="relative">
      {/* A soft turf glow behind the phone. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative" onClick={() => pick((i + 1) % STAGES.length)} role="img" aria-label="Installing LeaguePulse on a phone: Share, Add to Home Screen, then open it like any app">
        <Phone stage={STAGES[i].key} />
      </div>
      <ol className="relative mx-auto mt-6 flex max-w-[320px] items-center justify-between gap-1">
        {STAGES.map((s, n) => (
          <li key={s.key} className="flex-1">
            <button type="button" onClick={() => pick(n)} className="group flex w-full flex-col items-center gap-1.5">
              <span className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
                {n === i && !reduce && (
                  <motion.span key={`${n}-${i}`} className="absolute inset-y-0 left-0 rounded-full bg-primary"
                    initial={{ width: '0%' }} animate={{ width: paused ? '100%' : '100%' }} transition={{ duration: paused ? 0.2 : s.ms / 1000, ease: 'linear' }} />
                )}
                {(n < i || (reduce && n <= i)) && <span className="absolute inset-0 rounded-full bg-primary" />}
              </span>
              <span className={cn('text-center text-[10.5px] font-semibold leading-tight transition-colors', n === i ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>
                {s.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
