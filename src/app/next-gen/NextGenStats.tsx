'use client';

/**
 * Next-Gen Stats: how each team wins (or does not), beyond the standings.
 *
 * One season or all time (every season the league has played). Each view
 * answers one question:
 *   Teams         a card per team: scoring, its shape over the season (or,
 *                 all time, season by season), and six measures of style
 *   Radar         each team's shape against the league's average shape
 *   Head to head  two teams overlaid, measure by measure
 *   Career        the all-time record book (CareerMetrics)
 *
 * Playoffs and titles come from each season's bracket (lib/api,
 * seasonPostseason): all time they are counts, never one season's flag.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import Hint from '@/components/ui/Hint';
import TabSelector from '@/components/ui/TabSelector';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { ChevronDown, Flame, Heart, Rocket, Scale, ShieldCheck, Star, TrendingUp, Trophy, Zap } from '@/components/icons';
import { getAdvancedTeamMetrics } from '@/lib/api';
import { cn } from '@/lib/utils';
import CareerMetricsSection from './CareerMetrics';

type Team = Awaited<ReturnType<typeof getAdvancedTeamMetrics>>[number];
type MetricKey = 'consistency' | 'explosiveness' | 'clutch' | 'efficiency' | 'momentum' | 'luck';

const EASE = [0.22, 1, 0.36, 1] as const;
/** Two series colors, checked for color-blind separation, stepped for dark mode. */
const PAIR = '[--a:#2a78d6] [--b:#eb6834] dark:[--a:#3987e5] dark:[--b:#d95926]';

const METRICS: { key: MetricKey; label: string; icon: React.ComponentType<{ className?: string }>; help: string }[] = [
  { key: 'consistency', label: 'Consistency', icon: ShieldCheck, help: 'How steady the weekly scores are, from how much they vary around the average. High: the same team shows up every week.' },
  { key: 'explosiveness', label: 'Ceiling', icon: Zap, help: 'Share of weeks scoring more than 20% above the league average. High: the big weeks are real.' },
  { key: 'clutch', label: 'Clutch', icon: Heart, help: 'Win rate in games decided by under 10 points. With no close games yet, 50.' },
  { key: 'efficiency', label: 'Efficiency', icon: Rocket, help: 'How well points turn into wins: scoring not wasted on weeks already decided.' },
  { key: 'momentum', label: 'Finish', icon: TrendingUp, help: 'Win rate over the last four weeks of the regular season (50 until they are played). All time, summed across every season.' },
  { key: 'luck', label: 'Luck', icon: Scale, help: 'Wins compared with the wins the scoring deserved (expected wins). Above 50: the schedule has been kind.' },
];
const scoreOf = (t: Team, k: MetricKey) => t[k].score;
const record = (t: Team) => `${t.record.wins}-${t.record.losses}${t.record.ties ? `-${t.record.ties}` : ''}`;
const signed = (n: number, d = 1) => `${n > 0 ? '+' : ''}${n.toFixed(d)}`;

