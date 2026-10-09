'use client';

/**
 * The Game of the Week, as a featured card.
 *
 * Shows the case for watching (records, why it was chosen, who decides it)
 * and, once it starts, the game itself: the same card turns into a live
 * scoreboard with the win odds moving, so the featured game never goes stale
 * on the page that featured it.
 *
 * The pick comes from `/api/game-of-week`, locked for the week. Only the live
 * half refreshes.
 */

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { IconChip, StatusPill, WinBar, type Status } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import {
  CrownIcon, Trophy, Ticket, Zap, Sword, Scale, ArrowRight, type Icon,
} from '@/components/icons';
import { winLabel } from './MatchupForecastView';
import type { MatchupTarget } from './MatchupDetailModal';
import type { GameOfWeek, GotwSignal } from '@/lib/gameOfWeek';
import type { MatchupForecast } from '@/lib/sim/matchupOdds';
import type { WeekPhase } from '@/lib/nflSchedule';

const SIGNAL_ICON: Record<GotwSignal, Icon> = {
  records: Trophy,
  playoffs: Ticket,
  points: Zap,
  rivalry: Sword,
  closeness: Scale,
};

interface Payload {
  pick: GameOfWeek | null;
  live: { phase: WeekPhase; forecast: MatchupForecast } | null;
}

/** Refreshed this often while the game is live. */
const LIVE_REFRESH_MS = 60_000;

