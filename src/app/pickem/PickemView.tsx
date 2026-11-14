'use client';

/**
 * Pick'em (api/pickem): the week's card, the season's table and the Cup.
 *
 *   Your card     tap the side you think wins each of the league's other games; tap the padlock
 *                 on the one you're surest of (double points). Saved as you go. Your own game
 *                 isn't on it.
 *   After kickoff everyone's card opens: the split on each game and who picked whom.
 *   After the week each pick is marked right or wrong, and the table moves.
 *
 * Who you are: a signed-in manager is their franchise. Anyone else says which team is theirs, once,
 * and that browser holds the team (a key, lib/pickem). Rivalry week's games wear their colours.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Clock, Flame, Lock, Trophy, X } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { PickemGame, PickemTable, PickemTeam, PickemWeek, WeekPicks } from '@/lib/pickem';
import { pickemDollars, upsetBonus } from '@/lib/pickemScore';
import type { RivalryNow } from '@/lib/rivalryWeek';

const PickemCup = dynamic(() => import('@/components/trophies/Forge').then(m => m.PickemCup), { ssr: false, loading: () => <div className="h-[300px] animate-pulse rounded-xl bg-muted/50" /> });

type Team = Omit<PickemTeam, 'points'>;
interface Data {
  season: string; lastWeek: number; over: boolean; accounts: boolean;
  /** Whether winnings pay into the franchise's bank (hosted). */
  money: boolean;
  /** The week open for picks; null once the regular season's last week has kicked off. */
  card: PickemWeek | null;
  /** The week being played: picks locked, everyone's shown. */
  live: { card: PickemWeek; picks: Record<string, WeekPicks> } | null;
  previous: { card: PickemWeek; picks: Record<string, WeekPicks> } | null;
  table: PickemTable; champions: { season: string; name: string }[]; teams: Team[];
  me: { userId: string; signedIn: boolean; claimed: boolean; allowed: boolean; picks: WeekPicks | null } | null;
}

const ease = [0.22, 1, 0.36, 1] as const;
const TEAM_KEY = 'lp_pickem_team';
const keyFor = (team: string) => `lp_pickem_key:${team}`;
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function headers(team: string | null): HeadersInit {
  const h: Record<string, string> = {};
  const pass = store.get('lp_visitor');
  if (pass) h['x-visitor-pass'] = pass;
  const key = team ? store.get(keyFor(team)) : null;
  if (key) h['x-pickem-key'] = key;
  return h;
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function Face({ src, size = 40, ring }: { src: string; size?: number; ring?: string }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full bg-muted object-cover" style={{ width: size, height: size, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }} />
    : <span className="shrink-0 rounded-full bg-muted" style={{ width: size, height: size }} />;
}

function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), every); return () => clearInterval(t); }, [every]);
  return now;
}

