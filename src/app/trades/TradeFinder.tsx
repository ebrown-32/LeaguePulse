'use client';

/**
 * Trade Finder's feed: one trade a screen, swiped (or scrolled, or arrowed) to the next, loading
 * more as it goes and never running out: when every trade matching the filters has been dealt,
 * a new round starts on a new shuffle. The trades come a page at a time from /api/trades/finder.
 *
 * Filters: teams, what they're after (points now or value later), positions coming back, fair
 * deals only, how many teams are in it, and a creativity dial from safe to wild.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useIsPresent } from 'framer-motion';
import { RefreshCw, SlidersHorizontal, X } from '@/components/icons';
import type { Goal } from '@/lib/trades/feed';
import type { FinderMeta, FinderPage, FinderTeam, FinderTrade } from '@/lib/trades/finder';
import type { LeagueKind } from '@/lib/trades/values';
import { track } from '@/lib/mixpanel';
import { cn } from '@/lib/utils';
import TradeCard, { POSITION_TEXT, TeamAvatar } from './TradeCard';

type Item = { kind: 'trade'; key: string; trade: FinderTrade } | { kind: 'round'; key: string; round: number };

interface Filters { teams: number[]; positions: string[]; goal: Goal; fair: boolean; size: number; picks: boolean; creativity: number }
const NO_FILTERS: Filters = { teams: [], positions: [], goal: 'any', fair: false, size: 0, picks: false, creativity: 50 };
const SIZES: { id: number; label: string }[] = [{ id: 0, label: 'Any' }, ...[2, 3, 4, 5, 6].map(n => ({ id: n, label: String(n) }))];
const creativityOf = (c: number) =>
  c <= 20 ? { label: 'Safe', about: 'Simple, even swaps first.' }
  : c < 45 ? { label: 'Steady', about: 'Mostly straightforward deals, a few twists.' }
  : c <= 55 ? { label: 'Balanced', about: 'A mix of simple swaps and bolder ideas.' }
  : c < 80 ? { label: 'Bold', about: 'Consolidations, buy-lows and multi-piece deals come first.' }
  : { label: 'Wild', about: 'The most inventive trades in the league first: five and six team loops, picks, blockbusters.' };
const GOALS: { id: Goal; label: string; about: string }[] = [
  { id: 'any', label: 'Anything', about: 'Every trade that helps both sides.' },
  { id: 'now', label: 'Win now', about: 'Trades that put more points in the lineup this season.' },
  { id: 'later', label: 'Rebuild', about: 'Trades that add value for the long haul.' },
];
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const PAGE = 12;

/** The filters as the feed's query string (api/trades/finder). */
function filterParams(f: Filters, qs = new URLSearchParams()): URLSearchParams {
  if (f.teams.length) qs.set('teams', f.teams.join(','));
  if (f.positions.length) qs.set('pos', f.positions.join(','));
  if (f.goal !== 'any') qs.set('goal', f.goal);
  if (f.fair) qs.set('fair', '1');
  if (f.size) qs.set('size', String(f.size));
  if (f.creativity !== 50) qs.set('creativity', String(f.creativity));
  if (f.picks) qs.set('picks', '1');
  return qs;
}

const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const ago = (t: number) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

