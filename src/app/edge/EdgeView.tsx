'use client';

/**
 * The Edge (lib/market/read): what leagues like this one are doing, turned into calls this
 * league can use. Its waiver wire against the field's rosters, the week's market, and every
 * manager's lineup calls that went against the field.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { SectionHeader } from '@/components/ui/kit';
import { Activity, ArrowLeftRight, Target, TrendingDown, TrendingUp, Users } from '@/components/icons';
import { initialsOf, playerPhoto } from '@/lib/playerPhoto';
import { cn } from '@/lib/utils';
import type { Edge, EdgePlayer, Metric, Mover, TeamCalls, WaiverPick } from '@/lib/market/read';

const card = 'rounded-2xl border border-border bg-card p-4 sm:p-5';

/** "5% of budget", "$0", "over 20%". */
function bid(pct: number | null | undefined): string {
  if (pct == null) return '';
  if (pct === 0) return '$0';
  return pct >= 20 ? 'over 20%' : `up to ${pct}%`;
}

function Face({ p, size = 36 }: { p: EdgePlayer; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = playerPhoto({ playerId: p.id, position: p.position, nflTeam: p.team });
  return (
    <span className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-bold text-muted-foreground" style={{ width: size, height: size }}>
      {initialsOf(p.name)}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && !broken && <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={cn('absolute inset-0 h-full w-full', p.position === 'DEF' ? 'object-contain p-1' : 'object-cover object-top')} />}
    </span>
  );
}

function Who({ p }: { p: EdgePlayer }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-[13.5px] font-semibold">{p.name}</span>
      <span className="block text-[11px] text-muted-foreground">{p.position}{p.team ? ` · ${p.team}` : ''}</span>
    </span>
  );
}

/** A share of the field, as a thin bar with its number. */
function Share({ value, label }: { value: number; label?: string }) {
  return (
    <span className="flex w-28 shrink-0 flex-col items-end gap-1 sm:w-36">
      <span className="text-[12px] font-semibold tabular-nums">{Math.round(value)}%{label ? <span className="font-normal text-muted-foreground"> {label}</span> : null}</span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.span className="block h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${Math.min(100, value)}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
      </span>
    </span>
  );
}

