'use client';

/**
 * The hero's stage (desktop only), taken in turns:
 *
 *   The game    the stadium and its plays (landing/GameField), a live matchup card that takes
 *               each play's fantasy points and moves its win chance (which the jumbotron shows
 *               too), and a scoring alert like the app's own live feed.
 *   The Vault   every other round of plays (a pass, a sack, a kick), the stadium dims and a few
 *               seconds of the league's history play like a video (landing/Vault, compact): the
 *               standings race through every season, the Record Book, the rivalries. Then the game.
 *
 * Sample teams, made up like every other team on this page; when the Ghosts have it won, the card
 * rolls on to next week.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import GameField, { useTimeOfDay, type PlayScore, type TimeOfDay } from './GameField';
import { VAULT_TABS, VaultTab, type VaultTabId } from './Vault';

/** The Vault's reel: how long each cut runs, and how many plays between reels (two rounds of three). */
const VIEW_MS = { race: 3800, records: 2400, rivals: 2400 } as const;
const EVERY = 6;

const START = { home: 96.4, away: 109.8 };
/** A win chance from the margin, as a live matchup card shows it. */
const chance = (home: number, away: number) => 1 / (1 + Math.exp(-(home - away) / 6.5));
const TURF_LIGHT = 'hsl(var(--turf-light))';

interface Alert { id: number; score: PlayScore; total: number }

/** The night (or day) from the left, behind the headline: tinted to the sky, dark enough for white words. */
const SHADE: Record<TimeOfDay, string> = { night: '7,9,12', dawn: '22,24,52', day: '9,26,50', dusk: '24,16,42' };

/**
 * `layout`: `wide`, behind a desktop hero, overlays floating at the right; `phone`, its own stage
 * under the headline (a tall cut of the stadium, the alert and the reel inside it) with the live
 * matchup as a scoreboard bar beneath.
 */
