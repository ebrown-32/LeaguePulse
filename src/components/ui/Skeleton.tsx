'use client';

import { cn } from '@/lib/utils';

/**
 * Loading placeholders.
 *
 * These exist to hold the shape of the thing that is coming, not to entertain.
 * A skeleton that matches the real layout means nothing jumps when the data
 * lands; a spinner in the middle of an empty page means the whole layout
 * arrives at once and shoves everything down.
 *
 * The shimmer is a single background-position animation on a gradient rather
 * than a pulsing opacity: opacity pulsing on a dozen elements at once reads as
 * flashing, and on a large table it is genuinely unpleasant to look at.
 *
 * Honours the admin motion setting and the OS preference through CSS alone,
 * so there is no JS media query to get out of sync.
 */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('lp-skeleton rounded-md', className)} aria-hidden />;
}

/** A block of text lines, last one short so it reads as a paragraph. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

/**
 * A stand-in for a data table.
 *
 * Column widths taper so it reads as "label then numbers", which is what every
 * table in this app actually is.
 */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" aria-hidden>
      <div className="flex gap-3 border-b border-border px-3 py-2.5">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className={cn('h-2.5', i === 0 ? 'w-32 flex-none' : 'flex-1')} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-0">
          <div className="flex flex-none items-center gap-2" style={{ width: '8rem' }}>
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-3 flex-1" />
          </div>
          {Array.from({ length: cols - 1 }, (_, c) => (
            <Skeleton key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A row of stat cards. */
export function SkeletonCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-3', className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-2.5 w-24" />
          <div className="mt-3 flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-16" />
            </div>
            <Skeleton className="h-6 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars, for the odds and points-by-position views. */
export function SkeletonBars({ rows = 8, labelWidth = 'w-32' }: { rows?: number; labelWidth?: string }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className={cn('h-3 flex-none', labelWidth)} />
          {/* Widths taper down the list so it suggests ranked data rather than
              a stack of identical bars. */}
          <div className="h-5 flex-1 overflow-hidden rounded-md bg-muted">
            <Skeleton
              className="h-full rounded-md"
              // eslint-disable-next-line react/forbid-dom-props
            />
          </div>
          <Skeleton className="h-3 w-10 flex-none" />
        </div>
      ))}
    </div>
  );
}
