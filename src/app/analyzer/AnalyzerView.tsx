'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { PageLayout } from '@/components/layout/PageLayout';
import Avatar from '@/components/ui/Avatar';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';
import type { AnalyzerResponse, AnalyzerTeam, AnalyzerMode } from '@/app/api/analyzer/route';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
const POS_LABEL: Record<string, string> = { DEF: 'DST' };

// Mirrors the player rankings page: same two questions, same toggle.
const MODES = [
  { id: 'weekly',  label: 'Weekly',  blurb: 'Expert start/sit consensus for the week ahead' },
  { id: 'dynasty', label: 'Dynasty', blurb: 'Expert long-term asset value' },
] as const;

const ord = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th';
  return `${n}${s}`;
};

/**
 * Magnitude meter: one hue against a recessive track.
 *
 * Deliberately NOT tinted by rank. Colouring a bar by its standing makes the
 * hue follow position rather than the entity, so the same team changes colour
 * as the table re-sorts. The rank number carries that information instead.
 */
function Meter({
  label, value, max, rank, detail,
}: { label: string; value: number; max: number; rank?: number; detail?: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 1.5 : 0) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5" title={detail}>
      <span className="w-11 shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {value > 0 ? value : 'n/a'}
      </span>
      {rank != null && (
        <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
          {ord(rank)}
        </span>
      )}
    </div>
  );
}

/**
 * Starters vs bench, per position.
 *
 * A dumbbell rather than a radar: radar encodes magnitude as area, which grows
 * quadratically and makes the axis ordering arbitrary. Two shades of one hue,
 * and both ends are labelled so identity is never colour alone.
 */
