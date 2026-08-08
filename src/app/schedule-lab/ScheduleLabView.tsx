'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ChevronDown, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import TeamLink from '@/components/ui/TeamLink';
import { cn } from '@/lib/utils';
import type {
  ScheduleLabResponse, SeasonScheduleData, TeamScheduleSummary, MatrixCell, ScheduleTeam,
} from '@/app/api/schedule-lab/route';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRecord(w: number, l: number, t: number) {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function winPct(w: number, l: number, t: number) {
  const g = w + l + t;
  return g === 0 ? 0 : (w + t * 0.5) / g;
}

function teamOf(season: SeasonScheduleData, rosterId: number): ScheduleTeam {
  return season.teams.find(t => t.rosterId === rosterId)!;
}

function cellFor(season: SeasonScheduleData, myRosterId: number, scheduleRosterId: number): MatrixCell | undefined {
  return season.matrix[String(myRosterId)]?.find(c => c.scheduleOwnerRosterId === scheduleRosterId);
}

/**
 * Where `rosterId` would rank if their record were swapped in, everyone else held constant.
 *
 * `w/l/t` here are always the head-to-head-only record from a matrix cell. Real
 * Sleeper standings, though, rank on the *official* record, which folds in a
 * bonus win/loss against the weekly league average for leagues that use it. That
 * median component is opponent-independent, so it doesn't change with a schedule
 * swap: we add the team's own (constant) median delta to their hypothetical H2H
 * record, and rank every other team on their real official record, so the
 * standing shown here always matches what the league would actually show. Points
 * for is unaffected by median scoring (it's just the sum of a team's own weekly
 * scores), so no adjustment is needed there.
 */
function standingRank(season: SeasonScheduleData, rosterId: number, w: number, l: number, t: number, pf: number): number {
  const mySummary = season.summaries[String(rosterId)];
  const medianWinDelta  = mySummary.officialWins   - mySummary.actualWins;
  const medianLossDelta = mySummary.officialLosses - mySummary.actualLosses;
  const medianTieDelta  = mySummary.officialTies   - mySummary.actualTies;

  const rows = season.teams.map(team => {
    if (team.rosterId === rosterId) {
      return { rosterId, w: w + medianWinDelta, l: l + medianLossDelta, t: t + medianTieDelta, pf };
    }
    const s = season.summaries[String(team.rosterId)];
    return { rosterId: team.rosterId, w: s.officialWins, l: s.officialLosses, t: s.officialTies, pf: s.actualPointsFor };
  });
  rows.sort((a, b) => (winPct(b.w, b.l, b.t) - winPct(a.w, a.l, a.t)) || (b.pf - a.pf));
  return rows.findIndex(r => r.rosterId === rosterId) + 1;
}

// One-line narrative flavor for a leaderboard row.
function quickTake(season: SeasonScheduleData, sm: TeamScheduleSummary): string {
  const n = season.teams.length;
  const rankWord = sm.difficultyRank === 1 ? 'the toughest slate in the league'
    : sm.difficultyRank === n ? 'the softest slate in the league'
    : sm.difficultyRank <= Math.ceil(n / 2) ? `the #${sm.difficultyRank} toughest schedule`
    : `a bottom-half, easier schedule`;
  const luckWord = sm.scheduleLuck > 0.75 ? 'overperformed it'
    : sm.scheduleLuck < -0.75 ? 'underperformed it'
    : 'played to form';
  return `Drew ${rankWord} and ${luckWord}.`;
}

// ── Micro-components ─────────────────────────────────────────────────────────

/** Weekly opponent-strength strip: taller bar means tougher opponent that week. */
function DifficultyStrip({ season, rosterId }: { season: SeasonScheduleData; rosterId: number }) {
  const actual = cellFor(season, rosterId, rosterId);
  if (!actual) return null;
  return (
    <div className="flex items-end gap-[3px] h-6">
      {actual.weeks.map((w, i) => (
        <span
          key={i}
          title={`Wk ${w.week} vs ${w.opponentTeamName}, outscored ${(w.oppPercentile * 100).toFixed(0)}% of the league that week`}
          className="w-1.5 rounded-sm bg-primary/70 shrink-0"
          style={{ height: `${Math.max(12, w.oppPercentile * 100)}%` }}
        />
      ))}
    </div>
  );
}

function StatTile({ label, team, value, sub, onClick }: {
  label: string;
  team: ScheduleTeam;
  value: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="group rounded-xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40"
    >
      <div className="mb-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
        {label}
      </div>
      <div className="mb-1 flex items-center gap-2 min-w-0">
        <Avatar avatarId={team.avatar} size={22} className="rounded shrink-0" />
        <span className="truncate text-sm font-semibold text-foreground">{team.teamName}</span>
      </div>
      <span className="text-xl font-bold tabular-nums text-foreground">{value}</span>
      <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground/60">{sub}</p>
    </motion.button>
  );
}

// ── Team picker ──────────────────────────────────────────────────────────────

function TeamPicker({ teams, selectedId, onSelect, label }: {
  teams: ScheduleTeam[];
  selectedId: number | null;
  onSelect: (rosterId: number) => void;
  label: string;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {teams.map(team => {
          const active = team.rosterId === selectedId;
          return (
            <button
              key={team.rosterId}
              onClick={() => onSelect(team.rosterId)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                active
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80',
              )}
            >
              <Avatar avatarId={team.avatar} size={16} className="rounded-full shrink-0" />
              {team.teamName}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Simulator ────────────────────────────────────────────────────────────────

function Simulator({
  season, myRosterId, scheduleRosterId, onSelectMy, onSelectSchedule,
}: {
  season: SeasonScheduleData;
  myRosterId: number;
  scheduleRosterId: number;
  onSelectMy: (id: number) => void;
  onSelectSchedule: (id: number) => void;
}) {
  const me = teamOf(season, myRosterId);
  const scheduleTeam = teamOf(season, scheduleRosterId);
  const mySummary = season.summaries[String(myRosterId)];
  const actual = cellFor(season, myRosterId, myRosterId)!;
  const hyp = cellFor(season, myRosterId, scheduleRosterId)!;
  const isActual = hyp.isActual;

  const actualRank = standingRank(season, myRosterId, actual.wins, actual.losses, actual.ties, actual.pointsFor);
  const hypRank = standingRank(season, myRosterId, hyp.wins, hyp.losses, hyp.ties, hyp.pointsFor);
  const winDelta = (hyp.wins + hyp.ties * 0.5) - (actual.wins + actual.ties * 0.5);
  const pointsAgainstDelta = hyp.pointsAgainst - actual.pointsAgainst;
  const actualByWeek = new Map(actual.weeks.map(w => [w.week, w]));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="h-px" style={{ background: 'var(--tx-trade-grad)' }} />
      <div className="p-4 sm:p-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <TeamPicker teams={season.teams} selectedId={myRosterId} onSelect={onSelectMy} label="Use this team's scores" />
          <TeamPicker teams={season.teams} selectedId={scheduleRosterId} onSelect={onSelectSchedule} label="Borrow this team's schedule" />
        </div>

        {/* Headline comparison */}
        <div className="rounded-lg border border-border/50 bg-background/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href={`/team/${me.userId}`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity">
              <Avatar avatarId={me.avatar} size={36} className="rounded-lg shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{me.teamName}</p>
                <p className="text-[11px] text-muted-foreground/60">
                  {isActual ? 'their actual schedule' : <>with <span className="text-foreground font-medium">{scheduleTeam.teamName}</span>&apos;s schedule</>}
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-4 sm:gap-6">
              <div className="text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Actual (H2H)</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{fmtRecord(actual.wins, actual.losses, actual.ties)}</p>
                <p className="text-[10px] text-muted-foreground/50">#{actualRank} standing</p>
                {season.hasMedianGames && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground/40">
                    official {fmtRecord(mySummary.officialWins, mySummary.officialLosses, mySummary.officialTies)}
                  </p>
                )}
              </div>
              <span className="text-muted-foreground/40 shrink-0">&rarr;</span>
              <div className="text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-primary/70">
                  {isActual ? 'Same' : 'Hypothetical'}
                </p>
                <p className="text-lg font-bold tabular-nums text-foreground">{fmtRecord(hyp.wins, hyp.losses, hyp.ties)}</p>
                <p className="text-[10px] text-muted-foreground/50">#{hypRank} standing</p>
              </div>
            </div>
          </div>

          {!isActual && (
            <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border/40 pt-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className={cn('font-semibold', winDelta > 0 ? 'text-emerald-400' : winDelta < 0 ? 'text-rose-400' : 'text-foreground')}>
                  {winDelta > 0 ? '+' : ''}{winDelta.toFixed(1)} wins
                </span>
                <span className="text-muted-foreground/60">vs actual</span>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground/70">
                <span className="font-semibold text-foreground">{pointsAgainstDelta > 0 ? '+' : ''}{pointsAgainstDelta.toFixed(1)}</span>
                pts faced vs actual
              </span>
              {hypRank !== actualRank && (
                <span className="text-muted-foreground/70">
                  standing moves <span className="font-semibold text-foreground">#{actualRank} → #{hypRank}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Week-by-week */}
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Week by week</p>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full min-w-[620px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  <th className="px-3 py-2 text-left">Wk</th>
                  <th className="px-3 py-2 text-right">{me.teamName}</th>
                  <th colSpan={3} className="px-3 py-2 text-center border-l border-border/40">Actual</th>
                  {!isActual && <th colSpan={3} className="px-3 py-2 text-center border-l border-border/40 text-primary/70">With {scheduleTeam.teamName}&apos;s schedule</th>}
                </tr>
              </thead>
              <tbody>
                {hyp.weeks.map(w => {
                  const real = actualByWeek.get(w.week);
                  const flipped = !isActual && real && real.result !== w.result;
                  return (
                    <tr key={w.week} className={cn('border-b border-border/30 last:border-0', flipped && 'bg-primary/5')}>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground/70">{w.week}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{w.myScore.toFixed(1)}</td>

                      {/* Actual */}
                      <td className="px-3 py-2 text-foreground border-l border-border/40">
                        <span className="truncate">{real?.opponentTeamName ?? '-'}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground/70">{real ? real.oppScore.toFixed(1) : '-'}</td>
                      <td className="px-3 py-2 text-center">
                        {real && (
                          <span className={cn(
                            'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                            real.result === 'W' && 'bg-emerald-400/15 text-emerald-400',
                            real.result === 'L' && 'bg-rose-400/15 text-rose-400',
                            real.result === 'T' && 'bg-muted text-muted-foreground',
                          )}>
                            {real.result}
                          </span>
                        )}
                      </td>

                      {/* Hypothetical */}
                      {!isActual && (
                        <>
                          <td className="px-3 py-2 text-foreground border-l border-border/40">
                            <span className="truncate">{w.opponentTeamName}</span>
                            {w.borrowedFromSelf && (
                              <span className="ml-1.5 text-[9px] text-muted-foreground/50 italic">same matchup</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground">{w.oppScore.toFixed(1)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={cn(
                              'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                              w.result === 'W' && 'bg-emerald-400/15 text-emerald-400',
                              w.result === 'L' && 'bg-rose-400/15 text-rose-400',
                              w.result === 'T' && 'bg-muted text-muted-foreground',
                            )}>
                              {w.result}
                            </span>
                            {flipped && <ArrowRightLeft className="inline-block h-3 w-3 text-primary ml-1" aria-label="Result flipped" />}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

function LeaderboardRow({ season, sm, expanded, onToggle, onSimulate }: {
  season: SeasonScheduleData;
  sm: TeamScheduleSummary;
  expanded: boolean;
  onToggle: () => void;
  onSimulate: () => void;
}) {
  const team = teamOf(season, sm.rosterId);
  const range = sm.maxWinsAcrossSchedules - sm.minWinsAcrossSchedules;
  const actual = cellFor(season, sm.rosterId, sm.rosterId)!;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-muted/20 transition-colors">
        <span className="w-6 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground/50">#{sm.difficultyRank}</span>
        <Avatar avatarId={team.avatar} size={30} className="rounded-lg shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{team.teamName}</span>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground/60">{fmtRecord(sm.actualWins, sm.actualLosses, sm.actualTies)}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground/60">{quickTake(season, sm)}</p>
        </div>
        <div className="hidden shrink-0 sm:block">
          <DifficultyStrip season={season} rosterId={sm.rosterId} />
        </div>
        <div className="hidden shrink-0 text-right md:block">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Opp Strength</p>
          <p className="text-sm font-bold tabular-nums text-foreground">{(sm.opponentStrengthAvg * 100).toFixed(1)}%</p>
        </div>
        <div className="hidden shrink-0 text-right lg:block">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Sched Luck</p>
          <p className={cn('text-sm font-bold tabular-nums', sm.scheduleLuck > 0.2 ? 'text-emerald-400' : sm.scheduleLuck < -0.2 ? 'text-rose-400' : 'text-foreground')}>
            {sm.scheduleLuck > 0 ? '+' : ''}{sm.scheduleLuck.toFixed(1)}
          </p>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform', expanded && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 bg-muted/10 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground/70">
                  {season.hasMedianGames && (
                    <span>Official record: <span className="font-semibold text-foreground">{fmtRecord(sm.officialWins, sm.officialLosses, sm.officialTies)}</span></span>
                  )}
                  <span>Opp PPG faced: <span className="font-semibold text-foreground">{(sm.actualPointsAgainst / Math.max(1, sm.gamesPlayed)).toFixed(1)}</span></span>
                  <span>Wins across every possible schedule: <span className="font-semibold text-foreground">{sm.minWinsAcrossSchedules.toFixed(1)},{sm.maxWinsAcrossSchedules.toFixed(1)}</span> (spread of {range.toFixed(1)})</span>
                </div>
                <button
                  onClick={onSimulate}
                  className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15 transition-colors"
                >
                  Try a different schedule
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border/50">
                <table className="w-full min-w-[420px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/50 bg-background/40 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      <th className="px-3 py-2 text-left">Wk</th>
                      <th className="px-3 py-2 text-left">Opponent</th>
                      <th className="px-3 py-2 text-right">Score</th>
                      <th className="px-3 py-2 text-right">Opp Score</th>
                      <th className="px-3 py-2 text-center">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actual.weeks.map(w => (
                      <tr key={w.week} className="border-b border-border/30 last:border-0">
                        <td className="px-3 py-2 tabular-nums text-muted-foreground/70">{w.week}</td>
                        <td className="px-3 py-2 text-foreground">{w.opponentTeamName}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{w.myScore.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground/70">{w.oppScore.toFixed(1)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn(
                            'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                            w.result === 'W' && 'bg-emerald-400/15 text-emerald-400',
                            w.result === 'L' && 'bg-rose-400/15 text-rose-400',
                            w.result === 'T' && 'bg-muted text-muted-foreground',
                          )}>
                            {w.result}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Multiverse matrix ────────────────────────────────────────────────────────

function MatrixGrid({ season, onCellClick }: { season: SeasonScheduleData; onCellClick: (myId: number, scheduleId: number) => void }) {
  const teams = season.teams;
  const allWins = teams.flatMap(t => season.matrix[String(t.rosterId)].map(c => c.wins));
  const minWins = Math.min(...allWins);
  const maxWins = Math.max(...allWins);
  const winSpread = Math.max(1, maxWins - minWins);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="border-collapse min-w-full">
        <thead>
          <tr>
            <th className="border border-border/30 bg-card p-2 min-w-[120px] sticky left-0 z-10">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Scores ↓ / Schedule →</span>
            </th>
            {teams.map(t => (
              <th key={t.rosterId} className="border border-border/30 bg-muted/40 p-2 min-w-[76px]">
                <TeamLink
                  userId={t.userId}
                  teamName={t.teamName}
                  avatar={t.avatar}
                  avatarSize={22}
                  avatarClassName="rounded-md"
                  className="flex-col gap-1"
                  textClassName="text-[9px] font-semibold text-foreground leading-tight text-center line-clamp-2 max-w-[68px]"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map(rowTeam => (
            <tr key={rowTeam.rosterId}>
              <td className="border border-border/30 bg-card p-2 sticky left-0 z-10">
                <TeamLink
                  userId={rowTeam.userId}
                  teamName={rowTeam.teamName}
                  avatar={rowTeam.avatar}
                  avatarSize={22}
                  avatarClassName="rounded-md"
                  textClassName="text-xs font-semibold text-foreground max-w-[90px]"
                />
              </td>
              {teams.map(colTeam => {
                const cell = cellFor(season, rowTeam.rosterId, colTeam.rosterId)!;
                const intensity = 0.06 + ((cell.wins - minWins) / winSpread) * 0.7;
                return (
                  <td
                    key={colTeam.rosterId}
                    onClick={() => onCellClick(rowTeam.rosterId, colTeam.rosterId)}
                    className={cn(
                      'border w-[76px] h-14 text-center cursor-pointer transition-opacity hover:opacity-80',
                      cell.isActual ? 'border-primary/60 ring-1 ring-inset ring-primary/40' : 'border-border/30',
                    )}
                    style={{ backgroundColor: `hsl(var(--primary) / ${intensity})` }}
                  >
                    <div className="font-bold text-sm tabular-nums leading-tight text-foreground">
                      {fmtRecord(cell.wins, cell.losses, cell.ties)}
                    </div>
                    {cell.isActual && (
                      <div className="text-[9px] font-medium uppercase tracking-wide text-primary/80 mt-0.5">actual</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border/30 p-3 text-[11px] text-muted-foreground">
        Each row is one team&apos;s scores replayed against every team&apos;s schedule (columns). Darker = more wins. Ringed cell = what actually happened. Click any cell to open it in the simulator.
      </div>
    </div>
  );
}

// ── Ledger teasers ───────────────────────────────────────────────────────────

function LedgerTeasers({ season, onPick }: { season: SeasonScheduleData; onPick: (rosterId: number) => void }) {
  const sums = Object.values(season.summaries);
  const toughest = [...sums].sort((a, b) => b.opponentStrengthAvg - a.opponentStrengthAvg)[0];
  const easiest  = [...sums].sort((a, b) => a.opponentStrengthAvg - b.opponentStrengthAvg)[0];
  const dependent = [...sums].sort((a, b) => (b.maxWinsAcrossSchedules - b.minWinsAcrossSchedules) - (a.maxWinsAcrossSchedules - a.minWinsAcrossSchedules))[0];
  const proof = [...sums].sort((a, b) => (a.maxWinsAcrossSchedules - a.minWinsAcrossSchedules) - (b.maxWinsAcrossSchedules - b.minWinsAcrossSchedules))[0];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Toughest Schedule" team={teamOf(season, toughest.rosterId)} value={`${(toughest.opponentStrengthAvg * 100).toFixed(0)}%`} sub="avg weekly opp strength" onClick={() => onPick(toughest.rosterId)} />
      <StatTile label="Easiest Schedule" team={teamOf(season, easiest.rosterId)} value={`${(easiest.opponentStrengthAvg * 100).toFixed(0)}%`} sub="avg weekly opp strength" onClick={() => onPick(easiest.rosterId)} />
      <StatTile label="Most Schedule-Dependent" team={teamOf(season, dependent.rosterId)} value={`±${((dependent.maxWinsAcrossSchedules - dependent.minWinsAcrossSchedules) / 2).toFixed(1)}`} sub="win swing across all slates" onClick={() => onPick(dependent.rosterId)} />
      <StatTile label="Most Slate-Proof" team={teamOf(season, proof.rosterId)} value={`±${((proof.maxWinsAcrossSchedules - proof.minWinsAcrossSchedules) / 2).toFixed(1)}`} sub="win swing across all slates" onClick={() => onPick(proof.rosterId)} />
    </div>
  );
}

// ── How this works ───────────────────────────────────────────────────────────

const METHODOLOGY: { term: string; body: string }[] = [
  {
    term: 'Opponent Strength',
    body: "Computed week by week, not from final records: each week, every team's score is ranked against the full league that week, and your opponent's percentile finish becomes that week's difficulty. Averaged across the season. This is what drives the difficulty rank and the leaderboard's weekly bars, and it holds up even when the league doesn't play a perfectly even round-robin, since each week is judged on its own against the whole field rather than leaning on end-of-season win totals.",
  },
  {
    term: 'Schedule Luck',
    body: "The gap between your actual win total and the average win total you'd have earned across every possible schedule in the league (the row average in the Multiverse matrix below). Positive means your real schedule was kinder than the average one available; negative means it was tougher.",
  },
  {
    term: 'Win Range',
    body: "The worst-case and best-case records you could have posted this season: what you'd have gone if you'd been handed the toughest schedule in the league instead of your own, and what you'd have gone with the easiest.",
  },
  {
    term: 'The Schedule Multiverse',
    body: 'Every team\'s real weekly scores, replayed against every team\'s real weekly opponents. Each cell is a hypothetical final record: what the row team would have gone using the column team\'s schedule. The ringed cell on the diagonal is what actually happened.',
  },
  {
    term: '"Same matchup" weeks',
    body: "If the schedule you're borrowing has that team facing you in a given week, there's no one to swap in, you can't play yourself. That week just shows your real result instead.",
  },
  {
    term: 'Median games',
    body: "Some leagues award a bonus win/loss each week against the league-average score. Every calculation here (records, the leaderboard, the matrix) counts real head-to-head matchups only, since a median game has no actual opponent to swap. Where a league uses them, the official record (H2H plus median bonus) is shown alongside for reference.",
  },
];

function HowItWorks() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="mb-4 font-display text-sm font-semibold text-foreground">How Schedule Lab Works</h3>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {METHODOLOGY.map(({ term, body }) => (
          <div key={term}>
            <p className="mb-1 text-xs font-bold text-foreground">{term}</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground/70">{body}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-border/40 pt-3 text-[11px] text-muted-foreground/50">
        Regular season only: playoff weeks aren&apos;t part of the standard slate, so they&apos;re left out of every calculation on this page.
      </p>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl border border-border bg-card animate-pulse" />)}
      </div>
      <div className="h-72 rounded-xl border border-border bg-card animate-pulse" />
      {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl border border-border bg-card animate-pulse" />)}
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

export default function ScheduleLabView() {
  const [data,    setData]    = useState<ScheduleLabResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [season,  setSeason]  = useState<string | null>(null);
  const [expandedRosterId, setExpandedRosterId] = useState<number | null>(null);
  const [simMy, setSimMy] = useState<number | null>(null);
  const [simSchedule, setSimSchedule] = useState<number | null>(null);
  const simRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/schedule-lab')
      .then(r => r.json())
      .then((d: ScheduleLabResponse & { error?: string }) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        if (d.seasons.length > 0) setSeason(d.seasons[0]);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const seasonData = season && data ? data.bySeason[season] : null;

  // Default simulator picks: highest and lowest difficulty-ranked teams, once season data lands
  useEffect(() => {
    if (!seasonData) return;
    const sums = Object.values(seasonData.summaries).sort((a, b) => a.difficultyRank - b.difficultyRank);
    setSimMy(sums[0]?.rosterId ?? null);
    setSimSchedule(sums[sums.length - 1]?.rosterId ?? null);
    setExpandedRosterId(null);
  }, [seasonData]);

  const jumpToSimulator = useCallback((myRosterId: number, scheduleRosterId?: number) => {
    setSimMy(myRosterId);
    if (scheduleRosterId !== undefined) setSimSchedule(scheduleRosterId);
    requestAnimationFrame(() => {
      simRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const leaderboard = useMemo(() => {
    if (!seasonData) return [];
    return Object.values(seasonData.summaries).sort((a, b) => a.difficultyRank - b.difficultyRank);
  }, [seasonData]);

  return (
    <div className="space-y-6">
      {loading && <Skeleton />}

      {!loading && error && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{error}</div>
      )}

      {!loading && !error && data && (!season || data.seasons.length === 0) && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">No completed schedule weeks yet. Check back once the season gets going.</p>
        </div>
      )}

      {!loading && !error && seasonData && (
        <>
          {/* Season switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {data!.seasons.map(s => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                  season === s
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {s} Season
              </button>
            ))}
            {seasonData.isLive && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                {seasonData.weeksPlayed}/{seasonData.regularSeasonWeeks} weeks in
              </span>
            )}
          </div>

          <LedgerTeasers season={seasonData} onPick={id => jumpToSimulator(id, id)} />

          {/* Simulator */}
          <div ref={simRef} className="space-y-2 scroll-mt-20">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Schedule Swap Simulator</span>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            {simMy !== null && simSchedule !== null && (
              <Simulator
                season={seasonData}
                myRosterId={simMy}
                scheduleRosterId={simSchedule}
                onSelectMy={setSimMy}
                onSelectSchedule={setSimSchedule}
              />
            )}
          </div>

          {/* Leaderboard */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Strength of Schedule</span>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <div className="space-y-2">
              {leaderboard.map(sm => (
                <LeaderboardRow
                  key={sm.rosterId}
                  season={seasonData}
                  sm={sm}
                  expanded={expandedRosterId === sm.rosterId}
                  onToggle={() => setExpandedRosterId(id => id === sm.rosterId ? null : sm.rosterId)}
                  onSimulate={() => jumpToSimulator(sm.rosterId)}
                />
              ))}
            </div>
          </div>

          {/* Multiverse matrix */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">The Schedule Multiverse</span>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <MatrixGrid season={seasonData} onCellClick={(myId, schedId) => jumpToSimulator(myId, schedId)} />
          </div>

          <HowItWorks />
        </>
      )}
    </div>
  );
}
