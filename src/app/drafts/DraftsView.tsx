'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { CalendarDays, Clock, Users, Layers, Trophy, Star, Zap } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import type { EnrichedDraft, DraftPickEnriched, DraftTeamSlot, TradedFuturePick, DraftsResponse } from '@/app/api/drafts/route';

// ── Position styling ──────────────────────────────────────────────────────────

const POS_STYLE: Record<string, string> = {
  QB:  'bg-foreground/8 text-foreground/60 border-foreground/12',
  RB:  'bg-foreground/8 text-foreground/60 border-foreground/12',
  WR:  'bg-foreground/8 text-foreground/60 border-foreground/12',
  TE:  'bg-foreground/8 text-foreground/60 border-foreground/12',
  K:   'bg-foreground/8 text-foreground/60 border-foreground/12',
  DEF: 'bg-foreground/8 text-foreground/60 border-foreground/12',
  DST: 'bg-foreground/8 text-foreground/60 border-foreground/12',
};

const POS_DOT: Record<string, string> = {
  QB:  'bg-foreground/30',
  RB:  'bg-foreground/30',
  WR:  'bg-foreground/30',
  TE:  'bg-foreground/30',
  K:   'bg-foreground/30',
  DEF: 'bg-foreground/30',
  DST: 'bg-foreground/30',
};

function posStyle(pos: string) {
  return POS_STYLE[pos] ?? 'bg-muted/40 text-muted-foreground border-border';
}

// ── Countdown ─────────────────────────────────────────────────────────────────