export default function NextGenStats({ initialMetrics, seasons, leagueId }: {
  initialMetrics: Team[]; seasons: string[]; leagueId: string;
}) {
  const [metrics, setMetrics] = useState<Team[]>(initialMetrics);
  const [loading, setLoading] = useState(false);
  const [season, setSeason] = useState('all-time');
  const [view, setView] = useState<'teams' | 'radar' | 'h2h' | 'career'>('teams');
  const [sort, setSort] = useState<'winPct' | 'ppg' | MetricKey>('winPct');
  const allTime = season === 'all-time';

  const changeSeason = async (next: string) => {
    setLoading(true); setSeason(next);
    try { setMetrics(await getAdvancedTeamMetrics(leagueId, next === 'all-time' ? undefined : next)); }
    catch (e) { console.error('Failed to fetch metrics:', e); }
    setLoading(false);
  };

  const sorted = useMemo(() => [...metrics].sort((a, b) => {
    if (sort === 'winPct') return b.record.winPct - a.record.winPct;
    if (sort === 'ppg') return b.points.average - a.points.average;
    return scoreOf(b, sort) - scoreOf(a, sort);
  }), [metrics, sort]);
  const leagueAvg = useMemo(() => Object.fromEntries(METRICS.map(m => [m.key, metrics.length ? metrics.reduce((s, t) => s + scoreOf(t, m.key), 0) / metrics.length : 0])) as Record<MetricKey, number>, [metrics]);
  const span = [...seasons].sort();
  const context = allTime
    ? `All time: ${seasons.length} season${seasons.length === 1 ? '' : 's'}${span.length > 1 ? `, ${span[0]} to ${span.at(-1)}` : ''}`
    : `The ${season} season`;

  return (
    <div className={cn('space-y-8', PAIR)}>
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Viewing</p>
          <p className="font-display text-lg font-bold tracking-tight">{context}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <TabSelector id="next-gen-view" aria-label="Stats view" value={view} onChange={setView}
            options={[{ id: 'teams', label: 'Teams' }, { id: 'radar', label: 'Radar' }, { id: 'h2h', label: 'Head to head' }, { id: 'career', label: 'Career' }] as const} />
          <SeasonSelect seasons={seasons} selectedSeason={season} onSeasonChange={changeSeason} className="min-w-[150px]" />
        </div>
      </div>

      {view !== 'career' && <Superlatives teams={metrics} loading={loading} />}

      <AnimatePresence mode="wait">
        {view === 'teams' && (
          <motion.div key="teams" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, ease: EASE }} className="space-y-4">
            <SortBar value={sort} onChange={setSort} />
            <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3 transition-opacity', loading && 'pointer-events-none opacity-50')}>
              {sorted.map((t, i) => <TeamCard key={`${season}-${t.userId}`} team={t} index={i} allTime={allTime} />)}
            </div>
          </motion.div>
        )}
        {view === 'radar' && (
          <motion.div key="radar" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, ease: EASE }}
            className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3 transition-opacity', loading && 'opacity-50')}>
            {sorted.map((t, i) => (
              <motion.div key={`${season}-${t.userId}`} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i, 9) * 0.04 }}
                className="rounded-2xl border border-border bg-card p-4">
                <TeamHeader team={t} allTime={allTime} size={34} />
                <Radar series={[{ team: t, color: 'hsl(var(--primary))' }]} average={leagueAvg} />
              </motion.div>
            ))}
          </motion.div>
        )}
        {view === 'h2h' && (
          <motion.div key="h2h" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, ease: EASE }}>
            <HeadToHead teams={sorted} allTime={allTime} average={leagueAvg} />
          </motion.div>
        )}
        {view === 'career' && <CareerMetricsSection key="career" season={season} />}
      </AnimatePresence>

      {view !== 'career' && <HowMeasured />}
    </div>
  );
}

// ── Superlatives ─────────────────────────────────────────────────────────────

