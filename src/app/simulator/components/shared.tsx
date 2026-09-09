'use client';

/** Small pieces used across every simulator surface. */

import { useEffect, useRef, useState } from 'react';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn(
      'text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50',
      className,
    )}>
      {children}
    </p>
  );
}

/**
 * A percentage that rolls to its new value instead of snapping.
 *
 * Odds move by fractions of a point between runs, and a hard cut makes the
 * board look like it is glitching rather than responding. The tween is short
 * enough to read as causal: you click, the number travels, you see which way.
 */
export function RollingPct({
  value, decimals = 1, className,
}: { value: number; decimals?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf  = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (Math.abs(a - b) < 0.0001) { setShown(b); return; }

    const reduced = typeof document !== 'undefined'
      && document.documentElement.dataset.motion === 'reduced';
    if (reduced) { from.current = b; setShown(b); return; }

    const DUR = 420;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(a + (b - a) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value]);

  return (
    <span className={cn('tabular-nums', className)}>
      {(shown * 100).toFixed(decimals)}
      <span className="text-[0.7em] text-muted-foreground">%</span>
    </span>
  );
}

/** A horizontal odds bar that shares the page's primary colour. */
export function OddsBar({ value, tone = 'primary', className }: {
  value: number;
  tone?: 'primary' | 'muted' | 'danger';
  className?: string;
}) {
  const colour =
    tone === 'danger' ? 'bg-red-500/70'
    : tone === 'muted' ? 'bg-muted-foreground/30'
    : 'bg-primary';
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted/50', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', colour)}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

/**
 * The provenance chip.
 *
 * Every fitted number in this tool can be traced to what produced it, and this
 * is how that gets said in the UI. It matters more than it looks: without it a
 * simulated playoff percentage is indistinguishable from a made up one.
 */
export function BasisChip({ weights, games }: {
  weights: { current: number; prior: number; projection: number; leagueBase: number };
  games: { current: number; prior: number };
}) {
  const parts = [
    { label: 'This season', w: weights.current,    detail: `${games.current} games` },
    { label: 'Past seasons', w: weights.prior,     detail: `${games.prior} games` },
    { label: 'Projections', w: weights.projection, detail: 'Sleeper weekly projections' },
    { label: 'League average', w: weights.leagueBase, detail: 'fallback' },
  ].filter(p => p.w > 0.005);

  return (
    <div className="space-y-1.5">
      <Eyebrow>Built from</Eyebrow>
      <div className="flex flex-wrap gap-1.5">
        {parts.map(p => (
          <span
            key={p.label}
            title={p.detail}
            className="inline-flex items-baseline gap-1 rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            {p.label}
            <span className="font-semibold tabular-nums text-foreground">
              {Math.round(p.w * 100)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function fmtRecord(w: number, l: number, t: number) {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

/**
 * Team picker as a row of chips.
 *
 * Chosen over a `<select>` because eight teams fit comfortably and the avatars
 * are how people actually recognise each other in this league. It also makes
 * the current selection visible without opening anything, which matters when
 * the selection drives the chart directly underneath it.
 */
export function TeamChips({ teams, value, onChange, disabledId, label }: {
  teams: { rosterId: number; teamName: string; avatar: string }[];
  value: number | null;
  onChange: (rosterId: number) => void;
  /** A team already picked elsewhere, so it cannot be picked twice. */
  disabledId?: number | null;
  label?: string;
}) {
  return (
    <div>
      {label && <Eyebrow className="mb-2">{label}</Eyebrow>}
      <div className="flex flex-wrap gap-1.5">
        {teams.map(t => {
          const active = value === t.rosterId;
          const blocked = disabledId === t.rosterId;
          return (
            <button
              key={t.rosterId}
              onClick={() => !blocked && onChange(t.rosterId)}
              disabled={blocked}
              aria-pressed={active}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : blocked
                    ? 'cursor-not-allowed border-border/50 text-muted-foreground/35'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              <Avatar avatarId={t.avatar} size={16} className="shrink-0 rounded-full" />
              <span className="max-w-[130px] truncate">{t.teamName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
