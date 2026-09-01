/**
 * The same position colours as literal values, for SVG.
 *
 * Charts cannot use the Tailwind classes below, and a chart that invented its
 * own palette would mean a running back was one colour in the table and
 * another in the plot directly above it.
 */
export const POSITION_COLOR: Record<string, string> = {
  QB:  '#f43f5e',
  RB:  '#10b981',
  WR:  '#0ea5e9',
  TE:  '#f59e0b',
  K:   '#8b5cf6',
  DEF: '#94a3b8',
  DEFAULT: '#94a3b8',
};

/** Shared position colour language for the rosters page. */
export const POSITION_STYLE: Record<string, { badge: string; glow: string; bar: string }> = {
  QB:      { badge: 'border-rose-500/30 bg-rose-500/10 text-rose-500',       glow: 'bg-rose-500/20',    bar: 'bg-rose-500' },
  RB:      { badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500', glow: 'bg-emerald-500/20', bar: 'bg-emerald-500' },
  WR:      { badge: 'border-sky-500/30 bg-sky-500/10 text-sky-500',          glow: 'bg-sky-500/20',     bar: 'bg-sky-500' },
  TE:      { badge: 'border-amber-500/30 bg-amber-500/10 text-amber-500',    glow: 'bg-amber-500/20',   bar: 'bg-amber-500' },
  K:       { badge: 'border-violet-500/30 bg-violet-500/10 text-violet-500', glow: 'bg-violet-500/20',  bar: 'bg-violet-500' },
  DEF:     { badge: 'border-slate-400/30 bg-slate-400/10 text-slate-400',    glow: 'bg-slate-400/20',   bar: 'bg-slate-400' },
  DEFAULT: { badge: 'border-border bg-muted text-muted-foreground',          glow: 'bg-primary/20',     bar: 'bg-muted-foreground' },
};
