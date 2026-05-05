'use client';

import { useState, useEffect } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  AnimatePresence,
  animate,
} from 'framer-motion';
import { X, Check, RefreshCw, Flame, TrendingUp } from 'lucide-react';
import { type TradeProposal, type PlayerValue, POSITION_COLORS } from '@/lib/tradeEngine';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const SWIPE_THRESHOLD = 90;
const SWIPE_VELOCITY  = 400;

// ── Label styling ──────────────────────────────────────────────────────────────

const LABEL_STYLES: Record<string, string> = {
  green:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  blue:   'bg-sky-500/10     text-sky-400     border-sky-500/30',
  amber:  'bg-amber-500/10   text-amber-400   border-amber-500/30',
  purple: 'bg-violet-500/10  text-violet-400  border-violet-500/30',
  red:    'bg-rose-500/10    text-rose-400     border-rose-500/30',
};

const LABEL_ICONS: Record<string, React.ReactNode> = {
  green:  <Check className="h-3 w-3" />,
  blue:   <TrendingUp className="h-3 w-3" />,
  amber:  <Flame className="h-3 w-3" />,
  purple: <Flame className="h-3 w-3" />,
  red:    <X className="h-3 w-3" />,
};

// ── Single player pill ─────────────────────────────────────────────────────────

