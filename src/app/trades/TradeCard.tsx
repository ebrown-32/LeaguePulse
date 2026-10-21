'use client';

/**
 * One trade, one screen. It plays in when it becomes the card in view (`active`): the grade's ring
 * draws to how even the deal is, each team's side slides in from its corner, the players follow,
 * and the gains count up. Cards out of view keep still.
 */

import { useEffect, useState } from 'react';
import { animate, motion } from 'framer-motion';
import { ArrowLeftRight, Share2, Sparkles, TrendingDown, TrendingUp } from '@/components/icons';
import { initialsOf, playerPhoto } from '@/lib/playerPhoto';
import type { Story } from '@/lib/trades/engine';
import type { FinderPlayer, FinderSide, FinderTeam, FinderTrade } from '@/lib/trades/finder';
import type { LeagueKind } from '@/lib/trades/values';
import { cn } from '@/lib/utils';

export const POSITION_TEXT: Record<string, string> = {
  QB: 'text-amber-500', RB: 'text-emerald-500', WR: 'text-sky-500', TE: 'text-violet-500',
};

/** The grade's colour: text, ring and the card's glow. */
const toneOf = (g: string) =>
  g.startsWith('A') ? { text: 'text-emerald-500', stroke: '#10b981', glow: 'rgba(16,185,129,0.16)' }
  : g.startsWith('B') ? { text: 'text-sky-500', stroke: '#0ea5e9', glow: 'rgba(14,165,233,0.16)' }
  : g.startsWith('C') ? { text: 'text-amber-500', stroke: '#f59e0b', glow: 'rgba(245,158,11,0.14)' }
  : { text: 'text-rose-500', stroke: '#f43f5e', glow: 'rgba(244,63,94,0.14)' };

const seedOf = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const VERBS = ['lands', 'goes and gets', 'pries loose', 'brings in', 'swings for'];

const COUNT = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
const isPick = (p: FinderPlayer) => p.position === 'PICK';

/** What kind of deal, for the chip on the card. A plain upgrade needs no chip. */
export const STORY_LABEL: Record<Story, string | null> = {
  'buy-low': 'Buy low', 'sell-high': 'Sell high', consolidate: 'Consolidation', picks: 'Draft picks',
  swap: 'Position swap', 'multi-team': null, upgrade: null,
};
const labelOf = (t: FinderTrade) => (t.story === 'multi-team' ? `${t.sides.length}-team deal` : STORY_LABEL[t.story]);

/** A headline and a line from the numbers, told as the kind of deal it is. */
export function copyOf(trade: FinderTrade, teamOf: Map<number, FinderTeam>) {
  const name = (rid: number) => teamOf.get(rid)?.name ?? `Team ${rid}`;
  const players = trade.sides.flatMap(s => s.gets).filter(p => !isPick(p));
  const star = [...players].sort((a, b) => b.value - a.value)[0] ?? trade.sides[0].gets[0];
  const getter = trade.sides.find(s => s.gets.includes(star)) ?? trade.sides[0];
  const other = trade.sides.find(s => s !== getter) ?? getter;
  const verb = VERBS[seedOf(trade.id) % VERBS.length];

  let headline: string;
  switch (trade.story) {
    case 'multi-team': headline = trade.sides.length === 3
      ? `${star.name} lands with ${name(getter.rosterId)} in a three-team deal`
      : `${star.name} heads to ${name(getter.rosterId)} as ${COUNT[trade.sides.length]} teams swap starters`;
      break;
    case 'buy-low': headline = `${name(getter.rosterId)} grabs ${star.name} on the dip`; break;
    case 'sell-high': {
      const riser = [...players].sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0))[0];
      const seller = trade.sides.find(s => s.gives.some(p => p.id === riser.id)) ?? other;
      headline = `${name(seller.rosterId)} cashes in ${riser.name} at peak value`;
      break;
    }
    case 'consolidate': {
      const c = trade.sides.find(s => s.gets.length === 1 && s.gives.length >= 2) ?? getter;
      headline = `${name(c.rosterId)} turns ${COUNT[c.gives.length] ?? c.gives.length} into ${c.gets[0].name}`;
      break;
    }
    case 'picks': {
      const buyer = trade.sides.find(s => s.gives.some(isPick)) ?? getter;
      const target = buyer.gets.filter(p => !isPick(p)).sort((a, b) => b.value - a.value)[0];
      headline = target ? `${name(buyer.rosterId)} spends draft capital on ${target.name}` : `${name(buyer.rosterId)} ${verb} ${star.name}`;
      break;
    }
    case 'swap': {
      const [a, b] = trade.sides;
      headline = `${name(a.rosterId)} and ${name(b.rosterId)} swap a ${a.gives[0].position} for a ${a.gets[0].position}`;
      break;
    }
    default: headline = `${name(getter.rosterId)} ${verb} ${star.name}`;
  }

  const now = trade.sides.filter(s => s.lineupDelta > 0.3), later = trade.sides.filter(s => s.lineupDelta <= 0.3);
  const n = trade.sides.length;
  const line = !later.length
    ? (n > 2 ? `All ${COUNT[n]} starting lineups get better.` : 'Both starting lineups get better.')
    : n > 3 ? `${now.length} of ${n} starting lineups get better; the rest bank value.`
    : `${now.map(s => name(s.rosterId)).join(' and ')} ${now.length > 1 ? 'score' : 'scores'} more now; ${later.map(s => name(s.rosterId)).join(' and ')} ${later.length > 1 ? 'bank' : 'banks'} value.`;
  return { headline, line };
}