export default function HeroGame({ layout = 'wide' }: { layout?: 'wide' | 'phone' }) {
  const phone = layout === 'phone';
  const tod = useTimeOfDay();
  const [week, setWeek] = useState(9);
  const [home, setHome] = useState(START.home);
  const [history, setHistory] = useState<number[]>([chance(START.home, START.away)]);
  const [flash, setFlash] = useState(0);
  const [alert, setAlert] = useState<Alert | null>(null);
  const reset = useRef<number | null>(null);
  const hide = useRef<number | null>(null);

  // The stage: the game, or the Vault showing one of its views.
  const reduce = useReducedMotion();
  const [vault, setVault] = useState<VaultTabId | null>(null);
  // The last cut shown, kept while the reel fades out.
  const [shown, setShown] = useState<VaultTabId | null>(null);
  useEffect(() => { if (vault) setShown(vault); }, [vault]);
  const plays = useRef(0);
  useEffect(() => {
    if (!vault) return;
    const next = VAULT_TABS.findIndex(t => t.id === vault) + 1;
    const id = window.setTimeout(() => setVault(next < VAULT_TABS.length ? VAULT_TABS[next].id : null), VIEW_MS[vault]);
    return () => clearTimeout(id);
  }, [vault]);

  const score = useRef(START.home);
  const onScore = useCallback((s: PlayScore) => {
    // Now and then, once the celebration has played, the Vault's reel (never with reduced motion).
    if (++plays.current % EVERY === 0 && !reduce) window.setTimeout(() => setVault('race'), 2800);
    const next = Math.round((score.current + s.points) * 10) / 10;
    score.current = next;
    setHome(next);
    setHistory(xs => [...xs.slice(-11), chance(next, START.away)]);
    setAlert({ id: Date.now(), score: s, total: next });
    setFlash(f => f + 1);
    // Won by two scores: final, and on to next week.
    if (next - START.away > 9 && reset.current == null) {
      reset.current = window.setTimeout(() => {
        score.current = START.home;
        setWeek(w => (w >= 17 ? 1 : w + 1)); setHome(START.home); setHistory([chance(START.home, START.away)]); reset.current = null;
      }, 3200);
    }
    if (hide.current) clearTimeout(hide.current);
    hide.current = window.setTimeout(() => setAlert(null), 3000);
  }, [reduce]);
  useEffect(() => () => { if (reset.current) clearTimeout(reset.current); if (hide.current) clearTimeout(hide.current); }, []);

  const p = chance(home, START.away);
  const final = home - START.away > 9;
  // The win chance's history, drawn as a pulse.
  const line = history.map((v, i) => `${(i / Math.max(1, history.length - 1)) * 100},${(1 - v) * 36 + 2}`).join(' ');

  const stage = (
    <>
      <div className="absolute inset-0 transition-[filter] duration-700" style={{ filter: vault ? 'brightness(0.4) saturate(0.7) blur(2px)' : undefined }}>
        <GameField onScore={onScore} winChance={chance(home, START.away)} tod={tod} hold={Boolean(vault)} frame={layout} />
      </div>
      {!phone && <div className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{ background: `linear-gradient(90deg, rgba(${SHADE[tod]},0.96) 0%, rgba(${SHADE[tod]},0.8) 36%, rgba(${SHADE[tod]},0) 60%)` }} />}

      {/* The Vault's reel: a few quick cuts, then back to the game. */}
      {/* Always mounted, faded in and out (an unmounting exit stalled on the views inside): it keeps the last cut while it fades. */}
      {shown && (
          <motion.div initial={false} animate={vault ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} aria-hidden={!vault}
            className={`lp-ink pointer-events-none absolute rounded-[24px] border border-white/12 bg-[#0B1013]/90 text-white shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl ${phone ? 'inset-3 overflow-hidden p-4' : 'right-6 top-[108px] w-[min(560px,42vw)] p-5'}`}>
            {/* Like a video's: a segment a cut, filling as it plays. */}
            <div className="flex gap-1">
              {VAULT_TABS.map((t, i) => {
                const at = VAULT_TABS.findIndex(x => x.id === shown);
                return (
                  <div key={t.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
                    {i < at ? <div className="h-full bg-white/80" /> : i === at
                      ? <motion.div key={shown} className="h-full origin-left bg-white/80" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: VIEW_MS[shown] / 1000, ease: 'linear' }} />
                      : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--turf-light))]">The Vault</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">{VAULT_TABS.find(t => t.id === shown)?.label}</p>
            </div>
            <motion.div key={shown} className={phone ? 'mt-3 origin-top scale-[0.86]' : 'mt-4'} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
              <VaultTab tab={shown} compact />
            </motion.div>
          </motion.div>
      )}

      {/* The scoring alert, as the app's live feed sends it. */}
      <div className={`pointer-events-none absolute transition-opacity duration-500 ${phone ? 'inset-x-3 bottom-3' : 'right-6 top-[500px] w-[244px]'} ${vault ? 'opacity-0' : ''}`}>
        <AnimatePresence>
          {alert && (
            <motion.div key={alert.id} initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 30 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="flex items-center gap-3 rounded-2xl border border-white/12 bg-[#0B1013]/85 p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--signal))] text-[12px] font-black text-white">{alert.score.label.split(',')[0].replace('GHO ', '')}</span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-[13px] font-semibold text-white">{alert.score.label}</p>
                <p className="mt-0.5 text-[12px] text-white/60">Ghosts now {alert.total.toFixed(1)}</p>
              </div>
              <span className="lp-num shrink-0 text-[22px] font-black text-[hsl(var(--turf-light))]">+{alert.score.points.toFixed(1)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </>
  );

  if (phone) {
    return (
      <>
        <div className="relative h-[440px] overflow-hidden">
          {stage}
          {/* The stage's sky melts into the page above it. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[hsl(var(--background))] to-transparent" />
        </div>
        {/* The live matchup, as a scoreboard bar. */}
        <div className="mx-4 -mt-1 rounded-2xl border border-white/12 bg-[#0B1013] p-3 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0A7550] text-[10.5px] font-black">GG</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold"><span className="hidden min-[420px]:inline">Ghosts</span></span>
            <motion.span key={flash} initial={{ scale: 1.3, color: '#F5C542' }} animate={{ scale: 1, color: '#FFFFFF' }} transition={{ duration: 0.8 }}
              className="lp-num text-[19px] font-black tabular-nums">{home.toFixed(1)}</motion.span>
            <span className={`px-1 text-[10px] font-bold uppercase tracking-[0.16em] ${final ? 'text-[hsl(var(--turf-light))]' : 'text-[hsl(var(--signal))]'}`}>{final ? 'Final' : `Wk ${week}`}</span>
            <span className="lp-num text-[19px] font-black tabular-nums text-white/80">{START.away.toFixed(1)}</span>
            <span className="min-w-0 flex-1 truncate text-right text-[13px] font-semibold"><span className="hidden min-[420px]:inline">Long Shots</span></span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#6D4AFF] text-[10.5px] font-black">FL</span>
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-[11px] font-semibold text-white/55">
            <span>Win chance</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full" style={{ background: TURF_LIGHT }} animate={{ width: `${Math.round(p * 100)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
            </div>
            <span className="lp-num text-[12px] font-black text-white">{Math.round(p * 100)}%</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {stage}
      {/* The live matchup. */}
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ visibility: vault ? 'hidden' : 'visible' }}
        className="pointer-events-none absolute right-6 top-[286px] w-[244px] rounded-2xl border border-white/12 bg-[#0B1013]/85 p-4 text-white shadow-[0_30px_70px_-25px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/55">
          <span>Week {week}</span>
          <span className={final ? 'text-[hsl(var(--turf-light))]' : 'text-[hsl(var(--signal))]'}>{final ? 'Final' : 'Live'}</span>
        </div>
        {([['GG', 'Gridiron Ghosts', home, '#0A7550', true], ['FL', 'Fourth & Long Shots', START.away, '#6D4AFF', false]] as const).map(([init, name, pts, color, mine]) => (
          <div key={name} className="mt-2.5 flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10.5px] font-black" style={{ background: color }}>{init}</span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{name}</span>
            {mine
              ? <motion.span key={flash} initial={{ scale: 1.3, color: '#F5C542' }} animate={{ scale: 1, color: '#FFFFFF' }} transition={{ duration: 0.8 }}
                  className="lp-num text-[20px] font-black tabular-nums">{pts.toFixed(1)}</motion.span>
              : <span className="lp-num text-[20px] font-black tabular-nums text-white/80">{pts.toFixed(1)}</span>}
          </div>
        ))}
        <div className="mt-3.5 flex items-center justify-between text-[11px] font-semibold text-white/55">
          <span>Ghosts win chance</span>
          <span className="lp-num text-[13px] font-black text-white">{Math.round(p * 100)}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full rounded-full" style={{ background: TURF_LIGHT }} animate={{ width: `${Math.round(p * 100)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
        </div>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2.5 h-9 w-full" aria-hidden>
          <polyline points={line} fill="none" stroke={TURF_LIGHT} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </motion.div>

    </>
  );
}
