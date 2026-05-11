'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeftRight, Gavel, UserPlus, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { cn } from '@/lib/utils';
import type { EnrichedTransaction, PlayerSummary, DraftPickSummary, TransactionsResponse } from '@/app/api/transactions/route';

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  trade:      { label: 'Trade',      Icon: ArrowLeftRight, accent: 'text-amber-400  bg-amber-400/10  border-amber-400/30',  line: 'from-amber-500/80  via-amber-400/40  to-transparent' },
  waiver:     { label: 'Waiver',     Icon: Gavel,          accent: 'text-sky-400    bg-sky-400/10    border-sky-400/30',    line: 'from-sky-500/80    via-sky-400/40    to-transparent' },
  free_agent: { label: 'Free Agent', Icon: UserPlus,       accent: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', line: 'from-emerald-500/80 via-emerald-400/40 to-transparent' },
} as const;

const POS_COLOR: Record<string, string> = {
  QB:  'bg-amber-400/10 text-amber-400 border-amber-400/30',
  RB:  'bg-emerald-400/10 text-emerald-400 border-emerald-400/30',
  WR:  'bg-sky-400/10 text-sky-400 border-sky-400/30',
  TE:  'bg-violet-400/10 text-violet-400 border-violet-400/30',
  K:   'bg-slate-400/10 text-slate-400 border-slate-400/30',
  DEF: 'bg-rose-400/10 text-rose-400 border-rose-400/30',
};

const TYPE_FILTERS = ['All', 'Trades', 'Waivers', 'Free Agents'] as const;
type TypeFilter = typeof TYPE_FILTERS[number];
const TYPE_MAP: Record<TypeFilter, string> = { All: '', Trades: 'trade', Waivers: 'waiver', 'Free Agents': 'free_agent' };

// ── Micro-components ─────────────────────────────────────────────────────────

function PosTag({ pos }: { pos: string }) {
  return (
    <span className={cn('inline-flex items-center rounded border px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide', POS_COLOR[pos] ?? 'bg-muted text-muted-foreground border-border')}>
      {pos}
    </span>
  );
}

function PickTag({ pick }: { pick: DraftPickSummary }) {
  return (
    <span className="inline-flex items-center rounded border border-purple-400/30 bg-purple-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-purple-400">
      &apos;{pick.season.slice(2)} R{pick.round} Pick
    </span>
  );
}

function PlayerRow({ player, variant }: { player: PlayerSummary; variant: 'add' | 'drop' | 'neutral' }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {variant === 'add'     && <TrendingUp   className="h-3 w-3 shrink-0 text-emerald-400" />}
      {variant === 'drop'    && <TrendingDown  className="h-3 w-3 shrink-0 text-rose-400"   />}
      {variant === 'neutral' && <div className="h-3 w-3 shrink-0" />}
      <PosTag pos={player.position} />
      <span className="text-sm font-medium text-foreground leading-none">{player.name}</span>
      <span className="text-[10px] text-muted-foreground/60 font-medium">{player.nflTeam}</span>
    </div>
  );
}

// ── Trade card ───────────────────────────────────────────────────────────────