export default function GameOfWeekCard({ week, onOpen, onPick, className }: {
  /** Defaults to the current week. */
  week?: number;
  onOpen: (target: MatchupTarget) => void;
  /** Told which fixture was picked, or null, so a page can mark it. */
  onPick?: (matchupId: number | null) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [data, setData] = useState<Payload | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => fetch(`/api/game-of-week${week ? `?week=${week}` : ''}`)
      .then(r => r.json())
      .then((d: Payload) => {
        if (cancelled) return;
        setData(d?.pick ? d : null);
        onPick?.(d?.pick?.matchupId ?? null);
        // Keep the scoreboard moving while games are on, and only then.
        if (d?.live?.phase === 'live' && !d.live.forecast.settled) timer = setTimeout(load, LIVE_REFRESH_MS);
      })
      .catch(() => { if (!cancelled) setData(null); });
    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // onPick is a notification, not an input; a new function identity each
    // render must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  if (data === undefined) return <GotwSkeleton className={className} />;
  if (!data?.pick) return null;

  const { pick, live } = data;
  const f = live?.forecast;
  const scored = f ? f.a.pointsSoFar + f.b.pointsSoFar > 0 : false;
  const status: Status = f?.settled ? 'final' : scored || live?.phase === 'live' ? 'live' : 'upcoming';
  // Before kickoff the locked pre-game odds; after, the live ones.
  const pA = status === 'upcoming' ? pick.aWinProb : (f?.aWinProb ?? pick.aWinProb);

  const target: MatchupTarget = {
    a: { userId: pick.a.userId, teamName: pick.a.teamName, avatar: pick.a.avatar },
    b: { userId: pick.b.userId, teamName: pick.b.teamName, avatar: pick.b.avatar },
    week: pick.week,
  };

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn('lp-spotlight overflow-hidden rounded-2xl bg-card shadow-[var(--elev-2)]', className)}
    >
      <div className="relative z-[2] p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <IconChip icon={CrownIcon} size="md" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Game of the Week</p>
              <p className="text-[11px] text-muted-foreground">Week {pick.week}</p>
            </div>
          </div>
          <StatusPill status={status} label={status === 'upcoming' ? 'Preview' : undefined} />
        </div>

        {/* Face-off */}
        <div className="relative mt-5 grid grid-cols-2 items-start gap-6 sm:gap-10">
          <TeamSide
            team={pick.a} align="left"
            figure={status === 'upcoming' ? winLabel(pA) : f!.a.pointsSoFar.toFixed(1)}
            figureLabel={status === 'upcoming' ? 'to win' : `${winLabel(pA)} to win`}
            lead={status === 'final' ? f!.a.pointsSoFar > f!.b.pointsSoFar : pA >= 0.5}
            settled={status === 'final'}
          />
          {/* Centred on the avatars' line, between the two teams. */}
          <span className="pointer-events-none absolute left-1/2 top-[26px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            vs
          </span>
          <TeamSide
            team={pick.b} align="right"
            figure={status === 'upcoming' ? winLabel(1 - pA) : f!.b.pointsSoFar.toFixed(1)}
            figureLabel={status === 'upcoming' ? 'to win' : `${winLabel(1 - pA)} to win`}
            lead={status === 'final' ? f!.b.pointsSoFar > f!.a.pointsSoFar : pA < 0.5}
            settled={status === 'final'}
          />
        </div>

        <WinBar p={pA} height="h-2" className="mt-4" />
        {status !== 'final' && (
          <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>proj {(status === 'upcoming' ? pick.a.projected : f!.a.projectedFinal).toFixed(1)}</span>
            <span>proj {(status === 'upcoming' ? pick.b.projected : f!.b.projectedFinal).toFixed(1)}</span>
          </div>
        )}

        {/* Why this one */}
        <ul className="mt-5 flex flex-wrap gap-2">
          {pick.reasons.map((r, i) => {
            const I = SIGNAL_ICON[r.kind as GotwSignal] ?? Zap;
            return (
              <motion.li
                key={r.text}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.35 }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 py-1 pl-1 pr-3 text-[12px] text-foreground"
              >
                <IconChip icon={I} size="xs" className="rounded-full" />
                {r.text}
              </motion.li>
            );
          })}
        </ul>

        {/* Who decides it */}
        {(pick.a.keyPlayers.length > 0 || pick.b.keyPlayers.length > 0) && (
          <div className="mt-5 grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-2 sm:gap-10">
            {[pick.a, pick.b].map(t => (
              <div key={t.userId} className="min-w-0">
                <p className="truncate text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Watch · {t.teamName}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {t.keyPlayers.map(k => (
                    <li key={k.name} className="flex items-baseline gap-2 text-[12.5px]">
                      <span className="w-6 shrink-0 text-[9.5px] font-bold uppercase text-muted-foreground">{k.position}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{k.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{k.projected.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => onOpen(target)}
          className="group mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-[var(--elev-1)] transition-[filter] hover:brightness-110 sm:w-auto"
        >
          {status === 'upcoming' ? 'Open the matchup' : status === 'live' ? 'Follow it live' : 'See how it finished'}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </motion.section>
  );
}

function TeamSide({ team, align, figure, figureLabel, lead, settled }: {
  team: GameOfWeek['a'];
  align: 'left' | 'right';
  figure: string;
  figureLabel: string;
  lead: boolean;
  settled: boolean;
}) {
  const right = align === 'right';
  return (
    <div className={cn('flex min-w-0 flex-col gap-3', right ? 'items-end text-right' : 'items-start')}>
      {/* Avatar over name on a phone, beside it from sm up: side by side,
          two names plus the "vs" between them did not fit in 360px. */}
      <div className={cn(
        'flex min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3',
        right ? 'items-end sm:flex-row-reverse' : 'items-start',
      )}>
        <div className={cn(
          'relative shrink-0 rounded-2xl p-[2px]',
          lead ? 'bg-gradient-to-br from-primary to-primary/30' : 'bg-border',
        )}>
          <Avatar avatarId={team.avatar} size={52} className="rounded-[14px]" />
        </div>
        <div className="min-w-0 max-w-full">
          <p className="truncate font-display text-[15px] font-bold leading-tight text-foreground sm:text-[17px]">
            {team.teamName}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
            {team.record}{team.rank ? ` · ${ordinal(team.rank)}` : ''}
          </p>
        </div>
      </div>
      <div className={cn(right && 'text-right')}>
        <p className={cn(
          'font-display font-bold leading-none tracking-[-0.03em] tabular-nums',
          lead ? 'text-[34px] text-foreground sm:text-[40px]' : 'text-[24px] text-muted-foreground/70 sm:text-[28px]',
        )}>
          {figure}
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {settled ? (lead ? 'Won' : 'Lost') : figureLabel}
        </p>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function GotwSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-4 sm:p-6', className)} aria-hidden>
      <div className="flex items-center gap-2.5">
        <div className="lp-skeleton h-8 w-8 rounded-[10px]" />
        <div className="space-y-1.5"><div className="lp-skeleton h-2.5 w-28 rounded" /><div className="lp-skeleton h-2 w-14 rounded" /></div>
      </div>
      <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div className="flex items-center gap-3"><div className="lp-skeleton h-14 w-14 rounded-2xl" /><div className="lp-skeleton h-3 w-24 rounded" /></div>
        <div className="lp-skeleton h-3 w-5 rounded" />
        <div className="flex flex-row-reverse items-center gap-3"><div className="lp-skeleton h-14 w-14 rounded-2xl" /><div className="lp-skeleton h-3 w-24 rounded" /></div>
      </div>
      <div className="lp-skeleton mt-5 h-2 w-full rounded-full" />
      <div className="mt-5 flex gap-2"><div className="lp-skeleton h-7 w-40 rounded-full" /><div className="lp-skeleton h-7 w-32 rounded-full" /></div>
    </div>
  );
}
