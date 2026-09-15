'use client';

/**
 * The forecast half of a matchup drilldown.
 *
 * Built for a phone first: one column, the answer in the largest type on the
 * screen, then the reasons in order of how much they explain. The lineup is a
 * slot by slot face-off rather than two stacked lists, because "my running back
 * against yours" is how people actually read a matchup, and two lists forced a
 * scroll between halves of every comparison.
 *
 * The model lives in `lib/sim/matchupOdds`, calibrated per league.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
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

/**
 * Win chance as people say it. "0.1%" and "99.9%" read as false precision and
 * looked broken beside a result that is plainly all but over.
 */
export function winLabel(p: number): string {
  if (p >= 0.995) return '>99%';
  if (p <= 0.005) return '<1%';
  return `${Math.round(p * 100)}%`;
}

/** A number that counts up to its value, once. */
function CountUp({ value, decimals = 1, className }: {
  value: number; decimals?: number; className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce) { setShown(value); return; }
    let raf = 0;
    const start = performance.now();
    const a = from.current;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 800);
      const e = 1 - Math.pow(1 - t, 4);
      setShown(a + (value - a) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return <span className={cn('tabular-nums', className)}>{shown.toFixed(decimals)}</span>;
}

export default function MatchupForecastView({ a, b, week, phase, forecast, lines }: Props) {
  const reduce = useReducedMotion();
  const pA = forecast.aWinProb;
  const settled = forecast.settled;
  const aFav = pA >= 0.5;
  const left = forecast.a.startersLeft + forecast.b.startersLeft;
  const hasPoints = forecast.a.pointsSoFar + forecast.b.pointsSoFar > 0;

  const status = settled
    ? 'Final'
    : phase === 'upcoming' && !hasPoints
      ? `Week ${week} preview`
      : `Live, ${left} starter${left === 1 ? '' : 's'} to go`;

  const chart = useMemo(() => {
    const spread = (s: typeof forecast.a) => Math.max(s.sd, 8);
    const lo = Math.min(forecast.a.projectedFinal - 3 * spread(forecast.a),
                        forecast.b.projectedFinal - 3 * spread(forecast.b));
    const hi = Math.max(forecast.a.projectedFinal + 3 * spread(forecast.a),
                        forecast.b.projectedFinal + 3 * spread(forecast.b));
    const BINS = 72, W = 600, H = 84;
    const x = (v: number) => ((v - lo) / (hi - lo)) * W;
    const curve = (side: typeof forecast.a) => {
      // A side with nothing left to play is a single known number, drawn as a
      // marker. As a curve it collapsed into a one-bin spike that looked like a
      // rendering glitch.
      if (side.sd <= 0) return { marker: x(side.projectedFinal), path: '' };
      const c = densityCurve(side, lo, hi, BINS);
      const peak = Math.max(...c) || 1;
      const pts = c.map((v, i) =>
        `${((i / (BINS - 1)) * W).toFixed(1)},${(H - (v / peak) * (H - 6)).toFixed(1)}`);
      return { marker: null, path: `M0,${H} L${pts.join(' L')} L${W},${H} Z` };
    };
    return { a: curve(forecast.a), b: curve(forecast.b), lo, hi, W, H };
  }, [forecast]);

  const rows = useMemo(() => {
    const [la, lb] = lines;
    const n = Math.max(la.length, lb.length);
    return Array.from({ length: n }, (_, i) => ({ pa: la[i], pb: lb[i] }));
  }, [lines]);

  return (
    <div className="space-y-5">
      {/* ── Scoreboard ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-gradient-to-b from-muted/40 to-transparent p-4">
        <div className="flex items-center justify-between">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            settled ? 'bg-muted text-muted-foreground'
              : status.startsWith('Live') ? 'bg-red-500/10 text-red-500'
              : 'bg-primary/10 text-primary',
          )}>
            {status.startsWith('Live') && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
            )}
            {status}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Win chance
          </span>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Side team={a} points={forecast.a.pointsSoFar} showPoints={hasPoints}
                pct={settled ? null : pA} won={settled && pA > 0.5} lead={aFav} align="left" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">vs</span>
          <Side team={b} points={forecast.b.pointsSoFar} showPoints={hasPoints}
                pct={settled ? null : 1 - pA} won={settled && pA < 0.5} lead={!aFav} align="right" />
        </div>

        {/* Each side keeps its own colour on both the bar and its figure, so
            the eye can match them. The favourite used to be coloured blue in
            text while its share of the bar was grey. */}
        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full bg-primary"
            initial={reduce ? false : { width: '50%' }}
            animate={{ width: `${pA * 100}%` }}
            transition={{ type: 'spring', stiffness: 110, damping: 22 }}
          />
          <motion.div
            className="h-full bg-foreground/30"
            initial={reduce ? false : { width: '50%' }}
            animate={{ width: `${(1 - pA) * 100}%` }}
            transition={{ type: 'spring', stiffness: 110, damping: 22 }}
          />
        </div>

        <p className="mt-3 text-[13px] leading-snug text-foreground">
          {settled ? (
            <><b className="font-semibold">{aFav ? a.teamName : b.teamName}</b> won by {forecast.expectedMargin.toFixed(1)}.</>
          ) : (
            <>
              <b className="font-semibold">{aFav ? a.teamName : b.teamName}</b>{' '}
              {Math.max(pA, 1 - pA) >= 0.97 ? 'has it all but sealed' : 'is favoured'}
              <span className="text-muted-foreground">, typical margin {forecast.expectedMargin.toFixed(1)}.</span>
            </>
          )}
        </p>
      </section>

      {/* ── Projection ──────────────────────────────────────────────────── */}
      {!settled && (
        <section>
          <SectionLabel>Projected final</SectionLabel>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([[a, forecast.a, 'a'], [b, forecast.b, 'b']] as const).map(([team, side, k]) => (
              <div key={k} className="rounded-xl border border-border px-3 py-2.5">
                <p className="mb-1 flex items-center gap-1.5 truncate text-[10px] font-semibold text-muted-foreground">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', k === 'a' ? 'bg-primary' : 'bg-foreground/30')} />
                  <span className="truncate">{team.teamName}</span>
                </p>
                <div className="flex items-baseline gap-1">
                  <CountUp value={side.projectedFinal} className="text-[22px] font-bold leading-none text-foreground" />
                  {side.sd > 0 && (
                    <span className="text-[11px] tabular-nums text-muted-foreground">&plusmn;{side.sd.toFixed(0)}</span>
                  )}
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {side.startersLeft > 0
                    ? `${side.pointsSoFar.toFixed(1)} + ${side.projectedRemaining.toFixed(1)} to come`
                    : 'All starters done'}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-2 rounded-xl border border-border px-3 pb-2 pt-3">
            <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full" style={{ aspectRatio: `${chart.W} / ${chart.H}` }}
                 role="img" aria-label="Range of likely final scores">
              {chart.b.path && (
                <motion.path d={chart.b.path} fill="hsl(var(--foreground) / 0.1)"
                  stroke="hsl(var(--foreground) / 0.4)" strokeWidth={1.5}
                  initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} />
              )}
              {chart.a.path && (
                <motion.path d={chart.a.path} fill="hsl(var(--primary) / 0.18)"
                  stroke="hsl(var(--primary))" strokeWidth={1.75}
                  initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} />
              )}
              {chart.b.marker !== null && (
                <line x1={chart.b.marker} x2={chart.b.marker} y1={4} y2={chart.H}
                      stroke="hsl(var(--foreground) / 0.5)" strokeWidth={2} strokeDasharray="3 3" />
              )}
              {chart.a.marker !== null && (
                <line x1={chart.a.marker} x2={chart.a.marker} y1={4} y2={chart.H}
                      stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="3 3" />
              )}
            </svg>
            <div className="flex items-center justify-between gap-2 text-[10px] tabular-nums text-muted-foreground">
              <span>{Math.round(chart.lo)}</span>
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex min-w-0 items-center gap-1">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span className="max-w-[90px] truncate">{a.teamName}</span>
                </span>
                <span className="flex min-w-0 items-center gap-1">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-foreground/30" />
                  <span className="max-w-[90px] truncate">{b.teamName}</span>
                </span>
              </span>
              <span>{Math.round(chart.hi)}</span>
            </div>
            <p className="mt-1 text-center text-[10px] text-muted-foreground/70">
              Range of likely finals{chart.a.marker !== null || chart.b.marker !== null ? '. Dashed line: already final' : ''}
            </p>
          </div>
        </section>
      )}

      {/* ── Lineups, slot by slot ───────────────────────────────────────── */}
      <section>
        <SectionLabel>Starters</SectionLabel>
        <div className="mt-2 overflow-hidden rounded-xl border border-border">
          {rows.map(({ pa, pb }, i) => {
            const va = value(pa), vb = value(pb);
            const pos = pa?.position && pa.position === pb?.position ? pa.position : 'FLX';
            return (
              <motion.div
                key={i}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: 0.1 + i * 0.025 }}
                className={cn('grid grid-cols-[1fr_2.25rem_1fr] items-center',
                  i > 0 && 'border-t border-border/60')}
              >
                <Cell p={pa} better={va > vb} align="left" />
                <span className="text-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  {pos}
                </span>
                <Cell p={pb} better={vb > va} align="right" />
              </motion.div>
            );
          })}
        </div>
        <p className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-foreground" />scored</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full border border-muted-foreground" />projected</span>
        </p>
      </section>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Banked points count as fact; only starters still to play carry uncertainty.
        {forecast.calibration.source === 'league'
          ? ` Tuned on ${forecast.calibration.sample.toLocaleString()} starter-weeks from this league's ${forecast.calibration.season} season.`
          : ' Using default tuning until this league completes a season.'}
      </p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{children}</p>;
}

