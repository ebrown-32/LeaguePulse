'use client';

/**
 * Rookie draft outlook.
 *
 * Four playoff spots in an eight team dynasty league means half the league is
 * mathematically done by November. This gives that half a race of their own by
 * simulating the draft order instead of the trophy.
 *
 * ── Why this shows ownership ─────────────────────────────────────────────────
 *
 * The first version reported each team's own projected slot, which in dynasty is
 * close to meaningless: seven of this league's eight 2027 firsts have already
 * been traded. A team can be on track for the 1.01 and not own it, or own three
 * firsts and none of its own. "Owned" is the default view for that reason, with
 * the tanking view kept behind a toggle since where your own record lands still
 * matters to the team doing the tanking.
 */

import { useState } from 'react';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { Eyebrow } from './shared';
import { ArrowRightLeft, User } from 'lucide-react';
import type { SimLeague, TeamOutcome } from '@/lib/sim/types';

interface Props {
  league: SimLeague;
  outcomes: TeamOutcome[];
}

type View = 'owned' | 'own';

export default function TankTracker({ league, outcomes }: Props) {
  const [view, setView] = useState<View>('owned');
  const byRoster = new Map(league.teams.map(t => [t.rosterId, t]));
  const slots = league.teams.length;

  const oddsOf = (o: TeamOutcome) => view === 'owned' ? o.ownedSlotOdds : o.draftSlotOdds;
  const countOf = (o: TeamOutcome) => view === 'owned' ? o.ownedPickCount : 1;

  /** Mean slot across the picks a team holds. Undefined when they hold none. */
  const avgSlot = (o: TeamOutcome) => {
    const n = countOf(o);
    if (n === 0) return null;
    return oddsOf(o).reduce((s, p, i) => s + p * (i + 1), 0) / n;
  };

  const rows = [...outcomes].sort((a, b) => {
    const av = avgSlot(a), bv = avgSlot(b);
    if (av === null) return 1;          // teams with no pick sink to the bottom
    if (bv === null) return -1;
    return av - bv;
  });

  /** Whose picks a team holds, for the ownership caption. */
  const heldBy = (rosterId: number) =>
    Object.entries(league.pickOwnership ?? {})
      .filter(([, owner]) => Number(owner) === rosterId)
      .map(([original]) => Number(original));

  const anyTraded = Object.entries(league.pickOwnership ?? {})
    .some(([orig, owner]) => Number(orig) !== Number(owner));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow>{league.draftSeason} rookie draft</Eyebrow>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {view === 'owned'
                  ? 'Where the picks each team actually owns are likely to land.'
                  : "Where each team's own pick lands, whoever ends up making it."}
              </p>
            </div>
            <div className="flex gap-1 rounded-lg border border-border p-0.5">
              {([['owned', 'Picks owned', ArrowRightLeft], ['own', 'Own slot', User]] as const)
                .map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  aria-pressed={view === id}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                    view === id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {anyTraded && view === 'owned' && (
            <p className="mt-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11.5px] text-muted-foreground">
              Most first rounders in this league have been traded, so a team&apos;s record and its
              actual pick are different things. Reverse standings set the order.
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
                    Team
                  </span>
                </th>
                {Array.from({ length: slots }, (_, i) => (
                  <th key={i} className="px-1 py-2 text-center">
                    <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                      1.{String(i + 1).padStart(2, '0')}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(o => {
                const team = byRoster.get(o.rosterId);
                if (!team) return null;
                const odds = oddsOf(o);
                const n = countOf(o);
                const avg = avgSlot(o);
                const held = view === 'owned' ? heldBy(o.rosterId) : [o.rosterId];

                return (
                  <tr key={o.rosterId} className="border-t border-border/50">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar avatarId={team.avatar} size={22} className="shrink-0 rounded-md" />
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-foreground">
                            {team.teamName}
                          </p>
                          <p className="text-[10px] tabular-nums text-muted-foreground">
                            {/* Plain decimal, not "1.02". Rounding an average
                                slot of 2.4 into pick notation both lost the
                                decimal and implied an exact pick. */}
                            {n === 0
                              ? 'no first rounder'
                              : avg !== null
                                ? `${n} pick${n === 1 ? '' : 's'}, avg pick ${avg.toFixed(1)}`
                                : ''}
                          </p>
                          {view === 'owned' && held.length > 0 && (
                            <p className="truncate text-[10px] text-muted-foreground/60">
                              {held.map(rid => rid === o.rosterId
                                ? 'own'
                                : byRoster.get(rid)?.teamName ?? `Team ${rid}`).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    {odds.map((p, i) => (
                      <td key={i} className="px-1 py-2 text-center">
                        <div
                          className="mx-auto flex h-8 w-full min-w-[34px] items-center justify-center rounded"
                          style={{ backgroundColor: `hsl(var(--primary) / ${Math.min(1, p * 0.85).toFixed(3)})` }}
                          title={`${team.teamName}: ${(p * 100).toFixed(1)}% chance of holding pick 1.${String(i + 1).padStart(2, '0')}`}
                        >
                          <span className={cn(
                            'text-[10px] font-semibold tabular-nums',
                            p > 0.45 ? 'text-primary-foreground' : 'text-foreground',
                            p < 0.02 && 'text-muted-foreground/40',
                          )}>
                            {p < 0.005 ? '' : Math.round(p * 100)}
                          </span>
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Who is most likely to hold the 1.01 itself. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...outcomes]
          .sort((a, b) => oddsOf(b)[0] - oddsOf(a)[0])
          .slice(0, 4)
          .map(o => {
            const team = byRoster.get(o.rosterId);
            if (!team) return null;
            const odds = oddsOf(o);
            return (
              <div key={o.rosterId} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <Avatar avatarId={team.avatar} size={26} className="shrink-0 rounded-lg" />
                  <p className="truncate text-[12px] font-semibold text-foreground">{team.teamName}</p>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                    Holds 1.01
                  </span>
                  <span className="text-[20px] font-bold tabular-nums text-foreground">
                    {(odds[0] * 100).toFixed(1)}
                    <span className="text-[0.7em] text-muted-foreground">%</span>
                  </span>
                </div>
                {/* With more than one pick this is an expected COUNT, not a
                    probability, and can exceed one. Showing it as a percentage
                    would read as broken the moment a team held two early picks. */}
                {(() => {
                  const top2 = odds[0] + (odds[1] ?? 0);
                  const multi = countOf(o) > 1;
                  return (
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        {multi ? 'Top 2 picks' : 'Top 2'}
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">
                        {multi
                          ? top2.toFixed(2)
                          : <>{(top2 * 100).toFixed(1)}<span className="text-[0.7em]">%</span></>}
                      </span>
                    </div>
                  );
                })()}
              </div>
            );
          })}
      </div>
    </div>
  );
}
