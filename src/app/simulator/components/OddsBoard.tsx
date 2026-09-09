'use client';

/**
 * The league's odds at a glance.
 *
 * Rows animate to their new position when a forced result changes things, so a
 * team climbing into the field is something you watch happen rather than
 * something you have to diff by eye.
 *
 * Deliberately just a board. The per-team detail that used to expand underneath
 * it now lives on its own tab, because a league overview and a single team's
 * deep dive are different questions and stacking them made both harder to read.
 */

import { motion } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { Eyebrow, RollingPct, OddsBar, BasisChip, fmtRecord } from './shared';
import type { SimLeague, TeamOutcome } from '@/lib/sim/types';
import { Trophy, ChevronRight } from 'lucide-react';

interface Props {
  league: SimLeague;
  outcomes: TeamOutcome[];
  /** Odds from the run with nothing forced, so deltas have a reference. */
  baseline: Map<number, number> | null;
  selectedRosterId: number | null;
  onSelect: (rosterId: number) => void;
}

export default function OddsBoard({
  league, outcomes, baseline, selectedRosterId, onSelect,
}: Props) {
  const byRoster = new Map(league.teams.map(t => [t.rosterId, t]));
  const sorted = [...outcomes].sort((a, b) => b.playoffOdds - a.playoffOdds || b.titleOdds - a.titleOdds);
  const cutoff = league.playoffTeams;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <Eyebrow>Playoff odds</Eyebrow>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Top {cutoff} make the field. Tap a team for its full outlook.
          </p>
        </div>
        {baseline && (
          <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
            vs no forcing
          </span>
        )}
      </div>

      <div className="divide-y divide-border/60">
        {sorted.map((o, i) => {
          const team = byRoster.get(o.rosterId);
          if (!team) return null;
          const selected = selectedRosterId === o.rosterId;
          const base = baseline?.get(o.rosterId);
          const delta = base === undefined ? null : o.playoffOdds - base;
          const inField = i < cutoff;

          return (
            <motion.button
              key={o.rosterId}
              layout="position"
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              onClick={() => onSelect(o.rosterId)}
              aria-pressed={selected}
              className={cn(
                'group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                selected ? 'bg-primary/[0.06]' : 'hover:bg-accent/40',
              )}
            >
              {/* Seed rail: a solid mark inside the field, hollow outside it. */}
              <span
                className={cn(
                  'w-4 shrink-0 text-center text-[11px] font-bold tabular-nums',
                  inField ? 'text-primary' : 'text-muted-foreground/40',
                )}
              >
                {i + 1}
              </span>

              <Avatar avatarId={team.avatar} size={32} className="shrink-0 rounded-lg" />

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{team.teamName}</p>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {fmtRecord(team.wins, team.losses, team.ties)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <OddsBar value={o.playoffOdds} tone={inField ? 'primary' : 'muted'} className="max-w-[180px]" />
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Trophy className="h-3 w-3" />
                    <RollingPct value={o.titleOdds} decimals={1} />
                  </span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <RollingPct
                  value={o.playoffOdds}
                  className={cn('text-[19px] font-bold', inField ? 'text-foreground' : 'text-muted-foreground')}
                />
                {delta !== null && Math.abs(delta) >= 0.001 && (
                  <p className={cn(
                    'text-[11px] font-semibold tabular-nums',
                    delta > 0 ? 'text-emerald-500' : 'text-red-500',
                  )}>
                    {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}
                  </p>
                )}
                <p className="text-[10px] tabular-nums text-muted-foreground/70">
                  {o.avgWins.toFixed(1)} wins
                </p>
              </div>

              {/* Opens this team on the Team tab. */}
              <ChevronRight className={cn(
                'h-4 w-4 shrink-0 transition-colors',
                selected ? 'text-primary' : 'text-muted-foreground/30 group-hover:text-muted-foreground',
              )} />
            </motion.button>
          );
        })}
      </div>

    </div>
  );
}
