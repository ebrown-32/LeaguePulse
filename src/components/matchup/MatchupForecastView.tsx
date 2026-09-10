'use client';

/**
 * The forecast half of a matchup drilldown.
 *
 * Answers one question first, in the largest type on the screen: who is going
 * to win, and how sure is that. Everything else on the panel exists to show why
 * the number is what it is.
 *
 * The model lives in `lib/sim/matchupOdds` and is calibrated on 1,119 real
 * starter-weeks. The thing it gets right that a scoreboard cannot is the
 * difference between a lead and a decided game: thirty points up with eight
 * starters left is roughly a coin flip, and this says so.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, MinusCircle } from 'lucide-react';
import { densityCurve, type StarterLine, type MatchupForecast } from '@/lib/sim/matchupOdds';
import type { WeekPhase } from '@/lib/nflSchedule';

interface Team { userId: string; teamName: string; avatar: string }

interface Props {
  a: Team;
  b: Team;
  week: number;
  phase: WeekPhase;
  forecast: MatchupForecast;
  lines: [StarterLine[], StarterLine[]];
}

/** A number that counts up to its value once, on mount. */
function CountUp({ value, decimals = 1, className }: {
  value: number; decimals?: number; className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) { setShown(value); return; }
    const start = performance.now();
    const from = 0;
    const DUR = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      // Ease out quart: fast to begin, settles gently on the number.
      const e = 1 - Math.pow(1 - t, 4);
      setShown(from + (value - from) * e);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, reduce]);

  return <span className={cn('tabular-nums', className)}>{shown.toFixed(decimals)}</span>;
}