/**
 * "Jonathan Taylor" to "J. Taylor" on a phone, where half a row is about 150px
 * and full names were being cut to "Jonathan Tay…". Team defences keep their
 * name, which has no first name to abbreviate.
 */
function shortName(p: StarterLine): string {
  if (p.position === 'DEF') return p.nflTeam ?? p.name;
  const parts = p.name.trim().split(/\s+/);
  if (parts.length < 2) return p.name;
  const suffix = /^(Jr\.?|Sr\.?|II|III|IV|V)$/i.test(parts[parts.length - 1]) ? parts.pop() : '';
  const last = parts.slice(1).join(' ');
  return `${parts[0][0]}. ${last}${suffix ? ` ${suffix}` : ''}`;
}

/** What a starter is worth right now: real points once played, else projection. */
function value(p: StarterLine | undefined): number {
  if (!p) return -1;
  if (p.phase === 'played') return p.actual ?? 0;
  if (p.phase === 'bye') return -1;
  return p.projected ?? -1;
}

function Side({ team, points, showPoints, pct, won, lead, align }: {
  team: Team; points: number; showPoints: boolean; pct: number | null;
  won: boolean; lead: boolean; align: 'left' | 'right';
}) {
  const right = align === 'right';
  return (
    <div className={cn('flex min-w-0 flex-col', right ? 'items-end text-right' : 'items-start')}>
      <div className={cn('flex min-w-0 items-center gap-2', right && 'flex-row-reverse')}>
        <Avatar avatarId={team.avatar} size={34} className="shrink-0 rounded-xl" />
        <span className="line-clamp-2 text-[12px] font-semibold leading-tight text-foreground">
          {team.teamName}
        </span>
      </div>
      <div className={cn('mt-2 flex items-baseline gap-1.5', right && 'flex-row-reverse')}>
        {pct !== null ? (
          // Size and weight go to whoever is favoured; each side keeps its own
          // colour so it still matches the bar. The underdog used to be the
          // loudest figure on screen, a big blue "<1%".
          <span className={cn('font-bold leading-none tabular-nums transition-all',
            right ? 'text-foreground' : 'text-primary',
            lead ? 'text-[30px]' : 'text-[20px] opacity-55')}>
            {winLabel(pct)}
          </span>
        ) : (
          <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase',
            won ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
            {won ? 'Won' : 'Lost'}
          </span>
        )}
        {showPoints && (
          <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">
            {points.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

function Cell({ p, better, align }: { p?: StarterLine; better: boolean; align: 'left' | 'right' }) {
  const right = align === 'right';
  if (!p) return <div className="px-3 py-2" />;
  const played = p.phase === 'played';
  const bye = p.phase === 'bye';
  const pts = played ? (p.actual ?? 0) : p.projected;
  return (
    <div className={cn('flex min-w-0 items-center gap-2 px-3 py-2', right && 'flex-row-reverse text-right',
      better && 'bg-primary/[0.05]')}>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[12px] leading-tight',
          played ? 'font-medium text-foreground' : 'text-muted-foreground')}>
          <span className="sm:hidden">{shortName(p)}</span>
          <span className="hidden sm:inline">{p.name}</span>
        </p>
        <p className="text-[10px] leading-tight text-muted-foreground/70">
          {bye ? 'bye' : `${p.position}${p.nflTeam ? ` · ${p.nflTeam}` : ''}`}
        </p>
      </div>
      <span className={cn('flex shrink-0 items-center gap-1 text-[13px] tabular-nums',
        right && 'flex-row-reverse',
        played ? 'font-bold text-foreground' : 'font-medium text-muted-foreground')}>
        <span className={cn('h-1.5 w-1.5 rounded-full',
          played ? 'bg-foreground' : 'border border-muted-foreground')} />
        {bye ? '--' : pts != null ? pts.toFixed(1) : '--'}
      </span>
    </div>
  );
}
