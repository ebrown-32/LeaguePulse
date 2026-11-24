'use client';

/**
 * The Edge (lib/market/read): what leagues like this one are doing, turned into calls this
 * league can use. Its waiver wire against the field's rosters, the week's market, whose share of
 * lineups and rosters is moving, the big games the field sat, the draft's steals and busts, real
 * trades from leagues like this one, and every manager's lineup calls that went against the field.
 * Each player says who has him here, or that he's a free agent.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { SectionHeader } from '@/components/ui/kit';
import { Activity, ArrowLeftRight, Target, TrendingDown, TrendingUp, Users } from '@/components/icons';
import { initialsOf, playerPhoto } from '@/lib/playerPhoto';
import { cn } from '@/lib/utils';
import type { DraftValue, Edge, EdgePlayer, FieldTrade, Hit, Metric, Mover, Shift, TeamCalls, WaiverPick } from '@/lib/market/read';

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
      <span className="block truncate text-[11px] text-muted-foreground">
        {p.position}{p.team ? `, ${p.team}` : ''}
        {p.here === null && <span className="ml-1.5 rounded bg-emerald-500/12 px-1 py-px text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Free agent here</span>}
        {p.here && <span className="ml-1.5">{p.here}</span>}
      </span>
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
    <div className={cn('grid gap-3 sm:grid-cols-2', metrics.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
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

/** Players whose share of the field moved: now, and where it was. */
function ShiftList({ title, icon, items, noun, empty }: { title: string; icon: typeof TrendingUp; items: Shift[]; noun: string; empty: string }) {
  return (
    <div className={card}>
      <SectionHeader icon={icon} title={title} />
      <ol className="mt-3 space-y-2.5">
        {items.map(m => {
          const d = m.now - m.was;
          return (
            <li key={m.id} className="flex items-center gap-2.5">
              <Face p={m} size={30} />
              <span className="min-w-0 flex-1"><Who p={m} /></span>
              <span className="shrink-0 text-right">
                <span className={cn('block text-[12.5px] font-bold tabular-nums', d >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{d >= 0 ? 'Up' : 'Down'} {Math.abs(d).toFixed(0)}</span>
                <span className="block text-[10.5px] tabular-nums text-muted-foreground">{Math.round(m.was)}% to {Math.round(m.now)}% {noun}</span>
              </span>
            </li>
          );
        })}
        {!items.length && <li className="text-[13px] text-muted-foreground">{empty}</li>}
      </ol>
    </div>
  );
}

function Hits({ items }: { items: Hit[] }) {
  if (!items.length) return <p className={cn(card, 'text-[13px] text-muted-foreground')}>No big games slipped past the field last week.</p>;
  return (
    <ul className={cn(card, 'grid gap-x-6 gap-y-3 sm:grid-cols-2')}>
      {items.map(h => (
        <li key={h.id} className="flex items-center gap-2.5">
          <Face p={h} size={32} />
          <span className="min-w-0 flex-1"><Who p={h} /><span className="mt-0.5 block text-[11px] text-muted-foreground">Started in only {Math.round(h.startPct)}% of leagues</span></span>
          <span className="shrink-0 text-right"><span className="block text-[16px] font-extrabold tabular-nums">{h.points.toFixed(1)}</span><span className="block text-[10px] text-muted-foreground">pts when started</span></span>
        </li>
      ))}
    </ul>
  );
}

const ord = (n: number) => { const x = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (x[(v - 20) % 10] || x[v] || x[0]); };

function DraftList({ title, icon, items, steal }: { title: string; icon: typeof TrendingUp; items: DraftValue[]; steal: boolean }) {
  return (
    <div className={card}>
      <SectionHeader icon={icon} title={title} />
      <ol className="mt-3 space-y-2.5">
        {items.map(d => (
          <li key={d.id} className="flex items-center gap-2.5">
            <Face p={d} size={30} />
            <span className="min-w-0 flex-1"><Who p={d} /><span className="mt-0.5 block text-[11px] text-muted-foreground">Drafted {ord(d.adpRank)} on average (pick {d.adp.toFixed(0)}), {ord(d.ptsRank)} in points</span></span>
            <span className={cn('shrink-0 text-[12.5px] font-bold tabular-nums', steal ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{steal ? '+' : '-'}{Math.abs(d.adpRank - d.ptsRank)}<span className="block text-right text-[10px] font-normal text-muted-foreground">spots</span></span>
          </li>
        ))}
        {!items.length && <li className="text-[13px] text-muted-foreground">Nobody stands out yet.</li>}
      </ol>
    </div>
  );
}

function Trades({ items }: { items: FieldTrade[] }) {
  if (!items.length) return <p className={cn(card, 'text-[13px] text-muted-foreground')}>No trades in the field over the last three weeks.</p>;
  const side = (s: FieldTrade['sides'][number]) => [...s.players.map(p => p.name), ...s.picks.map(x => `${x} pick`), ...(s.faab ? [`$${s.faab} of budget`] : [])];
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((t, i) => (
        <li key={i} className={card}>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Week {t.week}</p>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-2.5">
            {t.sides.map((s, k) => (
              <div key={k} className={cn('min-w-0', k === 1 && 'order-3')}>
                <p className="text-[10.5px] font-semibold text-muted-foreground">{k === 0 ? 'One side got' : 'The other got'}</p>
                <ul className="mt-1 space-y-1.5">
                  {s.players.map(p => (
                    <li key={p.id} className="flex items-center gap-2"><Face p={p} size={24} /><span className="min-w-0"><span className="block truncate text-[12.5px] font-semibold">{p.name}</span>{p.here !== undefined && <span className="block truncate text-[10.5px] text-muted-foreground">{p.here === null ? 'Free agent here' : p.here}</span>}</span></li>
                  ))}
                  {side(s).slice(s.players.length).map(x => <li key={x} className="text-[12.5px] font-semibold">{x}</li>)}
                </ul>
              </div>
            ))}
            <ArrowLeftRight className="order-2 mt-5 h-4 w-4 text-muted-foreground" />
          </div>
        </li>
      ))}
    </ul>
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
          <p className="text-[13.5px] font-semibold">Compared with {f.leagues.toLocaleString()} Sleeper leagues: {f.label}</p>
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

      {edge.lineups && (edge.lineups.risers.length > 0 || edge.lineups.fallers.length > 0) && (
        <section className="space-y-3">
          <SectionHeader icon={TrendingUp} title="Lineups on the move" meta={`Week ${f.week} against week ${f.week - 1}`} />
          <p className="text-[13px] text-muted-foreground">Whose share of the field&apos;s starting lineups changed most in a week: roles won and lost, before your league notices.</p>
          <div className="grid gap-3 lg:grid-cols-3">
            <ShiftList title="Into lineups" icon={TrendingUp} items={edge.lineups.risers} noun="start him" empty="Nobody jumped this week." />
            <ShiftList title="Out of lineups" icon={TrendingDown} items={edge.lineups.fallers} noun="start him" empty="Nobody fell out this week." />
            <ShiftList title="Being stashed" icon={Target} items={edge.stashes ?? []} noun="roster him" empty="No stashes building over the last two weeks." />
          </div>
        </section>
      )}

      {edge.hits && (
        <section className="space-y-3">
          <SectionHeader icon={Activity} title="The games the field sat" meta={`Week ${f.week}`} />
          <p className="text-[13px] text-muted-foreground">Big games from players most leagues like yours left on the bench. Somebody saw it coming.</p>
          <Hits items={edge.hits} />
        </section>
      )}

      {edge.draft && (
        <section className="space-y-3">
          <SectionHeader icon={Target} title="The draft, graded" meta={`${edge.draft.drafts.toLocaleString()} drafts`} />
          <p className="text-[13px] text-muted-foreground">Where the field drafted each player against where he ranks in points this season.</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <DraftList title="Steals" icon={TrendingUp} items={edge.draft.steals} steal />
            <DraftList title="Busts" icon={TrendingDown} items={edge.draft.busts} steal={false} />
          </div>
        </section>
      )}

      {edge.trades && (
        <section className="space-y-3">
          <SectionHeader icon={ArrowLeftRight} title="Trades in leagues like yours" meta="Last three weeks" />
          <p className="text-[13px] text-muted-foreground">Real trades from the field, as they were made. Ones with a player rostered in your league come first: this is what he goes for.</p>
          <Trades items={edge.trades} />
        </section>
      )}

      <section className="space-y-3">
        <SectionHeader icon={Users} title="Calls against the field" meta={`Week ${f.week}`} />
        <p className="text-[13px] text-muted-foreground">Last week&apos;s lineup decisions that went against what leagues like yours did, and how they turned out.</p>
        <Calls teams={edge.calls ?? []} />
      </section>

      {edge.sample && edge.sample.length > 0 && (
        <section className="space-y-3">
          <SectionHeader icon={Users} title="Who the field is" meta={`Week ${f.week}`} />
          <div className={card}>
            <p className="text-[13px] text-muted-foreground">The market&apos;s biggest groups of leagues this week. Yours is compared with the ones marked.</p>
            <ul className="mt-3 space-y-2">
              {edge.sample.map(x => {
                const top = Math.max(...edge.sample!.map(y => y.leagues));
                return (
                  <li key={x.label} className="grid grid-cols-[minmax(0,220px)_1fr_auto] items-center gap-3 text-[12.5px]">
                    <span className={cn('truncate', x.yours ? 'font-bold text-foreground' : 'text-muted-foreground')}>{x.label}{x.yours ? ' (your field)' : ''}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className={cn('block h-full rounded-full', x.yours ? 'bg-primary' : 'bg-foreground/25')} style={{ width: `${(x.leagues / top) * 100}%` }} /></span>
                    <span className="tabular-nums text-muted-foreground">{x.leagues.toLocaleString()}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
