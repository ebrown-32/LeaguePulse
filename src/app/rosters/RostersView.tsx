'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PageLayout } from '@/components/layout/PageLayout';
import Avatar from '@/components/ui/Avatar';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';
import { POSITION_STYLE } from './positions';
import PlayerDetailModal from './PlayerDetailModal';
import DynastyBreakdown from './DynastyBreakdown';
import type { AnalysisPlayer, AnalysisResponse } from '@/app/api/rosters/analysis/route';

/**
 * Rosters.
 *
 * Pick a team, see their players, tap one to go deep. That is the whole page.
 *
 * It has been two other things: eight stacked lists nobody could compare, and
 * then a filter bench with axis pickers and league-wide scatter plots that
 * answered questions most people were not asking. Both failed the same way, by
 * making the reader assemble the view before they could read anything. The
 * roster is the view.
 *
 * The dynasty breakdown sits underneath rather than beside, and only appears in
 * a league Sleeper reports as dynasty, because in a redraft league none of it
 * means anything.
 */

/** Starters first, then the bench, each in the league's own position order. */
const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
function positionRank(p: AnalysisPlayer): number {
  const i = POSITION_ORDER.indexOf(p.position);
  return i === -1 ? POSITION_ORDER.length : i;
}

function feetInches(inches: number | null): string {
  if (inches == null) return '';
  return `${Math.floor(inches / 12)}'${inches % 12}`;
}