export default function MatchupForecastView({ a, b, week, phase, forecast, lines }: Props) {
  const reduce = useReducedMotion();
  const aPct = forecast.aWinProb * 100;
  const bPct = 100 - aPct;
  const aFav = forecast.aWinProb >= 0.5;

  const [la, lb] = lines;
  const totalLeft = forecast.a.startersLeft + forecast.b.startersLeft;

  // A shared axis so both curves sit on the same scale.
  const chart = useMemo(() => {
    const lo = Math.min(forecast.a.projectedFinal - 3 * Math.max(forecast.a.sd, 8),
                        forecast.b.projectedFinal - 3 * Math.max(forecast.b.sd, 8));
    const hi = Math.max(forecast.a.projectedFinal + 3 * Math.max(forecast.a.sd, 8),
                        forecast.b.projectedFinal + 3 * Math.max(forecast.b.sd, 8));
    const BINS = 64;
    const ca = densityCurve(forecast.a, lo, hi, BINS);
    const cb = densityCurve(forecast.b, lo, hi, BINS);
    const peak = Math.max(...ca, ...cb) || 1;
    const W = 600, H = 92;
    const path = (c: number[]) => {
      const pts = c.map((v, i) =>
        `${((i / (BINS - 1)) * W).toFixed(1)},${(H - (v / peak) * H).toFixed(1)}`);
      return `M0,${H} L${pts.join(' L')} L${W},${H} Z`;
    };
    return { aPath: path(ca), bPath: path(cb), lo, hi, W, H };
  }, [forecast]);

  return (
    <div className="space-y-5 p-5 sm:p-6">
      {/* ── The answer ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
            {forecast.settled ? 'Final result' : `Week ${week} forecast`}
          </p>
          {!forecast.settled && (
            <p className="text-[11px] text-muted-foreground">
              {totalLeft} starter{totalLeft === 1 ? '' : 's'} still to play
            </p>
          )}
        </div>

        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar avatarId={a.avatar} size={40} className="shrink-0 rounded-xl" />
            <div className="min-w-0">
              <CountUp
                value={aPct} decimals={1}
                className={cn('block text-[30px] font-bold leading-none',
                  aFav ? 'text-primary' : 'text-muted-foreground')}
              />
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{a.teamName}</p>
            </div>
          </div>

          <div className="min-w-0 text-right">
            <div className="flex items-center justify-end gap-2.5">
              <div className="min-w-0">
                <CountUp
                  value={bPct} decimals={1}
                  className={cn('block text-[30px] font-bold leading-none',
                    !aFav ? 'text-primary' : 'text-muted-foreground')}
                />
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{b.teamName}</p>
              </div>
              <Avatar avatarId={b.avatar} size={40} className="shrink-0 rounded-xl" />
            </div>
          </div>
        </div>

        {/* The bar grows from nothing, so the split is something you watch
            resolve rather than a static block of colour. */}
        <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-l-full bg-primary"
            initial={reduce ? false : { width: '50%' }}
            animate={{ width: `${aPct}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.1 }}
          />
          <motion.div
            className="h-full rounded-r-full bg-foreground/25"
            initial={reduce ? false : { width: '50%' }}
            animate={{ width: `${bPct}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.1 }}
          />
        </div>

        <p className="mt-2.5 text-[12px] leading-relaxed text-foreground">
          {forecast.settled ? (
            <>
              <span className="font-semibold">
                {aFav ? a.teamName : b.teamName}
              </span>{' '}
              won by {forecast.expectedMargin.toFixed(1)}.
            </>
          ) : (
            <>
              <span className="font-semibold">{aFav ? a.teamName : b.teamName}</span> is favoured,
              with a typical margin of {forecast.expectedMargin.toFixed(1)}.
              {phase === 'live' && totalLeft > 0 && (
                <span className="text-muted-foreground">
                  {' '}Points already banked are locked in; only the {totalLeft} unplayed
                  starter{totalLeft === 1 ? '' : 's'} carry any uncertainty.
                </span>
              )}
            </>
          )}
        </p>
      </div>

      {/* ── Projected finals ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {([[a, forecast.a], [b, forecast.b]] as const).map(([team, side], i) => (
          <div key={i} className="rounded-xl border border-border bg-muted/20 p-3">
            <p className="truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              {team.teamName}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <CountUp value={side.projectedFinal} className="text-[24px] font-bold text-foreground" />
              {side.sd > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  plus or minus {side.sd.toFixed(0)}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
              <span>{side.pointsSoFar.toFixed(1)} banked</span>
              {side.startersLeft > 0 && (
                <span>+{side.projectedRemaining.toFixed(1)} from {side.startersLeft} left</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Where the two finals sit ────────────────────────────────────── */}
      {!forecast.settled && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Range of finishes
          </p>
          <svg
            viewBox={`0 0 ${chart.W} ${chart.H}`} className="mt-2 w-full"
            style={{ aspectRatio: `${chart.W} / ${chart.H}` }}
            role="img"
            aria-label={`Projected score distributions for ${a.teamName} and ${b.teamName}`}
          >
            <motion.path
              d={chart.bPath} fill="hsl(var(--foreground) / 0.12)"
              stroke="hsl(var(--foreground) / 0.6)" strokeWidth={1.75} strokeDasharray="5 3"
              initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.25 }}
            />
            <motion.path
              d={chart.aPath} fill="hsl(var(--primary) / 0.2)"
              stroke="hsl(var(--primary))" strokeWidth={1.75}
              initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.35 }}
            />
          </svg>
          <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>{Math.round(chart.lo)}</span>
            {/* Truncated by CSS, not by slicing: a hard character cut produced
                "Just Jaxson Of", which reads as a typo rather than an ellipsis. */}
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex min-w-0 items-center gap-1">
                <span className="inline-block h-0 w-3 shrink-0 border-t-2 border-[hsl(var(--primary))]" />
                <span className="max-w-[110px] truncate">{a.teamName}</span>
              </span>
              <span className="flex min-w-0 items-center gap-1">
                <span className="inline-block h-0 w-3 shrink-0 border-t-2 border-dashed border-foreground/60" />
                <span className="max-w-[110px] truncate">{b.teamName}</span>
              </span>
            </span>
            <span>{Math.round(chart.hi)}</span>
          </div>
        </div>
      )}

      {/* ── Who is left ─────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {([[a, la], [b, lb]] as const).map(([team, list], i) => (
          <div key={i} className="rounded-xl border border-border">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Avatar avatarId={team.avatar} size={20} className="shrink-0 rounded-md" />
              <span className="truncate text-[12px] font-semibold text-foreground">{team.teamName}</span>
            </div>
            <ul className="divide-y divide-border/50">
              {list.map((p, k) => (
                <motion.li
                  key={p.playerId}
                  initial={reduce ? false : { opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: 0.3 + k * 0.03 }}
                  className="flex items-center gap-2 px-3 py-1.5"
                >
                  <PhaseMark phase={p.phase} />
                  <span className="w-7 shrink-0 text-[10px] font-bold uppercase text-muted-foreground">
                    {p.position}
                  </span>
                  <span className={cn(
                    'min-w-0 flex-1 truncate text-[12px]',
                    p.phase === 'played' ? 'text-foreground' : 'text-muted-foreground',
                  )}>
                    {p.name}
                  </span>
                  <span className="shrink-0 text-right text-[12px] font-semibold tabular-nums">
                    {p.phase === 'played' ? (
                      <span className="text-foreground">{(p.actual ?? 0).toFixed(1)}</span>
                    ) : p.phase === 'bye' ? (
                      <span className="text-muted-foreground/40">bye</span>
                    ) : (
                      <span className="text-muted-foreground">
                        {p.projected != null ? p.projected.toFixed(1) : '--'}
                      </span>
                    )}
                  </span>
                </motion.li>
              ))}
              {list.length === 0 && (
                <li className="px-3 py-3 text-[12px] text-muted-foreground">No starters set.</li>
              )}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Settled points are treated as fact; only unplayed starters carry uncertainty. Projections
        are scored with this league&apos;s own settings, then shaded rather than taken at face
        value{' '}
        {forecast.calibration.source === 'league' ? (
          <>
            using coefficients fitted from{' '}
            <span className="text-foreground">
              {forecast.calibration.sample.toLocaleString()} starter-weeks
            </span>{' '}
            of this league&apos;s {forecast.calibration.season} season.
          </>
        ) : (
          <>using default coefficients, until this league has a completed season to fit.</>
        )}
      </p>
    </div>
  );
}

/** Played, yet to play, or on a bye. */
function PhaseMark({ phase }: { phase: StarterLine['phase'] }) {
  if (phase === 'played') {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Played" />;
  }
  if (phase === 'bye') {
    return <MinusCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" aria-label="On a bye" />;
  }
  return <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-label="Yet to play" />;
}
