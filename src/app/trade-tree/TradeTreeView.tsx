'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import {
  ArrowLeftRight, ChevronDown, TrendingUp, GitBranch, ArrowRight,
  Users, Layers, Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import TeamLink from '@/components/ui/TeamLink';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { cn } from '@/lib/utils';
import type {
  TradeTreeResponse, TradeTreeEntry, TradeSideResult, AssetResult,
} from '@/app/api/trade-tree/route';

// Position colors match the Transactions page for cross-page consistency.
const POS_COLOR: Record<string, string> = {
  QB:  'bg-amber-400/10 text-amber-400 border-amber-400/30',
  RB:  'bg-emerald-400/10 text-emerald-400 border-emerald-400/30',
  WR:  'bg-sky-400/10 text-sky-400 border-sky-400/30',
  TE:  'bg-violet-400/10 text-violet-400 border-violet-400/30',
  K:   'bg-slate-400/10 text-slate-400 border-slate-400/30',
  DEF: 'bg-rose-400/10 text-rose-400 border-rose-400/30',
};

const STATUS_FILTERS = ['All', 'Settled', 'In Progress'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

// ── Micro-components ─────────────────────────────────────────────────────────

function PosTag({ pos }: { pos: string }) {
  return (
    <span className={cn('inline-flex items-center rounded border px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide shrink-0', POS_COLOR[pos] ?? 'bg-muted text-muted-foreground border-border')}>
      {pos}
    </span>
  );
}

function PtsChip({ pts, muted }: { pts: number; muted?: boolean }) {
  return (
    <span className={cn(
      'ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
      !muted && pts > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground/70',
    )}>
      {pts.toFixed(1)}
    </span>
  );
}

/** Neutral status badge: points differential once settled, "In Progress" until then. */
function OutcomeBadge({ trade }: { trade: TradeTreeEntry }) {
  const { status, leaderRosterId, margin } = trade.outcome;
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center rounded border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        In Progress
      </span>
    );
  }
  if (leaderRosterId === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Even
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary"
      title="Points differential since the trade"
    >
      +{margin.toFixed(1)} net
    </span>
  );
}