function PlayerRow({ player, onOpen, best, forwardLooking, pointsLabel }: {
  player: AnalysisPlayer; onOpen: () => void; best: number;
  /** False for a past season or a specific week, where there is nothing to
   *  project and the only number worth showing is what actually happened. */
  forwardLooking: boolean;
  pointsLabel: string;
}) {
  const style = POSITION_STYLE[player.position] ?? POSITION_STYLE.DEFAULT;
  // The bar measures whichever number leads: the projection on a live roster,
  // the points actually scored on a historical one.
  const lead = forwardLooking ? player.projectedPoints : player.points;
  const pct = lead != null && best > 0 ? Math.max(3, (lead / best) * 100) : 0;

  const detail = [
    player.nflTeam,
    player.age != null ? `${player.age}yr` : null,
    player.weight != null ? `${feetInches(player.height)}, ${player.weight}lb` : null,
    player.depthChartOrder ? `depth ${player.depthChartOrder}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <button
      onClick={onOpen}
      className="group relative flex w-full items-center gap-3 overflow-hidden px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
    >
      <span
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 opacity-[0.07] transition-opacity group-hover:opacity-[0.14]',
          style.bar,
        )}
        style={{ width: `${pct}%` }}
      />

      <span className={cn(
        'relative flex h-8 w-9 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold tracking-wider',
        style.badge,
      )}>
        {player.position}
      </span>

      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
            {player.name}
          </span>
          {player.injuryStatus && (
            <span className="shrink-0 rounded border border-rose-500/25 bg-rose-500/10 px-1 py-px text-[8px] font-bold uppercase tracking-widest text-rose-500">
              {player.injuryStatus}
            </span>
          )}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
      </span>

      <span className="relative shrink-0 text-right">
        <span className="block font-display text-sm font-bold tabular-nums text-foreground">
          {lead != null ? lead.toFixed(forwardLooking ? 0 : 1) : '–'}
        </span>
        <span className="block text-[10px] tabular-nums text-muted-foreground">
          {forwardLooking && player.points != null
            ? `${player.points.toFixed(0)} ${pointsLabel}`
            : pointsLabel}
        </span>
      </span>
    </button>
  );
}

/**
 * Season and week, as one control.
 *
 * Seasons are a short fixed list, so they sit as a segmented row. Weeks are
 * up to eighteen, so they scroll, with the current selection pulled into view
 * whenever it changes: landing on week 14 with the strip parked at week 1
 * leaves the reader with no idea where they are.
 */
function TimeMachine({
  seasons, season, onSeason, weeks, week, onWeek, nowLabel,
}: {
  seasons: string[];
  season: string;
  onSeason: (s: string) => void;
  weeks: number[];
  week: number | null;
  onWeek: (w: number | null) => void;
  nowLabel: string;
}) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = strip.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [week, season]);

  const chip = (active: boolean) => cn(
    'relative shrink-0 rounded-lg px-3 text-[12px] font-bold tabular-nums transition-all',
    'min-h-[34px] inline-flex items-center justify-center',
    active
      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  );

  return (
    <section className="lp-glass overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Season
        </span>
        <div className="no-scrollbar ml-auto flex gap-1 overflow-x-auto">
          {[...seasons].sort((a, b) => Number(b) - Number(a)).map(s => (
            <button key={s} onClick={() => onSeason(s)} aria-pressed={s === season}
              className={chip(s === season)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Week
        </span>
        <div ref={strip} className="no-scrollbar flex gap-1 overflow-x-auto">
          <button
            onClick={() => onWeek(null)}
            aria-pressed={week === null}
            data-active={week === null}
            className={cn(chip(week === null), 'px-3.5')}
          >
            {nowLabel}
          </button>
          {weeks.map(w => (
            <button key={w} onClick={() => onWeek(w)} aria-pressed={week === w}
              data-active={week === w} className={cn(chip(week === w), 'w-9 px-0')}>
              {w}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function RostersView() {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [season, setSeason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [openPlayer, setOpenPlayer] = useState<AnalysisPlayer | null>(null);

  const load = useCallback((s: string, w: number | null) => {
    setError(null);
    const q = new URLSearchParams();
    if (s) q.set('season', s);
    if (w) q.set('week', String(w));
    fetch(`/api/rosters/analysis${q.toString() ? `?${q}` : ''}`)
      .then(r => r.json())
      .then((d: AnalysisResponse & { error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setData(d);
        setSeason(prev => prev || d.rosterSeason);
        setTeamId(prev => prev ?? d.teams[0]?.rosterId ?? null);
      })
      .catch(() => setError('Could not load rosters.'));
  }, []);

  useEffect(() => { load('', null); }, [load]);

  const onSeason = useCallback((s: string) => {
    // A week number means something different in each season, so changing the
    // season drops back to that season's final roster rather than carrying a
    // week across.
    setSeason(s); setData(null); load(s, null);
  }, [load]);
  const onWeek = useCallback((w: number | null) => {
    setData(null); load(season, w);
  }, [load, season]);

  const team = data?.teams.find(t => t.rosterId === teamId) ?? null;

  const squad = useMemo(
    () => (data?.players ?? []).filter(p => p.rosterId === teamId),
    [data, teamId],
  );

  /** Squad size per team, so a chip says something beyond the record. */
  const squadSize = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of data?.players ?? []) m.set(p.rosterId, (m.get(p.rosterId) ?? 0) + 1);
    return m;
  }, [data]);

  const { starters, bench } = useMemo(() => {
    // Within a position, order by whichever number is on screen. Sorting a
    // historical roster by projections it does not carry left every group in
    // arbitrary order.
    const lead = (p: AnalysisPlayer) =>
      (data?.isCurrent ? p.projectedPoints : p.points) ?? -1;
    const order = (a: AnalysisPlayer, b: AnalysisPlayer) =>
      positionRank(a) - positionRank(b) || lead(b) - lead(a);
    return {
      starters: squad.filter(p => p.starter).sort(order),
      bench: squad.filter(p => !p.starter).sort(order),
    };
  }, [squad, data?.isCurrent]);

  if (error) return <ErrorMessage title="Rosters" message={error} />;
  if (!data || !team) return <LoadingPage />;

  // Scale the bars against whichever number is being shown.
  const best = Math.max(1, ...squad.map(p =>
    (data.isCurrent ? p.projectedPoints : p.points) ?? 0));
  const rec = team.record;

  return (
    <PageLayout
      title="Rosters"
      // Static. What is on screen is already stated by the controls below and
      // in the note under the player list; restating it in the page heading
      // meant the subtitle changed under the reader on every tap.
      subtitle="Every team's players. Tap anyone for their profile and outlook."
    >
      <div className="space-y-4">
        {/* ── When ──
            Two dropdowns for this was a poor trade: picking a week is
            browsing, and browsing wants something you can flick along rather
            than a native select sheet that hides every other option the
            moment it opens. */}
        <TimeMachine
          seasons={data.seasons}
          season={season}
          onSeason={onSeason}
          weeks={data.weeks}
          week={data.week}
          onWeek={onWeek}
          nowLabel={data.isCurrentSeason ? 'Now' : 'Final'}
        />
        {/* ── Whose roster ──
            The selected team lifts and gets a ring rather than just a tinted
            border: this row is the page's main control, and on a phone it is
            half scrolled off screen, so the active state has to survive being
            glanced at sideways. */}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
          {data.teams.map(t => {
            const on = t.rosterId === teamId;
            return (
              <motion.button
                key={t.rosterId}
                onClick={() => setTeamId(t.rosterId)}
                aria-pressed={on}
                animate={{ scale: on ? 1 : 0.97 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors',
                  on
                    ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/40 shadow-sm shadow-primary/20'
                    : 'border-border bg-card/40 hover:border-border/80 hover:bg-muted/40',
                )}
              >
                <span className={cn(
                  'relative shrink-0 rounded-full transition-all',
                  on && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                )}>
                  <Avatar avatarId={t.avatar} size={on ? 30 : 26} />
                </span>
                <span className="min-w-0 text-left">
                  <span className={cn(
                    'block max-w-[8.5rem] truncate text-[12px] font-bold',
                    on ? 'text-primary' : 'text-foreground',
                  )}>
                    {t.name}
                  </span>
                  <span className="block text-[10px] tabular-nums text-muted-foreground">
                    {t.record.wins}-{t.record.losses}{t.record.ties ? `-${t.record.ties}` : ''}
                    {' · '}{squadSize.get(t.rosterId) ?? 0} players
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* ── The roster ──────────────────────────────────────────────── */}
        <section className="lp-glass overflow-hidden rounded-xl border">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Avatar avatarId={team.avatar} size={32} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-base font-bold text-foreground">{team.name}</h2>
              <p className="truncate text-[11px] text-muted-foreground">
                {team.manager} · {rec.wins}-{rec.losses}{rec.ties ? `-${rec.ties}` : ''} · {squad.length} players
              </p>
            </div>
          </div>

          {[
            { label: 'Starters', list: starters },
            { label: 'Bench', list: bench },
          ].map(({ label, list }) => list.length > 0 && (
            <div key={label}>
              <p className="border-b border-border bg-muted/20 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                {label}
              </p>
              <div className="divide-y divide-border">
                {list.map((p, i) => (
                  <motion.div
                    key={p.playerId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: Math.min(i, 10) * 0.015 }}
                  >
                    <PlayerRow
                      player={p}
                      best={best}
                      forwardLooking={data.isCurrent}
                      pointsLabel={
                        data.week ? `week ${data.week}`
                          : data.isCurrent ? `${data.statsSeason} pts`
                          : `${data.statsSeason} pts`
                      }
                      onOpen={() => setOpenPlayer(p)}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          ))}

          <p className="border-t border-border px-4 py-2 text-[10px] leading-relaxed text-muted-foreground">
            {data.week
              ? `The squad exactly as it was in week ${data.week}, with that week's points. Sleeper freezes a roster each week, so this is what was actually fielded.`
              : data.isCurrent
                ? `Right hand number is the ${data.projectionSeason} projection, beneath it ${data.statsSeason} points.`
                : `The roster at the end of ${data.rosterSeason}, with that season's points. Projections are not shown for a season already played.`}
          </p>
        </section>

        {/* ── Dynasty, only where it applies ──────────────────────────
            Current roster only. Dynasty worth is a claim about a roster
            somebody still owns; pricing a 2024 snapshot at today's market
            would be answering a question nobody asked. */}
        {data.isDynasty && data.isCurrent && (
          <DynastyBreakdown
            squad={squad}
            league={data.players}
            teamName={team.name}
          />
        )}
      </div>

      {openPlayer && (
        <PlayerDetailModal
          playerId={openPlayer.playerId}
          season={season}
          onClose={() => setOpenPlayer(null)}
        />
      )}
    </PageLayout>
  );
}
