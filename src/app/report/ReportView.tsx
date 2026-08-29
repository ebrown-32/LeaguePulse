'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Info } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { SkeletonTable, SkeletonBars, Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

/**
 * The weekly metrics report.
 *
 * Metrics credited to the Fantasy Football Metrics Weekly Report, which is a
 * Python tool that emails a PDF; this is an independent implementation reading
 * the same ideas off Sleeper, and the attribution at the foot of the page is
 * not optional decoration.
 */

interface PositionPoints { position: string; points: number }
interface TeamReport {
  rosterId: number;
  teamName: string;
  manager: string;
  pointsFor: number;
  wins: number; losses: number; ties: number;
  averageScore: number;
  averageOptimal: number;
  efficiency: number | null;
  pointsLeftOnBench: number;
  allPlayWins: number; allPlayLosses: number; allPlayPct: number;
  medianWins: number; medianLosses: number;
  zScore: number;
  luck: number;
  pointsByPosition: PositionPoints[];
  beefLbs: number;
  scoreRank: number; efficiencyRank: number; luckRank: number;
  powerScore: number; powerRank: number;
}
interface TeamOdds {
  rosterId: number;
  teamName: string;
  playoffOdds: number;
  topSeedOdds: number;
  titleOdds: number;
  projectedWins: number;
  clinched: boolean;
  eliminated: boolean;
}
interface Report {
  medianMatch: boolean;
  season: string;
  throughWeek: number;
  leagueName: string;
  teams: TeamReport[];
  weeklyHighs: { week: number; teamName: string; points: number }[];
  weeklyLows: { week: number; teamName: string; points: number }[];
  bestEfficiency: { week: number; teamName: string; efficiency: number }[];
  odds: { teams: TeamOdds[]; simulations: number; remainingGames: number } | null;
  playoffTeams: number;
}

