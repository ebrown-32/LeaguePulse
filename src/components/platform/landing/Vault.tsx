'use client';

/**
 * The Vault: the league's history and analytics, played with rather than described. Three
 * tabs over one sample league (the page's made-up teams, like every other team here):
 *
 *   Standings race   all-time wins, season by season; bars overtake each other as the seasons
 *                    play, the champions light up along the timeline. Plays itself, or scrub it.
 *   Record Book      the league's records on medal cards, numbers counting up; open one for the
 *                    box score of the game it came from.
 *   Rivalries        head to head, every pair, as a heatmap; hover (or tap) a square for the series.
 *
 * On a desktop the Vault takes turns with the game in the hero (landing/HeroGame), in its compact
 * form (`VaultTab compact`); on a phone it is its own section (`Vault`).
 *
 * Deterministic sample data, so it reads the same for everyone. With reduced motion nothing plays
 * by itself and numbers arrive whole.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

const TEAMS = ['Ghosts', 'Long Shots', 'Waiver Wire', 'Bench Mob', 'Punt Intended', 'Hail Marys', 'Red Zone', 'Fumblers'] as const;
const SEASONS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const ease = [0.22, 1, 0.36, 1] as const;

/** A small fixed random source: the same league for every visitor. */
function rng(seed: number) { let a = seed; return () => ((a = (a * 16807) % 2147483647) / 2147483647); }

/** Thirteen-game seasons for every team, and a champion each year. */
const LEAGUE = (() => {
  const r = rng(42);
  const strength = [0.68, 0.5, 0.56, 0.36, 0.44, 0.6, 0.52, 0.32];
  const wins: number[][] = SEASONS.map((_, s) => TEAMS.map((_, t) => {
    const swing = Math.sin((s + t * 1.7) * 0.9) * 0.14;
    return Math.max(2, Math.min(12, Math.round(13 * (strength[t] + swing) + (r() - 0.5) * 3)));
  }));
  const champs = wins.map((row, s) => { const best = [...row].map((w, t) => ({ w: w + r() * 3, t })).sort((a, b) => b.w - a.w)[0].t; return s === 4 ? 3 : best; });
  return { wins, champs };
})();

export const VAULT_TABS = [
  { id: 'race', label: 'Standings race' },
  { id: 'records', label: 'Record Book' },
  { id: 'rivals', label: 'Rivalries' },
] as const;
export type VaultTabId = (typeof VAULT_TABS)[number]['id'];
type Tab = VaultTabId;
const tabs = VAULT_TABS;

/** One view of the Vault; `compact`, the hero's: the chart alone, a little quicker. */
export function VaultTab({ tab, compact = false }: { tab: VaultTabId; compact?: boolean }) {
  return tab === 'race' ? <Race compact={compact} /> : tab === 'records' ? <Records compact={compact} /> : <Rivals compact={compact} />;
}

