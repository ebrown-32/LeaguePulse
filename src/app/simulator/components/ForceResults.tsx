'use client';

/**
 * Force results, and watch the odds move.
 *
 * The remaining schedule with every game clickable. Tap the team you want to
 * win and that result is locked in; everything else stays simulated.
 *
 * This was originally called "Pin the Slate", which meant nothing to anyone who
 * had not built it. The mechanic is worth stating plainly instead: you are
 * answering "what if I win out", and the odds board next to it re-solves.
 */

import { motion } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { Eyebrow } from './shared';
import { RotateCcw, MousePointerClick } from 'lucide-react';
import type { SimLeague, Pin } from '@/lib/sim/types';

interface Props {
  league: SimLeague;
  pins: Pin[];
  onToggle: (week: number, home: number, away: number, winner: number) => void;
  onClear: () => void;
  highlightRosterId: number | null;
}

export default function ForceResults({
  league, pins, onToggle, onClear, highlightRosterId,
}: Props) {
  const byRoster = new Map(league.teams.map(t => [t.rosterId, t]));
  const weeks = [...new Set(league.remaining.map(g => g.week))].sort((a, b) => a - b);

  const pinFor = (week: number, h: number, a: number) =>
    pins.find(p => p.week === week
      && ((p.homeRosterId === h && p.awayRosterId === a)
       || (p.homeRosterId === a && p.awayRosterId === h)));

  // Plain-language summary of the scenario, so a board full of highlights has a
  // sentence attached to it.
  const forcedWins = new Map<number, number>();
  for (const p of pins) {
    if (p.winnerRosterId === null) continue;
    forcedWins.set(p.winnerRosterId, (forcedWins.get(p.winnerRosterId) ?? 0) + 1);
  }
  const summary = [...forcedWins.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rid, n]) => `${byRoster.get(rid)?.teamName ?? 'Team'} wins ${n}`)
    .join(', ');

  if (weeks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          The regular season is complete, so there are no results left to force.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>Force results</Eyebrow>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Tap the team you want to win. Playoff odds update instantly.
            </p>
          </div>
          {pins.length > 0 && (
            <button
              onClick={onClear}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <RotateCcw className="h-3 w-3" />
              Clear {pins.length}
            </button>
          )}
        </div>

        {pins.length === 0 ? (
          <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11.5px] text-muted-foreground">
            <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
            Nothing forced yet, so every game below is being simulated.
          </p>
        ) : (
          <p className="mt-2.5 rounded-lg bg-primary/[0.07] px-2.5 py-1.5 text-[11.5px] text-foreground">
            <span className="font-semibold">Your scenario:</span> {summary}.
            <span className="text-muted-foreground"> The rest stays simulated.</span>
          </p>
        )}
      </div>

      <div className="max-h-[520px] overflow-y-auto">
        {weeks.map(week => (
          <div key={week} className="border-b border-border/60 last:border-b-0">
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-muted/40 px-4 py-1.5 backdrop-blur-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Week {week}
              </span>
            </div>

            {/* One card per game, with the two teams stacked. Side by side put
                four names in a row with nothing to say where one matchup ended
                and the next began. */}
            <div className="grid gap-2 p-2 sm:grid-cols-2">
              {league.remaining.filter(g => g.week === week).map(game => {
                const pin = pinFor(week, game.homeRosterId, game.awayRosterId);
                const involvesSelected = highlightRosterId !== null
                  && (highlightRosterId === game.homeRosterId || highlightRosterId === game.awayRosterId);

                return (
                  <div
                    key={`${week}-${game.homeRosterId}`}
                    className={cn(
                      'overflow-hidden rounded-lg border transition-colors',
                      pin ? 'border-primary/50' : 'border-border/70',
                      involvesSelected && !pin && 'border-primary/30 bg-primary/[0.03]',
                    )}
                  >
                    {[game.homeRosterId, game.awayRosterId].map((rid, i) => {
                      const team = byRoster.get(rid);
                      if (!team) return null;
                      const isWinner = pin?.winnerRosterId === rid;
                      const isLoser  = pin && pin.winnerRosterId !== null && !isWinner;

                      return (
                        <button
                          key={rid}
                          onClick={() => onToggle(week, game.homeRosterId, game.awayRosterId, rid)}
                          aria-pressed={isWinner}
                          aria-label={
                            isWinner
                              ? `${team.teamName} is forced to win in week ${week}. Click to undo.`
                              : `Force ${team.teamName} to win in week ${week}`
                          }
                          className={cn(
                            'group relative flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors',
                            i === 0 && 'border-b border-border/60',
                            isWinner && 'bg-primary/10',
                            !pin && 'hover:bg-accent/50',
                          )}
                        >
                          <Avatar
                            avatarId={team.avatar} size={20}
                            className={cn('shrink-0 rounded-md transition-opacity', isLoser && 'opacity-40')}
                          />
                          <span className={cn(
                            'min-w-0 flex-1 truncate text-[12px] transition-colors',
                            isWinner ? 'font-bold text-primary'
                              : isLoser ? 'text-muted-foreground/50'
                              : 'font-medium text-foreground',
                          )}>
                            {team.teamName}
                          </span>

                          {/* An explicit W or L reads instantly. A pin icon
                              alone required knowing what the tool called it. */}
                          {isWinner && (
                            <motion.span
                              layoutId={`pin-${week}-${game.homeRosterId}`}
                              className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground"
                            >
                              Win
                            </motion.span>
                          )}
                          {isLoser && (
                            <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/60">
                              Loss
                            </span>
                          )}
                          {!pin && (
                            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/70">
                              Pick
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