function PlayerPill({ player }: { player: PlayerValue }) {
  const colorClass = POSITION_COLORS[player.position] ?? 'text-muted-foreground bg-muted/20 border-border/30';
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-background/50 px-3 py-2">
      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${colorClass}`}>
        {player.position}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground leading-tight">{player.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {player.nflTeam}
          {player.avgPPG > 0 && (
            <span className="ml-1.5 text-muted-foreground/70">
              {player.avgPPG.toFixed(1)} ppg
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ── Fairness bar ───────────────────────────────────────────────────────────────

function FairnessBar({ fairness }: { fairness: number }) {
  const label =
    fairness >= 42 && fairness <= 58 ? 'Even'
    : fairness < 42 ? 'Side A favored'
    : 'Side B favored';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Value balance</span>
        <span className="font-medium text-foreground">{label}</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-border/40">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          initial={{ width: '50%' }}
          animate={{ width: `${fairness}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// ── Card content (shared between draggable + background) ───────────────────────

function CardContent({ proposal }: { proposal: TradeProposal }) {
  const labelStyle = LABEL_STYLES[proposal.labelVariant] ?? LABEL_STYLES.blue;
  const labelIcon  = LABEL_ICONS[proposal.labelVariant];

  return (
    <div className="flex flex-col h-full gap-4 p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${labelStyle}`}>
          {labelIcon}
          {proposal.label}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">
          #{proposal.id.slice(-4).toUpperCase()}
        </span>
      </div>

      {/* Tagline */}
      <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground -mt-1">
        {proposal.tagline}
      </p>

      {/* Trade sides */}
      <div className="grid grid-cols-2 gap-3 flex-1">
        {/* Side A */}
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">
              {proposal.sideA.teamName}
            </p>
            <p className="text-xs font-medium text-muted-foreground">{proposal.sideA.record}</p>
          </div>
          <div className="space-y-1.5">
            {proposal.sideA.gives.map(p => (
              <PlayerPill key={p.playerId} player={p} />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="relative flex flex-col gap-2">
          <div className="absolute -left-1.5 top-0 bottom-0 w-px bg-border/40" />
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">
              {proposal.sideB.teamName}
            </p>
            <p className="text-xs font-medium text-muted-foreground">{proposal.sideB.record}</p>
          </div>
          <div className="space-y-1.5">
            {proposal.sideB.gives.map(p => (
              <PlayerPill key={p.playerId} player={p} />
            ))}
          </div>
        </div>
      </div>

      {/* Rationale */}
      <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/30 pt-3 line-clamp-3">
        {proposal.rationale}
      </p>

      {/* Fairness */}
      <FairnessBar fairness={proposal.fairness} />
    </div>
  );
}

// ── Draggable top card ─────────────────────────────────────────────────────────

function DraggableCard({
  proposal,
  onSwipe,
}: {
  proposal: TradeProposal;
  onSwipe: (dir: 'left' | 'right') => void;
}) {
  const x        = useMotionValue(0);
  const rotate   = useTransform(x, [-220, 220], [-18, 18]);
  const likeOpacity = useTransform(x, [30, 110],  [0, 1]);
  const passOpacity = useTransform(x, [-110, -30], [1, 0]);
  const bgGlowGreen = useTransform(x, [0, 150],   ['rgba(16,185,129,0)', 'rgba(16,185,129,0.08)']);
  const bgGlowRed   = useTransform(x, [-150, 0],  ['rgba(239,68,68,0.08)', 'rgba(239,68,68,0)']);

  function swipe(dir: 'left' | 'right') {
    animate(x, dir === 'right' ? 600 : -600, {
      duration: 0.35,
      ease: 'easeIn',
      onComplete: () => onSwipe(dir),
    });
  }

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      style={{ x, rotate }}
      onDragEnd={(_, info) => {
        if (
          Math.abs(info.offset.x) > SWIPE_THRESHOLD ||
          Math.abs(info.velocity.x) > SWIPE_VELOCITY
        ) {
          swipe(info.offset.x > 0 ? 'right' : 'left');
        } else {
          animate(x, 0, { type: 'spring', stiffness: 350, damping: 30 });
        }
      }}
      className="absolute inset-0 cursor-grab active:cursor-grabbing select-none touch-none"
      whileTap={{ scale: 1.02 }}
    >
      {/* Card surface */}
      <motion.div
        className="absolute inset-0 rounded-2xl border border-border bg-card overflow-hidden shadow-2xl"
        style={{ backgroundColor: bgGlowGreen }}
      >
        <motion.div
          className="absolute inset-0 rounded-2xl"
          style={{ backgroundColor: bgGlowRed }}
        />
        <div className="relative h-full">
          <CardContent proposal={proposal} />
        </div>
      </motion.div>

      {/* Swipe stamps */}
      <motion.div
        style={{ opacity: likeOpacity }}
        className="pointer-events-none absolute left-5 top-6 z-10 rotate-[-12deg] rounded-xl border-4 border-emerald-400 px-4 py-1.5"
      >
        <span className="text-2xl font-black uppercase tracking-widest text-emerald-400">
          Send It 🔥
        </span>
      </motion.div>

      <motion.div
        style={{ opacity: passOpacity }}
        className="pointer-events-none absolute right-5 top-6 z-10 rotate-[12deg] rounded-xl border-4 border-rose-400 px-4 py-1.5"
      >
        <span className="text-2xl font-black uppercase tracking-widest text-rose-400">
          Pass ❌
        </span>
      </motion.div>

      {/* Hint arrows on edges */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-gradient-to-r from-rose-500/0 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1 rounded-r-2xl bg-gradient-to-l from-emerald-500/0 to-transparent" />
    </motion.div>
  );
}

// ── Summary screen ─────────────────────────────────────────────────────────────

function Summary({
  liked,
  total,
  onReset,
}: {
  liked: TradeProposal[];
  total: number;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-4 text-center">
      <div className="text-5xl">🎯</div>
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">
          You liked {liked.length} of {total} trades
        </h2>
        <p className="text-sm text-muted-foreground">
          {liked.length === 0
            ? 'Nothing caught your eye today.'
            : 'Here are the trade ideas you flagged as interesting:'}
        </p>
      </div>

      {liked.length > 0 && (
        <div className="w-full max-w-sm space-y-2 text-left max-h-48 overflow-y-auto pr-1">
          {liked.map(p => (
            <div
              key={p.id}
              className="rounded-xl border border-border bg-card p-3 text-sm"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-foreground text-xs">
                  {p.sideA.teamName} ↔ {p.sideB.teamName}
                </span>
                <span className={`text-[9px] font-bold uppercase rounded-full border px-1.5 py-0.5 ${LABEL_STYLES[p.labelVariant]}`}>
                  {p.label}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {p.sideA.gives.map(pl => pl.name).join(', ')}
                {' '}←→{' '}
                {p.sideB.gives.map(pl => pl.name).join(', ')}
              </p>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onReset}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
      >
        <RefreshCw className="h-4 w-4" />
        Shuffle again
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TradeSwiper() {
  const [proposals,    setProposals]    = useState<TradeProposal[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [liked,        setLiked]        = useState<TradeProposal[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setCurrentIndex(0);
    setLiked([]);
    try {
      const res = await fetch('/api/trades/suggestions');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setProposals(data.proposals ?? []);
    } catch {
      setError('Could not load trade ideas. Check your league config.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleSwipe(dir: 'left' | 'right') {
    if (dir === 'right') {
      setLiked(prev => [...prev, proposals[currentIndex]]);
    }
    setCurrentIndex(prev => prev + 1);
  }

  const done = currentIndex >= proposals.length;

  if (loading) {
    return (
      <div className="flex h-[520px] items-center justify-center">
        <div className="text-center space-y-3">
          <LoadingSpinner className="h-8 w-8 mx-auto" />
          <p className="text-sm text-muted-foreground">Crunching the numbers…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[520px] items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <button onClick={load} className="text-sm text-primary hover:underline">Try again</button>
        </div>
      </div>
    );
  }

  if (!proposals.length) {
    return (
      <div className="flex h-[520px] items-center justify-center text-center px-8">
        <div className="space-y-2">
          <p className="text-lg font-semibold text-foreground">Not enough data yet</p>
          <p className="text-sm text-muted-foreground">
            Trade suggestions need a few weeks of game data to be useful. Check back once the season is underway!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Progress */}
      {!done && (
        <div className="flex items-center gap-3 w-full max-w-sm">
          <div className="flex-1 h-1 rounded-full bg-border/40 overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: `${(currentIndex / proposals.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-[11px] font-mono text-muted-foreground shrink-0">
            {currentIndex + 1} / {proposals.length}
          </span>
        </div>
      )}

      {/* Card stack — extra bottom padding so peeking skeleton cards are visible */}
      <div className="relative w-full max-w-sm" style={{ height: 500 }}>
        {done ? (
          <div className="absolute inset-x-0 top-0 h-[476px] rounded-2xl border border-border bg-card overflow-hidden">
            <Summary liked={liked} total={proposals.length} onReset={load} />
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {/* Render in reverse so top card is painted last (on top) */}
            {[2, 1, 0]
              .map(stackIdx => ({ stackIdx, proposal: proposals[currentIndex + stackIdx] }))
              .filter(({ proposal }) => proposal != null)
              .map(({ stackIdx, proposal }) => (
                <motion.div
                  key={proposal.id}
                  className="absolute inset-x-0 top-0 h-[476px]"
                  style={{ zIndex: 10 - stackIdx }}
                  initial={{
                    scale: 1 - stackIdx * 0.05,
                    y: stackIdx * 12,
                    opacity: stackIdx === 0 ? 1 : 0.7 - stackIdx * 0.1,
                  }}
                  animate={{
                    scale: 1 - stackIdx * 0.05,
                    y: stackIdx * 12,
                    opacity: stackIdx === 0 ? 1 : 0.7 - stackIdx * 0.1,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  {stackIdx === 0 ? (
                    <DraggableCard proposal={proposal} onSwipe={handleSwipe} />
                  ) : (
                    /* Skeleton peek — no content, just structure hints */
                    <div className="h-full rounded-2xl border border-border/50 bg-card overflow-hidden shadow-lg pointer-events-none">
                      <div className="p-5 space-y-4">
                        <div className="h-6 w-28 rounded-full bg-muted/60 animate-pulse" />
                        <div className="h-3 w-40 rounded bg-muted/40 animate-pulse" />
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div className="space-y-2">
                            <div className="h-2.5 w-20 rounded bg-muted/40 animate-pulse" />
                            <div className="h-11 rounded-lg bg-muted/40 animate-pulse" />
                            <div className="h-11 rounded-lg bg-muted/30 animate-pulse" />
                          </div>
                          <div className="space-y-2">
                            <div className="h-2.5 w-20 rounded bg-muted/40 animate-pulse" />
                            <div className="h-11 rounded-lg bg-muted/40 animate-pulse" />
                          </div>
                        </div>
                        <div className="space-y-2 pt-2 border-t border-border/30">
                          <div className="h-2.5 w-full rounded bg-muted/30 animate-pulse" />
                          <div className="h-2.5 w-5/6 rounded bg-muted/30 animate-pulse" />
                          <div className="h-2.5 w-3/4 rounded bg-muted/20 animate-pulse" />
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
          </AnimatePresence>
        )}
      </div>

      {/* Action buttons */}
      {!done && (
        <div className="flex items-center gap-8">
          <button
            onClick={() => handleSwipe('left')}
            className="
              flex h-14 w-14 items-center justify-center rounded-full
              border-2 border-rose-500/40 bg-rose-500/5 text-rose-400
              hover:border-rose-500/70 hover:bg-rose-500/10 transition-colors shadow-lg
            "
            aria-label="Pass"
          >
            <X className="h-6 w-6" />
          </button>

          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Drag or tap
            </p>
          </div>

          <button
            onClick={() => handleSwipe('right')}
            className="
              flex h-14 w-14 items-center justify-center rounded-full
              border-2 border-emerald-500/40 bg-emerald-500/5 text-emerald-400
              hover:border-emerald-500/70 hover:bg-emerald-500/10 transition-colors shadow-lg
            "
            aria-label="Send it"
          >
            <Check className="h-6 w-6" />
          </button>
        </div>
      )}

      {/* Legend */}
      {!done && (
        <div className="flex items-center gap-6 text-[10px] text-muted-foreground/60 font-medium uppercase tracking-widest">
          <span className="flex items-center gap-1.5 text-rose-400/60">
            <X className="h-3 w-3" /> Pass
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400/60">
            <Check className="h-3 w-3" /> Send it
          </span>
        </div>
      )}
    </div>
  );
}