/** Tiny weekly-points sparkline. Starter weeks get solid dots, bench weeks hollow. */
function Sparkline({ asset }: { asset: AssetResult }) {
  const pts = asset.weekly;
  if (pts.length < 2) return null;
  const W = 220, H = 36, PAD = 4;
  const max = Math.max(...pts.map(p => p.pts), 1);
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (Math.max(0, v) / max) * (H - PAD * 2);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.pts).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[220px] h-9" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary/60" />
      {pts.map((p, i) => (
        <circle
          key={i} cx={x(i)} cy={y(p.pts)} r="2"
          className={p.started ? 'fill-primary' : 'fill-transparent stroke-primary/50'}
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

// ── Journey (the tree branches) ──────────────────────────────────────────────

function JourneyTrail({ asset, onJumpToTrade }: { asset: AssetResult; onJumpToTrade: (id: string) => void }) {
  if (asset.journey.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
        <span className="h-[11px] w-[11px] shrink-0 rounded-full border-2 border-primary bg-background" />
        {asset.fate}
      </div>
    );
  }
  return (
    <div className="relative pl-[5px]">
      <div className="absolute left-[10px] top-2 bottom-2 w-px bg-border/60" />
      <ul className="space-y-1.5">
        {asset.journey.map((e, i) => (
          <li key={i} className="relative flex items-start gap-2.5 text-[11px] leading-tight">
            <span className={cn(
              'relative z-10 mt-0.5 flex h-[11px] w-[11px] shrink-0 items-center justify-center rounded-full border-2 bg-background',
              e.kind === 'traded' ? 'border-primary' : 'border-muted-foreground/50',
            )} />
            <span className="text-muted-foreground">
              {e.kind === 'traded' && (
                <>
                  Traded to <span className="text-foreground font-medium">{e.toTeam ?? '?'}</span>
                </>
              )}
              {e.kind === 'dropped' && <>Dropped by <span className="text-foreground font-medium">{e.fromTeam ?? '?'}</span></>}
              {(e.kind === 'waived' || e.kind === 'signed') && <>Picked up by <span className="text-foreground font-medium">{e.toTeam ?? '?'}</span></>}
              <span className="text-muted-foreground/50">
                {' '}· {e.isOffseason ? `'${e.season.slice(2)} offseason` : `Wk ${e.week} '${e.season.slice(2)}`}
              </span>
              {e.tradeId && (
                <button
                  onClick={() => onJumpToTrade(e.tradeId!)}
                  className="ml-1.5 inline-flex items-center gap-0.5 text-primary/80 hover:text-primary font-medium transition-colors"
                >
                  follow branch <ArrowRight className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          </li>
        ))}
        <li className="relative flex items-start gap-2.5 text-[11px] leading-tight">
          <span className={cn(
            'relative z-10 mt-0.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 bg-background',
            asset.stillHeld ? 'border-primary' : 'border-muted-foreground/40',
          )} />
          <span className="text-muted-foreground/70 italic">{asset.fate}</span>
        </li>
      </ul>
    </div>
  );
}

// ── Asset rows ───────────────────────────────────────────────────────────────

function AssetRow({ asset }: { asset: AssetResult }) {
  const p = asset.player;
  return (
    <div className="flex items-center gap-2 py-0.5 min-w-0">
      {asset.kind === 'pick' && (
        <span className="inline-flex items-center rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary shrink-0">
          &apos;{asset.pick!.season.slice(2)} R{asset.pick!.round}
        </span>
      )}
      {asset.kind === 'pick' && p && <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
      {p ? (
        <>
          <PosTag pos={p.position} />
          <span className="truncate text-sm font-medium text-foreground leading-none">{p.name}</span>
        </>
      ) : (
        <span className="text-xs italic text-muted-foreground/50">
          {asset.pick?.status === 'pending' ? 'not drafted yet'
            : asset.journey.length > 0 ? 'traded onward'
            : 'untraceable'}
        </span>
      )}
      <PtsChip pts={asset.totalPoints} muted={!p} />
    </div>
  );
}

function AssetDetail({ asset, onJumpToTrade }: { asset: AssetResult; onJumpToTrade: (id: string) => void }) {
  const p = asset.player;
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {asset.kind === 'pick' && asset.pick && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
            {asset.pick.season} Round {asset.pick.round}
            {asset.pick.pickNo != null && ` · Pick ${asset.pick.pickNo}`}
            {p && ' became'}
          </span>
        )}
        {p && (
          <span className="flex items-center gap-1.5">
            <PosTag pos={p.position} />
            <span className="text-sm font-semibold text-foreground">{p.name}</span>
            <span className="text-[10px] text-muted-foreground/60">{p.nflTeam}</span>
          </span>
        )}
        {!p && asset.pick?.became && (
          <span className="text-[10px] italic text-muted-foreground/50">
            eventually became {asset.pick.became.name}, for another team
          </span>
        )}
      </div>

      {asset.gamesRostered > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground/70 tabular-nums">
          <span><span className="font-bold text-foreground">{asset.totalPoints.toFixed(1)}</span> pts since trade</span>
          <span><span className="font-bold text-foreground">{asset.gamesStarted}</span>/{asset.gamesRostered} wks started</span>
          {asset.gamesStarted > 0 && (
            <span><span className="font-bold text-foreground">{(asset.starterPoints / asset.gamesStarted).toFixed(1)}</span> ppg as starter</span>
          )}
        </div>
      )}

      <Sparkline asset={asset} />

      <div>
        <p className="mb-1.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
          <GitBranch className="h-2.5 w-2.5" /> Branch
        </p>
        <JourneyTrail asset={asset} onJumpToTrade={onJumpToTrade} />
      </div>
    </div>
  );
}

// ── Differential bar ─────────────────────────────────────────────────────────

function DifferentialBar({ trade }: { trade: TradeTreeEntry }) {
  const [a, b] = trade.sides;
  if (!a || !b) return null;
  const total = a.totalPoints + b.totalPoints;
  const aShare = total > 0 ? a.totalPoints / total : 0.5;
  const { status, leaderRosterId, margin } = trade.outcome;
  const settled = status === 'settled';
  const leader = trade.sides.find(s => s.rosterId === leaderRosterId);

  return (
    <div className="px-4 pb-3.5">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <motion.div
          initial={{ width: '50%' }}
          animate={{ width: `${Math.max(4, Math.min(96, aShare * 100))}%` }}
          transition={{ type: 'spring', bounce: 0.2, duration: 0.9 }}
          className={cn('h-full', settled && leaderRosterId === a.rosterId ? 'bg-primary/80' : 'bg-muted-foreground/30')}
        />
        <div className={cn('h-full flex-1', settled && leaderRosterId === b.rosterId ? 'bg-primary/80' : 'bg-muted-foreground/20')} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] tabular-nums">
        <span className={cn('font-bold', leaderRosterId === a.rosterId ? 'text-foreground' : 'text-muted-foreground/60')}>
          {a.totalPoints.toFixed(1)}
        </span>
        <span className="font-medium text-muted-foreground/50">
          {!settled
            ? 'return still in progress'
            : leader
              ? <>{leader.teamName} ahead by <span className="font-bold text-foreground/80">{margin.toFixed(1)}</span></>
              : 'dead level'}
        </span>
        <span className={cn('font-bold', leaderRosterId === b.rosterId ? 'text-foreground' : 'text-muted-foreground/60')}>
          {b.totalPoints.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

// ── Trade card ───────────────────────────────────────────────────────────────

function TradeSidePanel({ side }: { side: TradeSideResult }) {
  return (
    <div className="px-4 pb-3 min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <TeamLink userId={side.userId} teamName={side.teamName} avatar={side.avatar} avatarSize={20} className="min-w-0" textClassName="text-xs font-semibold text-foreground leading-tight" />
        <span className="shrink-0 text-[10px] font-bold tabular-nums text-muted-foreground/70">
          {side.totalPoints.toFixed(1)} pts
        </span>
      </div>
      <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Gets</p>
      <div className="space-y-0.5">
        {side.assets.map((a, i) => <AssetRow key={i} asset={a} />)}
      </div>
    </div>
  );
}

function TradeCard({ trade, highlighted, onJumpToTrade }: {
  trade: TradeTreeEntry;
  highlighted: boolean;
  onJumpToTrade: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sideA, sideB] = trade.sides;
  if (!sideA || !sideB) return null;

  return (
    <div
      id={`trade-${trade.transactionId}`}
      className={cn(
        'rounded-xl border bg-card overflow-hidden transition-all duration-500 scroll-mt-24',
        highlighted ? 'border-primary ring-2 ring-primary/40' : 'border-border',
      )}
    >
      <div className="h-px" style={{ background: 'var(--tx-trade-grad)' }} />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <OutcomeBadge trade={trade} />
          <span className="text-[10px] text-muted-foreground/60">
            {trade.isOffseason ? 'Offseason' : `Wk ${trade.week}`} · {trade.season}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/50">{format(new Date(trade.created), 'MMM d, yyyy')}</span>
      </div>

      {/* Sides */}
      <div className="grid grid-cols-2 divide-x divide-border/50">
        <TradeSidePanel side={sideA} />
        <TradeSidePanel side={sideB} />
      </div>
      {trade.sides.slice(2).map(side => (
        <div key={side.rosterId} className="border-t border-border/40">
          <div className="pt-3">
            <TradeSidePanel side={side} />
          </div>
        </div>
      ))}

      <DifferentialBar trade={trade} />

      {/* Expand: the tree */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-border/40 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-primary hover:bg-primary/5 transition-colors"
      >
        <GitBranch className="h-3 w-3" />
        {open ? 'Hide the tree' : 'Trace the tree'}
        <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 border-t border-border/40 bg-muted/20 p-4 sm:grid-cols-2">
              {trade.sides.map(side => (
                <div key={side.rosterId} className="space-y-2 min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
                    {side.teamName}&apos;s return
                  </p>
                  {side.assets.map((a, i) => (
                    <AssetDetail key={i} asset={a} onJumpToTrade={onJumpToTrade} />
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Ledger stats ─────────────────────────────────────────────────────────────

function StatTile({ icon: Icon, label, value, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
        <Icon className="h-3 w-3 text-primary/70" />
        {label}
      </div>
      <p className="text-xl font-bold tabular-nums text-foreground leading-none">{value}</p>
      {sub && <p className="mt-1 truncate text-[10px] text-muted-foreground/60">{sub}</p>}
    </div>
  );
}

function TradeLedger({ trades }: { trades: TradeTreeEntry[] }) {
  const stats = useMemo(() => {
    const players = new Set<string>();
    let picks = 0;
    const byManager = new Map<string, { teamName: string; count: number }>();
    for (const t of trades) {
      for (const s of t.sides) {
        const entry = byManager.get(s.userId) ?? { teamName: s.teamName, count: 0 };
        entry.count += 1;
        entry.teamName = s.teamName;
        byManager.set(s.userId, entry);
        for (const a of s.assets) {
          if (a.kind === 'player' && a.player) players.add(a.player.id);
          else if (a.kind === 'pick') picks += 1;
        }
      }
    }
    const mostActive = [...byManager.values()].sort((a, b) => b.count - a.count)[0];
    return { total: trades.length, players: players.size, picks, mostActive };
  }, [trades]);

  if (stats.total === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile icon={ArrowLeftRight} label="Trades all-time" value={String(stats.total)} />
      <StatTile icon={Users} label="Players moved" value={String(stats.players)} />
      <StatTile icon={Layers} label="Picks moved" value={String(stats.picks)} />
      <StatTile
        icon={Activity}
        label="Most active"
        value={stats.mostActive ? String(stats.mostActive.count) : '-'}
        sub={stats.mostActive?.teamName}
      />
    </div>
  );
}

// ── Largest point swings ─────────────────────────────────────────────────────

function LargestSwings({ trades, onJumpToTrade }: { trades: TradeTreeEntry[]; onJumpToTrade: (id: string) => void }) {
  const swings = useMemo(() =>
    trades
      .filter(t => t.outcome.status === 'settled' && t.outcome.leaderRosterId !== null)
      .sort((a, b) => b.outcome.margin - a.outcome.margin)
      .slice(0, 3),
    [trades]);

  if (swings.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          <TrendingUp className="h-3 w-3 text-primary/70" /> Largest Point Swings
        </span>
        <div className="h-px flex-1 bg-border/40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {swings.map((t, i) => {
          const leader = t.sides.find(s => s.rosterId === t.outcome.leaderRosterId)!;
          const other = t.sides.find(s => s.rosterId !== t.outcome.leaderRosterId)!;
          const best = [...leader.assets].sort((a, b) => b.totalPoints - a.totalPoints)[0];
          return (
            <motion.button
              key={t.transactionId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => onJumpToTrade(t.transactionId)}
              className="group rounded-xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40"
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">#{i + 1}</span>
                <span className="text-[10px] text-muted-foreground/50">{t.isOffseason ? 'Off.' : `Wk ${t.week}`} &apos;{t.season.slice(2)}</span>
              </div>
              <div className="mb-1 flex items-center gap-2 min-w-0">
                <Avatar avatarId={leader.avatar} size={22} className="rounded shrink-0" />
                <span className="truncate text-sm font-semibold text-foreground">{leader.teamName}</span>
              </div>
              <p className="mb-2.5 truncate text-[11px] text-muted-foreground/70">
                vs {other.teamName}
              </p>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xl font-bold tabular-nums text-foreground">
                  +{t.outcome.margin.toFixed(0)}
                  <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50">pts</span>
                </span>
                {best?.player && (
                  <span className="truncate text-[10px] text-muted-foreground/60">landed {best.player.name}</span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl border border-border bg-card animate-pulse" />)}
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse">
          <div className="flex justify-between"><div className="h-5 w-28 rounded bg-muted" /><div className="h-3 w-20 rounded bg-muted" /></div>
          <div className="grid grid-cols-2 gap-4">
            {[0, 1].map(c => (
              <div key={c} className="space-y-2">
                <div className="h-5 w-32 rounded bg-muted" />
                <div className="h-3 w-40 rounded bg-muted" />
                <div className="h-3 w-24 rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

export default function TradeTreeView() {
  const [trades,  setTrades]  = useState<TradeTreeEntry[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [seasonFilter, setSeasonFilter] = useState('all-time');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    fetch('/api/trade-tree')
      .then(r => r.json())
      .then((d: TradeTreeResponse & { error?: string }) => {
        if (d.error) throw new Error(d.error);
        setTrades(d.trades ?? []);
        setSeasons(d.seasons ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  // Deep-link into another trade card from a journey branch, wherever it is in the list
  const jumpToTrade = useCallback((transactionId: string) => {
    setSeasonFilter('all-time');
    setStatusFilter('All');
    setSelectedTeams(new Set());
    setHighlightId(transactionId);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2500);
    // Let filters re-render before scrolling
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(`trade-${transactionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }, []);

  const availableTeams = useMemo(() => {
    const base = seasonFilter === 'all-time' ? trades : trades.filter(t => t.season === seasonFilter);
    const map = new Map<string, { userId: string; teamName: string; avatar: string }>();
    for (const t of base) for (const s of t.sides) {
      if (s.userId && !map.has(s.userId)) map.set(s.userId, { userId: s.userId, teamName: s.teamName, avatar: s.avatar });
    }
    return [...map.values()].sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [trades, seasonFilter]);

  const matchesStatus = useCallback((t: TradeTreeEntry, f: StatusFilter) =>
    f === 'All' || (f === 'Settled' ? t.outcome.status === 'settled' : t.outcome.status === 'pending'),
  []);

  const filtered = useMemo(() => {
    let list = trades;
    if (seasonFilter !== 'all-time') list = list.filter(t => t.season === seasonFilter);
    if (selectedTeams.size > 0) list = list.filter(t => t.sides.some(s => selectedTeams.has(s.userId)));
    return list.filter(t => matchesStatus(t, statusFilter));
  }, [trades, seasonFilter, selectedTeams, statusFilter, matchesStatus]);

  const bySeason = useMemo(() => {
    const map = new Map<string, TradeTreeEntry[]>();
    for (const t of filtered) {
      const list = map.get(t.season) ?? [];
      list.push(t);
      map.set(t.season, list);
    }
    return [...map.entries()].sort(([a], [b]) => Number(b) - Number(a));
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const base = trades
      .filter(t => seasonFilter === 'all-time' || t.season === seasonFilter)
      .filter(t => selectedTeams.size === 0 || t.sides.some(s => selectedTeams.has(s.userId)));
    return Object.fromEntries(
      STATUS_FILTERS.map(f => [f, base.filter(t => matchesStatus(t, f)).length])
    ) as Record<StatusFilter, number>;
  }, [trades, seasonFilter, selectedTeams, matchesStatus]);

  return (
    <div className="space-y-6">
      {loading && <Skeleton />}

      {!loading && error && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{error}</div>
      )}

      {!loading && !error && (
        <>
          <TradeLedger trades={trades} />
          <LargestSwings trades={trades} onJumpToTrade={jumpToTrade} />

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <SeasonSelect
              seasons={seasons}
              selectedSeason={seasonFilter}
              onSeasonChange={val => { setSeasonFilter(val); setSelectedTeams(new Set()); }}
              className="w-[140px]"
            />
            <div className="hidden sm:block h-5 w-px bg-border/60" />
            {STATUS_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                  statusFilter === f
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {f}
                <span className={cn('rounded px-1 py-0.5 text-[9px] font-bold tabular-nums', statusFilter === f ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
                  {statusCounts[f]}
                </span>
              </button>
            ))}
          </div>

          {/* Manager filter */}
          {availableTeams.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 shrink-0">Manager</span>
              {availableTeams.map(team => {
                const active = selectedTeams.has(team.userId);
                return (
                  <button
                    key={team.userId}
                    onClick={() => setSelectedTeams(prev => {
                      const next = new Set(prev);
                      active ? next.delete(team.userId) : next.add(team.userId);
                      return next;
                    })}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      active
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80',
                    )}
                  >
                    <Avatar avatarId={team.avatar} size={16} className="rounded-full shrink-0" />
                    {team.teamName}
                  </button>
                );
              })}
              {selectedTeams.size > 0 && (
                <button onClick={() => setSelectedTeams(new Set())} className="text-[11px] font-medium text-muted-foreground/60 hover:text-foreground transition-colors">
                  Clear
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <ArrowLeftRight className="mx-auto mb-3 h-6 w-6 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No trades here yet.</p>
            </div>
          )}

          {/* Season timeline */}
          {bySeason.map(([season, list]) => (
            <div key={season} className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{season} Season</span>
                <div className="h-px flex-1 bg-border/40" />
                <span className="text-[10px] text-muted-foreground/40">{list.length} trade{list.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="relative space-y-3 pl-5 sm:pl-6">
                <div className="absolute left-[7px] sm:left-[9px] top-3 bottom-3 w-px bg-border" />
                <AnimatePresence initial={false}>
                  {list.map((trade, i) => (
                    <motion.div
                      key={trade.transactionId}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(i * 0.03, 0.3) }}
                      className="relative"
                    >
                      <span className="absolute -left-5 sm:-left-6 top-5 flex h-[15px] w-[15px] items-center justify-center">
                        <span className="h-2 w-2 rounded-full bg-primary/60 ring-4 ring-background" />
                      </span>
                      <TradeCard trade={trade} highlighted={highlightId === trade.transactionId} onJumpToTrade={jumpToTrade} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