function VsField({ metrics }: { metrics: Metric[] }) {
  const say = (m: Metric) => m.higherIs === 'busier'
    ? (m.percentile >= 50 ? `Busier than ${m.percentile}% of leagues like yours` : `Quieter than ${100 - m.percentile}% of leagues like yours`)
    : (m.percentile >= 50 ? `Higher than ${m.percentile}% of leagues like yours` : `Lower than ${100 - m.percentile}% of leagues like yours`);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {metrics.map(m => (
        <div key={m.id} className={card}>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{m.label}</p>
          <p className="mt-2 text-[28px] font-extrabold leading-none tabular-nums">{m.mine}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">Typical league: {m.median}</p>
          {/* Where this league sits among the field: the marker on a track from least to most. */}
          <div className="relative mt-4 h-1.5 rounded-full bg-muted" role="img" aria-label={`${m.percentile}th percentile`}>
            <motion.span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow"
              initial={{ left: '50%' }} animate={{ left: `${Math.max(3, Math.min(97, m.percentile))}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
          </div>
          <p className="mt-2 text-[12.5px] font-medium">{say(m)}</p>
        </div>
      ))}
    </div>
  );
}

function Waiver({ picks }: { picks: WaiverPick[] }) {
  if (!picks.length) return <p className={cn(card, 'text-[13px] text-muted-foreground')}>Nothing the field rosters is sitting on your wire. Your league doesn&apos;t miss much.</p>;
  return (
    <ul className={cn(card, 'divide-y divide-border p-0 sm:p-0')}>
      {picks.map(p => (
        <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <Face p={p} />
          <span className="min-w-0 flex-1">
            <Who p={p} />
            <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
              Rostered in {Math.round(p.rosteredPct)}% of leagues{p.ppgStarted != null ? `, ${p.ppgStarted} pts when started` : ''}
              {p.bid50 != null ? `. Winning bids ${bid(p.bid50)} of budget` : ''}
            </span>
          </span>
          <Share value={p.startPct} label="start him" />
        </li>
      ))}
    </ul>
  );
}

function MoverList({ title, icon, items, unit, bids }: { title: string; icon: typeof TrendingUp; items: Mover[]; unit: string; bids?: boolean }) {
  return (
    <div className={card}>
      <SectionHeader icon={icon} title={title} />
      <ol className="mt-3 space-y-2.5">
        {items.map((m, i) => (
          <li key={m.id} className="flex items-center gap-2.5">
            <span className="w-4 text-right text-[11px] font-bold tabular-nums text-muted-foreground">{i + 1}</span>
            <Face p={m} size={30} />
            <span className="min-w-0 flex-1">
              <Who p={m} />
              {bids && m.bid50 != null && <span className="block text-[11px] text-muted-foreground">Half of winning bids {bid(m.bid50)}; three in four {bid(m.bid75)}</span>}
            </span>
            <span className="shrink-0 text-[12px] font-semibold tabular-nums">{m.pct}%<span className="block text-right text-[10px] font-normal text-muted-foreground">{unit}</span></span>
          </li>
        ))}
        {!items.length && <li className="text-[13px] text-muted-foreground">Nothing yet this week.</li>}
      </ol>
    </div>
  );
}

function Calls({ teams }: { teams: TeamCalls[] }) {
  const withCalls = teams.filter(t => t.calls.length);
  const [pick, setPick] = useState<number | null>(null);
  const team = useMemo(() => withCalls.find(t => t.rosterId === pick) ?? withCalls[0], [withCalls, pick]);
  if (!withCalls.length) return <p className={cn(card, 'text-[13px] text-muted-foreground')}>Every lineup last week went with the field. A league of conformists.</p>;
  return (
    <div className={card}>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {withCalls.map(t => (
          <button key={t.rosterId} onClick={() => setPick(t.rosterId)} aria-pressed={team?.rosterId === t.rosterId}
            className={cn('flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition',
              team?.rosterId === t.rosterId ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.avatar && <img src={t.avatar} alt="" className="h-5 w-5 rounded-full" />}
            {t.name}
            <span className="rounded-full bg-muted px-1.5 text-[10.5px] tabular-nums">{t.calls.length}</span>
          </button>
        ))}
      </div>
      {team && (
        <ul className="mt-3 divide-y divide-border">
          {team.calls.map(c => (
            <li key={c.id} className="flex items-center gap-3 py-3">
              <Face p={c} />
              <span className="min-w-0 flex-1">
                <Who p={c} />
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  {c.kind === 'benched'
                    ? <>Benched. Leagues like yours started him {c.fieldStartPct}% of the time.</>
                    : <>Started him. Only {c.fieldStartPct}% of leagues like yours did.</>}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[17px] font-extrabold tabular-nums">{c.points.toFixed(1)}</span>
                <span className="block text-[10px] text-muted-foreground">pts</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EdgeView() {
  const [edge, setEdge] = useState<Edge | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/market/edge').then(r => r.json()).then(d => (d.error ? setError(d.error) : setEdge(d))).catch(() => setError('The Edge could not be read right now.'));
  }, []);

  if (error) return <p className={cn(card, 'text-[13.5px]')}>{error}</p>;
  if (!edge) return <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />)}</div>;

  if (!edge.ready || !edge.field) {
    return (
      <div className={cn(card, 'p-6 text-center sm:p-10')}>
        <Target className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 text-[17px] font-bold">The Edge is still learning.</p>
        <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-muted-foreground">
          It compares your league with others like it ({edge.format}), and needs a few more of them first.
          {edge.sampled ? ` ${edge.sampled.toLocaleString()} Sleeper leagues sampled so far this season.` : ''} Check back after the next game week.
        </p>
      </div>
    );
  }

  const f = edge.field;
  return (
    <div className="space-y-8">
      <div className={cn(card, 'flex flex-wrap items-center justify-between gap-3')}>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold">Compared with {f.leagues.toLocaleString()} Sleeper leagues: {f.label.toLowerCase()}</p>
          <p className="text-[12px] text-muted-foreground">
            Through week {f.week}, {f.season}.{!f.exact ? ` Not enough leagues match yours exactly (${edge.format}) yet, so this is the closest group.` : ''} Counts only, from public leagues; no names.
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-[11.5px] font-bold text-primary">{edge.sampled.toLocaleString()} leagues sampled</span>
      </div>

      {edge.vsField && edge.vsField.length > 0 && (
        <section className="space-y-3">
          <SectionHeader icon={Users} title="Your league vs the field" meta="Season so far" />
          <VsField metrics={edge.vsField} />
        </section>
      )}

      <section className="space-y-3">
        <SectionHeader icon={Target} title="Your waiver edge" meta={`Week ${f.week}`} />
        <p className="text-[13px] text-muted-foreground">Players leagues like yours are starting, sitting unowned in yours.</p>
        <Waiver picks={edge.waiver ?? []} />
      </section>

      <section className="space-y-3">
        <SectionHeader icon={Activity} title="The market this week" meta={`Week ${f.week}`} />
        <div className="grid gap-3 lg:grid-cols-3">
          <MoverList title="Most added" icon={TrendingUp} items={edge.movers?.added ?? []} unit="of leagues" bids />
          <MoverList title="Most dropped" icon={TrendingDown} items={edge.movers?.dropped ?? []} unit="of leagues" />
          <MoverList title="Most traded for" icon={ArrowLeftRight} items={edge.movers?.tradedFor ?? []} unit="3 weeks" />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader icon={Users} title="Calls against the field" meta={`Week ${f.week}`} />
        <p className="text-[13px] text-muted-foreground">Last week&apos;s lineup decisions that went against what leagues like yours did, and how they turned out.</p>
        <Calls teams={edge.calls ?? []} />
      </section>
    </div>
  );
}
