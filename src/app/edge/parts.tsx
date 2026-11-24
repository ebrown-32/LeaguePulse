'use client';

/**
 * The Edge's shared pieces: the research data and what's derived from it once (every player's
 * profile, replacement level), and the small things every tab draws with: a player's face, a
 * matchup chip, a row of game bars, a number with its trend.
 */

import { createContext, useContext, useState } from 'react';
import { initialsOf, playerPhoto } from '@/lib/playerPhoto';
import { cn } from '@/lib/utils';
import { grade, nextMatchup, ordinal, STARTER_RANK, BUST_RANK, type Game, type Player, type Pos, type Profile, type Research, type TeamInfo } from '@/lib/edge/metrics';

export interface EdgeData {
  r: Research;
  byId: Map<string, Player>;
  prof: Map<string, Profile>;
  repl: Record<Pos, number>;
  team: Map<number, TeamInfo>;
  /** The visitor's team here (a roster id), if they've said. */
  mine: number | null;
  setMine: (rosterId: number | null) => void;
  /** Open a player's page. */
  open: (id: string) => void;
  compare: string[];
  toggleCompare: (id: string) => void;
}

export const EdgeCtx = createContext<EdgeData | null>(null);
export function useEdge(): EdgeData {
  const v = useContext(EdgeCtx);
  if (!v) throw new Error('The Edge data is not loaded');
  return v;
}

export const card = 'rounded-2xl border border-border bg-card';
export const label = 'text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground';
export const pct = (x: number | null | undefined, digits = 0) => (x == null ? '' : `${(x * 100).toFixed(digits)}%`);
export const n1 = (x: number | null | undefined) => (x == null ? '' : x.toFixed(1));

export const POS_TINT: Record<Pos, string> = {
  QB: 'bg-rose-500/15 text-rose-700 dark:text-rose-300', RB: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  WR: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', TE: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  K: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', DEF: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
};

export function PosTag({ pos }: { pos: Pos }) {
  return <span className={cn('inline-block w-9 rounded px-1 py-0.5 text-center text-[10px] font-black', POS_TINT[pos])}>{pos}</span>;
}

export function Face({ p, size = 36 }: { p: Pick<Player, 'id' | 'name' | 'pos' | 'team'>; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = playerPhoto({ playerId: p.id, position: p.pos, nflTeam: p.team });
  return (
    <span className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-bold text-muted-foreground" style={{ width: size, height: size }}>
      {initialsOf(p.name)}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && !broken && <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={cn('absolute inset-0 h-full w-full', p.pos === 'DEF' ? 'object-contain p-1' : 'object-cover object-top')} />}
    </span>
  );
}

export function TeamFace({ t, size = 22 }: { t: TeamInfo | undefined; size?: number }) {
  return t?.avatar
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={t.avatar} alt="" width={size} height={size} className="shrink-0 rounded-full bg-muted object-cover" style={{ width: size, height: size }} />
    : <span className="shrink-0 rounded-full bg-muted" style={{ width: size, height: size }} />;
}

const TONE = {
  good: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  ok: 'bg-lime-500/15 text-lime-700 dark:text-lime-300',
  mid: 'bg-muted text-muted-foreground',
  poor: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  bad: 'bg-red-500/15 text-red-700 dark:text-red-300',
} as const;

/** A matchup: the opponent, and how soft it's been for the position ("A" gives up the most). */
export function MatchupChip({ p, week, compact = false }: { p: Pick<Player, 'team' | 'pos'>; week?: number; compact?: boolean }) {
  const { r } = useEdge();
  const m = nextMatchup(r, p, week);
  if (!m) return <span className="text-[11px] text-muted-foreground">-</span>;
  if (m.bye) return <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-bold text-muted-foreground">BYE</span>;
  const g = grade(m.allowed?.rank);
  return (
    <span title={m.allowed ? `${m.opp} gives up ${m.allowed.ppg} a game to ${p.pos}s, ${ordinal(m.allowed.rank)} most` : undefined}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-bold', g ? TONE[g.tone] : TONE.mid)}>
      {!compact && <span className="font-semibold opacity-80">{m.home ? 'vs' : '@'}</span>}{m.opp}
      {g && <span className="font-black">{g.letter}</span>}
    </span>
  );
}