function getTimeLeft(targetMs: number) {
  const diff = Math.max(0, targetMs - Date.now());
  const totalSec = Math.floor(diff / 1000);
  return {
    days:    Math.floor(totalSec / 86400),
    hours:   Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

function Countdown({ targetMs }: { targetMs: number }) {
  const [tl, setTl] = useState(getTimeLeft(targetMs));
  useEffect(() => {
    const id = setInterval(() => setTl(getTimeLeft(targetMs)), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  const segments = [
    { label: 'Days',    val: tl.days    },
    { label: 'Hours',   val: tl.hours   },
    { label: 'Minutes', val: tl.minutes },
    { label: 'Seconds', val: tl.seconds },
  ];

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent p-8 text-center">
      <div className="flex items-center justify-center gap-2 mb-5">
        <Clock className="h-4 w-4 text-primary" />
        <p className="text-xs font-bold uppercase tracking-widest text-primary/70">Draft Begins In</p>
      </div>
      <div className="flex items-center justify-center gap-4 sm:gap-8">
        {segments.map(({ label, val }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span className="font-display text-4xl sm:text-5xl font-bold text-foreground tabular-nums leading-none">
              {String(val).padStart(2, '0')}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Draft board cell ──────────────────────────────────────────────────────────

function SinglePick({ pick, colSlot }: { pick: DraftPickEnriched; colSlot: number }) {
  const wasTraded = pick.slot !== colSlot;
  return (
    <div className="relative p-2 min-h-[72px] flex flex-col justify-between">
      {pick.isKeeper && (
        <span className="absolute top-1.5 right-1.5 text-[7px] font-black uppercase tracking-wide bg-foreground/10 text-foreground/50 border border-foreground/15 px-1 py-0.5 rounded">
          K
        </span>
      )}
      {wasTraded && !pick.isKeeper && (
        <span className="absolute top-1.5 right-1.5 text-[7px] font-bold text-primary/50 tabular-nums">
          ↙{pick.slot}
        </span>
      )}
      <div>
        <span className={cn('inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide border', posStyle(pick.position))}>
          {pick.position}
        </span>
        <p className="mt-1 text-[11px] font-semibold text-foreground leading-tight line-clamp-2">
          {pick.playerName}
        </p>
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-[9px] text-muted-foreground/50 font-medium">{pick.nflTeam}</span>
        <span className="text-[8px] text-muted-foreground/25 tabular-nums">#{pick.pickNo}</span>
      </div>
    </div>
  );
}

function PickCell({
  picks,
  tradedToTeam,
  colSlot,
  dimmed,
  onHover,
}: {
  picks: DraftPickEnriched[];
  tradedToTeam: DraftTeamSlot | null;
  colSlot: number;
  dimmed: boolean;
  onHover: (slot: number | null) => void;
}) {
  if (picks.length === 0) {
    return (
      <div
        className="border-r border-b border-border/20 min-h-[72px] flex flex-col items-center justify-center gap-1 p-1.5"
        onMouseEnter={() => onHover(colSlot)}
        onMouseLeave={() => onHover(null)}
      >
        {tradedToTeam ? (
          <>
            <span className="text-[8px] font-bold uppercase tracking-wide text-muted-foreground/30">Traded to</span>
            <Avatar avatarId={tradedToTeam.avatar || null} size={20} className="rounded shrink-0" />
            <span className="text-[9px] text-muted-foreground/50 text-center leading-tight line-clamp-2 max-w-[90px]">
              {tradedToTeam.teamName}
            </span>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/15 select-none">—</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border-r border-b border-border/20 flex flex-col divide-y divide-border/15 transition-opacity duration-150 cursor-default',
        dimmed ? 'opacity-15' : 'opacity-100',
      )}
      onMouseEnter={() => onHover(colSlot)}
      onMouseLeave={() => onHover(null)}
    >
      {picks.map(pick => (
        <SinglePick key={pick.pickNo} pick={pick} colSlot={colSlot} />
      ))}
    </div>
  );
}

// ── Draft board ───────────────────────────────────────────────────────────────

function DraftBoard({ draft }: { draft: EnrichedDraft }) {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);

  // Map rosterId → the slot column that team occupies on the board
  const rosterIdToSlot = useMemo(
    () => new Map(draft.slots.map(s => [s.rosterId, s.slot])),
    [draft.slots],
  );

  // Build lookup: picksByCell[round][colSlot] = DraftPickEnriched[]
  // Picks are placed in the RECEIVING team's column (not the original draft_slot),
  // so traded picks move to the correct team's column.
  const picksByCell = useMemo(() => {
    const map: Record<number, Record<number, DraftPickEnriched[]>> = {};
    for (const pick of draft.picks) {
      const colSlot = rosterIdToSlot.get(pick.rosterId) ?? pick.slot;
      if (!map[pick.round]) map[pick.round] = {};
      if (!map[pick.round][colSlot]) map[pick.round][colSlot] = [];
      map[pick.round][colSlot].push(pick);
    }
    return map;
  }, [draft.picks, rosterIdToSlot]);

  // For each traded-away cell, record which slot's column received the pick
  // so we can render "Traded to [team avatar]" instead of a bare dash.
  const tradedAwayCells = useMemo(() => {
    const map = new Map<string, number>(); // `${round}-${originalSlot}` → receivingColSlot
    for (const pick of draft.picks) {
      const colSlot = rosterIdToSlot.get(pick.rosterId) ?? pick.slot;
      if (colSlot !== pick.slot) {
        map.set(`${pick.round}-${pick.slot}`, colSlot);
      }
    }
    return map;
  }, [draft.picks, rosterIdToSlot]);

  const slotBySlotNum = useMemo(
    () => new Map(draft.slots.map(s => [s.slot, s])),
    [draft.slots],
  );

  const colMinPx = 118;
  const labelColPx = 52;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: draft.teams * colMinPx + labelColPx }}>
          {/* Column headers */}
          <div
            className="grid border-b border-border bg-card/80 sticky top-0 z-10"
            style={{ gridTemplateColumns: `${labelColPx}px repeat(${draft.teams}, minmax(${colMinPx}px, 1fr))` }}
          >
            <div className="border-r border-border/30" />
            {draft.slots.map(slot => (
              <button
                key={slot.slot}
                className={cn(
                  'flex flex-col items-center gap-1 py-3 px-2 border-r border-border/30 transition-colors cursor-pointer',
                  hoveredSlot === slot.slot
                    ? 'bg-primary/8'
                    : 'hover:bg-accent/50',
                )}
                onMouseEnter={() => setHoveredSlot(slot.slot)}
                onMouseLeave={() => setHoveredSlot(null)}
              >
                <Avatar avatarId={slot.avatar || null} size={24} className="rounded shrink-0" />
                <span className="text-[10px] font-semibold text-center text-foreground leading-tight max-w-[100px] truncate">
                  {slot.teamName}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/35">
                  #{slot.slot}
                </span>
              </button>
            ))}
          </div>

          {/* Round rows */}
          {Array.from({ length: draft.rounds }, (_, i) => i + 1).map(round => (
            <div
              key={round}
              className={cn(
                'grid',
                round % 2 === 0 ? 'bg-muted/10' : '',
              )}
              style={{ gridTemplateColumns: `${labelColPx}px repeat(${draft.teams}, minmax(${colMinPx}px, 1fr))` }}
            >
              {/* Round label */}
              <div className="border-r border-b border-border/20 flex items-center justify-center min-h-[72px]">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                  R{round}
                </span>
              </div>
              {draft.slots.map(slot => {
                const receivingColSlot = tradedAwayCells.get(`${round}-${slot.slot}`) ?? null;
                const tradedToTeam = receivingColSlot !== null ? (slotBySlotNum.get(receivingColSlot) ?? null) : null;
                return (
                  <PickCell
                    key={slot.slot}
                    picks={picksByCell[round]?.[slot.slot] ?? []}
                    tradedToTeam={tradedToTeam}
                    colSlot={slot.slot}
                    dimmed={hoveredSlot !== null && hoveredSlot !== slot.slot}
                    onHover={setHoveredSlot}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Team pick cards ───────────────────────────────────────────────────────────

function TeamPickCard({ slot }: { slot: DraftTeamSlot }) {
  const [open, setOpen] = useState(false);

  const byPos: Record<string, DraftPickEnriched[]> = {};
  for (const p of slot.picks) {
    (byPos[p.position] = byPos[p.position] ?? []).push(p);
  }

  if (slot.picks.length === 0 && !slot.teamName) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
      >
        <Avatar avatarId={slot.avatar || null} size={32} className="rounded shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{slot.teamName}</p>
          <p className="text-[10px] text-muted-foreground/50 font-medium">Slot {slot.slot} · {slot.picks.length} picks</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {Object.entries(byPos).slice(0, 4).map(([pos, picks]) => (
            <span key={pos} className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase border', posStyle(pos))}>
              {picks.length}{pos}
            </span>
          ))}
        </div>
        <span className="text-muted-foreground/50 ml-2 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border/40"
          >
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {slot.picks.map(pick => (
                <div
                  key={pick.pickNo}
                  className={cn(
                    'rounded-lg border p-2.5 flex flex-col gap-1 relative',
                    posStyle(pick.position).replace('text-', 'border-').replace('/15', '/20').replace('bg-', 'bg-').split(' ')[0],
                    'bg-card border-border/50',
                  )}
                >
                  {pick.isKeeper && (
                    <span className="absolute top-1.5 right-1.5 text-[7px] font-black uppercase bg-foreground/10 text-foreground/50 border border-foreground/15 px-1 py-0.5 rounded">K</span>
                  )}
                  <span className={cn('inline-flex w-fit items-center rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide border', posStyle(pick.position))}>
                    {pick.position}
                  </span>
                  <p className="text-[11px] font-semibold text-foreground leading-tight">{pick.playerName}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-muted-foreground/50">{pick.nflTeam}</span>
                    <span className="text-[8px] text-muted-foreground/30">Rd {pick.round}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function DraftStats({ draft }: { draft: EnrichedDraft }) {
  const picks = draft.picks;
  if (picks.length === 0) return null;

  const firstOverall = picks.find(p => p.pickNo === 1);

  const posCounts = picks.reduce<Record<string, number>>((acc, p) => {
    acc[p.position] = (acc[p.position] ?? 0) + 1;
    return acc;
  }, {});

  const topPos = Object.entries(posCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

  const keeperCount = picks.filter(p => p.isKeeper).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {firstOverall && (
        <div className="rounded-xl border border-border bg-card p-4 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 mb-2">
            <Trophy className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">#1 Overall</span>
          </div>
          <p className="text-sm font-bold text-foreground">{firstOverall.playerName}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn('rounded px-1 py-0.5 text-[9px] font-bold uppercase border', posStyle(firstOverall.position))}>
              {firstOverall.position}
            </span>
            <span className="text-[10px] text-muted-foreground/50">{firstOverall.teamName}</span>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Picks Made</span>
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{picks.length}</p>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">of {draft.rounds * draft.teams}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">By Position</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {topPos.map(([pos, count]) => (
            <span key={pos} className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase border', posStyle(pos))}>
              {count} {pos}
            </span>
          ))}
        </div>
      </div>

      {keeperCount > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Star className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Keepers</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums">{keeperCount}</p>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">pre-set picks</p>
        </div>
      )}
    </div>
  );
}

// ── Position legend ───────────────────────────────────────────────────────────

function PosLegend() {
  const items = [
    { pos: 'QB', label: 'Quarterback' },
    { pos: 'RB', label: 'Running Back' },
    { pos: 'WR', label: 'Wide Receiver' },
    { pos: 'TE', label: 'Tight End' },
    { pos: 'K',  label: 'Kicker' },
    { pos: 'DEF', label: 'Defense' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 shrink-0">Legend</span>
      {items.map(({ pos, label }) => (
        <div key={pos} className="flex items-center gap-1.5">
          <div className={cn('h-2 w-2 rounded-full', POS_DOT[pos] ?? 'bg-muted')} />
          <span className="text-[10px] text-muted-foreground/60 font-medium">{pos} <span className="text-muted-foreground/30">·</span> {label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Upcoming draft pick ownership board ───────────────────────────────────────


// Overall pick number for a snake draft at (round, slot, numTeams).
function snakePickNo(round: number, slot: number, numTeams: number): number {
  const isRightToLeft = round % 2 === 0;
  const posInRound    = isRightToLeft ? numTeams - slot + 1 : slot;
  return (round - 1) * numTeams + posInRound;
}

interface EffectivePick {
  userId: string;
  teamName: string;
  avatar: string;
  tradedFrom?: { teamName: string; avatar: string };
}

function UpcomingDraftBoard({ draft }: { draft: EnrichedDraft }) {
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);

  const slotBySlotNum = useMemo(
    () => new Map(draft.slots.map(s => [s.slot, s])),
    [draft.slots],
  );

  // Build effective ownership: for each (round, slot) → who actually picks there
  const effectiveMatrix = useMemo(() => {
    const matrix: Record<number, Record<number, EffectivePick>> = {};

    for (let r = 1; r <= draft.rounds; r++) {
      matrix[r] = {};
      for (const slot of draft.slots) {
        matrix[r][slot.slot] = { userId: slot.userId, teamName: slot.teamName, avatar: slot.avatar };
      }
    }

    for (const tp of draft.tradedFuturePicks ?? []) {
      const r = tp.round;
      if (!matrix[r]) continue;
      const toSlotTeam = slotBySlotNum.get(tp.toSlot);
      const fromSlotTeam = slotBySlotNum.get(tp.fromSlot);
      // The pick AT the from-slot position is now owned by the to-team
      matrix[r][tp.fromSlot] = {
        userId:     toSlotTeam?.userId ?? '',
        teamName:   tp.toTeamName,
        avatar:     tp.toAvatar,
        tradedFrom: { teamName: tp.fromTeamName, avatar: tp.fromAvatar },
      };
      // The to-slot keeps their own pick; mark it as "also has received pick" via tradedFrom on fromSlot only
      // (no change to matrix[r][tp.toSlot] — their own pick stays as-is)
      void fromSlotTeam; // suppress unused warning
    }

    return matrix;
  }, [draft, slotBySlotNum]);

  const colMinPx   = 112;
  const labelColPx = 52;
  const isSnake    = draft.type !== 'linear';
  const tradeCount = (draft.tradedFuturePicks ?? []).length;

  if (draft.slots.length === 0 || !draft.orderSet) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Draft Board</h3>
        <div className="flex-1 h-px bg-border/40" />
        {tradeCount > 0 && (
          <span className="text-[10px] text-muted-foreground/50 font-semibold">{tradeCount} traded pick{tradeCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: draft.teams * colMinPx + labelColPx }}>
            {/* Column headers — original slot positions */}
            <div
              className="grid border-b border-border bg-card/80 sticky top-0 z-10"
              style={{ gridTemplateColumns: `${labelColPx}px repeat(${draft.teams}, minmax(${colMinPx}px, 1fr))` }}
            >
              <div className="border-r border-border/30" />
              {draft.slots.map(slot => {
                const isHovered = hoveredUserId === slot.userId;
                return (
                  <button
                    key={slot.slot}
                    className={cn(
                      'flex flex-col items-center gap-1 py-3 px-2 border-r border-border/30 transition-colors',
                      isHovered ? 'bg-primary/8' : 'hover:bg-accent/50',
                    )}
                    onMouseEnter={() => setHoveredUserId(slot.userId)}
                    onMouseLeave={() => setHoveredUserId(null)}
                  >
                    <Avatar avatarId={slot.avatar || null} size={24} className="rounded shrink-0" />
                    <span className="text-[10px] font-semibold text-center text-foreground leading-tight max-w-[100px] truncate">
                      {slot.teamName}
                    </span>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/35">
                      Pick #{slot.slot}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Round rows */}
            {Array.from({ length: draft.rounds }, (_, i) => i + 1).map(round => (
              <div
                key={round}
                className={cn('grid', round % 2 === 0 && isSnake ? 'bg-muted/[0.04]' : '')}
                style={{ gridTemplateColumns: `${labelColPx}px repeat(${draft.teams}, minmax(${colMinPx}px, 1fr))` }}
              >
                {/* Round label */}
                <div className="border-r border-b border-border/20 flex flex-col items-center justify-center min-h-[72px] gap-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">R{round}</span>
                  {isSnake && (
                    <span className="text-[8px] text-muted-foreground/20">{round % 2 === 0 ? '←' : '→'}</span>
                  )}
                </div>

                {/* Pick cells */}
                {draft.slots.map(slot => {
                  const pick   = effectiveMatrix[round]?.[slot.slot];
                  const pickNo = snakePickNo(round, slot.slot, draft.teams);
                  const isOwner   = hoveredUserId === pick?.userId;
                  const isHovered = hoveredUserId !== null;
                  const isTraded  = !!pick?.tradedFrom;

                  return (
                    <div
                      key={slot.slot}
                      className={cn(
                        'border-r border-b border-border/20 flex flex-col items-center justify-center min-h-[72px] gap-1.5 p-2.5 transition-all duration-150',
                        isTraded ? 'bg-foreground/[0.02]' : '',
                        isHovered && !isOwner ? 'opacity-15' : 'opacity-100',
                      )}
                      onMouseEnter={() => pick && setHoveredUserId(pick.userId)}
                      onMouseLeave={() => setHoveredUserId(null)}
                    >
                      {/* Pick number */}
                      <span className="text-[9px] font-black text-muted-foreground/20 tabular-nums leading-none">
                        {round}.{String(slot.slot).padStart(2, '0')}
                      </span>

                      {/* Effective owner */}
                      <Avatar avatarId={pick?.avatar || null} size={28} className="rounded shrink-0" />
                      <span className="text-[10px] font-semibold text-foreground/80 text-center leading-tight line-clamp-2 max-w-[88px]">
                        {pick?.teamName ?? slot.teamName}
                      </span>

                      {/* Traded indicator */}
                      {isTraded && (
                        <span className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground/40 text-center leading-tight">
                          via {pick!.tradedFrom!.teamName}
                        </span>
                      )}

                      {/* Own pick subtle indicator */}
                      {!isTraded && (
                        <span className="text-[7px] text-muted-foreground/20 font-medium">#{pickNo}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Upcoming draft ────────────────────────────────────────────────────────────

function UpcomingDraft({ draft }: { draft: EnrichedDraft }) {
  const isLive  = draft.status === 'drafting';
  const hasTime = draft.startTime !== null && draft.startTime > Date.now();
  const keepers = draft.picks.filter(p => p.isKeeper);

  return (
    <div className="space-y-6">
      {isLive ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 mb-4">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-primary">Draft In Progress</span>
          </div>
          <p className="text-sm text-muted-foreground">The draft is currently live on Sleeper.</p>
        </div>
      ) : hasTime ? (
        <Countdown targetMs={draft.startTime!} />
      ) : (
        <div className="rounded-2xl border border-border bg-card/50 p-6 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">Draft date not yet set</p>
          <p className="text-xs text-muted-foreground/60">The commissioner will set the date soon.</p>
        </div>
      )}

      {/* Draft order and board only shown once the draft is live or complete */}
      {isLive && (
        <>
          {draft.orderSet && draft.slots.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-4">Draft Order</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {draft.slots.map((slot, i) => (
                  <motion.div
                    key={slot.slot}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.25 }}
                    className="rounded-xl border border-border bg-card p-4 flex flex-col items-center gap-2.5 text-center"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                      <span className="text-[10px] font-black text-primary">{slot.slot}</span>
                    </div>
                    <Avatar avatarId={slot.avatar || null} size={40} />
                    <p className="text-xs font-semibold text-foreground leading-tight">{slot.teamName}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
          <UpcomingDraftBoard draft={draft} />
        </>
      )}

      {/* Keepers */}
      {keepers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Star className="h-3.5 w-3.5 text-muted-foreground/50" />
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Keepers</h3>
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-[10px] text-muted-foreground/40">{keepers.length} picks reserved</span>
          </div>
          <div className="space-y-3">
            {draft.slots.map(slot => {
              const slotKeepers = keepers.filter(p => p.rosterId === slot.rosterId || p.userId === slot.userId);
              if (slotKeepers.length === 0) return null;
              return (
                <div key={slot.slot} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <Avatar avatarId={slot.avatar || null} size={24} className="rounded shrink-0" />
                    <span className="text-sm font-semibold text-foreground">{slot.teamName}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {slotKeepers.map(pick => (
                      <div key={pick.pickNo} className={cn('rounded-lg border px-2.5 py-1.5 flex items-center gap-2', posStyle(pick.position))}>
                        <span className="text-[9px] font-bold uppercase">{pick.position}</span>
                        <span className="text-xs font-semibold text-foreground">{pick.playerName}</span>
                        <span className="text-[9px] text-muted-foreground/50">Rd {pick.round}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Draft hero ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  complete:  { label: 'Complete',  class: 'bg-foreground/8 text-foreground/60 border-foreground/15' },
  drafting:  { label: 'Live',      class: 'bg-primary/10 text-primary border-primary/30 animate-pulse' },
  pre_draft: { label: 'Upcoming',  class: 'bg-foreground/8 text-foreground/60 border-foreground/15' },
};

const TYPE_LABEL: Record<string, string> = {
  snake:   'Snake',
  linear:  'Linear',
  auction: 'Auction',
};

function DraftHero({ draft }: { draft: EnrichedDraft }) {
  const status   = STATUS_CONFIG[draft.status] ?? { label: draft.status, class: 'bg-muted text-muted-foreground border-border' };
  const typeLabel = TYPE_LABEL[draft.type] ?? draft.type;
  const dateStr  = draft.startTime
    ? format(new Date(draft.startTime), 'MMMM d, yyyy · h:mm a')
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Gradient top bar */}
      <div className="h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
      <div className="flex flex-wrap items-center gap-4 px-6 py-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider', status.class)}>
              {status.label}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
              {typeLabel} Draft
            </span>
          </div>
          <h2 className="mt-1.5 font-display text-2xl sm:text-3xl font-bold text-foreground">
            {draft.season} Season
          </h2>
          {dateStr && (
            <p className="mt-1 text-xs text-muted-foreground/60 flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3" />
              {dateStr}
            </p>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="flex items-center gap-1.5 text-muted-foreground/50 justify-center mb-0.5">
              <Users className="h-3 w-3" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Teams</span>
            </div>
            <p className="text-xl font-bold text-foreground tabular-nums">{draft.teams}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center gap-1.5 text-muted-foreground/50 justify-center mb-0.5">
              <Layers className="h-3 w-3" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Rounds</span>
            </div>
            <p className="text-xl font-bold text-foreground tabular-nums">{draft.rounds}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card h-32 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card h-24 animate-pulse" />
        ))}
      </div>
      <div className="rounded-xl border border-border h-[520px] animate-pulse" />
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function DraftsView() {
  const [drafts,    setDrafts]    = useState<EnrichedDraft[]>([]);
  const [seasons,   setSeasons]   = useState<string[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [view,      setView]      = useState<'board' | 'teams'>('board');

  useEffect(() => {
    fetch('/api/drafts')
      .then(r => r.json())
      .then((d: DraftsResponse & { error?: string }) => {
        if (d.error) throw new Error(d.error);
        setDrafts(d.drafts ?? []);
        setSeasons(d.seasons ?? []);
        setActiveDraftId(d.drafts?.[0]?.draftId ?? null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const selectedDraft = useMemo(
    () => drafts.find(d => d.draftId === activeDraftId) ?? drafts[0] ?? null,
    [drafts, activeDraftId],
  );

  const isCompleted = selectedDraft?.status === 'complete';
  const isDrafting  = selectedDraft?.status === 'drafting';
  const showBoard   = isCompleted || isDrafting;

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">No drafts found for this league.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Draft selector tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {drafts.map(d => {
          const isActive = d.draftId === selectedDraft?.draftId;
          const statusDot = d.status === 'drafting' ? 'bg-primary animate-pulse' : 'bg-foreground/30';
          return (
            <button
              key={d.draftId}
              onClick={() => { setActiveDraftId(d.draftId); setView('board'); }}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors',
                isActive
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusDot)} />
              {d.season} Draft
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {selectedDraft && (
          <motion.div
            key={selectedDraft.draftId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Hero */}
            <DraftHero draft={selectedDraft} />

            {showBoard ? (
              <>
                {/* Stats */}
                <DraftStats draft={selectedDraft} />

                {/* View toggle */}
                <div className="flex items-center justify-between">
                  <PosLegend />
                  <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                    {(['board', 'teams'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setView(v)}
                        className={cn(
                          'px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors',
                          view === v
                            ? 'bg-primary/10 text-primary'
                            : 'bg-card text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {v === 'board' ? 'Draft Board' : 'By Team'}
                      </button>
                    ))}
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {view === 'board' ? (
                    <motion.div
                      key="board"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <DraftBoard draft={selectedDraft} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="teams"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3"
                    >
                      {selectedDraft.slots
                        .filter(s => s.picks.length > 0 || s.teamName)
                        .map(slot => (
                          <TeamPickCard key={slot.slot} slot={slot} />
                        ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : (
              <UpcomingDraft draft={selectedDraft} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