function TradeCard({ tx }: { tx: EnrichedTransaction }) {
  const [sideA, sideB] = tx.sides;
  if (!sideA || !sideB) return null;

  const aItems = [...sideA.adds, ...sideA.picksIn.map(() => null)];
  const bItems = [...sideB.adds, ...sideB.picksIn.map(() => null)];
  const empty  = aItems.length === 0 && bItems.length === 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="h-px bg-gradient-to-r from-amber-500/80 via-amber-400/40 to-transparent" />
      <div className="flex items-center justify-between px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
            <ArrowLeftRight className="h-2.5 w-2.5" />
            Trade
          </span>
          <span className="text-[10px] text-muted-foreground/60">Wk {tx.week}</span>
        </div>
        <span className="text-[10px] text-muted-foreground/50">
          {formatDistanceToNow(new Date(tx.created), { addSuffix: true })}
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border/50">
        {[sideA, sideB].map(side => (
          <div key={side.rosterId} className="px-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Avatar avatarId={side.avatar} size={20} className="rounded shrink-0" />
              <span className="text-xs font-semibold text-foreground leading-tight line-clamp-1">{side.teamName}</span>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">Gets</p>
            <div className="space-y-0.5">
              {side.adds.map(p => <PlayerRow key={p.id} player={p} variant="neutral" />)}
              {side.picksIn.map((pk, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <div className="h-3 w-3 shrink-0" />
                  <PickTag pick={pk} />
                </div>
              ))}
              {side.adds.length === 0 && side.picksIn.length === 0 && (
                <span className="text-xs text-muted-foreground/30 italic">—</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Extra sides (3-way trades) */}
      {tx.sides.slice(2).map(side => (
        <div key={side.rosterId} className="border-t border-border/40 px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Avatar avatarId={side.avatar} size={20} className="rounded shrink-0" />
            <span className="text-xs font-semibold text-foreground">{side.teamName} also gets</span>
          </div>
          <div className="space-y-0.5">
            {side.adds.map(p => <PlayerRow key={p.id} player={p} variant="neutral" />)}
            {side.picksIn.map((pk, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <div className="h-3 w-3 shrink-0" />
                <PickTag pick={pk} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── FA / Waiver card ─────────────────────────────────────────────────────────

function ActivityCard({ tx }: { tx: EnrichedTransaction }) {
  const cfg  = TYPE_CONFIG[tx.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.free_agent;
  const side = tx.sides[0];
  if (!side) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className={cn('h-px bg-gradient-to-r', cfg.line)} />
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className={cn('inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest', cfg.accent)}>
              <cfg.Icon className="h-2.5 w-2.5" />
              {cfg.label}
            </span>
            {tx.waiverBid !== undefined && tx.waiverBid > 0 && (
              <span className="text-[10px] font-medium text-muted-foreground/70">${tx.waiverBid} bid</span>
            )}
            <span className="text-[10px] text-muted-foreground/60">Wk {tx.week}</span>
          </div>
          <span className="text-[10px] text-muted-foreground/50">
            {formatDistanceToNow(new Date(tx.created), { addSuffix: true })}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-2.5">
          <Avatar avatarId={side.avatar} size={20} className="rounded shrink-0" />
          <span className="text-sm font-semibold text-foreground">{side.teamName}</span>
        </div>
        {side.adds.length > 0 && (
          <div className="space-y-0.5">
            {side.adds.map(p => <PlayerRow key={p.id} player={p} variant="add" />)}
          </div>
        )}
        {side.drops.length > 0 && (
          <div className={cn('space-y-0.5', side.adds.length > 0 && 'mt-1.5 pt-1.5 border-t border-border/40')}>
            {side.drops.map(p => <PlayerRow key={p.id} player={p} variant="drop" />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6">
      {[...Array(3)].map((_, g) => (
        <div key={g} className="space-y-3">
          <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          {[...Array(2)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-16 rounded bg-muted" />
                  <div className="h-3 w-12 rounded bg-muted" />
                </div>
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[0, 1].map(c => (
                  <div key={c} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded bg-muted" />
                      <div className="h-3 w-24 rounded bg-muted" />
                    </div>
                    <div className="h-3 w-28 rounded bg-muted" />
                    <div className="h-3 w-20 rounded bg-muted" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

export default function TransactionsView() {
  const [all,          setAll]         = useState<EnrichedTransaction[]>([]);
  const [seasons,      setSeasons]     = useState<string[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState<string | null>(null);
  const [typeFilter,    setTypeFilter]   = useState<TypeFilter>('All');
  const [seasonFilter,  setSeasonFilter] = useState<string>('all-time');
  const [selectedTeams, setSelectedTeams]= useState<Set<number>>(new Set());

  useEffect(() => {
    fetch('/api/transactions')
      .then(r => r.json())
      .then((d: TransactionsResponse & { error?: string }) => {
        if (d.error) throw new Error(d.error);
        setAll(d.transactions ?? []);
        setSeasons(d.seasons ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Teams available for the current season filter (used to populate pills)
  const availableTeams = useMemo(() => {
    const base = seasonFilter === 'all-time' ? all : all.filter(t => t.season === seasonFilter);
    const map = new Map<number, { rosterId: number; teamName: string; avatar: string }>();
    for (const tx of base) {
      for (const side of tx.sides) {
        if (!map.has(side.rosterId)) {
          map.set(side.rosterId, { rosterId: side.rosterId, teamName: side.teamName, avatar: side.avatar });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [all, seasonFilter]);

  // Season + team filter applied first; type filter is the last layer
  const seasonTeamFiltered = useMemo(() => {
    let txs = all;
    if (seasonFilter !== 'all-time') txs = txs.filter(t => t.season === seasonFilter);
    if (selectedTeams.size > 0) txs = txs.filter(t => t.sides.some(s => selectedTeams.has(s.rosterId)));
    return txs;
  }, [all, seasonFilter, selectedTeams]);

  const filtered = useMemo(() => {
    if (typeFilter === 'All') return seasonTeamFiltered;
    return seasonTeamFiltered.filter(t => t.type === TYPE_MAP[typeFilter]);
  }, [seasonTeamFiltered, typeFilter]);

  // Group by week. Offseason transactions collapse into a single "offseason-{season}" bucket.
  const byGroup = useMemo(() => {
    const map = new Map<string, EnrichedTransaction[]>();
    for (const tx of filtered) {
      const key = tx.isOffseason
        ? `offseason-${tx.season}`
        : seasonFilter === 'all-time'
          ? `${tx.season}-${tx.week}`
          : String(tx.week);
      const list = map.get(key) ?? [];
      list.push(tx);
      map.set(key, list);
    }
    return [...map.entries()].sort(([, a], [, b]) => b[0].created - a[0].created);
  }, [filtered, seasonFilter]);

  // Counts are computed after season + team filter, but before type filter
  const counts = useMemo(() => ({
    All:           seasonTeamFiltered.length,
    Trades:        seasonTeamFiltered.filter(t => t.type === 'trade').length,
    Waivers:       seasonTeamFiltered.filter(t => t.type === 'waiver').length,
    'Free Agents': seasonTeamFiltered.filter(t => t.type === 'free_agent').length,
  }), [seasonTeamFiltered]);

  const groupLabel = (key: string, txs: EnrichedTransaction[]) => {
    const tx = txs[0];
    if (!tx) return key;
    if (tx.isOffseason) return seasonFilter === 'all-time' ? `Offseason · ${tx.season}` : 'Offseason';
    const weekPart = `Week ${tx.week}`;
    return seasonFilter === 'all-time' ? `${weekPart} · ${tx.season}` : weekPart;
  };

  return (
    <div className="space-y-5">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Season selector */}
        <SeasonSelect
          seasons={seasons}
          selectedSeason={seasonFilter}
          onSeasonChange={val => { setSeasonFilter(val); setTypeFilter('All'); setSelectedTeams(new Set()); }}
          className="w-[140px]"
        />

        {/* Divider */}
        <div className="hidden sm:block h-5 w-px bg-border/60" />

        {/* Type filter pills */}
        {TYPE_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
              typeFilter === f
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {f}
            <span className={cn('rounded px-1 py-0.5 text-[9px] font-bold tabular-nums', typeFilter === f ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* Team filter */}
      {availableTeams.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 shrink-0">
            Manager
          </span>
          {availableTeams.map(team => {
            const active = selectedTeams.has(team.rosterId);
            return (
              <button
                key={team.rosterId}
                onClick={() => {
                  setSelectedTeams(prev => {
                    const next = new Set(prev);
                    active ? next.delete(team.rosterId) : next.add(team.rosterId);
                    return next;
                  });
                }}
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
            <button
              onClick={() => setSelectedTeams(new Set())}
              className="text-[11px] font-medium text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loading && <Skeleton />}

      {!loading && error && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{error}</div>
      )}

      {!loading && !error && byGroup.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">No transactions found.</p>
        </div>
      )}

      {!loading && !error && byGroup.map(([key, txs]) => (
        <div key={key} className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              {groupLabel(key, txs)}
            </span>
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-[10px] text-muted-foreground/40">
              {txs.length} transaction{txs.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {txs.map((tx, i) => (
                <motion.div
                  key={tx.transactionId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, delay: i * 0.025 }}
                >
                  {tx.type === 'trade' ? <TradeCard tx={tx} /> : <ActivityCard tx={tx} />}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      ))}
    </div>
  );
}
