'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Sofa, Flame, ChevronDown, ExternalLink } from 'lucide-react';
import { SkeletonCards, SkeletonTable, Skeleton } from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import Hint from '@/components/ui/Hint';
import { cn } from '@/lib/utils';

/**
 * The career record book.
 *
 * Everything here is measured across every season the league has played, which
 * is the point: one season of coaching efficiency is noise, and a manager who
 * has left 800 points on his bench since 2024 cannot argue with it.
 */

interface SeasonSlice {
  season: string;
  weeks: number;
  actual: number;
  optimal: number;
  efficiency: number | null;
  benchPoints: number;
  averageScore: number;
  allPlayWins: number;
  allPlayLosses: number;
  medianWins: number;
  medianLosses: number;
}
interface ManagedWeek {
  season: string; week: number; userId: string; username: string;
  actual: number; optimal: number; efficiency: number; wasted?: number;
}
interface CareerMetrics {
  userId: string; username: string; avatar: string;
  seasons: SeasonSlice[];
  weeksPlayed: number;
  actual: number; optimal: number; efficiency: number | null;
  benchPoints: number; benchPerWeek: number;
  allPlayWins: number; allPlayLosses: number; allPlayPct: number;
  medianWins: number; medianLosses: number;
  pointsByPosition: { position: string; points: number; share: number }[];
  bestManaged: ManagedWeek | null;
  worstManaged: ManagedWeek | null;
  efficiencyRank: number;
}
interface CareerReport {
  managers: CareerMetrics[];
  seasons: string[];
  weeksCovered: number;
  records: {
    bestManagedWeeks: ManagedWeek[];
    worstManagedWeeks: ManagedWeek[];
    biggestBenchWaste: ManagedWeek[];
  };
}

function Stat({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'good' | 'bad';
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-display text-xl font-bold tabular-nums',
        tone === 'good' ? 'text-emerald-500' : tone === 'bad' ? 'text-amber-500' : 'text-foreground')}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** What one manager's row shows for the selected season, or for all time. */
interface ManagerView {
  m: CareerMetrics;
  weeks: number;
  efficiency: number | null;
  benchPoints: number;
  benchPerWeek: number;
  allPlayPct: number;
  medianWins: number;
  medianLosses: number;
  actual: number;
  optimal: number;
}

