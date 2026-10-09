'use client';

/**
 * Small shared components that give the app one visual voice.
 *
 * Before these, every page hand-rolled its own section header, its own status
 * badge and its own probability bar, each slightly different. The differences
 * were too small to name and too many not to notice. These are the shared
 * versions; styling lives in the COMPONENT KIT block of globals.css.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Icon } from '@/components/icons';
import { ChevronRight } from '@/components/icons';

// ── Icon chip ────────────────────────────────────────────────────────────────

const CHIP_SIZE = {
  xs: 'h-5 w-5 rounded-md [&>svg]:h-3 [&>svg]:w-3',
  sm: 'h-6 w-6 rounded-lg [&>svg]:h-3.5 [&>svg]:w-3.5',
  md: 'h-8 w-8 rounded-[10px] [&>svg]:h-4 [&>svg]:w-4',
  lg: 'h-10 w-10 rounded-xl [&>svg]:h-5 [&>svg]:w-5',
} as const;

export function IconChip({ icon: I, size = 'sm', tone = 'primary', className }: {
  icon: Icon;
  size?: keyof typeof CHIP_SIZE;
  tone?: 'primary' | 'muted' | 'live';
  className?: string;
}) {
  return (
    <span className={cn(
      'lp-chip',
      tone === 'muted' && 'lp-chip-muted',
      tone === 'live' && 'lp-chip-live',
      CHIP_SIZE[size],
      className,
    )}>
      <I />
    </span>
  );
}

// ── Section header ───────────────────────────────────────────────────────────

/**
 * The header row of a card: what it is, and optionally where it goes.
 *
 * One component so every card on every page labels itself the same way, which
 * is most of what makes a set of pages feel like one product.
 */
export function SectionHeader({ icon, title, meta, href, action, className }: {
  icon?: Icon;
  title: ReactNode;
  /** Quiet supporting text beside the title: a count, a week, a date. */
  meta?: ReactNode;
  /** Makes the whole right side a link with an arrow. */
  href?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <IconChip icon={icon} size="sm" />}
        <h2 className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">
          {title}
        </h2>
        {meta && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {meta}
          </span>
        )}
      </div>
      {action}
      {href && !action && (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-primary"
        >
          Open
          <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

// ── Status pill ──────────────────────────────────────────────────────────────

export type Status = 'live' | 'final' | 'upcoming';

/** Live, final or still to come. The live one pulses; nothing else does. */
export function StatusPill({ status, label, className }: {
  status: Status;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
      status === 'live' && 'bg-red-500/10 text-red-500',
      status === 'final' && 'bg-muted text-muted-foreground',
      status === 'upcoming' && 'bg-primary/10 text-primary',
      className,
    )}>
      {status === 'live' && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
        </span>
      )}
      {label ?? (status === 'live' ? 'Live' : status === 'final' ? 'Final' : 'Upcoming')}
    </span>
  );
}

// ── Win probability bar ──────────────────────────────────────────────────────

/**
 * Side A's share of the win probability, as a bar.
 *
 * A tick at the centre line, because "a bit over half" and "a bit under" are
 * the readings people actually make from this, and without a reference point
 * 48% and 52% look identical.
 */
export function WinBar({ p, height = 'h-1.5', className }: {
  p: number;
  height?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(1, p)) * 100;
  return (
    <div className={cn('relative w-full overflow-hidden rounded-full bg-foreground/[0.12]', height, className)}>
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/80 to-primary"
        initial={reduce ? false : { width: '50%' }}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 90, damping: 20 }}
      />
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-background/80" />
    </div>
  );
}

// ── Count up ─────────────────────────────────────────────────────────────────

/** A figure that counts up to its value the first time it is seen. */
export function CountUp({ value, decimals = 0, className }: {
  value: number; decimals?: number; className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (reduce) { setShown(value); return; }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const run = () => {
      const from = started.current ? shown : 0;
      started.current = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / 900);
        setShown(from + (value - from) * (1 - Math.pow(1 - t, 4)));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    // Only once it is on screen, so a figure below the fold is not already
    // finished by the time anyone scrolls to it.
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { run(); io.disconnect(); } });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {shown.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────

/** One headline number, with what it is and what it means. */
export function StatTile({ icon, label, value, decimals = 0, sub, href }: {
  icon: Icon;
  label: string;
  /** A number counts up; a string (a placeholder, say) shows as is. */
  value: number | string;
  decimals?: number;
  sub?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        <IconChip icon={icon} size="xs" />
        <span className="truncate text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
      </div>
      <span className="mt-2.5 block font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-foreground sm:text-[30px]">
        {typeof value === 'number'
          ? <CountUp value={value} decimals={decimals} />
          : <span className="tabular-nums">{value}</span>}
      </span>
      {sub && <span className="mt-1.5 block truncate text-[11px] text-muted-foreground">{sub}</span>}
    </>
  );
  const cls = 'lp-glass lp-edge lp-sheen rounded-2xl border p-3.5 sm:p-4';
  // Only the ones that go somewhere lift. A tile that moves under the cursor
  // and then does nothing when clicked is a promise the interface breaks.
  return href
    ? <Link href={href} className={cn(cls, 'lp-lift block')}>{body}</Link>
    : <div className={cls}>{body}</div>;
}