function Dumbbell({ team, mode, max }: { team: AnalyzerTeam; mode: AnalyzerMode; max: number }) {
  return (
    <div className="space-y-2.5">
      {POSITIONS.map(g => {
        const { starters, bench } = team.positions[mode][g];
        const s = max > 0 ? (starters / max) * 100 : 0;
        const b = max > 0 ? (bench / max) * 100 : 0;
        const [lo, hi] = [Math.min(s, b), Math.max(s, b)];
        return (
          <div key={g} className="flex items-center gap-3"
            title={`${POS_LABEL[g] ?? g}: starters ${starters}, bench ${bench} expert value`}>
            <span className="w-11 shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {POS_LABEL[g] ?? g}
            </span>
            <div className="relative h-3 min-w-0 flex-1">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
              <div className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-primary/25"
                style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 0)}%` }} />
              <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/50 bg-card"
                style={{ left: `${b}%` }} />
              <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
                style={{ left: `${s}%` }} />
            </div>
            <span className="w-16 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
              {starters} / {bench}
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-end gap-4 pt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> Starters</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-primary/50 bg-card" /> Bench</span>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function AnalyzerView() {
  const [data, setData] = useState<AnalyzerResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<AnalyzerMode>('weekly');

  useEffect(() => {
    fetch('/api/analyzer')
      .then(r => r.json())
      .then(d => (d.error ? setFailed(true) : setData(d)))
      .catch(() => setFailed(true));
  }, []);

  const team = useMemo(
    () => data?.teams.find(t => t.userId === selected) ?? data?.teams[0] ?? null,
    [data, selected],
  );

  const scales = useMemo(() => {
    if (!data?.teams.length) return null;
    const posMax = Object.fromEntries(POSITIONS.map(g => [
      g, Math.max(...data.teams.map(t => t.positions[mode][g].value), 1),
    ])) as Record<string, number>;
    const splitMax = Math.max(
      ...data.teams.flatMap(t => POSITIONS.flatMap(g => [t.positions[mode][g].starters, t.positions[mode][g].bench])), 1);
    const slotMax = data.slotOrder.map((_, i) =>
      Math.max(...data.teams.map(t => t.slots[mode][i]?.value ?? 0), 1));
    return { posMax, splitMax, slotMax };
  }, [data, mode]);

  const activeMode = MODES.find(m => m.id === mode)!;

  if (failed) {
    return (
      <PageLayout title="Power Rankings" subtitle="League analyzer">
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Could not build the analyzer.
        </p>
      </PageLayout>
    );
  }

  if (!data) {
    return (
      <PageLayout title="Power Rankings" subtitle="League analyzer">
        <div className="flex justify-center py-20"><LoadingSpinner className="h-8 w-8" /></div>
      </PageLayout>
    );
  }

  // No production fallback by design: with no expert rankings there is nothing
  // forward-looking to rank on, and saying so beats quietly substituting a
  // different metric behind the same label.
  if (!data.ecrAvailable || !team || !scales) {
    return (
      <PageLayout title="Power Rankings" subtitle="Expert consensus">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm font-semibold text-foreground">No expert rankings cached yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            These rankings come entirely from FantasyPros expert consensus and refresh
            once a day. Nothing has been pulled yet.
          </p>
        </div>
      </PageLayout>
    );
  }

  const ordered = [...data.teams].sort((a, b) => a.ranks[mode] - b.ranks[mode]);
  const topScore = Math.max(...data.teams.map(t => t.scores[mode]), 1);
  const cov = team.coverage[mode];

  return (
    <PageLayout title="Power Rankings" subtitle={`${activeMode.blurb} · FantasyPros`}>
      <div className="mb-4 inline-flex rounded-lg border border-border bg-card p-0.5">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            disabled={!data.modesAvailable.includes(m.id)}
            className={cn(
              'relative rounded-md px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40',
              mode === m.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {mode === m.id && (
              <motion.span layoutId="analyzer-mode" className="absolute inset-0 rounded-md bg-primary"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
            )}
            <span className="relative">{m.label}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Panel title="Team Rankings">
          <ul className="space-y-0.5">
            {ordered.map(t => {
              const active = t.userId === team.userId;
              return (
                <li key={t.userId}>
                  <button
                    onClick={() => setSelected(t.userId)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                      active ? 'bg-primary/10' : 'hover:bg-muted/60',
                    )}
                  >
                    <span className="w-4 shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
                      {t.ranks[mode]}
                    </span>
                    <Avatar avatarId={t.avatar} size={22} className="shrink-0 rounded-md" />
                    <span className={cn('min-w-0 flex-1 truncate text-xs',
                      active ? 'font-semibold text-primary' : 'text-foreground')}>
                      {t.teamName}
                    </span>
                    <span className="relative h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-primary"
                        style={{ width: `${(t.scores[mode] / topScore) * 100}%` }} />
                    </span>
                    <span className="w-7 shrink-0 text-right font-display text-sm font-bold tabular-nums text-foreground">
                      {t.scores[mode]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
            Every ranked player is worth more the higher the experts place him, counted
            once per board he appears on.{' '}
            {mode === 'weekly'
              ? 'Weekly discounts the bench to 35%, since it is about who you start.'
              : 'Dynasty counts every ranked asset in full.'}
          </p>
        </Panel>

        <div className="min-w-0 space-y-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${team.userId}-${mode}`}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <Avatar avatarId={team.avatar} size={40} className="shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <Link href={`/team/${team.userId}`}
                    className="truncate font-display text-lg font-bold text-foreground hover:text-primary">
                    {team.teamName}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">
                    {ord(team.ranks[mode])} overall · starters {ord(team.startersRank[mode])}
                    {team.avgAge != null && ` · avg age ${team.avgAge}`}
                  </p>
                </div>
                <span className="shrink-0 font-display text-3xl font-bold tabular-nums text-primary">
                  {team.scores[mode]}
                </span>
              </div>

              {/* The score is only as good as its coverage, so state it beside
                  the number rather than burying it in a footnote. */}
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-3">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Coverage
                  </span>
                  <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-primary"
                      style={{ width: `${(cov.ranked / Math.max(cov.total, 1)) * 100}%` }} />
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-foreground">
                    {cov.ranked}/{cov.total}
                  </span>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  The free FantasyPros tier returns only the top 10 per board, so most
                  rostered players are unranked and score zero. This measures elite
                  talent, not full roster depth.
                </p>
              </div>

              <div className="grid items-start gap-4 md:grid-cols-2">
                <Panel title="Positional Value">
                  {POSITIONS.map(g => (
                    <Meter key={g} label={POS_LABEL[g] ?? g}
                      value={team.positions[mode][g].value}
                      max={scales.posMax[g]}
                      rank={team.positions[mode][g].rank}
                      detail={`${POS_LABEL[g] ?? g}: ${team.positions[mode][g].value} expert value · ${ord(team.positions[mode][g].rank)} in league`} />
                  ))}
                </Panel>

                <Panel title="Starter Value">
                  {team.slots[mode].map((s, i) => (
                    <Meter key={s.slot} label={s.slot} value={s.value} max={scales.slotMax[i]} rank={s.rank}
                      detail={`${s.slot}: ${s.player?.name ?? 'empty'}${s.bestRank ? ` · expert rank ${s.bestRank}` : ' · unranked'}`} />
                  ))}
                </Panel>
              </div>

              <Panel title="Starters vs Bench">
                <Dumbbell team={team} mode={mode} max={scales.splitMax} />
              </Panel>

              <Panel title="Starting Lineup">
                <ul className="divide-y divide-border">
                  {team.slots[mode].map(s => (
                    <li key={s.slot} className="flex items-center gap-3 py-2">
                      <span className="w-11 shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {s.slot}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {s.player?.name ?? <span className="text-muted-foreground">Empty</span>}
                      </span>
                      {s.player?.nflTeam && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {s.player.nflTeam}
                        </span>
                      )}
                      <span className="w-24 shrink-0 text-right text-[11px] tabular-nums">
                        {s.bestRank != null
                          ? <span className="font-semibold text-foreground">expert #{s.bestRank}</span>
                          : <span className="text-muted-foreground/60">unranked</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title={`Expert-Ranked Players (${team.elitePlayers[mode].length})`}>
                {team.elitePlayers[mode].length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {team.elitePlayers[mode].map(p => (
                      <span key={`${p.name}-${p.position}`}
                        className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] text-foreground">
                        {p.name}
                        <span className="ml-1 text-[9px] font-bold uppercase tracking-wider text-primary">
                          {p.posRank ?? p.position}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nobody on this roster appears on a cached {activeMode.label.toLowerCase()} board.
                  </p>
                )}
              </Panel>

              {data.fetchedAt && (
                <p className="text-center text-[10px] text-muted-foreground">
                  FantasyPros {activeMode.label.toLowerCase()} consensus
                  {data.season && ` · ${data.season}`} · cached{' '}
                  {new Date(data.fetchedAt).toLocaleString()}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </PageLayout>
  );
}