/** A heat colour for a rank among `of`: green at 1, neutral in the middle, red at the bottom. */
export function heat(rank: number | undefined, of: number, strength = 0.42): string | undefined {
  if (!rank || of < 2) return undefined;
  const k = 1 - (rank - 1) / (of - 1); // 1 the best
  const d = (k - 0.5) * 2; // -1 to 1
  if (Math.abs(d) < 0.12) return undefined;
  return d > 0 ? `rgba(16,185,129,${(d * strength).toFixed(3)})` : `rgba(239,68,68,${(-d * strength).toFixed(3)})`;
}

/** A player's games as small bars, weeks left to right, a gap where he didn't play. */
export function Spark({ p, through, height = 22, max }: { p: Pick<Player, 'pos' | 'games'>; through: number; height?: number; max?: number }) {
  const top = max ?? Math.max(10, ...p.games.map(g => g.pts));
  const by = new Map(p.games.map(g => [g.w, g]));
  return (
    <span className="flex items-end gap-[2px]" style={{ height }} aria-hidden>
      {Array.from({ length: through }, (_, i) => {
        const g = by.get(i + 1);
        if (!g) return <span key={i} className="w-[4px] rounded-full bg-muted" style={{ height: 2 }} />;
        return <span key={i} className={cn('w-[4px] rounded-t-[1.5px]', tierClass(p.pos, g))} style={{ height: Math.max(2, (Math.max(0, g.pts) / top) * height) }} />;
      })}
    </span>
  );
}

/** A game's colour by where he finished: a starter's week, a middling one, a bust. */
export function tierClass(pos: Pos, g: Game): string {
  return g.rk <= STARTER_RANK[pos] ? 'bg-primary' : g.rk > BUST_RANK[pos] ? 'bg-red-400/70' : 'bg-foreground/30';
}

export function Trend({ v, digits = 1 }: { v: number; digits?: number }) {
  if (Math.abs(v) < 0.05) return null;
  return <span className={cn('lp-num text-[10.5px] font-bold', v > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{v > 0 ? '+' : ''}{v.toFixed(digits)}</span>;
}

export function InjuryTag({ inj }: { inj?: string }) {
  if (!inj) return null;
  const short = inj === 'Questionable' ? 'Q' : inj === 'Doubtful' ? 'D' : inj === 'Out' ? 'O' : inj === 'IR' ? 'IR' : inj.slice(0, 3).toUpperCase();
  return <span title={inj} className="rounded bg-red-500/15 px-1 py-px text-[9.5px] font-black text-red-700 dark:text-red-300">{short}</span>;
}

/** Whose he is here: a team's face and name, or a free agent. */
export function OwnerTag({ p }: { p: Player }) {
  const { team, mine } = useEdge();
  if (p.owner === null) return <span className="rounded bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Free agent</span>;
  const t = team.get(p.owner);
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold', p.owner === mine ? 'text-primary' : 'text-muted-foreground')}>
      <TeamFace t={t} size={14} /><span className="truncate">{p.owner === mine ? 'Yours' : t?.name ?? 'Rostered'}</span>
    </span>
  );
}

/** A tile: a small label over a big number, a line under. */
export function Tile({ k, v, sub, tone }: { k: string; v: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5">
      <p className={label}>{k}</p>
      <p className={cn('lp-num mt-0.5 text-[20px] font-black leading-tight text-foreground', tone)}>{v}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function PosFilter({ value, onChange, all = true }: { value: Pos | 'ALL' | 'FLEX'; onChange: (v: Pos | 'ALL' | 'FLEX') => void; all?: boolean }) {
  const opts: (Pos | 'ALL' | 'FLEX')[] = [...(all ? ['ALL' as const] : []), 'QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
  return (
    <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Position">
      {opts.map(o => (
        <button key={o} type="button" role="tab" aria-selected={value === o} onClick={() => onChange(o)}
          className={cn('shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition-colors', value === o ? 'bg-foreground text-background' : 'bg-muted/60 text-muted-foreground hover:text-foreground')}>
          {o === 'ALL' ? 'All' : o === 'FLEX' ? 'Flex' : o}
        </button>
      ))}
    </div>
  );
}
export const inPos = (p: Player, f: Pos | 'ALL' | 'FLEX') => f === 'ALL' || (f === 'FLEX' ? p.pos === 'RB' || p.pos === 'WR' || p.pos === 'TE' : p.pos === f);