export default function Vault() {
  const [tab, setTab] = useState<Tab>('race');
  return (
    <section id="vault" className="lp-ink relative scroll-mt-16 overflow-hidden py-20 sm:py-28 lg:scroll-mt-28">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_80%_0%,hsl(var(--primary)/0.14),transparent_70%)]" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
        <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7, ease }}
          className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">The Vault</p>
            <h2 className="lp-headline mt-3 text-[34px] sm:text-[52px]">Every season. <span className="text-primary">Still in play.</span></h2>
          </div>
          <p className="max-w-md text-[15.5px] leading-relaxed text-muted-foreground">
            Every game your league has played, back to the first draft, turned into races, records and rivalries you can scrub, open and argue about.
          </p>
        </motion.div>

        <div role="tablist" aria-label="The Vault" className="mt-10 inline-flex rounded-full border border-border bg-card p-1">
          {tabs.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cn('relative rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors sm:px-5', tab === t.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {tab === t.id && <motion.span layoutId="vault-tab" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-[26px] border border-border bg-card p-4 shadow-[0_40px_90px_-50px_rgba(0,0,0,0.9)] sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease }}>
              <VaultTab tab={tab} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

// ── Standings race ─────────────────────────────────────────────────────────

function Race({ compact = false }: { compact?: boolean }) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { margin: '-120px' });
  const [s, setS] = useState(reduce ? SEASONS.length - 1 : 0);
  const [playing, setPlaying] = useState(!reduce);

  useEffect(() => {
    if (!playing || !inView) return;
    const id = window.setInterval(() => setS(x => {
      if (x >= SEASONS.length - 1) { setPlaying(false); return x; }
      return x + 1;
    }), compact ? 330 : 1300);
    return () => clearInterval(id);
  }, [playing, inView]);

  const totals = useMemo(() => TEAMS.map((name, t) => {
    const w = LEAGUE.wins.slice(0, s + 1).reduce((a, row) => a + row[t], 0);
    const g = (s + 1) * 13;
    const titles = LEAGUE.champs.slice(0, s + 1).filter(c => c === t).length;
    return { name, t, w, l: g - w, titles };
  }).sort((a, b) => b.w - a.w || a.t - b.t), [s]);
  const max = totals[0].w;
  const champ = LEAGUE.champs[s];

  const play = () => { if (s >= SEASONS.length - 1) setS(0); setPlaying(p => !p || s >= SEASONS.length - 1); };

  return (
    <div ref={box} className={cn(!compact && 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]')}>
      <div>
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">All-time wins, through</p>
            {compact && <p className="mt-1 text-[12.5px] font-semibold text-[#F5C542]">{TEAMS[champ]} won it</p>}
          </div>
          <motion.p key={s} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="lp-num text-[40px] font-black leading-none text-foreground">{SEASONS[s]}</motion.p>
        </div>
        <ol className="mt-4 space-y-1.5">
          {totals.map((r, i) => (
            <motion.li key={r.name} layout transition={{ type: 'spring', stiffness: 260, damping: 30 }} className="grid grid-cols-[22px_minmax(0,1fr)] items-center gap-2.5">
              <span className="lp-num text-right text-[13px] font-bold text-muted-foreground">{i + 1}</span>
              <div className="relative h-9 overflow-hidden rounded-lg bg-foreground/[0.05]">
                <motion.div className={cn('absolute inset-y-0 left-0 rounded-lg', i === 0 ? 'bg-primary' : 'bg-primary/40')}
                  animate={{ width: `${Math.max(14, (r.w / max) * 100)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 22 }} />
                <div className="relative flex h-full items-center justify-between px-3 text-[13.5px]">
                  <span className={cn('flex items-center gap-1.5 truncate font-semibold', i === 0 ? 'text-primary-foreground' : 'text-foreground')}>
                    {r.name}
                    {r.titles > 0 && <span className="text-[11px] font-black text-[#F5C542]" aria-label={`${r.titles} titles`}>{'★'.repeat(r.titles)}</span>}
                  </span>
                  <span className="lp-num shrink-0 font-black tabular-nums text-foreground">{r.w}-{r.l}</span>
                </div>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>

      {!compact && <div className="flex flex-col gap-4">
        <AnimatePresence mode="wait">
          <motion.div key={s} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
            className="rounded-2xl border border-[#F5C542]/35 bg-[#F5C542]/[0.08] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#F5C542]">{SEASONS[s]} champion</p>
            <p className="lp-headline mt-2 text-[24px] text-foreground">{TEAMS[champ]}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{LEAGUE.wins[s][champ]}-{13 - LEAGUE.wins[s][champ]} in the regular season</p>
          </motion.div>
        </AnimatePresence>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Ring room</p>
          <div className="mt-2 grid grid-cols-9 gap-1">
            {SEASONS.map((y, i) => (
              <button key={y} onClick={() => { setPlaying(false); setS(i); }} aria-label={`${y}: ${TEAMS[LEAGUE.champs[i]]}`}
                className={cn('flex h-9 items-center justify-center rounded-md text-[9.5px] font-bold transition-colors',
                  i <= s ? 'bg-[#F5C542] text-black' : 'bg-foreground/[0.06] text-muted-foreground', i === s && 'ring-2 ring-foreground')}>
                &apos;{String(y).slice(2)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-auto flex items-center gap-3">
          <button onClick={play} aria-label={playing ? 'Pause' : 'Play the seasons'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:brightness-110">
            {playing
              ? <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
              : <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden><path d="M7 4.5v15l12.5-7.5Z" /></svg>}
          </button>
          <label className="flex-1">
            <span className="sr-only">Season</span>
            <input type="range" min={0} max={SEASONS.length - 1} value={s} onChange={e => { setPlaying(false); setS(Number(e.target.value)); }}
              className="lp-range w-full" style={{ ['--fill' as string]: `${(s / (SEASONS.length - 1)) * 100}%` }} />
          </label>
        </div>
      </div>}
    </div>
  );
}

// ── Record Book ────────────────────────────────────────────────────────────

const RECORDS = [
  { label: 'Highest score', value: 214.36, unit: 'pts', who: 'Ghosts', when: '2023, week 6', game: { a: ['Ghosts', 214.36], b: ['Fumblers', 98.12], lines: [['QB', 'J. Allen', 41.2], ['RB', 'C. McCaffrey', 47.9], ['WR', 'T. Hill', 38.6], ['WR', 'C. Lamb', 29.1], ['TE', 'T. Kelce', 24.4]] } },
  { label: 'Biggest blowout', value: 118.24, unit: 'margin', who: 'Hail Marys', when: '2021, week 11', game: { a: ['Hail Marys', 187.5], b: ['Bench Mob', 69.26], lines: [['QB', 'P. Mahomes', 36.8], ['RB', 'D. Henry', 39.4], ['WR', 'J. Jefferson', 33.2], ['WR', 'D. Adams', 27.0], ['TE', 'M. Andrews', 21.1]] } },
  { label: 'Closest game', value: 0.04, unit: 'margin', who: 'Long Shots', when: '2019, week 3', game: { a: ['Long Shots', 121.88], b: ['Red Zone', 121.84], lines: [['QB', 'L. Jackson', 30.1], ['RB', 'S. Barkley', 22.3], ['WR', 'A. St. Brown', 19.8], ['WR', 'D. Metcalf', 17.4], ['K', 'J. Tucker', 9.0]] } },
  { label: 'Longest win streak', value: 11, unit: 'games', who: 'Ghosts', when: '2024 to 2025', game: null },
] as const;

function CountUp({ to, decimals }: { to: number; decimals: number }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) return;
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 1000); setV(to * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, reduce]);
  return <>{v.toFixed(decimals)}</>;
}

function Records({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState<number>(0);
  const medal = ['linear-gradient(145deg,#FFF4C2,#FACC15 45%,#B8860B)', 'linear-gradient(145deg,#fff,#CBD5E1 45%,#7C8899)', 'linear-gradient(145deg,#FFD9B0,#D97706 45%,#8A4B0B)', 'linear-gradient(145deg,#E2E8F0,#94A3B8 45%,#475569)'];
  const g = RECORDS[open].game;
  return (
    <div className={cn(!compact && 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
      <ul className="space-y-2.5">
        {RECORDS.map((r, i) => (
          <motion.li key={r.label} initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08, duration: 0.5, ease }}>
            <button onClick={() => setOpen(i)} aria-pressed={open === i}
              className={cn('flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
                open === i ? 'border-primary/60 bg-primary/10' : 'border-border bg-foreground/[0.03] hover:border-foreground/25')}>
              <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full text-black" style={{ background: medal[i] }}>
                <span className="text-[8px] font-black uppercase leading-none opacity-70">No.</span>
                <span className="text-[17px] font-black leading-none">1</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold text-foreground">{r.label}</span>
                <span className="block text-[12px] text-muted-foreground">{r.who}, {r.when}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="lp-num block text-[22px] font-black leading-none text-foreground"><CountUp to={r.value} decimals={r.unit === 'games' ? 0 : 2} /></span>
                <span className="mt-1 block text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{r.unit}</span>
              </span>
            </button>
          </motion.li>
        ))}
      </ul>

      {!compact && <AnimatePresence mode="wait">
        <motion.div key={open} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.35, ease }}
          className="rounded-2xl border border-border bg-background/40 p-4">
          {g ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">The box score, {RECORDS[open].when}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div><p className="text-[13px] font-semibold text-foreground">{g.a[0]}</p><p className="lp-num text-[30px] font-black leading-none text-primary">{(g.a[1] as number).toFixed(2)}</p></div>
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">vs</span>
                <div className="text-right"><p className="text-[13px] font-semibold text-foreground">{g.b[0]}</p><p className="lp-num text-[30px] font-black leading-none text-foreground/70">{(g.b[1] as number).toFixed(2)}</p></div>
              </div>
              <ul className="mt-4 space-y-1.5">
                {g.lines.map(([pos, name, pts], i) => (
                  <li key={name} className="grid grid-cols-[38px_minmax(0,1fr)_48px] items-center gap-2 text-[13px]">
                    <span className="rounded-md bg-foreground/[0.07] py-0.5 text-center text-[10px] font-black text-muted-foreground">{pos}</span>
                    <span className="relative h-6 overflow-hidden rounded-md">
                      <motion.span className="absolute inset-y-0 left-0 rounded-md bg-primary/30" initial={{ width: 0 }} animate={{ width: `${((pts as number) / 50) * 100}%` }}
                        transition={{ delay: 0.15 + i * 0.07, duration: 0.6, ease }} />
                      <span className="relative flex h-full items-center px-2 font-semibold text-foreground">{name}</span>
                    </span>
                    <span className="lp-num text-right font-black text-foreground">{(pts as number).toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex h-full flex-col justify-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">The streak</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {[...Array(14)].map((_, i) => (
                  <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 400, damping: 18 }}
                    className={cn('flex h-9 w-9 items-center justify-center rounded-lg text-[12px] font-black', i < 11 ? 'bg-primary text-primary-foreground' : i === 11 ? 'bg-[hsl(var(--signal))] text-white' : 'bg-foreground/[0.07] text-muted-foreground')}>
                    {i < 11 ? 'W' : i === 11 ? 'L' : ''}
                  </motion.span>
                ))}
              </div>
              <p className="mt-4 text-[13.5px] text-muted-foreground">Eleven straight across two seasons, snapped by the Long Shots in week 3. The Desk has not let it go.</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>}
    </div>
  );
}

// ── Rivalries ──────────────────────────────────────────────────────────────

const H2H = (() => {
  const r = rng(7);
  const m: [number, number][][] = TEAMS.map(() => TEAMS.map(() => [0, 0] as [number, number]));
  for (let i = 0; i < TEAMS.length; i++) for (let j = i + 1; j < TEAMS.length; j++) {
    const games = 9 + Math.floor(r() * 9);
    const lean = 0.5 + (j - i) * 0.03 * (i % 2 ? -1 : 1) + (r() - 0.5) * 0.5;
    const w = Math.round(games * Math.max(0.1, Math.min(0.9, lean)));
    m[i][j] = [w, games - w]; m[j][i] = [games - w, w];
  }
  m[0][1] = [12, 5]; m[1][0] = [5, 12];
  return m;
})();

function Rivals({ compact = false }: { compact?: boolean }) {
  const [hover, setHover] = useState<[number, number]>([0, 1]);
  const [i, j] = hover;
  const [w, l] = H2H[i][j];
  const pct = w / Math.max(1, w + l);
  // Diverging: turf where the row's team leads, signal where it trails, gray at even.
  const tint = (a: number, b: number) => {
    const p = a / Math.max(1, a + b) - 0.5;
    return p >= 0 ? `hsl(var(--primary) / ${0.12 + p * 1.5})` : `hsl(var(--signal) / ${0.12 + -p * 1.5})`;
  };
  const short = (n: string) => n.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={cn(!compact && 'grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center')}>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1" aria-label="Head to head, all time">
          <thead>
            <tr><th />{TEAMS.map(t => <th key={t} scope="col" className="w-10 text-[10px] font-black text-muted-foreground" title={t}>{short(t)}</th>)}</tr>
          </thead>
          <tbody>
            {TEAMS.map((row, a) => (
              <tr key={row}>
                <th scope="row" className="whitespace-nowrap pr-2 text-right text-[12px] font-semibold text-muted-foreground">{row}</th>
                {TEAMS.map((col, b) => a === b
                  ? <td key={col} className="h-10 w-10 rounded-md bg-foreground/[0.03]" />
                  : (
                    <td key={col} className="p-0">
                      <motion.button initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: (a + b) * 0.025 }}
                        onPointerEnter={() => setHover([a, b])} onFocus={() => setHover([a, b])} onClick={() => setHover([a, b])}
                        aria-label={`${row} against ${col}: ${H2H[a][b][0]} and ${H2H[a][b][1]}`}
                        className={cn('lp-num flex h-10 w-10 items-center justify-center rounded-md text-[11px] font-black text-foreground transition-transform', i === a && j === b && 'scale-110 ring-2 ring-foreground')}
                        style={{ background: tint(H2H[a][b][0], H2H[a][b][1]) }}>
                        {H2H[a][b][0]}-{H2H[a][b][1]}
                      </motion.button>
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
        {compact && (
          <p className="mt-2 text-[13px] text-foreground">
            <span className="font-bold">{TEAMS[i]}</span> <span className="text-muted-foreground">vs</span> <span className="font-bold">{TEAMS[j]}</span>
            <span className="lp-num ml-2 font-black text-primary">{w}-{l}</span>
          </p>
        )}
        <p className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary/70" />Row leads</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[hsl(var(--signal))]/70" />Row trails</span>
        </p>
      </div>

      {!compact && <AnimatePresence mode="wait">
        <motion.div key={`${i}-${j}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
          className="rounded-2xl border border-border bg-background/40 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">The series</p>
          <p className="lp-headline mt-2 text-[24px] text-foreground">{TEAMS[i]} <span className="text-muted-foreground">vs</span> {TEAMS[j]}</p>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[hsl(var(--signal))]/60">
            <motion.div className="h-full bg-primary" initial={{ width: '50%' }} animate={{ width: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 140, damping: 20 }} />
          </div>
          <div className="mt-2 flex justify-between text-[13px]">
            <span className="lp-num font-black text-foreground">{w} wins</span>
            <span className="lp-num font-black text-foreground">{l} wins</span>
          </div>
          <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">
            {w === l ? 'Dead even. Every meeting is a coin flip with a grudge.'
              : `${w > l ? TEAMS[i] : TEAMS[j]} own${pct > 0.65 || pct < 0.35 ? ' it outright' : ' the edge'}, ${Math.max(w, l)} to ${Math.min(w, l)} across ${w + l} meetings.`}
          </p>
        </motion.div>
      </AnimatePresence>}
    </div>
  );
}
