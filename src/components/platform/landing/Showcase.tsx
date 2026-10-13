'use client';

/**
 * The product, shown working, with sample data.
 *
 * Each piece mirrors a real screen and its real behaviour: the feed's writers
 * and typing indicator, Game Day's ranking by swing and its field strip, Game
 * of the Week's five signals at their real weights, the analytics question
 * answered by the product's own query engine and chart, and the simulator's
 * odds settling as simulations run. Teams, writers and numbers are invented.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import ChartView from '@/components/analytics/ChartView';
import { runQuery, type Row } from '@/lib/analytics/engine';
import type { QuerySpec } from '@/lib/analytics/schema';

// ── Shared ───────────────────────────────────────────────────────────────────

/** A seeded generator, so server and client draw the same sample. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

function useTicker(active: boolean, ms: number, steps: number) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(reduce ? steps - 1 : 0);
  useEffect(() => {
    if (reduce || !active) return;
    const t = setInterval(() => setI(n => (n + 1) % steps), ms);
    return () => clearInterval(t);
  }, [reduce, active, ms, steps]);
  return i;
}

/** A writer's avatar: initials on a tile, ink and paper, never a gradient. */
function Face({ initials, tone }: { initials: string; tone: 'ink' | 'turf' | 'signal' | 'paper' }) {
  const cls = {
    ink: 'bg-foreground text-background',
    turf: 'bg-primary text-primary-foreground',
    signal: 'bg-[hsl(var(--signal))] text-white',
    paper: 'bg-muted text-foreground ring-1 ring-inset ring-border',
  }[tone];
  return <span className={cn('lp-display flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[12px] font-extrabold', cls)}>{initials}</span>;
}

// ── The desk ─────────────────────────────────────────────────────────────────

const POSTS = [
  { who: 'Dana Cole', handle: 'thecolecall', role: 'Beat writer', initials: 'DC', tone: 'ink' as const,
    kind: 'Power rankings', text: 'Gridiron Ghosts stay No. 1. Three straight weeks over 120 and the bench is outscoring two starting lineups.' },
  { who: 'Big Mike', handle: 'bigmikefantasy', role: 'Fan', initials: 'BM', tone: 'signal' as const, reply: true,
    text: 'Ranking a 7-1 team first is not analysis, Dana. It is reading the standings out loud.' },
  { who: 'The Analyst', handle: 'byexpectation', role: 'Numbers', initials: 'TA', tone: 'turf' as const, reply: true,
    text: 'For the record: Ghosts have the best points-for and the third-easiest schedule left. Both things are true, Mike.' },
  { who: 'Dana Cole', handle: 'thecolecall', role: 'Beat writer', initials: 'DC', tone: 'ink' as const,
    kind: 'Trade grade', text: 'Fourth & Long Shots sent their RB1 away for "depth" and are now starting a fullback. C minus, generously.' },
];