function round(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * Career totals, or one season's slice of them.
 *
 * The Next Gen page has a single season control that every other tab obeys,
 * so this one obeys it too. Selecting a year here narrows every figure to that
 * year rather than leaving a control on screen that does nothing.
 */
function viewOf(m: CareerMetrics, season: string): ManagerView | null {
  if (season === 'all-time') {
    return {
      m, weeks: m.weeksPlayed, efficiency: m.efficiency,
      benchPoints: m.benchPoints, benchPerWeek: m.benchPerWeek,
      allPlayPct: m.allPlayPct, medianWins: m.medianWins, medianLosses: m.medianLosses,
      actual: m.actual, optimal: m.optimal,
    };
  }
  const slice = m.seasons.find(x => x.season === season);
  // A manager who was not in the league that year simply drops out of the view.
  if (!slice || !slice.weeks) return null;
  const ap = slice.allPlayWins + slice.allPlayLosses;
  return {
    m, weeks: slice.weeks, efficiency: slice.efficiency,
    benchPoints: slice.benchPoints,
    benchPerWeek: round(slice.benchPoints / slice.weeks),
    allPlayPct: ap ? round((slice.allPlayWins / ap) * 100) : 0,
    medianWins: slice.medianWins, medianLosses: slice.medianLosses,
    actual: slice.actual, optimal: slice.optimal,
  };
}

export default function CareerMetricsSection({ season = 'all-time' }: { season?: string }) {
  const [report, setReport] = useState<CareerReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/next-gen/career')
      .then(r => r.json())
      .then(d => (d.error ? setError(d.error) : setReport(d.report)))
      .catch(() => setError('Could not load career metrics.'));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }
  if (!report) {
    // Mirrors the real layout below, so nothing shifts when the data lands.
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>
        <SkeletonCards count={3} />
        <SkeletonTable rows={8} cols={7} />
      </div>
    );
  }

  const views = report.managers
    .map(m => viewOf(m, season))
    .filter((v): v is ManagerView => v !== null)
    .sort((a, b) => (b.efficiency ?? 0) - (a.efficiency ?? 0));

  const bestEff = views[0];
  const worstBench = [...views].sort((a, b) => b.benchPerWeek - a.benchPerWeek)[0];
  const bestAllPlay = [...views].sort((a, b) => b.allPlayPct - a.allPlayPct)[0];

  const scope = season === 'all-time' ? 'all time' : season;
  const weeksShown = views.reduce((n, v) => Math.max(n, v.weeks), 0);

  if (!views.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No games were played in {season}.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">
          {season === 'all-time' ? 'The career record' : `The ${season} record`}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {season === 'all-time'
            ? `${report.weeksCovered} league weeks across ${report.seasons.join(', ')}, every one scored against the best lineup that manager could have started.`
            : `${weeksShown} weeks of ${season}, each scored against the best lineup that manager could have started.`}
        </p>
      </div>

      {/* Career leaders. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Trophy, label: `Best manager, ${scope}`, team: bestEff?.m,
            value: `${bestEff?.efficiency}%`, sub: 'of available points started' },
          { icon: Sofa, label: 'Most points benched', team: worstBench?.m,
            value: `${worstBench?.benchPerWeek}`, sub: 'per week, on average' },
          { icon: Flame, label: 'Best all-play record', team: bestAllPlay?.m,
            value: `${bestAllPlay?.allPlayPct}%`, sub: 'against the whole league' },
        ].map(card => card.team && (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              <card.icon className="h-3 w-3" /> {card.label}
            </div>
            <div className="mt-2 flex items-center gap-2.5">
              <Avatar avatarId={card.team.avatar} size={32} className="shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{card.team.username}</p>
                <p className="text-[11px] text-muted-foreground">{card.sub}</p>
              </div>
              <span className="ml-auto shrink-0 font-display text-xl font-bold tabular-nums text-primary">
                {card.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Every manager, expandable into their season history. */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-bold">Manager</th>
                <th className="px-2.5 py-2.5 text-right font-bold" title="Weeks played">Wks</th>
                <th className="px-2.5 py-2.5 text-right font-bold" title="Career coaching efficiency">CE%</th>
                <th className="px-2.5 py-2.5 text-right font-bold" title="Points left on the bench">Benched</th>
                <th className="px-2.5 py-2.5 text-right font-bold" title="Bench points per week">/wk</th>
                <th className="px-2.5 py-2.5 text-right font-bold" title="All-play win rate">AllPlay</th>
                <th className="px-2.5 py-2.5 text-right font-bold">
                  <Hint label="vs Med" side="bottom">
                    Record against the league median score each week. If your league plays median
                    matches this is the second game of every week, already counted in the standings.
                    Nothing else in this table is affected by that setting: coaching efficiency,
                    bench points and all-play all measure scoring rather than wins.
                  </Hint>
                </th>
              </tr>
            </thead>
            <tbody>
              {views.map((v, i) => {
                const m = v.m;
                return (
                <motion.tr
                  key={m.userId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i, 10) * 0.02 }}
                  onClick={() => setOpen(open === m.userId ? null : m.userId)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar avatarId={m.avatar} size={24} className="shrink-0" />
                      <span className="truncate font-semibold text-foreground">{m.username}</span>
                      {m.efficiencyRank === 1 && (
                        <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-primary">
                          #1
                        </span>
                      )}
                      <ChevronDown className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                        open === m.userId && 'rotate-180')} />
                    </div>
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">{v.weeks}</td>
                  <td className={cn('px-2.5 py-2 text-right font-semibold tabular-nums',
                    (v.efficiency ?? 0) >= 86 ? 'text-emerald-500'
                      : (v.efficiency ?? 0) < 82 ? 'text-amber-500' : 'text-foreground')}>
                    {v.efficiency === null ? 'n/a' : `${v.efficiency}%`}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">{v.benchPoints}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-foreground">{v.benchPerWeek}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-foreground">{v.allPlayPct}%</td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">
                    {v.medianWins}-{v.medianLosses}
                  </td>
                </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          Tap a manager for their season by season history and where their points come from.
        </p>
      </section>

      {/* Expanded manager. */}
      {open && (() => {
        const view = views.find(x => x.m.userId === open);
        if (!view) return null;
        const m = view.m;
        const maxPos = Math.max(...m.pointsByPosition.map(p => p.points), 1);
        return (
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center gap-2.5">
              <Avatar avatarId={m.avatar} size={36} className="shrink-0" />
              <div>
                <p className="font-display text-base font-bold text-foreground">{m.username}</p>
                <p className="text-[11px] text-muted-foreground">
                  {season === 'all-time'
                    ? `${m.weeksPlayed} weeks across ${m.seasons.length} season${m.seasons.length === 1 ? '' : 's'}`
                    : `${view.weeks} weeks in ${season}`}
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <Stat label={season === 'all-time' ? 'Career CE' : `${season} CE`}
                value={view.efficiency === null ? 'n/a' : `${view.efficiency}%`}
                sub={season === 'all-time' && m.efficiencyRank ? `rank ${m.efficiencyRank}` : undefined} />
              <Stat label="Points started" value={String(view.actual)} sub={`of ${view.optimal} available`} />
              <Stat label="Benched" value={String(view.benchPoints)} sub={`${view.benchPerWeek} per week`} tone="bad" />
              <Stat label="All-play" value={`${view.allPlayPct}%`}
                sub={`${view.medianWins}-${view.medianLosses} vs median`} />
            </div>

            {/* Season by season. */}
            <h3 className="mt-4 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Season by season
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[480px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="py-1.5 text-left font-bold">Season</th>
                    <th className="py-1.5 text-right font-bold">Wks</th>
                    <th className="py-1.5 text-right font-bold">Avg</th>
                    <th className="py-1.5 text-right font-bold">CE%</th>
                    <th className="py-1.5 text-right font-bold">Benched</th>
                    <th className="py-1.5 text-right font-bold">vs Med</th>
                  </tr>
                </thead>
                <tbody>
                  {m.seasons.filter(x => season === 'all-time' || x.season === season).map(s => (
                    <tr key={s.season} className="border-b border-border last:border-0">
                      <td className="py-1.5 font-semibold text-foreground">{s.season}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{s.weeks}</td>
                      <td className="py-1.5 text-right tabular-nums text-foreground">{s.averageScore}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums text-foreground">
                        {s.efficiency === null ? ',' : `${s.efficiency}%`}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{s.benchPoints}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {s.medianWins}-{s.medianLosses}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Where the points come from. */}
            <h3 className="mt-4 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Career points by position
            </h3>
            <div className="mt-2 space-y-1.5">
              {m.pointsByPosition.map(p => (
                <div key={p.position} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {p.position}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary"
                      style={{ width: `${(p.points / maxPos) * 100}%` }} />
                  </div>
                  {/* Wide enough for a four figure total plus its share; at
                      w-24 the percentage was being clipped off the end. */}
                  <span className="w-32 shrink-0 whitespace-nowrap text-right text-[12px] tabular-nums text-muted-foreground">
                    {p.points} <span className="text-[11px]">({p.share}%)</span>
                  </span>
                </div>
              ))}
            </div>

            {(m.bestManaged || m.worstManaged) && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {m.bestManaged && (
                  <p className="rounded-lg border border-border px-3 py-2 text-[12px] text-foreground/85">
                    <span className="font-bold uppercase tracking-widest text-emerald-500">Best week </span>
                    {m.bestManaged.season} week {m.bestManaged.week}, {m.bestManaged.efficiency}%
                    {' '}({m.bestManaged.actual} of {m.bestManaged.optimal})
                  </p>
                )}
                {m.worstManaged && (
                  <p className="rounded-lg border border-border px-3 py-2 text-[12px] text-foreground/85">
                    <span className="font-bold uppercase tracking-widest text-amber-500">Worst week </span>
                    {m.worstManaged.season} week {m.worstManaged.week}, {m.worstManaged.efficiency}%
                    {' '}({m.worstManaged.actual} of {m.worstManaged.optimal})
                  </p>
                )}
              </div>
            )}
          </motion.section>
        );
      })()}

      {/* League record book. */}
      <div className="grid gap-4 md:grid-cols-3">
        {([
          ['Perfect weeks', report.records.bestManagedWeeks,
            (w: ManagedWeek) => `${w.efficiency}%`],
          ['Worst managed', report.records.worstManagedWeeks,
            (w: ManagedWeek) => `${w.efficiency}%`],
          ['Biggest bench waste', report.records.biggestBenchWaste,
            (w: ManagedWeek) => `${w.wasted} pts`],
        ] as const).map(([title, allRows, fmt]) => {
          const rows = allRows.filter(w => season === 'all-time' || w.season === season);
          if (!rows.length) return null;
          return (
          <section key={title} className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              {title}
            </h3>
            <ul className="space-y-1.5">
              {rows.map((w, i) => (
                <li key={`${w.season}-${w.week}-${w.userId}-${i}`}
                  className="flex items-baseline gap-2 text-[13px]">
                  <span className="w-16 shrink-0 text-[11px] text-muted-foreground">
                    {w.season} w{w.week}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{w.username}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{fmt(w)}</span>
                </li>
              ))}
            </ul>
          </section>
          );
        })}
      </div>

      <p className="rounded-xl border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
        Coaching efficiency, all-play and median records follow the definitions from the{' '}
        <a href="https://github.com/uberfastman/fantasy-football-metrics-weekly-report"
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          Fantasy Football Metrics Weekly Report
          <ExternalLink className="h-2.5 w-2.5" />
        </a>{' '}
        by uberfastman. Implemented independently here; no code from that GPL-3.0 project is used.
      </p>
    </div>
  );
}