export default function TradeFinder() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [items, setItems] = useState<Item[]>([]);
  const [meta, setMeta] = useState<FinderMeta | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [sheet, setSheet] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  // Where the feed is in its shuffle; a ref so overlapping loads can't deal the same page twice.
  const cursor = useRef({ seed: newSeed(), offset: 0, round: 1, loading: false, gen: 0 });

  const loadMore = useCallback(async () => {
    const c = cursor.current;
    if (c.loading) return;
    c.loading = true;
    const gen = c.gen;
    const qs = filterParams(filters, new URLSearchParams({ seed: String(c.seed), offset: String(c.offset), limit: String(PAGE) }));
    try {
      const r = await fetch(`/api/trades/finder?${qs}`);
      const page = await r.json() as FinderPage & { error?: string };
      if (!r.ok) throw new Error(page.error);
      if (gen !== c.gen) return; // The filters changed while this was in flight.
      // Once per set of filters: what people ask the finder for, and whether it had answers.
      if (c.offset === 0 && c.round === 1) {
        track('trade_finder_searched', {
          teams_filtered: filters.teams.length, positions: filters.positions.join(',') || 'any', goal: filters.goal,
          fair_only: filters.fair, deal_size: filters.size || 'any', picks: filters.picks, creativity: filters.creativity, results: page.total,
        });
      }
      setMeta(page.meta);
      setTotal(page.total);
      const fresh: Item[] = page.trades.map(t => ({ kind: 'trade', key: `${c.round}:${t.id}`, trade: t }));
      c.offset += page.trades.length;
      if (page.exhausted && page.total > 0) {
        // Every trade dealt: shuffle again and say so.
        c.round += 1; c.seed = newSeed(); c.offset = 0;
        fresh.push({ kind: 'round', key: `round-${c.round}`, round: c.round });
      }
      setItems(prev => [...prev, ...fresh]);
      setError(null);
    } catch (e) {
      if (gen === c.gen) setError(e instanceof Error && e.message ? e.message : 'Could not find trades');
    } finally {
      if (gen === c.gen) c.loading = false;
    }
  }, [filters]);

  // A change of filters starts the feed over.
  useEffect(() => {
    const c = cursor.current;
    Object.assign(c, { offset: 0, round: 1, loading: false, gen: c.gen + 1 });
    setItems([]); setTotal(null); setIndex(0);
    feed.current?.scrollTo({ top: 0 });
    loadMore();
  }, [loadMore]);

  // Keep a few cards ahead of the reader.
  useEffect(() => {
    if (items.length && index >= items.length - 4) loadMore();
  }, [index, items.length, loadMore]);

  const go = useCallback((i: number) => {
    const el = feed.current;
    if (el) el.scrollTo({ top: Math.max(0, i) * el.clientHeight, behavior: 'smooth' });
  }, []);

  const onScroll = () => {
    const el = feed.current;
    if (el) setIndex(Math.round(el.scrollTop / Math.max(1, el.clientHeight)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); go(index + 1); }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); go(index - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go, sheet]);

  // The league's own reduced-motion setting (admin theme) as well as the device's.
  const [reduced, setReduced] = useState(false);
  useEffect(() => { setReduced(document.documentElement.dataset.motion === 'reduced'); }, []);

  const teamOf = useMemo(() => new Map((meta?.teams ?? []).map(t => [t.rosterId, t])), [meta]);
  const active = filters.teams.length + filters.positions.length + (filters.goal !== 'any' ? 1 : 0) + (filters.fair ? 1 : 0) + (filters.size ? 1 : 0) + (filters.picks ? 1 : 0) + (filters.creativity !== 50 ? 1 : 0);

  if (error && !items.length) return <Empty title="No trades right now" body={error} />;

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Pulse meta={meta} total={total} filtered={active - (filters.creativity !== 50 ? 1 : 0) > 0} />
          <button onClick={() => setSheet(true)}
            className={cn('ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
            {active > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{active}</span>}
          </button>
        </div>

        <ActiveFilters filters={filters} teamOf={teamOf} onChange={setFilters} />

        <div className="relative">
          <div ref={feed} onScroll={onScroll}
            className="relative h-[calc(100svh-21rem)] min-h-[27rem] snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-3xl border border-border bg-card shadow-sm sm:h-[min(34rem,calc(100svh-19rem))] [scrollbar-width:none]">
            {total === null && !items.length && <Loading />}
            {total === 0 && (
              <div className="flex h-full items-center justify-center p-8">
                <Empty title="No trades match" body="Nothing in the league fits all of those filters right now."
                  action={<button onClick={() => setFilters(NO_FILTERS)} className="mt-3 text-sm font-semibold text-primary">Clear filters</button>} />
              </div>
            )}
            {items.map((it, i) => {
              const near = Math.abs(i - index) <= 2;
              if (!near) return <section key={it.key} className="h-full snap-start" />;
              return it.kind === 'trade'
                ? <TradeCard key={it.key} trade={it.trade} teamOf={teamOf} active={i === index} first={i === 0} kind={meta?.kind ?? 'redraft'} />
                : <RoundCard key={it.key} round={it.round} active={i === index} />;
            })}
          </div>
          {items.length > 0 && <Progress index={index} items={items} />}
        </div>
      </div>

      <AnimatePresence>
        {sheet && meta && (
          <FilterSheet teams={meta.teams} kind={meta.kind} initial={filters}
            onApply={f => { if (JSON.stringify(f) !== JSON.stringify(filters)) setFilters(f); setSheet(false); }} />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

/** The feed's heartbeat: it's live, how many trades are in play, how fresh the numbers are. */
function Pulse({ meta, total, filtered }: { meta: FinderMeta | null; total: number | null; filtered: boolean }) {
  if (!meta) return <div className="h-5 w-48 lp-skeleton rounded-full bg-muted" />;
  const count = filtered && total != null ? total : meta.poolSize;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5 font-semibold text-foreground">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 [animation-iteration-count:3]" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        {count.toLocaleString()} {filtered ? 'matching' : 'trades in play'}
      </span>
      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold">{meta.kind[0].toUpperCase() + meta.kind.slice(1)} values</span>
      {meta.freshCount > 0 && <span className="font-semibold text-primary">{meta.freshCount.toLocaleString()} new</span>}
      <span className="hidden sm:inline">Rosters checked {ago(meta.builtAt)}</span>
    </div>
  );
}

function ActiveFilters({ filters, teamOf, onChange }: { filters: Filters; teamOf: Map<number, FinderTeam>; onChange: (f: Filters) => void }) {
  const chips: { key: string; label: string; clear: Filters }[] = [
    ...filters.teams.map(t => ({ key: `t${t}`, label: teamOf.get(t)?.name ?? `Team ${t}`, clear: { ...filters, teams: filters.teams.filter(x => x !== t) } })),
    ...(filters.goal !== 'any' ? [{ key: 'goal', label: GOALS.find(g => g.id === filters.goal)!.label, clear: { ...filters, goal: 'any' as Goal } }] : []),
    ...filters.positions.map(p => ({ key: p, label: `Gets a ${p}`, clear: { ...filters, positions: filters.positions.filter(x => x !== p) } })),
    ...(filters.fair ? [{ key: 'fair', label: 'B or better', clear: { ...filters, fair: false } }] : []),
    ...(filters.size ? [{ key: 'size', label: `${filters.size} teams`, clear: { ...filters, size: 0 } }] : []),
    ...(filters.creativity !== 50 ? [{ key: 'creativity', label: creativityOf(filters.creativity).label, clear: { ...filters, creativity: 50 } }] : []),
    ...(filters.picks ? [{ key: 'picks', label: 'With picks', clear: { ...filters, picks: false } }] : []),
  ];
  if (!chips.length) return null;
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none]">
      <AnimatePresence initial={false}>
        {chips.map(c => (
          <motion.button key={c.key} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => onChange(c.clear)}
            className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 py-1 pl-2.5 pr-2 text-[11px] font-semibold text-foreground">
            <span className="max-w-[10rem] truncate">{c.label}</span> <X className="h-3 w-3 opacity-60" />
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * The filters, as a draft: nothing changes behind the sheet until it closes, so picking several
 * teams doesn't reload the feed under your thumb. The button counts the matches as you go.
 */
function FilterSheet({ teams, kind, initial, onApply }: { teams: FinderTeam[]; kind: LeagueKind; initial: Filters; onApply: (f: Filters) => void }) {
  const [filters, onChange] = useState(initial);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/trades/finder?${filterParams(filters, new URLSearchParams({ seed: '1', limit: '1' }))}`, { signal: ctl.signal })
        .then(r => r.json()).then(d => setCount(typeof d.total === 'number' ? d.total : null)).catch(() => {});
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [filters]);
  const onClose = () => onApply(filters);
  const present = useIsPresent();
  const toggle = <K extends 'teams' | 'positions'>(k: K, v: Filters[K][number]) => {
    const list = filters[k] as (typeof v)[];
    onChange({ ...filters, [k]: list.includes(v) ? list.filter(x => x !== v) : [...list, v] });
  };
  const pill = (on: boolean) => cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
    on ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground');
  return (
    // Closing, it lets go of the pointer at once: its exit plays while the feed reloads behind it, and
    // an invisible sheet was swallowing taps meant for the page (the filter chips' x among them).
    <motion.div className={cn('fixed inset-0 z-[60] flex items-end justify-center sm:items-center', !present && 'pointer-events-none')}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.18 } }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div role="dialog" aria-label="Filters"
        className="relative max-h-[85svh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card p-5 pb-8 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:pb-5"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">Filters</h3>
          <button onClick={() => onChange(NO_FILTERS)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Reset</button>
        </div>

        <Label>Teams</Label>
        <div className="mb-5 grid grid-cols-2 gap-1.5">
          {teams.map(t => (
            <button key={t.rosterId} onClick={() => toggle('teams', t.rosterId)}
              className={cn('flex min-w-0 items-center gap-2 rounded-xl border p-1.5 pr-2.5 text-left text-xs font-medium transition-colors',
                filters.teams.includes(t.rosterId) ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
              <TeamAvatar team={t} size={24} />
              <span className="truncate">{t.name}</span>
            </button>
          ))}
        </div>

        <Label>{filters.teams.length ? (filters.teams.length > 1 ? 'They want' : 'They want') : 'Looking for'}</Label>
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {GOALS.filter(g => kind !== 'redraft' || g.id !== 'later').map(g => <button key={g.id} onClick={() => onChange({ ...filters, goal: g.id })} className={pill(filters.goal === g.id)}>{g.label}</button>)}
        </div>
        <p className="mb-5 text-[11px] text-muted-foreground">{GOALS.find(g => g.id === filters.goal)!.about}</p>

        <Label>Getting back</Label>
        <div className="mb-5 flex flex-wrap gap-1.5">
          {POSITIONS.map(p => (
            <button key={p} onClick={() => toggle('positions', p)} className={cn(pill(filters.positions.includes(p)), !filters.positions.includes(p) && POSITION_TEXT[p])}>{p}</button>
          ))}
        </div>

        <Label>Teams involved</Label>
        <div className="mb-5 inline-flex rounded-full border border-border p-0.5">
          {SIZES.map(z => (
            <button key={z.id} onClick={() => onChange({ ...filters, size: z.id })}
              className={cn('relative min-w-[2.5rem] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', filters.size === z.id ? 'text-background' : 'text-muted-foreground hover:text-foreground')}>
              {filters.size === z.id && <motion.span layoutId="tf-size" className="absolute inset-0 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className="relative">{z.label}</span>
            </button>
          ))}
        </div>

        <Creativity value={filters.creativity} onChange={c => onChange({ ...filters, creativity: c })} />

        <Label>Deal</Label>
        <div className="mb-6 flex flex-wrap gap-1.5">
          <button onClick={() => onChange({ ...filters, fair: !filters.fair })} className={pill(filters.fair)}>B or better</button>
          {kind === 'dynasty' && <button onClick={() => onChange({ ...filters, picks: !filters.picks })} className={pill(filters.picks)}>With picks</button>}
        </div>

        <button onClick={onClose} disabled={count === 0}
          className="w-full rounded-full bg-foreground py-3 text-sm font-bold text-background transition-opacity disabled:opacity-40">
          {count === null ? 'Show trades' : count === 0 ? 'No trades match' : `Show ${count.toLocaleString()} trade${count === 1 ? '' : 's'}`}
        </button>
      </motion.div>
    </motion.div>
  );
}

/** The creativity dial: safe to wild. */
function Creativity({ value, onChange }: { value: number; onChange: (c: number) => void }) {
  const draft = value;
  const { label, about } = creativityOf(draft);
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between">
        <Label>Creativity</Label>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={label} className="text-xs font-bold text-primary"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {label}
          </motion.span>
        </AnimatePresence>
      </div>
      <input type="range" min={0} max={100} step={1} value={draft} aria-label="Creativity"
        onChange={e => onChange(Number(e.target.value))}
        className="tf-range w-full"
        style={{ ['--tf-fill' as string]: `${draft}%` }} />
      <div className="mt-1 flex justify-between text-[10px] font-medium text-muted-foreground"><span>Safe</span><span>Wild</span></div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{about}</p>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) =>
  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{children}</p>;

/** Between rounds: every trade has been dealt, and the deck is shuffled again. */
function RoundCard({ round, active }: { round: number; active: boolean }) {
  return (
    <section className="flex h-full snap-start snap-always flex-col items-center justify-center gap-3 p-8 text-center">
      <motion.div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
        initial={false} animate={active ? { rotate: 360, scale: 1 } : { rotate: 0, scale: 0.7 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
        <RefreshCw className="h-6 w-6" />
      </motion.div>
      <p className="text-lg font-bold text-foreground">That&apos;s every trade, for now</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Round {round} is a fresh shuffle. New ideas land the moment rosters, projections or values move.
      </p>
    </section>
  );
}

/** A thin rail of where you are in the current round. */
function Progress({ index, items }: { index: number; items: Item[] }) {
  const start = items.slice(0, index + 1).map(i => i.kind).lastIndexOf('round');
  const end = items.findIndex((it, i) => i > index && it.kind === 'round');
  const span = (end < 0 ? items.length : end) - (start + 1);
  const at = index - start;
  return (
    <div className="pointer-events-none absolute right-1.5 top-6 bottom-6 w-1 overflow-hidden rounded-full bg-border/50">
      <motion.div className="w-full rounded-full bg-primary" initial={false}
        animate={{ height: `${Math.min(100, (Math.max(1, at) / Math.max(1, span)) * 100)}%` }}
        transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex gap-4">
        <div className="h-14 w-14 lp-skeleton rounded-full bg-muted" />
        <div className="flex-1 space-y-2"><div className="h-5 w-3/4 lp-skeleton rounded bg-muted" /><div className="h-4 w-1/2 lp-skeleton rounded bg-muted" /></div>
      </div>
      <div className="grid flex-1 grid-cols-2 content-center gap-3">
        <div className="h-40 lp-skeleton rounded-2xl bg-muted" /><div className="h-40 lp-skeleton rounded-2xl bg-muted" />
      </div>
      <p className="text-center text-sm text-muted-foreground">Running every trade in the league...</p>
    </div>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-sm space-y-1 py-16 text-center">
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