function until(ms: number) {
  if (ms <= 0) return 'now';
  const m = Math.floor(ms / 60_000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m % 60}m`;
}

function PhasePill({ week }: { week: PickemWeek }) {
  const now = useNow();
  if (week.phase === 'open') {
    const at = week.locksAt ? Date.parse(week.locksAt) : null;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[12px] font-bold text-emerald-700 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        Open{at ? `, locks in ${until(at - now)}` : ''}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold',
      week.phase === 'final' ? 'bg-muted text-muted-foreground' : 'bg-amber-500/12 text-amber-700 dark:text-amber-400')}>
      {week.phase === 'final' ? <Check className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
      {week.phase === 'final' ? 'Final' : 'Locked, games under way'}
    </span>
  );
}

// ── A game ───────────────────────────────────────────────────────────────────

interface GameProps {
  g: PickemGame;
  phase: PickemWeek['phase'];
  /** Your roster, to sit out your own game. */
  mine: number | null;
  pick: number | undefined;
  locked: boolean;
  onPick?: (rosterId: number) => void;
  onLock?: () => void;
  /** Once the week's locked: who picked each side. */
  pickers?: { a: (Team & { auto?: boolean })[]; b: (Team & { auto?: boolean })[] };
  rivalry?: { a: string; b: string; label: string } | null;
  index: number;
  /** Your pick's odds when you made it: a right underdog pick is an upset. */
  odds?: number;
}

function Game({ g, phase, mine, pick, locked, onPick, onLock, pickers, rivalry, index, odds }: GameProps) {
  const reduce = useReducedMotion();
  const own = mine !== null && (g.a.rosterId === mine || g.b.rosterId === mine);
  const open = phase === 'open' && !own && Boolean(onPick);
  const total = (g.split?.a ?? 0) + (g.split?.b ?? 0);
  const sides = [g.a, g.b] as const;
  return (
    <motion.li initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04, duration: 0.4, ease }}
      className={cn('relative overflow-hidden rounded-2xl border bg-card', rivalry ? 'border-transparent' : 'border-border', own && 'opacity-60')}
      style={rivalry ? { background: `linear-gradient(hsl(var(--card)), hsl(var(--card))) padding-box, linear-gradient(90deg, ${rivalry.a}, ${rivalry.b}) border-box`, borderWidth: 2 } : undefined}>
      {(rivalry || own) && (
        <div className="flex items-center justify-between px-3.5 pt-2.5 text-[10.5px] font-black uppercase tracking-[0.16em]">
          {rivalry ? <span className="inline-flex items-center gap-1 text-[#e0352b]"><Flame className="h-3.5 w-3.5" /> Rivalry week · {rivalry.label}</span> : <span />}
          {own && <span className="text-muted-foreground">Your game</span>}
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 p-2.5">
        {sides.map((t, i) => {
          const chosen = pick === t.rosterId;
          const won = g.winner !== undefined && g.winner === t.rosterId;
          const lost = g.winner !== undefined && g.winner !== null && g.winner !== t.rosterId;
          const prob = g.aWinProb === null ? null : i === 0 ? g.aWinProb : 1 - g.aWinProb;
          const share = total ? ((i === 0 ? g.split!.a : g.split!.b) / total) : null;
          return (
            <button key={t.rosterId} type="button" disabled={!open} onClick={() => onPick?.(t.rosterId)} aria-pressed={chosen}
              aria-label={`${t.teamName}${chosen ? ', your pick' : ''}`}
              className={cn('relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center transition-all',
                i === 1 && 'order-3',
                open && 'hover:bg-muted/70 active:scale-[0.98]',
                chosen ? 'bg-primary/10 ring-2 ring-primary' : 'bg-muted/35',
                lost && 'opacity-55')}>
              <AnimatePresence>
                {chosen && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                    className={cn('absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white',
                      phase === 'final' && g.winner !== undefined ? (won ? 'bg-emerald-500' : g.winner === null ? 'bg-muted-foreground' : 'bg-red-500') : 'bg-primary')}>
                    {phase === 'final' && lost ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                  </motion.span>
                )}
              </AnimatePresence>
              <Face src={t.avatar} size={44} ring={rivalry ? (i === 0 ? rivalry.a : rivalry.b) : undefined} />
              <span className="line-clamp-2 text-[13px] font-bold leading-tight text-foreground">{t.teamName}</span>
              {phase === 'open'
                ? prob !== null && <span className={cn('text-[11px] font-semibold', prob >= 0.5 ? 'text-foreground/70' : 'text-muted-foreground')}>{prob >= 0.5 ? `Favoured, ${Math.round(prob * 100)}%` : `${Math.round(prob * 100)}% to win`}</span>
                : <span className={cn('lp-num text-[18px] font-black', won ? 'text-foreground' : 'text-muted-foreground')}>{t.points.toFixed(2)}</span>}
              {/* An underdog: a right pick on it earns a bonus. */}
              {phase === 'open' && prob !== null && upsetBonus(prob) > 0 && (
                <span className="rounded-full bg-violet-500/12 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-violet-700 dark:text-violet-300">Upset +{upsetBonus(prob)}</span>
              )}
              {chosen && won && upsetBonus(odds) > 0 && (
                <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.3 }}
                  className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-[0_0_14px_-2px_rgba(124,58,237,0.8)]">Upset! +{upsetBonus(odds)}</motion.span>
              )}
              {share !== null && <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{Math.round(share * 100)}% picked</span>}
            </button>
          );
        })}
        <div className="order-2 flex flex-col items-center justify-center gap-2 px-0.5">
          <span className="font-display text-[13px] font-black italic text-muted-foreground">VS</span>
          {!own && onLock && phase === 'open' && pick !== undefined && (
            <button type="button" onClick={onLock} aria-pressed={locked} title={locked ? 'Your lock: worth double' : 'Make this your lock (worth double)'}
              className={cn('flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                locked ? 'bg-amber-400 text-black shadow-[0_0_16px_-2px_rgba(251,191,36,0.9)]' : 'bg-muted text-muted-foreground hover:text-foreground')}>
              <Lock className="h-4 w-4" />
            </button>
          )}
          {locked && phase !== 'open' && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase text-black">2x</span>}
        </div>
      </div>
      {/* The split, and who's on each side, once it's locked. */}
      {total > 0 && (
        <div className="px-3 pb-3">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.span initial={{ width: 0 }} animate={{ width: `${(g.split!.a / total) * 100}%` }} transition={{ duration: 0.7, ease }} className="bg-primary" />
            <motion.span initial={{ width: 0 }} animate={{ width: `${(g.split!.b / total) * 100}%` }} transition={{ duration: 0.7, ease }} className="ml-auto bg-foreground/35" />
          </div>
          {pickers && (
            <div className="mt-2 flex justify-between gap-2">
              {[pickers.a, pickers.b].map((list, i) => (
                <div key={i} className={cn('flex -space-x-1.5', i && 'flex-row-reverse space-x-reverse')}>
                  {list.slice(0, 8).map(t => <span key={t.userId} title={t.auto ? `${t.teamName} (sim)` : t.teamName} className={cn('rounded-full ring-2 ring-card', t.auto && 'opacity-40 grayscale')}><Face src={t.avatar} size={20} /></span>)}
                  {list.length > 8 && <span className="ml-2 text-[11px] font-semibold text-muted-foreground">+{list.length - 8}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.li>
  );
}

// ── The table ────────────────────────────────────────────────────────────────

/** $1.2M, $400k. */
function dollars(d: number) {
  return d >= 1e6 ? `$${(d / 1e6).toFixed(d >= 1e7 ? 0 : 1)}M` : `$${Math.round(d / 1e3)}k`;
}

function Table({ table, me, lastWeek, money }: { table: PickemTable; me: string | null; lastWeek: number; money: boolean }) {
  const reduce = useReducedMotion();
  if (!table.rows.length) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13.5px] text-muted-foreground">The table starts once the first week with picks is final.</p>;
  }
  const max = Math.max(1, ...table.rows.flatMap(r => Object.values(r.byWeek)));
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {table.rows.map((r, i) => {
        const weeks = Array.from({ length: lastWeek }, (_, k) => r.byWeek[k + 1]);
        return (
          <motion.li key={r.userId} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03, duration: 0.35, ease }}
            className={cn('flex items-center gap-3 px-3.5 py-2.5', r.userId === me && 'bg-primary/[0.06]')}>
            <span className={cn('lp-num w-5 text-center text-[13px] font-black', i === 0 ? 'text-amber-500' : 'text-muted-foreground')}>{i + 1}</span>
            <Face src={r.avatar} size={30} ring={i === 0 ? '#f5b301' : undefined} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold text-foreground">{r.teamName}{r.userId === me && <span className="ml-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-primary">You</span>}
                {r.simWeeks === r.weeks && <span title="Hasn't picked: the sim picks for them" className="ml-1.5 rounded bg-muted px-1 py-px text-[9.5px] font-black uppercase tracking-[0.1em] text-muted-foreground">Sim</span>}</p>
              <p className="text-[11.5px] text-muted-foreground">{r.right}-{r.wrong}{r.upsets ? ` · ${r.upsets} upset${r.upsets === 1 ? '' : 's'}` : ''}{r.simWeeks && r.simWeeks < r.weeks ? ` · ${r.simWeeks} sim week${r.simWeeks === 1 ? '' : 's'}` : ''}{r.locksPlayed ? ` · locks ${r.locksRight}/${r.locksPlayed}` : ''} · best week {r.bestWeek}</p>
            </div>
            {/* Each week's points, as little bars. */}
            <div className="hidden h-6 items-end gap-[2px] sm:flex" aria-hidden>
              {weeks.map((p, k) => <span key={k} className={cn('w-[5px] rounded-t-[2px]', p === undefined ? 'bg-muted' : 'bg-primary/70')} style={{ height: p === undefined ? 2 : `${Math.max(12, (p / max) * 100)}%` }} />)}
            </div>
            <span className="flex w-14 flex-col items-end leading-none">
              <span className="lp-num text-[18px] font-black text-foreground">{r.points}</span>
              {money && <span className="lp-num mt-0.5 text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400">{dollars(pickemDollars(r.points, table.champion === r.userId))}</span>}
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export default function PickemView({ league }: { league: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [lock, setLock] = useState<number | null>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rivals, setRivals] = useState<RivalryNow | null>(null);
  const dirty = useRef(false);

  const load = useCallback(async (t: string | null) => {
    try {
      const r = await fetch(`/api/pickem${t ? `?team=${encodeURIComponent(t)}` : ''}`, { headers: headers(t), cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Could not load Pick\'em');
      setData(d);
      if (d.me?.signedIn) { setTeam(d.me.userId); store.set(TEAM_KEY, d.me.userId); }
      setPicks(d.me?.picks?.picks ?? {});
      setLock(d.me?.picks?.lock ?? null);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load Pick\'em'); }
  }, []);

  useEffect(() => {
    const t = store.get(TEAM_KEY);
    setTeam(t);
    load(t);
    fetch('/api/rivalry-week').then(r => r.json()).then(setRivals).catch(() => {});
  }, [load]);

  // Saved as you go, a moment after the last tap.
  useEffect(() => {
    if (!dirty.current || !data?.card || !team) return;
    const t = setTimeout(async () => {
      setSaving('saving');
      try {
        const r = await fetch('/api/pickem', { method: 'POST', headers: { 'content-type': 'application/json', ...headers(team) }, body: JSON.stringify({ team, week: data.card!.week, picks, lock }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || 'Could not save');
        if (d.key) store.set(keyFor(d.team), d.key);
        dirty.current = false;
        setSaving('saved'); setSaveError(null);
      } catch (e) { setSaving('error'); setSaveError(e instanceof Error ? e.message : 'Could not save'); }
    }, 550);
    return () => clearTimeout(t);
  }, [picks, lock, team, data]);

  const byUser = useMemo(() => new Map((data?.teams ?? []).map(t => [t.userId, t])), [data]);
  const me = data?.me?.allowed ? data.me : null;
  const myRoster = team ? byUser.get(team)?.rosterId ?? null : null;
  const pickable = data?.card ? data.card.games.filter(g => myRoster === null || (g.a.rosterId !== myRoster && g.b.rosterId !== myRoster)) : [];
  const made = pickable.filter(g => picks[String(g.matchupId)] !== undefined).length;

  const rivalryOf = (week: number, g: PickemGame) => {
    const rw = rivals?.upcoming?.week === week ? rivals.upcoming : rivals?.last?.week === week ? rivals.last : null;
    const r = rw?.games.find(x => x.matchupId === g.matchupId);
    if (!r) return null;
    const aIsA = r.a.rosterId === g.a.rosterId;
    return { a: aIsA ? r.a.color : r.b.color, b: aIsA ? r.b.color : r.a.color, label: r.label };
  };
  const pickersOf = (all: Record<string, WeekPicks>, g: PickemGame) => {
    const a: (Team & { auto?: boolean })[] = [], b: (Team & { auto?: boolean })[] = [];
    for (const [uid, p] of Object.entries(all)) {
      const t = byUser.get(uid); if (!t) continue;
      const v = p.picks[String(g.matchupId)];
      const who = { ...t, auto: p.auto };
      if (v === g.a.rosterId) a.push(who); else if (v === g.b.rosterId) b.push(who);
    }
    // The people first, the sims after.
    const order = (x: { auto?: boolean }, y: { auto?: boolean }) => Number(Boolean(x.auto)) - Number(Boolean(y.auto));
    a.sort(order); b.sort(order);
    return { a, b };
  };

  const choose = (t: Team) => { store.set(TEAM_KEY, t.userId); setTeam(t.userId); setChoosing(false); dirty.current = false; load(t.userId); };
  const pickSide = (g: PickemGame, rosterId: number) => {
    dirty.current = true;
    setPicks(p => ({ ...p, [String(g.matchupId)]: rosterId }));
  };
  const toggleLock = (g: PickemGame) => { dirty.current = true; setLock(l => (l === g.matchupId ? null : g.matchupId)); };

  if (error && !data) return <p className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">{error}</p>;
  if (!data) return <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/50" />)}</div>;

  const { card } = data;
  const head = card ?? data.live?.card ?? data.previous?.card ?? null;
  const myTeam = team ? byUser.get(team) : null;
  const blocked = data.me && !data.me.allowed;
  const champ = data.table.champion ? data.table.rows[0] : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        {/* The week. */}
        <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/12 via-card to-card p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{data.season} · Regular season</p>
              <h2 className="font-display text-[32px] font-black leading-none text-foreground sm:text-[40px]">{head ? `Week ${head.week}` : 'Pick\'em'}</h2>
            </div>
            {head && <PhasePill week={head} />}
          </div>
          {/* Who's picking. */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {myTeam && !choosing ? (
              <>
                <Face src={myTeam.avatar} size={30} />
                <span className="text-[13.5px] font-semibold text-foreground">Picking as <span className="font-black">{myTeam.teamName}</span></span>
                {!data.me?.signedIn && <button type="button" onClick={() => setChoosing(true)} className="text-[12.5px] font-semibold text-primary hover:underline">Not you?</button>}
                {card?.phase === 'open' && me && (
                  <span className="ml-auto text-[12.5px] font-semibold text-muted-foreground">
                    {made} of {pickable.length} picked{lock !== null ? ', lock set' : ''}
                    {saving === 'saving' && ' · saving'}{saving === 'saved' && ' · saved'}
                  </span>
                )}
              </>
            ) : (
              <span className="text-[13.5px] font-semibold text-foreground">Which team is yours?</span>
            )}
          </div>
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] font-semibold text-muted-foreground">
            <span>1 point a right pick</span><span>Lock: double</span>
            <span className="text-violet-700 dark:text-violet-300">Upsets: +1 under 40%, +2 under 25%</span>
            <span>No picks by kickoff: the sim picks for you</span>
            {data.money && <span className="text-emerald-700 dark:text-emerald-400">Every point pays $100k to your franchise, the Cup $5M</span>}
          </p>
          {saving === 'error' && saveError && <p className="mt-2 text-[12.5px] font-semibold text-red-600 dark:text-red-400">{saveError}</p>}
          {blocked && !choosing && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              {data.me!.claimed ? `${myTeam?.teamName ?? 'This team'} has a manager signed in. Sign in from the account menu to make its picks.` : 'This team\'s picks are being made on another device.'}
            </p>
          )}
          <AnimatePresence>
            {(choosing || !myTeam) && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {data.teams.map(t => (
                    <button key={t.userId} type="button" onClick={() => choose(t)}
                      className={cn('flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors hover:border-primary/60 hover:bg-primary/5',
                        t.userId === team ? 'border-primary bg-primary/5' : 'border-border bg-card')}>
                      <Face src={t.avatar} size={26} />
                      <span className="truncate text-[12.5px] font-semibold text-foreground">{t.teamName}</span>
                    </button>
                  ))}
                </div>
                {data.accounts && <p className="mt-2 text-[11.5px] text-muted-foreground">Managers signed in to their franchise pick as it automatically.</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Last week, in a line. */}
        {data.table.lastWeek && (
          <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-3.5 py-2.5 text-[13px] text-foreground/85">
            <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              Week {data.table.lastWeek.week}&apos;s sharpest: <b>{byUser.get(data.table.lastWeek.best.userId)?.teamName}</b>, {data.table.lastWeek.best.points} points.
              {' '}Bringing up the rear: <b>{byUser.get(data.table.lastWeek.worst.userId)?.teamName}</b>, {data.table.lastWeek.worst.right} for {data.table.lastWeek.worst.right + data.table.lastWeek.worst.wrong}. The Desk has notes.
            </span>
          </p>
        )}

        {/* The card. */}
        {card && (card.games.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {card.games.map((g, i) => (
              <Game key={g.matchupId} g={g} index={i} phase={card.phase} mine={myRoster}
                pick={picks[String(g.matchupId)]} locked={lock === g.matchupId}
                onPick={me ? r => pickSide(g, r) : undefined} onLock={me ? () => toggleLock(g) : undefined}
                rivalry={rivalryOf(card.week, g)} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13.5px] text-muted-foreground">Week {card.week}&apos;s matchups aren&apos;t set yet.</p>
        ))}
        {card?.phase === 'open' && <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Everyone&apos;s picks show once the week&apos;s first game kicks off.</p>}

        {/* The week being played, and the one before: everyone's picks, the split, and how they did. */}
        {[data.live && { ...data.live, title: `Week ${data.live.card.week}, under way` }, data.previous && { ...data.previous, title: `Week ${data.previous.card.week} results` }]
          .filter((x): x is NonNullable<Data['live']> & { title: string } => Boolean(x))
          .map(w => (
            <section key={w.card.week}>
              <h3 className="mb-2 flex items-center justify-between text-[12px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {w.title}
                {team && data.table.rows.find(r => r.userId === team)?.byWeek[w.card.week] !== undefined && (
                  <span className="normal-case tracking-normal text-foreground">You: {data.table.rows.find(r => r.userId === team)!.byWeek[w.card.week]} points</span>
                )}
              </h3>
              {team && w.picks[team]?.auto && (
                <p className="mb-2 rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">
                  You didn&apos;t pick week {w.card.week}, so the sim picked for you{data.money ? '. Sim weeks score but don\'t pay' : ''}.
                </p>
              )}
              <ul className="grid gap-3 sm:grid-cols-2">
                {w.card.games.map((g, i) => (
                  <Game key={g.matchupId} g={g} index={i} phase={w.card.phase} mine={myRoster}
                    pick={team ? w.picks[team]?.picks[String(g.matchupId)] : undefined}
                    locked={Boolean(team && w.picks[team]?.lock === g.matchupId)}
                    odds={team ? w.picks[team]?.odds?.[String(g.matchupId)] : undefined}
                    pickers={pickersOf(w.picks, g)} rivalry={rivalryOf(w.card.week, g)} />
                ))}
              </ul>
            </section>
          ))}
      </div>

      <aside className="space-y-5">
        <section>
          {champ && (
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3">
              <Face src={champ.avatar} size={40} ring="#f5b301" />
              <div className="min-w-0">
                <p className="text-[10.5px] font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">{data.season} Pick&apos;em champion</p>
                <p className="truncate text-[15px] font-black text-foreground">{champ.teamName}</p>
              </div>
            </div>
          )}
          <PickemCup league={league || 'Pick\'em'} champions={data.champions} height={280} />
        </section>
        <section>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.16em] text-muted-foreground">The table</h3>
          <Table table={data.table} me={team} lastWeek={data.lastWeek} money={data.money} />
        </section>
      </aside>
    </div>
  );
}