export function DeskFeed() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-80px' });
  const reduce = useReducedMotion();
  // 0..POSTS.length shown, with a typing beat before each.
  const [shown, setShown] = useState(reduce ? POSTS.length : 1);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (reduce || !inView) return;
    let alive = true;
    const run = async () => {
      while (alive) {
        for (let n = 1; n <= POSTS.length && alive; n++) {
          setTyping(true);
          await new Promise(r => setTimeout(r, 1300));
          if (!alive) return;
          setTyping(false); setShown(n);
          await new Promise(r => setTimeout(r, 2200));
        }
        await new Promise(r => setTimeout(r, 2500));
        if (alive) setShown(0);
      }
    };
    run();
    return () => { alive = false; };
  }, [reduce, inView]);

  return (
    <div ref={ref} className="rounded-[22px] border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between px-1 pb-3">
        <p className="text-[12px] font-semibold text-muted-foreground">The Desk</p>
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" /> 4 writers on
        </p>
      </div>
      <div className="flex min-h-[392px] flex-col gap-2">
        <AnimatePresence initial={false}>
          {POSTS.slice(0, shown).map((p, i) => (
            <motion.article key={i} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className={cn('flex gap-3 rounded-2xl border border-border/70 bg-background/60 p-3', p.reply && 'ml-7 sm:ml-10')}>
              <Face initials={p.initials} tone={p.tone} />
              <div className="min-w-0 text-[13.5px] leading-snug">
                <p className="flex flex-wrap items-center gap-x-1.5">
                  <span className="font-semibold">{p.who}</span>
                  <span className="text-muted-foreground">@{p.handle}</span>
                  {p.kind && <span className="rounded-md bg-muted px-1.5 py-px text-[10.5px] font-semibold text-foreground/80">{p.kind}</span>}
                </p>
                <p className="mt-1 text-foreground/85">{p.text}</p>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
        {typing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-1 flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="flex gap-1">
              {[0, 1, 2].map(d => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${d * 140}ms` }} />)}
            </span>
            {POSTS[Math.min(shown, POSTS.length - 1)].who} is writing
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ── Game Day ─────────────────────────────────────────────────────────────────

interface Drive { yards: number[]; desc: string[] }
const GAMES = [
  { away: 'MIN', home: 'DET', tv: 'FOX', swing: 31, mine: 3, theirs: 1, ball: 'DET',
    drive: { yards: [25, 31, 44, 52, 67, 79, 91, 100], desc: ['1st & 10', '2nd & 4', '1st & 10', '3rd & 2', '1st & 10', '2nd & 8', '1st & goal', 'Touchdown'] } },
  { away: 'DEN', home: 'LAC', tv: 'CBS', swing: 19, mine: 1, theirs: 2, ball: 'LAC',
    drive: { yards: [18, 22, 35, 41, 41, 53, 60, 58], desc: ['1st & 10', '2nd & 6', '1st & 10', '2nd & 4', '3rd & 4', '1st & 10', '2nd & 3', '3rd & 5'] } },
  { away: 'BUF', home: 'LAR', tv: 'FOX', swing: 12, mine: 1, theirs: 0, ball: 'BUF',
    drive: { yards: [40, 47, 47, 55, 62, 70, 74, 77], desc: ['1st & 10', '2nd & 3', '3rd & 3', '1st & 10', '2nd & 3', '1st & 10', '2nd & 6', '3rd & 2'] } },
];

/** The product's field strip: end zones, the red zone, yard lines, the ball. */
function Field({ at, defending, label }: { at: number; defending: string; label: string }) {
  const reduce = useReducedMotion();
  const red = at >= 80;
  return (
    <div>
      <div className="flex justify-between text-[10.5px] font-semibold text-muted-foreground">
        <span>{label}</span>
        <span className={cn(red && 'text-[hsl(var(--signal))]')}>{red && at < 100 ? 'Red zone' : at >= 100 ? 'Score' : ''}</span>
      </div>
      <div className="relative mt-1.5 h-7 overflow-hidden rounded-md bg-primary/[0.16] ring-1 ring-inset ring-primary/25">
        <div className="absolute inset-y-0 left-0 w-[6%] bg-foreground/[0.06]" />
        <div className="absolute inset-y-0 right-0 flex w-[6%] items-center justify-center bg-primary/35 text-[8px] font-bold uppercase tracking-wider text-foreground/70 [writing-mode:vertical-rl]">{defending}</div>
        <div className={cn('absolute inset-y-0 right-[6%] w-[17.6%] transition-colors', red ? 'bg-[hsl(var(--signal)/0.2)]' : 'bg-[hsl(var(--signal)/0.06)]')} />
        {Array.from({ length: 9 }, (_, i) => <div key={i} className="absolute inset-y-0 w-px bg-foreground/15" style={{ left: `${6 + (i + 1) * 8.8}%` }} />)}
        <motion.div className="absolute top-1/2 h-3.5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[#8a4b24] ring-2 ring-[hsl(var(--card))]"
          initial={false} animate={{ left: `${6 + Math.min(at, 100) * 0.88}%` }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 16 }} />
      </div>
    </div>
  );
}

export function GameDayBoard() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-80px' });
  const step = useTicker(inView, 1500, 8);
  return (
    <div ref={ref} className="space-y-3">
      {GAMES.map((g, i) => {
        const defending = g.ball === g.home ? g.away : g.home;
        return (
          <motion.div key={g.away} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.5 }}
            className={cn('rounded-2xl border bg-card p-4', i === 0 ? 'border-primary/50' : 'border-border')}>
            <div className="flex items-center gap-3">
              <span className="lp-num w-6 text-[22px] font-extrabold text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="lp-display text-[17px] font-bold">{g.away} <span className="text-muted-foreground">at</span> {g.home}</p>
                <p className="text-[12px] text-muted-foreground">{g.mine} of yours, {g.theirs} of theirs on the field</p>
              </div>
              <span className="rounded-md border border-border px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-muted-foreground">{g.tv}</span>
              <div className="w-20 text-right">
                <p className="lp-num text-[20px] font-extrabold leading-none">±{g.swing}%</p>
                <p className="text-[10.5px] text-muted-foreground">swing</p>
              </div>
            </div>
            <div className="mt-3">
              <Field at={g.drive.yards[step]} defending={defending} label={`${g.ball} ball · ${g.drive.desc[step]}`} />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Game of the Week ─────────────────────────────────────────────────────────

/** The real signals and weights the product uses to pick it. */
const SIGNALS = [
  { label: 'Both teams winning', weight: 0.25, score: 0.92, note: '7-1 and 6-2' },
  { label: 'Playoff stakes', weight: 0.2, score: 0.85, note: 'First-round bye on the line' },
  { label: 'Points scored', weight: 0.2, score: 0.78, note: 'Two of the top three offenses' },
  { label: 'Rivalry', weight: 0.15, score: 0.9, note: 'Series tied 5-5' },
  { label: 'Too close to call', weight: 0.2, score: 0.74, note: 'Forecast 54 to 46' },
];

export function GotwSignals() {
  const total = Math.round(SIGNALS.reduce((s, x) => s + x.weight * x.score, 0) * 100);
  return (
    <div className="rounded-[22px] border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Game of the Week · Week 9</p>
          <p className="lp-display mt-2 text-[22px] font-bold leading-tight">Gridiron Ghosts <span className="text-muted-foreground">vs</span> Fourth &amp; Long Shots</p>
        </div>
        <div className="text-right">
          <p className="lp-num text-[44px] font-extrabold leading-none">{total}</p>
          <p className="text-[10.5px] font-semibold text-muted-foreground">out of 100</p>
        </div>
      </div>
      <ul className="mt-5 space-y-3.5">
        {SIGNALS.map((s, i) => (
          <li key={s.label}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-semibold">{s.label}</span>
              <span className="truncate text-[12px] text-muted-foreground">{s.note}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="relative h-2 rounded-full bg-muted">
                <motion.div className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  initial={{ width: 0 }} whileInView={{ width: `${s.score * 100}%` }} viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }} />
              </div>
              <span className="w-[4.5rem] text-right text-[11px] tabular-nums text-muted-foreground">{Math.round(s.weight * 100)}% of score</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Ask the data ─────────────────────────────────────────────────────────────

const MANAGERS = ['Ghosts', 'Long Shots', 'Waiver Wire', 'Bench Mob', 'Punt Intended', 'Hail Marys', 'Red Zone', 'Fumblers'];
const QUESTION = 'Who leaves the most points on the bench?';

/** Sample rows in the product's own matchups table shape. */
function sampleMatchups(): Row[] {
  const rnd = seeded(9);
  const rows: Row[] = [];
  MANAGERS.forEach((m, mi) => {
    for (let w = 1; w <= 9; w++) {
      rows.push({ season: '2026', week: w, manager: m, team: m, bench_points: Math.round((12 + mi * 2.6 + rnd() * 22) * 10) / 10 });
    }
  });
  return rows;
}

const SPEC: QuerySpec = {
  dataset: 'matchups',
  dimensions: ['manager'],
  measures: [{ field: 'bench_points', agg: 'sum' }],
  filters: [],
  sort: { by: 'sum(bench_points)', dir: 'desc' },
  chart: 'hbar',
};

export function AskAnalytics() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState(reduce ? QUESTION.length : 0);
  const done = typed >= QUESTION.length;
  const result = useMemo(() => runQuery(sampleMatchups(), SPEC), []);

  useEffect(() => {
    if (reduce || !inView || done) return;
    const t = setTimeout(() => setTyped(n => n + 1), 38);
    return () => clearTimeout(t);
  }, [reduce, inView, typed, done]);

  return (
    <div ref={ref} className="rounded-[22px] border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-[14px]">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Ask</span>
        <span className="min-w-0 flex-1 truncate">
          {QUESTION.slice(0, typed)}
          {!done && <span className="ml-px inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-foreground" />}
        </span>
      </div>
      <div className="mt-4 min-h-[300px]">
        <AnimatePresence>
          {done && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <p className="text-[13px] font-semibold">Bench points by manager, 2026</p>
              <p className="mb-2 text-[12px] text-muted-foreground">Matchups · {result.matched} rows · sum of bench points, highest first</p>
              <ChartView spec={SPEC} result={result} height={280} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── The simulator ────────────────────────────────────────────────────────────

const ODDS = [
  { team: 'Gridiron Ghosts', p: 0.97 },
  { team: 'Fourth & Long Shots', p: 0.81 },
  { team: 'The Waiver Wire', p: 0.58 },
  { team: 'Bench Mob', p: 0.34 },
  { team: 'Punt Intended', p: 0.19 },
  { team: 'Hail Marys', p: 0.07 },
];
const SIMS = 10000;

export function PlayoffSim() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? SIMS : 0);

  useEffect(() => {
    if (reduce || !inView) return;
    let raf = 0; const t0 = performance.now();
    const tick = (ts: number) => {
      const f = Math.min(1, (ts - t0) / 3200);
      setN(Math.round(SIMS * (1 - Math.pow(1 - f, 3))));
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, inView]);

  // Early estimates wobble; the wobble shrinks with the square root of the
  // simulations run, the way a real Monte Carlo estimate settles.
  const shown = ODDS.map((o, i) => {
    if (n >= SIMS) return o.p;
    const noise = Math.sin(n / 37 + i * 1.7) * Math.sqrt((o.p * (1 - o.p)) / Math.max(n, 8)) * 2.2;
    return Math.max(0.01, Math.min(0.995, o.p + noise));
  });

  return (
    <div ref={ref} className="rounded-[22px] border border-border bg-card p-5 sm:p-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Playoff odds</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Rest of the season, simulated</p>
        </div>
        <p className="text-right"><span className="lp-num text-[30px] font-extrabold leading-none tabular-nums">{n.toLocaleString()}</span><br />
          <span className="text-[11px] text-muted-foreground">seasons</span></p>
      </div>
      <ul className="mt-5 space-y-2.5">
        {ODDS.map((o, i) => (
          <li key={o.team} className="grid grid-cols-[minmax(0,9.5rem)_1fr_3rem] items-center gap-3 text-[13px]">
            <span className="truncate">{o.team}</span>
            <span className="relative h-2.5 rounded-full bg-muted">
              <span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-150" style={{ width: `${shown[i] * 100}%` }} />
              <span className="absolute inset-y-[-3px] w-px bg-foreground/30" style={{ left: '50%' }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{Math.round(shown[i] * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
