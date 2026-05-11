'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, ArrowLeftRight, Gavel, UserPlus, Ticket } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { EnrichedTransaction } from '@/app/api/transactions/route';

const DISMISS_STORAGE_KEY = 'lp_tx_ticker_dismissed';

const TYPE_CONFIG = {
  trade:      { label: 'Trade',      Icon: ArrowLeftRight, badge: 'border-amber-400/40 bg-amber-400/10 text-amber-400'   },
  waiver:     { label: 'Waiver',     Icon: Gavel,          badge: 'border-sky-400/40 bg-sky-400/10 text-sky-400'         },
  free_agent: { label: 'Free Agent', Icon: UserPlus,       badge: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400' },
} as const;

function summarize(tx: EnrichedTransaction): string {
  if (tx.type === 'trade') {
    const [a, b] = tx.sides;
    if (!a || !b) return 'Trade executed';
    const aGets = [...a.adds.map(p => p.name), ...a.picksIn.map(p => `'${p.season.slice(2)} R${p.round} pick`)].slice(0, 2).join(', ');
    const bGets = [...b.adds.map(p => p.name), ...b.picksIn.map(p => `'${p.season.slice(2)} R${p.round} pick`)].slice(0, 2).join(', ');
    return `${a.teamName} gets ${aGets || '—'} · ${b.teamName} gets ${bGets || '—'}`;
  }
  const side = tx.sides[0];
  if (!side) return 'Transaction';
  const adds  = side.adds.map(p => p.name).slice(0, 2).join(', ');
  const drops = side.drops.map(p => p.name).slice(0, 1).join('');
  if (adds && drops) return `${side.teamName} claims ${adds}, cuts ${drops}`;
  if (adds)  return `${side.teamName} claims ${adds}`;
  if (drops) return `${side.teamName} releases ${drops}`;
  return `${side.teamName} · activity`;
}

// Dashed perforation line with punched-hole notches on each edge
function Perforation() {
  return (
    <div className="relative flex items-center">
      {/* Left notch */}
      <div className="absolute left-0 top-1/2 h-[18px] w-[18px] -translate-y-1/2 -translate-x-[9px] rounded-full border border-border bg-background z-10" />
      {/* Dashed line */}
      <div
        className="flex-1 h-px"
        style={{
          background: 'repeating-linear-gradient(to right, hsl(var(--border) / 0.5) 0, hsl(var(--border) / 0.5) 5px, transparent 5px, transparent 11px)',
        }}
      />
      {/* Right notch */}
      <div className="absolute right-0 top-1/2 h-[18px] w-[18px] -translate-y-1/2 translate-x-[9px] rounded-full border border-border bg-background z-10" />
    </div>
  );
}

interface TransactionTickerProps {
  className?: string;
}

export default function TransactionTicker({ className }: TransactionTickerProps) {
  const [transactions, setTransactions] = useState<EnrichedTransaction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [visible,      setVisible]      = useState(false);

  useEffect(() => {
    fetch('/api/transactions')
      .then(r => r.json())
      .then(data => {
        const txs: EnrichedTransaction[] = (data.transactions ?? []).slice(0, 5);
        if (!txs.length) return;
        setTransactions(txs);

        const latestId = txs[0]?.transactionId;
        const stored   = localStorage.getItem(DISMISS_STORAGE_KEY);
        if (stored !== latestId) setVisible(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const dismiss = () => {
    const latestId = transactions[0]?.transactionId;
    if (latestId) localStorage.setItem(DISMISS_STORAGE_KEY, latestId);
    setVisible(false);
  };

  if (loading || !visible || !transactions.length) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={className}
      >
        <div className="relative rounded-xl border border-border bg-card overflow-visible">
          {/* Primary gradient accent at top */}
          <div className="absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

          {/* Stub header */}
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2">
              <Ticket className="h-3.5 w-3.5 text-primary/80" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary/80">
                Recent Activity
              </span>
            </div>
            <button
              onClick={dismiss}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Perforation */}
          <div className="px-5">
            <Perforation />
          </div>

          {/* Transaction rows */}
          <div className="px-5 py-3 space-y-3">
            {transactions.map((tx) => {
              const cfg = TYPE_CONFIG[tx.type];
              return (
                <div key={tx.transactionId} className="flex items-start gap-3 min-w-0">
                  {/* Type badge */}
                  <span className={cn(
                    'mt-px shrink-0 inline-flex items-center gap-1 rounded border px-1.5 py-0.5',
                    'text-[9px] font-bold uppercase tracking-wide',
                    cfg.badge,
                  )}>
                    <cfg.Icon className="h-2.5 w-2.5" />
                    {cfg.label}
                  </span>

                  {/* Summary */}
                  <p className="flex-1 min-w-0 text-xs text-foreground/90 leading-snug line-clamp-2">
                    {summarize(tx)}
                  </p>

                  {/* Time */}
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50 whitespace-nowrap">
                    {formatDistanceToNow(new Date(tx.created), { addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Perforation */}
          <div className="px-5">
            <Perforation />
          </div>

          {/* Footer stub */}
          <div className="flex items-center justify-between px-5 py-2.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">
              League Pulse
            </span>
            <Link
              href="/transactions"
              className="text-xs font-medium text-primary/70 hover:text-primary transition-colors"
            >
              View all →
            </Link>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