export function TeamAvatar({ team, size }: { team?: FinderTeam; size: number }) {
  const [broken, setBroken] = useState(false);
  const a = team?.avatar;
  const src = a && !broken ? (/^(https?:|\/)/.test(a) ? a : `https://sleepercdn.com/avatars/thumbs/${a}`) : null;
  return src
    ? <img src={src} alt="" width={size} height={size} onError={() => setBroken(true)} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="flex shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground" style={{ width: size, height: size }}>{initialsOf(team?.name ?? '?')}</span>;
}

/** A number that counts up from zero when its card comes into view. */
function CountUp({ to, active, decimals = 0 }: { to: number; active: boolean; decimals?: number }) {
  const [v, setV] = useState(active ? 0 : to);
  useEffect(() => {
    if (!active) return;
    const c = animate(0, to, { duration: 0.9, delay: 0.45, ease: [0.16, 1, 0.3, 1], onUpdate: setV });
    return () => c.stop();
  }, [active, to]);
  const fixed = Math.abs(v).toFixed(decimals);
  return <>{v > 0 ? '+' : v < 0 ? '-' : ''}{decimals ? fixed : Number(fixed).toLocaleString()}</>;
}

function GradeRing({ grade, balance, active }: { grade: string; balance: number; active: boolean }) {
  const tone = toneOf(grade);
  return (
    <div className="relative h-14 w-14 shrink-0 sm:h-16 sm:w-16">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-border" />
        <motion.circle cx="32" cy="32" r="28" fill="none" stroke={tone.stroke} strokeWidth="4" strokeLinecap="round"
          initial={false} animate={{ pathLength: active ? balance : 0 }}
          transition={{ duration: 1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
      <motion.div className={cn('absolute inset-0 flex flex-col items-center justify-center', tone.text)}
        initial={false} animate={active ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.25 }}>
        <span className="text-xl font-black leading-none sm:text-2xl">{grade}</span>
        <span className="text-[7px] font-bold uppercase tracking-[0.2em] opacity-80">fair</span>
      </motion.div>
    </div>
  );
}

function PlayerRow({ p, active, i, from, roomy, kind }: { p: FinderPlayer; active: boolean; i: number; from: number; roomy: boolean; kind: LeagueKind }) {
  const motionProps = {
    initial: false as const, animate: active ? { opacity: 1, x: 0 } : { opacity: 0, x: from * 24 },
    transition: { type: 'spring' as const, stiffness: 260, damping: 26, delay: 0.3 + i * 0.08 },
  };
  if (isPick(p)) {
    // A draft pick: a ticket with its round, the year and where it's likely to land.
    const [year, round] = p.name.split(' ');
    return (
      <motion.li className="flex min-w-0 items-center gap-2" {...motionProps}>
        <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 to-primary/5 text-primary ring-1 ring-primary/30 sm:h-10 sm:w-10">
          <span className="text-[11px] font-black leading-none">{round}</span>
          <span className="text-[7px] font-bold tracking-wider opacity-80">{year}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground sm:text-sm">{p.name} pick</p>
          <p className="truncate text-[10px] text-muted-foreground sm:text-[11px]">{p.note ?? 'Draft pick'}</p>
        </div>
      </motion.li>
    );
  }
  const photo = playerPhoto({ playerId: p.id, position: p.position, nflTeam: p.nflTeam });
  const moving = p.trend != null && Math.abs(p.trend) >= 150;
  return (
    <motion.li className="flex min-w-0 items-center gap-2" {...motionProps}>
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border sm:h-10 sm:w-10">
        {photo
          ? <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
          : <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-muted-foreground">{initialsOf(p.name)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight text-foreground sm:text-sm">{p.name}</p>
        <p className="flex items-center gap-1 truncate text-[10px] text-muted-foreground sm:text-[11px]">
          <span className={cn('font-bold', POSITION_TEXT[p.position])}>{p.position}</span>
          <span>· {p.nflTeam}{kind !== 'redraft' && p.age ? ` · ${p.age}y` : ''} · {p.ppw.toFixed(1)}/wk</span>
          {moving && (p.trend! > 0
            ? <span className={cn('items-center gap-0.5 font-semibold text-emerald-500', roomy ? 'flex' : 'hidden sm:flex')}><TrendingUp className="h-3 w-3" />{p.trend!.toLocaleString()}</span>
            : <span className={cn('items-center gap-0.5 font-semibold text-rose-500', roomy ? 'flex' : 'hidden sm:flex')}><TrendingDown className="h-3 w-3" />{Math.abs(p.trend!).toLocaleString()}</span>)}
        </p>
      </div>
    </motion.li>
  );
}

function SideBlock({ side, team, active, i, row, kind }: { side: FinderSide; team?: FinderTeam; active: boolean; i: number; row: boolean; kind: LeagueKind }) {
  // Two-team sides come in from their own corner; three-team rows rise in turn.
  const from = row ? 0 : i === 0 ? -1 : 1;
  const chip = (good: boolean) => cn('rounded-md px-1.5 py-0.5 tabular-nums',
    good ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground');
  return (
    <motion.div
      className={cn('relative min-w-0 rounded-2xl border border-border bg-background/60 p-2.5 backdrop-blur-sm sm:p-3.5',
        row && 'max-sm:grid max-sm:grid-cols-[6.5rem_1fr] max-sm:gap-3')}
      initial={false}
      animate={active ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: from * 40, y: row ? 24 : 8 }}
      transition={{ type: 'spring', stiffness: 220, damping: 26, delay: 0.1 + i * 0.1 }}>
      <div className={cn('mb-2 flex min-w-0 items-center gap-2', row && 'max-sm:mb-0 max-sm:items-start')}>
        <TeamAvatar team={team} size={26} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{team?.name ?? `Team ${side.rosterId}`}</p>
          <p className="text-[10px] text-muted-foreground">{team?.record}</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className={cn('mb-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground', row && 'max-sm:hidden')}>Gets</p>
        <ul className="space-y-1.5">
          {side.gets.map((p, j) => <PlayerRow key={p.id} p={p} active={active} i={i * 2 + j} from={from} roomy={row} kind={kind} />)}
        </ul>
        <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold sm:text-[11px]">
          <span className={chip(side.lineupDelta > 0.05)}><CountUp to={side.lineupDelta} active={active} decimals={1} /> pts/wk</span>
          <span className={chip(side.marketDelta > 0)}>Value <CountUp to={side.marketDelta} active={active} /></span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Four to six teams in a loop: a row a team, each getting the player the team above it sends (the
 * first gets the last one's), tied together by a line that draws down the chain as it plays in.
 */
function Chain({ trade, teamOf, active }: { trade: FinderTrade; teamOf: Map<number, FinderTeam>; active: boolean }) {
  const n = trade.sides.length;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col justify-center">
      <ol className="relative space-y-1 sm:space-y-2">
        <motion.span aria-hidden className="absolute left-[16px] top-5 bottom-5 w-0.5 origin-top rounded-full bg-gradient-to-b from-primary/70 via-primary/40 to-primary/70 sm:left-[21px]"
          initial={false} animate={{ scaleY: active ? 1 : 0 }} transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }} />
        {trade.sides.map((s, i) => {
          const team = teamOf.get(s.rosterId), from = teamOf.get(trade.sides[(i - 1 + n) % n].rosterId);
          const p = s.gets[0];
          const photo = p.position === 'PICK' ? null : playerPhoto({ playerId: p.id, position: p.position, nflTeam: p.nflTeam });
          return (
            <motion.li key={s.rosterId} className="relative flex min-w-0 items-center gap-2 rounded-xl border border-border bg-background/60 p-1 pr-1.5 backdrop-blur-sm sm:gap-3 sm:p-2 sm:pr-2"
              initial={false} animate={active ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.15 + i * 0.09 }}>
              <span className="relative z-10 ml-0.5 rounded-full ring-4 ring-card sm:ml-0"><TeamAvatar team={team} size={24} /></span>
              <div className="w-[5rem] min-w-0 shrink-0 sm:w-36">
                <p className="truncate text-[11px] font-semibold leading-tight text-foreground sm:text-[13px]">{team?.name ?? `Team ${s.rosterId}`}</p>
                <p className="hidden text-[10px] text-muted-foreground sm:block">{team?.record}</p>
              </div>
              <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border sm:h-8 sm:w-8">
                {photo
                  ? <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-[9px] font-bold text-muted-foreground">{initialsOf(p.name)}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold leading-tight text-foreground sm:text-[13px]">{p.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  <span className={cn('font-bold', POSITION_TEXT[p.position])}>{p.position}</span> · from {from?.name ?? 'the last team'}
                </p>
              </div>
              <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums sm:text-[11px]',
                s.lineupDelta > 0.05 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
                <CountUp to={s.lineupDelta} active={active} decimals={1} />
              </span>
            </motion.li>
          );
        })}
      </ol>
      <p className="mt-2 hidden text-center text-[10px] text-muted-foreground sm:block">Each team gets the player from the one above; points a week in green.</p>
    </div>
  );
}

export default function TradeCard({ trade, teamOf, active, first, kind }: {
  trade: FinderTrade; teamOf: Map<number, FinderTeam>; active: boolean; first: boolean; kind: LeagueKind;
}) {
  const { headline, line } = copyOf(trade, teamOf);
  const tone = toneOf(trade.grade);
  const multi = trade.kind === 'multi', chain = trade.sides.length >= 4;
  const share = async () => {
    const url = `${window.location.origin}/trades`;
    try {
      if (navigator.share) await navigator.share({ title: headline, text: line, url });
      else await navigator.clipboard.writeText(`${headline}. ${line} ${url}`);
    } catch { /* dismissed */ }
  };

  return (
    <section className="relative flex h-full snap-start snap-always flex-col gap-4 overflow-hidden p-4 sm:p-7">
      {/* The grade's glow, rising behind the card as it arrives. */}
      <motion.div aria-hidden className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(120% 70% at 0% 0%, ${tone.glow}, transparent 60%)` }}
        initial={false} animate={{ opacity: active ? 1 : 0 }} transition={{ duration: 0.8 }} />

      <div className="relative flex items-start gap-3 pr-14 sm:gap-4">
        <GradeRing grade={trade.grade} balance={trade.balance} active={active} />
        <motion.div className="min-w-0" initial={false}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }} transition={{ duration: 0.45, ease: 'easeOut' }}>
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {trade.fresh && (
              <span className="tf-shimmer inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary">
                <Sparkles className="h-3 w-3" /> New
              </span>
            )}
            {labelOf(trade) && <span className="text-[9px] font-bold uppercase tracking-widest text-primary">{labelOf(trade)}</span>}
          </div>
          <h2 className="text-base font-bold leading-snug text-foreground sm:text-xl">{headline}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{line}</p>
        </motion.div>
      </div>

      {chain ? <Chain trade={trade} teamOf={teamOf} active={active} /> : (
      <div className={cn('relative grid min-h-0 flex-1 content-center gap-2.5 sm:gap-3', multi ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 gap-x-5 sm:gap-x-8')}>
        {trade.sides.map((s, i) => <SideBlock key={s.rosterId} side={s} team={teamOf.get(s.rosterId)} active={active} i={i} row={multi} kind={kind} />)}
        {!multi && (
          <motion.div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-lg"
            initial={false} animate={active ? { rotate: 180, scale: 1 } : { rotate: 0, scale: 0.6 }}
            transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.35 }}>
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </motion.div>
        )}
      </div>
      )}

      <div className="relative flex items-center justify-between text-xs text-muted-foreground">
        {first
          ? <motion.span className="flex items-center gap-1.5" animate={active ? { y: [0, -4, 0] } : {}} transition={{ duration: 1.4, repeat: 3, delay: 1.2 }}>
              <ArrowLeftRight className="h-3.5 w-3.5 rotate-90" /> Swipe up for the next trade
            </motion.span>
          : <span />}
        <button onClick={share} className="flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 font-medium backdrop-blur hover:text-foreground">
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
      </div>
    </section>
  );
}