function Superlatives({ teams, loading }: { teams: Team[]; loading: boolean }) {
  const picks: { title: string; key: MetricKey; icon: React.ComponentType<{ className?: string }>; value: (t: Team) => string; sub: (t: Team) => string }[] = [
    { title: 'Most consistent', key: 'consistency', icon: ShieldCheck, value: t => `${t.consistency.score.toFixed(0)}`, sub: t => `${t.points.standardDeviation.toFixed(1)} pt weekly swing` },
    { title: 'Highest ceiling', key: 'explosiveness', icon: Zap, value: t => `${t.explosiveness.explosiveGames}`, sub: t => `big weeks, best ${t.points.high.toFixed(1)}` },
    { title: 'Ice in the veins', key: 'clutch', icon: Heart, value: t => (t.clutch.closeGames ? `${t.clutch.closeWins}-${t.clutch.closeGames - t.clutch.closeWins}` : 'None yet'), sub: t => (t.clutch.closeGames ? 'in games within 10 points' : 'no games within 10 points yet') },
    { title: 'Most efficient', key: 'efficiency', icon: Rocket, value: t => `${t.efficiency.score.toFixed(0)}`, sub: t => `${t.points.average.toFixed(1)} points a game` },
    { title: 'Strongest finisher', key: 'momentum', icon: Flame, value: t => (t.momentum.lateSeasonRecord === '0-0' ? 'Not yet' : t.momentum.lateSeasonRecord), sub: t => (t.momentum.lateSeasonRecord === '0-0' ? 'the last four weeks are still to come' : 'over the last four weeks') },
    { title: 'Luckiest', key: 'luck', icon: Star, value: t => signed(t.luck.luckRating), sub: () => 'wins above expected' },
  ];
  if (!teams.length) return null;
  return (
    <div className={cn('-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6', loading && 'opacity-50')}>
      {picks.map((p, i) => {
        const ranked = [...teams].sort((a, b) => (p.key === 'luck' ? b.luck.luckRating - a.luck.luckRating : scoreOf(b, p.key) - scoreOf(a, p.key)));
        const best = ranked[0];
        const Icon = p.icon;
        return (
          <motion.div key={p.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, ease: EASE }}
            className="relative w-[46%] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card p-3.5 sm:w-auto">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <Icon className="h-3.5 w-3.5 text-primary" /> {p.title}
            </div>
            <Link href={`/team/${best.userId}`} className="mt-3 flex items-center gap-2 hover:opacity-80">
              <Avatar avatarId={best.avatar} size={28} className="rounded-lg" />
              <span className="truncate text-[13.5px] font-semibold">{best.teamName}</span>
            </Link>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums tracking-tight">{p.value(best)}</p>
            <p className="truncate text-[11.5px] text-muted-foreground">{p.sub(best)}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

function SortBar({ value, onChange }: { value: string; onChange: (v: 'winPct' | 'ppg' | MetricKey) => void }) {
  const options: [string, string][] = [['winPct', 'Win %'], ['ppg', 'Points'], ...METRICS.map(m => [m.key, m.label] as [string, string])];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12px] text-muted-foreground">Sort by</span>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v as never)} aria-pressed={value === v}
          className={cn('relative rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors', value === v ? 'text-background' : 'text-muted-foreground hover:text-foreground')}>
          {value === v && <motion.span layoutId="ng-sort" className="absolute inset-0 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ── A team ───────────────────────────────────────────────────────────────────

function TeamHeader({ team: t, allTime, size = 44 }: { team: Team; allTime: boolean; size?: number }) {
  return (
    <Link href={`/team/${t.userId}`} className="flex items-center gap-3 hover:opacity-85">
      <Avatar avatarId={t.avatar} size={size} className="rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold tracking-tight">{t.teamName}</p>
        <p className="text-[12.5px] tabular-nums text-muted-foreground">{record(t)}, {t.record.winPct.toFixed(1)}%</p>
      </div>
      <Honors team={t} allTime={allTime} />
    </Link>
  );
}

/** Champion or playoffs for a season; all time, how many of each. Only what happened. */
function Honors({ team: t, allTime }: { team: Team; allTime: boolean }) {
  const chips: { text: string; tone: string; icon: React.ComponentType<{ className?: string }> }[] = [];
  if (allTime) {
    if (t.championships) chips.push({ text: `${t.championships} title${t.championships === 1 ? '' : 's'}`, tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', icon: Trophy });
    if (t.playoffAppearances) chips.push({ text: `${t.playoffAppearances} playoff${t.playoffAppearances === 1 ? '' : 's'}`, tone: 'bg-muted text-muted-foreground', icon: Star });
  } else if (t.championship) chips.push({ text: 'Champion', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', icon: Trophy });
  else if (t.playoffAppearance) chips.push({ text: 'Playoffs', tone: 'bg-muted text-muted-foreground', icon: Star });
  if (!chips.length) return null;
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      {chips.map(c => (
        <span key={c.text} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', c.tone)}>
          <c.icon className="h-3 w-3" />{c.text}
        </span>
      ))}
    </span>
  );
}

function TeamCard({ team: t, index, allTime }: { team: Team; index: number; allTime: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 12) * 0.035, duration: 0.4, ease: EASE }}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-[0_10px_30px_-15px_rgba(0,0,0,0.25)] sm:p-5">
      <TeamHeader team={t} allTime={allTime} />
      <div className="grid grid-cols-2 gap-3">
        <BigNumber label="Points a game" value={t.points.average.toFixed(1)} />
        <BigNumber label="Against the league" value={signed(t.consistency.averageMargin)} tone={t.consistency.averageMargin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} />
      </div>
      {allTime && t.seasons.length > 1 ? <SeasonsChart team={t} /> : <WeeksChart scores={t.points.weeklyScores} />}
      <div className="space-y-2">
        {METRICS.filter(m => m.key !== 'luck').map(m => <Meter key={m.key} label={m.label} help={m.help} value={scoreOf(t, m.key)} />)}
        <LuckBar luck={t.luck.luckRating} help={METRICS.find(m => m.key === 'luck')!.help} />
      </div>
    </motion.div>
  );
}

function BigNumber({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={cn('font-display text-2xl font-bold tabular-nums tracking-tight', tone)}>{value}</p>
    </div>
  );
}

function Meter({ label, help, value }: { label: string; help: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="grid grid-cols-[88px_1fr_32px] items-center gap-2.5">
      <span className="text-[12px] text-muted-foreground"><Hint label={label} side="top">{help}</Hint></span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.span className="block h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.7, ease: EASE }} />
      </span>
      <span className="text-right text-[12px] font-semibold tabular-nums">{v.toFixed(0)}</span>
    </div>
  );
}

/** Wins above or below expected, as a bar either side of zero. */
function LuckBar({ luck, help }: { luck: number; help: string }) {
  const width = Math.min(50, (Math.abs(luck) / 6) * 50);
  return (
    <div className="grid grid-cols-[88px_1fr_32px] items-center gap-2.5 border-t border-border/60 pt-2">
      <span className="text-[12px] text-muted-foreground"><Hint label="Luck" side="top">{help}</Hint></span>
      <span className="relative h-1.5 rounded-full bg-muted">
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-border" />
        <motion.span className={cn('absolute top-0 h-full rounded-full', luck >= 0 ? 'left-1/2 bg-emerald-500' : 'right-1/2 bg-rose-500')}
          initial={{ width: 0 }} animate={{ width: `${width}%` }} transition={{ duration: 0.7, ease: EASE }} />
      </span>
      <span className={cn('text-right text-[12px] font-semibold tabular-nums', luck >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>{signed(luck)}</span>
    </div>
  );
}

/** One season: every week, above or below the team's own average, with the average drawn in. */
function WeeksChart({ scores }: { scores: number[] }) {
  if (!scores.length) return <p className="py-6 text-center text-[12.5px] text-muted-foreground">No games yet</p>;
  const max = Math.max(...scores), avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return (
    <figure>
      <figcaption className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>Week by week</span><span>Average {avg.toFixed(1)}</span>
      </figcaption>
      <div className="relative flex h-16 items-end gap-[2px]">
        <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/25" style={{ bottom: `${(avg / max) * 100}%` }} />
        {scores.map((s, i) => (
          <motion.span key={i} title={`Week ${i + 1}: ${s.toFixed(1)}`} initial={{ height: 0 }} animate={{ height: `${Math.max(4, (s / max) * 100)}%` }}
            transition={{ duration: 0.5, delay: i * 0.02, ease: EASE }}
            className={cn('min-w-0 flex-1 rounded-t-[3px]', s >= avg ? 'bg-primary' : 'bg-muted-foreground/30')} />
        ))}
      </div>
    </figure>
  );
}

/** All time: points a game, season by season; titles crowned, playoff seasons in full color. */
function SeasonsChart({ team: t }: { team: Team }) {
  const lines = t.seasons;
  const max = Math.max(...lines.map(l => l.ppg)), min = Math.min(...lines.map(l => l.ppg));
  const floor = Math.max(0, min - (max - min) * 0.6 - 5);
  const h = (v: number) => `${Math.max(8, ((v - floor) / (max - floor || 1)) * 100)}%`;
  return (
    <figure>
      <figcaption className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>Points a game, season by season</span>
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" />Playoffs</span>
          <span className="inline-flex items-center gap-1"><Trophy className="h-3 w-3 text-amber-500" />Title</span>
        </span>
      </figcaption>
      <div className="flex h-20 items-end gap-1">
        {lines.map((l, i) => (
          <div key={l.season} className="flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height: '100%' }}
            title={`${l.season}: ${l.ppg.toFixed(1)} a game, ${l.wins}-${l.losses}${l.ties ? `-${l.ties}` : ''}${l.champion ? ', champion' : l.playoff ? ', playoffs' : ''}`}>
            {l.champion && <Trophy className="mb-0.5 h-3 w-3 shrink-0 text-amber-500" />}
            <motion.span initial={{ height: 0 }} animate={{ height: h(l.ppg) }} transition={{ duration: 0.6, delay: i * 0.04, ease: EASE }}
              className={cn('w-full max-w-[22px] rounded-t-[4px]', l.playoff ? 'bg-primary' : 'bg-muted-foreground/30')} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {lines.map((l, i) => (
          <span key={l.season} className="min-w-0 flex-1 text-center text-[9.5px] tabular-nums text-muted-foreground">
            {lines.length <= 6 || i === 0 || i === lines.length - 1 || i % 3 === 0 ? `'${l.season.slice(-2)}` : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}

// ── Radar ────────────────────────────────────────────────────────────────────

function Radar({ series, average }: { series: { team: Team; color: string }[]; average?: Record<MetricKey, number> }) {
  const n = METRICS.length, R = 78;
  const at = (i: number, v: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2, r = (Math.max(0, Math.min(100, v)) / 100) * R;
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)] as const;
  };
  const shape = (vals: number[]) => vals.map((v, i) => at(i, v).join(',')).join(' ');
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px]">
      <svg viewBox="0 0 200 200" className="h-full w-full overflow-visible">
        {[25, 50, 75, 100].map(g => (
          <polygon key={g} points={shape(METRICS.map(() => g))} fill="none" className="stroke-border" strokeWidth={g === 100 ? 1 : 0.6} />
        ))}
        {METRICS.map((_, i) => { const [x, y] = at(i, 100); return <line key={i} x1={100} y1={100} x2={x} y2={y} className="stroke-border" strokeWidth={0.6} />; })}
        {average && (
          <polygon points={shape(METRICS.map(m => average[m.key]))} fill="none" className="stroke-muted-foreground/60" strokeWidth={1.2} strokeDasharray="3 3" />
        )}
        {series.map(({ team, color }, si) => (
          <motion.polygon key={team.userId} points={shape(METRICS.map(m => scoreOf(team, m.key)))}
            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: si * 0.1, ease: EASE }}
            style={{ transformOrigin: '100px 100px', fill: color, fillOpacity: 0.16, stroke: color }} strokeWidth={2} strokeLinejoin="round" />
        ))}
        {series.map(({ team, color }) => METRICS.map((m, i) => { const [x, y] = at(i, scoreOf(team, m.key)); return <circle key={`${team.userId}${m.key}`} cx={x} cy={y} r={2.6} style={{ fill: color }} className="stroke-card" strokeWidth={1.2} />; }))}
      </svg>
      {METRICS.map((m, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return (
          <span key={m.key} className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[10.5px] font-semibold text-muted-foreground"
            style={{ left: `${(100 + 96 * Math.cos(a)) / 2}%`, top: `${(100 + 92 * Math.sin(a)) / 2}%` }}>
            {m.label}{series.length === 1 && <span className="ml-1 text-foreground">{scoreOf(series[0].team, m.key).toFixed(0)}</span>}
          </span>
        );
      })}
      {average && series.length === 1 && (
        <p className="absolute bottom-0 right-0 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="w-4 border-t border-dashed border-muted-foreground" /> League average
        </p>
      )}
    </div>
  );
}

// ── Head to head ─────────────────────────────────────────────────────────────

function HeadToHead({ teams, allTime, average }: { teams: Team[]; allTime: boolean; average: Record<MetricKey, number> }) {
  const [a, setA] = useState(teams[0]?.userId ?? '');
  const [b, setB] = useState(teams[1]?.userId ?? '');
  const ta = teams.find(t => t.userId === a) ?? teams[0], tb = teams.find(t => t.userId === b) ?? teams[1];
  if (!ta || !tb) return <p className="text-sm text-muted-foreground">Head to head needs two teams.</p>;
  const pick = (id: string) => {
    if (id === a || id === b) return;
    setB(a); setA(id);
  };
  const rows: { label: string; help?: string; va: number; vb: number; fmt: (n: number) => string; higher?: boolean }[] = [
    { label: 'Win %', va: ta.record.winPct, vb: tb.record.winPct, fmt: n => `${n.toFixed(1)}%` },
    { label: 'Points a game', va: ta.points.average, vb: tb.points.average, fmt: n => n.toFixed(1) },
    { label: 'Best week', va: ta.points.high, vb: tb.points.high, fmt: n => n.toFixed(1) },
    ...(allTime ? [{ label: 'Titles', va: ta.championships, vb: tb.championships, fmt: (n: number) => String(n) }, { label: 'Playoffs', va: ta.playoffAppearances, vb: tb.playoffAppearances, fmt: (n: number) => String(n) }] : []),
    ...METRICS.map(m => ({ label: m.label, help: m.help, va: scoreOf(ta, m.key), vb: scoreOf(tb, m.key), fmt: (n: number) => n.toFixed(0) })),
  ];
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-[12.5px] text-muted-foreground">Tap a team to bring it in. The newest pick is blue.</p>
        <div className="flex flex-wrap gap-1.5">
          {teams.map(t => {
            const side = t.userId === ta.userId ? 'a' : t.userId === tb.userId ? 'b' : null;
            return (
              <button key={t.userId} onClick={() => pick(t.userId)}
                style={side ? { borderColor: `var(--${side})`, background: `color-mix(in srgb, var(--${side}) 12%, transparent)` } : undefined}
                className={cn('inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[12.5px] font-semibold transition',
                  side ? 'text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
                <Avatar avatarId={t.avatar} size={22} className="rounded-full" />
                <span className="max-w-[9rem] truncate">{t.teamName}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2 text-[13px] font-semibold">
            <span className="flex min-w-0 items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--a)]" /><span className="truncate">{ta.teamName}</span></span>
            <span className="text-muted-foreground">vs</span>
            <span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{tb.teamName}</span><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--b)]" /></span>
          </div>
          <Radar series={[{ team: ta, color: 'var(--a)' }, { team: tb, color: 'var(--b)' }]} average={average} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{ta.teamName} against {tb.teamName}</caption>
            <tbody>
              {rows.map(r => {
                const total = Math.max(r.va, r.vb, 0.0001);
                const lead = r.va === r.vb ? null : r.va > r.vb ? 'a' : 'b';
                return (
                  <tr key={r.label} className="border-b border-border/50 last:border-0">
                    <td className={cn('w-16 py-2 text-left tabular-nums', lead === 'a' ? 'font-bold' : 'text-muted-foreground')}>{r.fmt(r.va)}</td>
                    <td className="py-2">
                      <div className="mb-1 text-center text-[11.5px] text-muted-foreground">{r.help ? <Hint label={r.label}>{r.help}</Hint> : r.label}</div>
                      <div className="flex items-center gap-1">
                        <span className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-full bg-muted">
                          <motion.span className="h-full rounded-full bg-[var(--a)]" initial={{ width: 0 }} animate={{ width: `${(r.va / total) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
                        </span>
                        <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <motion.span className="h-full rounded-full bg-[var(--b)]" initial={{ width: 0 }} animate={{ width: `${(r.vb / total) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
                        </span>
                      </div>
                    </td>
                    <td className={cn('w-16 py-2 text-right tabular-nums', lead === 'b' ? 'font-bold' : 'text-muted-foreground')}>{r.fmt(r.vb)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── How it is measured ───────────────────────────────────────────────────────

function HowMeasured() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-border bg-card">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span>
          <span className="block text-[14.5px] font-semibold">How these are measured</span>
          <span className="block text-[12.5px] text-muted-foreground">Six measures of style, each from 0 to 100, from every game in the view</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-muted-foreground"><ChevronDown className="h-4 w-4" /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
            <div className="grid gap-5 border-t border-border px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
              {METRICS.map(m => (
                <div key={m.key}>
                  <p className="flex items-center gap-2 text-[13.5px] font-semibold"><m.icon className="h-4 w-4 text-primary" />{m.label}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.help}</p>
                </div>
              ))}
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Playoffs and titles come from each season&apos;s playoff bracket, once its regular season is over. All time, they are counted across
                  every season. If the league plays a weekly median game, records include it. All-time measures compare every week against the
                  all-time league average.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
