'use client';

/**
 * One team, in depth.
 *
 * Split out of the season view, which had grown into a league board, a scenario
 * builder and a per-team deep dive stacked in a single scroll. Those are three
 * different questions and they now get three different tabs. This one answers
 * "how does my team actually look, and why does the model think so".
 */

import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { Eyebrow, RollingPct, BasisChip, TeamChips, fmtRecord } from './shared';
import SeasonCone from './SeasonCone';
import Beeswarm from './Beeswarm';
import { Trophy, Target } from 'lucide-react';
import type { SimLeague, TeamOutcome } from '@/lib/sim/types';

interface Props {
  league: SimLeague;
  outcomes: TeamOutcome[];
  selected: number | null;
  onSelect: (rosterId: number) => void;
  maxWins: number;
  cutoffWins: number | null;
}

export default function TeamDetail({
  league, outcomes, selected, onSelect, maxWins, cutoffWins,
}: Props) {
  const team = league.teams.find(t => t.rosterId === selected);
  const outcome = outcomes.find(o => o.rosterId === selected);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <TeamChips label="Pick a team" teams={league.teams} value={selected} onChange={onSelect} />
      </div>

      {team && outcome && (
        <>
          {/* Headline numbers */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <Avatar avatarId={team.avatar} size={42} className="shrink-0 rounded-xl" />
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-foreground">{team.teamName}</p>
                <p className="text-[12px] text-muted-foreground">
                  {team.managerName}
                  <span className="ml-2 tabular-nums">
                    {fmtRecord(team.wins, team.losses, team.ties)}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                icon={<Target className="h-3 w-3" />}
                label="Make playoffs"
                value={<RollingPct value={outcome.playoffOdds} className="text-[22px] font-bold text-foreground" />}
              />
              <Stat
                icon={<Trophy className="h-3 w-3" />}
                label="Win it all"
                value={<RollingPct value={outcome.titleOdds} className="text-[22px] font-bold text-foreground" />}
              />
              <Stat
                label="Projected wins"
                value={<span className="text-[22px] font-bold tabular-nums text-foreground">
                  {outcome.avgWins.toFixed(1)}
                </span>}
                sub={`${outcome.p5Wins} to ${outcome.p95Wins} in 90% of runs`}
              />
              <Stat
                label="Weekly score"
                value={<span className="text-[22px] font-bold tabular-nums text-foreground">
                  {team.mean.toFixed(0)}
                </span>}
                sub={`plus or minus ${team.sd.toFixed(1)}`}
              />
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <BasisChip
                weights={team.basis.weights}
                games={{ current: team.basis.currentSeasonGames, prior: team.basis.priorSeasonGames }}
              />
            </div>
          </div>

          {/* Where they are likely to finish */}
          <div className="rounded-xl border border-border bg-card p-4">
            <Eyebrow>Where they finish</Eyebrow>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Odds of each final seed. The first {league.playoffTeams} make the field.
            </p>
            <div className="mt-3 flex items-end gap-1.5">
              {outcome.seedDistribution.map((p, i) => {
                const peak = Math.max(...outcome.seedDistribution) || 1;
                const inField = i < league.playoffTeams;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {p < 0.005 ? '' : `${Math.round(p * 100)}%`}
                    </span>
                    <div
                      className={cn(
                        'w-full rounded-t transition-[height] duration-500',
                        inField ? 'bg-primary' : 'bg-muted-foreground/25',
                      )}
                      style={{ height: `${Math.max(2, (p / peak) * 92)}px` }}
                      title={`Seed ${i + 1}: ${(p * 100).toFixed(1)}%`}
                    />
                    <span className={cn(
                      'text-[10px] font-bold tabular-nums',
                      inField ? 'text-primary' : 'text-muted-foreground/50',
                    )}>
                      {i + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <SeasonCone league={league} outcome={outcome} teamName={team.teamName} maxWins={maxWins} />
          <Beeswarm
            outcome={outcome} maxWins={maxWins} cutoffWins={cutoffWins} teamName={team.teamName}
          />
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value, sub }: {
  icon?: React.ReactNode; label: string; value: React.ReactNode; sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
      <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
        {icon}{label}
      </p>
      <div className="mt-1 leading-none">{value}</div>
      {sub && <p className="mt-1 text-[10px] tabular-nums text-muted-foreground/70">{sub}</p>}
    </div>
  );
}