/** Every column, with the one-line explanation it needs to be readable. */
const COLUMNS = [
  { id: 'powerRank',  label: 'Pwr',   help: 'Mean of the score, efficiency and luck ranks. Lower is better.' },
  { id: 'record',     label: 'W-L',   help: 'Actual head to head record.' },
  { id: 'pointsFor',  label: 'PF',    help: 'Total points scored.' },
  { id: 'avg',        label: 'Avg',   help: 'Average score per played week.' },
  { id: 'optimal',    label: 'Opt',   help: 'Average score of the best lineup that could have been started.' },
  { id: 'efficiency', label: 'CE%',   help: 'Coaching efficiency: points started as a share of points available.' },
  { id: 'bench',      label: 'Left',  help: 'Points left on the bench across the season.' },
  { id: 'allPlay',    label: 'AllPlay', help: 'Win rate if every team played every other team, every week.' },
  { id: 'median',     label: 'vs Med', help: 'Record against the league median score each week.' },
  { id: 'luck',       label: 'Luck',  help: 'Actual wins minus wins expected from the all-play rate. Positive is fortunate.' },
  { id: 'z',          label: 'Z',     help: 'Standard deviations from the league average weekly score.' },
] as const;

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('whitespace-nowrap px-2.5 py-2 text-right tabular-nums', className)}>{children}</td>;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export default function ReportView() {
  const [report, setReport] = useState<Report | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [help, setHelp] = useState<string | null>(null);

  // 'current' means the live season through the last played week. Anything
  // else is a completed season, which never changes.
  const [season, setSeason] = useState('current');
  const [week, setWeek] = useState(0);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setReport(null);
    setReason(null);
    setOpen(null);
    const qs = season === 'current'
      ? ''
      : `?season=${season}${week ? `&week=${week}` : ''}`;
    fetch(`/api/report${qs}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setError(null);
        setReport(d.report);
        setReason(d.reason ?? null);
        if (d.seasons?.length) setSeasons(d.seasons);
        setWeeks(d.weeks ?? []);
      })
      .catch(() => setError('Could not load the report.'))
      .finally(() => setLoading(false));
  }, [season, week]);

  const positions = useMemo(() => {
    const seen = new Set<string>();
    for (const t of report?.teams ?? []) for (const p of t.pointsByPosition) seen.add(p.position);
    return [...seen];
  }, [report]);

  const pickerClass =
    'rounded-md border border-border bg-background px-2.5 py-1.5 text-base text-foreground ' +
    'focus:border-primary focus:outline-none sm:text-xs';

  const subtitle = report
    ? `${report.leagueName}, ${report.season} through week ${report.throughWeek}`
    : 'Coaching efficiency, all-play records and optimal lineups.';

  return (
    <PageLayout title="Weekly Report" subtitle={subtitle}>
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-500">{error}</div>
      )}

      {/* Season and week pickers. A past report is exact, not reconstructed:
          Sleeper stores each week's roster and points permanently. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          value={season}
          aria-label="Season"
          onChange={e => { setSeason(e.target.value); setWeek(0); }}
          className={pickerClass}
        >
          <option value="current">This season, to date</option>
          {seasons.map(s => <option key={s} value={s}>{s} season</option>)}
        </select>

        {season !== 'current' && weeks.length > 0 && (
          <select
            value={week}
            aria-label="Through week"
            onChange={e => setWeek(Number(e.target.value))}
            className={pickerClass}
          >
            <option value={0}>Full season</option>
            {weeks.map(w => <option key={w} value={w}>Through week {w}</option>)}
          </select>
        )}

        {season !== 'current' && (
          <span className="text-[11px] text-muted-foreground">
            Rebuilt from that week&apos;s stored rosters and scores, not from today&apos;s.
          </span>
        )}
      </div>

      {loading && !report && !error && !reason && (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-2.5 w-28" />
            <div className="mt-3"><SkeletonBars rows={8} /></div>
          </section>
          <SkeletonTable rows={8} cols={8} />
        </div>
      )}

      {reason && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{reason}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The report fills in once the season starts.
          </p>
        </div>
      )}

      {report && (
        <div className="space-y-6">
          {/* Playoff odds. Above the table because it is the question everyone
              actually opens this page to answer. */}
          {report.odds && report.odds.teams.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  Playoff odds
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  {report.odds.simulations.toLocaleString()} simulations
                  {report.odds.remainingGames > 0
                    ? `, ${report.odds.remainingGames} games left`
                    : ', regular season complete'}
                  {' '}&middot; top {report.playoffTeams} qualify
                </p>
              </div>

              <div className="mt-3 space-y-2">
                {[...report.odds.teams]
                  .sort((a, b) => b.playoffOdds - a.playoffOdds || b.titleOdds - a.titleOdds)
                  .map(o => (
                    <div key={o.rosterId} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-[13px] font-semibold text-foreground sm:w-40">
                        {o.teamName}
                      </span>
                      <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-muted">
                        <div
                          className={cn('h-full rounded-md transition-all',
                            o.clinched ? 'bg-emerald-500/35'
                              : o.eliminated ? 'bg-muted-foreground/20' : 'bg-primary/30')}
                          style={{ width: `${Math.max(o.playoffOdds, o.eliminated ? 0 : 1.5)}%` }}
                        />
                        {/* Title odds nest inside the playoff bar, because a
                            team can only win it from inside the field. The
                            outer bar is deliberately the faint one: drawing
                            both solid made the inner segment invisible. */}
                        {o.titleOdds > 0 && (
                          <div
                            className={cn('absolute inset-y-0 left-0 rounded-md',
                              o.clinched ? 'bg-emerald-500' : 'bg-primary')}
                            style={{ width: `${o.titleOdds}%` }}
                          />
                        )}
                      </div>
                      <span className="w-12 shrink-0 text-right text-[13px] font-semibold tabular-nums text-foreground">
                        {o.clinched ? 'in' : o.eliminated ? 'out' : `${o.playoffOdds}%`}
                      </span>
                      <span className="hidden w-14 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground sm:block">
                        {o.titleOdds}%
                      </span>
                    </div>
                  ))}
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                The rest of the season played out {report.odds.simulations.toLocaleString()}{' '}times,
                drawing each week from that team&apos;s own scoring average and spread, then resolving
                the standings on record with points as the tiebreak. The full bar is the chance of
                reaching the playoffs; the brighter section inside it
                <span className="hidden sm:inline">, and the right-hand figure,</span> is the chance
                of winning the whole thing.
              </p>
            </section>
          )}

          {/* The main table. Scrolls inside itself so the page never does. */}
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="px-3 py-2.5 text-left font-bold">Team</th>
                    {COLUMNS.map(c => (
                      <th key={c.id} className="px-2.5 py-2.5 text-right font-bold">
                        <button
                          onClick={() => setHelp(help === c.id ? null : c.id)}
                          className="inline-flex items-center gap-1 hover:text-primary"
                          title={c.help}
                        >
                          {c.label}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.teams.map((t, i) => (
                    <motion.tr
                      key={t.rosterId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i, 10) * 0.02 }}
                      onClick={() => setOpen(open === t.rosterId ? null : t.rosterId)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2">
                        <span className="block truncate font-semibold text-foreground">{t.teamName}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{t.manager}</span>
                      </td>
                      <Cell className="font-bold text-primary">{t.powerRank}</Cell>
                      <Cell>{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ''}</Cell>
                      <Cell>{t.pointsFor}</Cell>
                      <Cell>{t.averageScore}</Cell>
                      <Cell className="text-muted-foreground">{t.averageOptimal}</Cell>
                      <Cell className={cn('font-semibold',
                        (t.efficiency ?? 0) >= 90 ? 'text-emerald-500'
                          : (t.efficiency ?? 0) < 80 ? 'text-amber-500' : 'text-foreground')}>
                        {t.efficiency === null ? ',' : `${t.efficiency}%`}
                      </Cell>
                      <Cell className="text-muted-foreground">{t.pointsLeftOnBench}</Cell>
                      <Cell>{t.allPlayPct}%</Cell>
                      <Cell className="text-muted-foreground">{t.medianWins}-{t.medianLosses}</Cell>
                      <Cell className={cn(t.luck > 0 ? 'text-emerald-500' : t.luck < 0 ? 'text-rose-500' : '')}>
                        {signed(t.luck)}
                      </Cell>
                      <Cell className="text-muted-foreground">{signed(t.zScore)}</Cell>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
            {help && (
              <p className="border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                <Info className="mr-1 inline h-3 w-3" />
                {COLUMNS.find(c => c.id === help)?.help}
              </p>
            )}
            <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              Tap a column heading for what it means. Tap a row for that team&apos;s points by position.
              {report.medianMatch && ' Records include this league\'s weekly median match, so each week counts as two games.'}
            </p>
          </section>

          {/* Points by position for whichever row is open. */}
          {open !== null && (() => {
            const t = report.teams.find(x => x.rosterId === open);
            if (!t) return null;
            const max = Math.max(...t.pointsByPosition.map(p => p.points), 1);
            return (
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  {t.teamName}, points by position
                </h2>
                <div className="mt-3 space-y-2">
                  {t.pointsByPosition.map(p => (
                    <div key={p.position} className="flex items-center gap-3">
                      <span className="w-10 shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        {p.position}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary"
                          style={{ width: `${(p.points / max) * 100}%` }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-[13px] tabular-nums text-foreground">
                        {p.points}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Roster weight: {t.beefLbs.toLocaleString()} lbs. Ranks this season, score{' '}
                  {t.scoreRank}, efficiency {t.efficiencyRank}, luck {t.luckRank}.
                </p>
              </section>
            );
          })()}

          {/* Weekly extremes. */}
          <div className="grid gap-4 md:grid-cols-3">
            {([
              ['Weekly highs', report.weeklyHighs.slice(-6).reverse(), (r: any) => `${r.points}`],
              ['Weekly lows', report.weeklyLows.slice(-6).reverse(), (r: any) => `${r.points}`],
              ['Best coaching', report.bestEfficiency.slice(-6).reverse(), (r: any) => `${r.efficiency}%`],
            ] as const).map(([title, rows, fmt]) => (
              <section key={title} className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  {title}
                </h2>
                <ul className="space-y-1.5">
                  {rows.map((r: any) => (
                    <li key={r.week} className="flex items-baseline gap-2 text-[13px]">
                      <span className="w-8 shrink-0 text-[11px] text-muted-foreground">W{r.week}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground">{r.teamName}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{fmt(r)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Attribution. Required, and specific about what was and was not taken. */}
          <section className="rounded-xl border border-border bg-muted/30 p-4">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Credit
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-foreground/85">
              These metrics were popularised by the{' '}
              <a
                href="https://github.com/uberfastman/fantasy-football-metrics-weekly-report"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                Fantasy Football Metrics Weekly Report
                <ExternalLink className="h-3 w-3" />
              </a>{' '}
              by uberfastman, a Python tool that generates a PDF report for Yahoo, ESPN, CBS,
              Sleeper and Fleaflicker leagues. If you want the full report, emailed as a PDF with
              charts and team pages, use it directly. It is worth your time.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              This page is an independent implementation of the metric definitions, written in
              TypeScript against the Sleeper API. That project is licensed GPL-3.0 and LeaguePulse
              is not, so no code from it is used or included here.
            </p>
          </section>
        </div>
      )}
    </PageLayout>
  );
}
