'use client';

import Link from 'next/link';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { teamAvatar } from '@/lib/teamAvatar';

/**
 * The standings table.
 *
 * One implementation, mounted on the home page and on /standings. There were
 * two before, and they disagreed: the home page read Sleeper's own roster
 * totals while the standings page rebuilt the record from the weekly matchup
 * feed. The rebuild had to re-derive median games by hand and produced a
 * streak that counted only head-to-head results, so a row could show a record
 * and a streak drawn from different sets of games.
 *
 * Reading `roster.settings` is correct by construction. Median matches, ties,
 * and any commissioner adjustment are already inside those totals, because
 * they are the same numbers Sleeper itself displays.
 */

export interface StandingsUser {
  user_id: string;
  avatar: string;
  display_name: string;
  metadata?: {
    team_name?: string;
    /** The manager's team picture for this league, a full uploads URL. */
    avatar?: string | null;
  };
}

/** An all-time row, as aggregated by generateComprehensiveLeagueHistory. */
export interface AllTimeRow {
  userId: string;
  user: StandingsUser;
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  totalPoints: number;
  /** Absent from some callers' data, so treated as unknown rather than zero. */
  totalPointsAgainst?: number;
  winPercentage: number;
  championships: number;
}

interface Props {
  /** Season rows, straight from Sleeper. Ignored when `allTime` is given. */
  rosters?: any[];
  users?: StandingsUser[];
  /** All-time rows, already sorted by the caller. */
  allTime?: AllTimeRow[];
  playoffTeams?: number;
  /** Applied to team and manager names before display. */
  censor?: (name: string) => string;
}

const num = (v: any, fallback = 0): number =>
  v === undefined || v === null || Number.isNaN(Number(v)) ? fallback : Number(v);

/** An em space stands in for a value that does not exist yet. */
const NONE = '\u2013';

/**
 * Before a ball is kicked every column is a zero, and a table of 0-0, 0.0% and
 * 0.00 reads as broken data rather than as a season that has not started. A
 * dash says "nothing here yet", which is the truth.
 */
function played(wins: number, losses: number, ties: number): boolean {
  return wins + losses + ties > 0;
}

function formatPoints(n: number): string {
  return n.toFixed(2);
}

function formatRecord(w: number, l: number, t: number): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function winPct(w: number, l: number, t: number): number {
  const games = w + l + t;
  return games > 0 ? ((w + t * 0.5) / games) * 100 : 0;
}

function HeaderRow() {
  return (
    <div className="mb-1 hidden items-center gap-3 px-4 py-2 md:flex">
      <span className="w-5 shrink-0" />
      <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Team</span>
      <span className="w-20 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Record</span>
      <span className="w-14 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Win%</span>
      <span className="w-16 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">PF</span>
      <span className="w-16 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">PA</span>
    </div>
  );
}

export default function StandingsTable({
  rosters, users, allTime, playoffTeams = 0, censor = (n: string) => n,
}: Props) {
  return (
    <div className="space-y-0.5">
      <HeaderRow />

      {allTime
        ? allTime.map((s, i) => {
            const games = s.totalWins + s.totalLosses + s.totalTies;
            const hasPlayed = games > 0;
            // All-time rows span seasons of different lengths, so the points
            // columns show a per-game average rather than a career total.
            const avgPF = games > 0 ? s.totalPoints / games : 0;
            // Undefined rather than zero when the caller has no figure, so the
            // column shows a dash instead of a confident 0.00 or a NaN.
            const avgPA = games > 0 && Number.isFinite(Number(s.totalPointsAgainst))
              ? Number(s.totalPointsAgainst) / games
              : null;
            return (
              <Link
                href={`/team/${s.userId}`}
                key={s.userId}
                className={cn(
                  'group relative flex items-center gap-3 rounded-md border-l-2 px-4 py-3 transition-none',
                  i === 0
                    ? 'border-amber-400 bg-amber-500/[0.05] hover:bg-amber-500/[0.08]'
                    : 'border-transparent hover:bg-accent/60',
                )}
              >
                <span className={cn('w-5 shrink-0 text-center text-xs font-bold',
                  i === 0 ? 'text-amber-500' : 'text-muted-foreground')}>
                  {i + 1}
                </span>
                <Avatar avatarId={teamAvatar(s.user)} size={26} className="shrink-0 rounded" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="line-clamp-2 text-sm font-medium leading-tight text-foreground">
                      {censor(s.user.display_name)}
                    </span>
                    {s.championships > 0 && (
                      <span className={cn(
                        'hidden shrink-0 items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide md:inline-flex',
                        i === 0
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-500'
                          : 'border-primary/20 bg-primary/10 text-primary',
                      )}>
                        {s.championships}&times; Champ
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 md:hidden">
                    <span className="text-[10px] text-muted-foreground">{s.winPercentage.toFixed(1)}% win</span>
                    <span className="text-[10px] text-muted-foreground/40">&middot;</span>
                    <span className="text-[10px] text-muted-foreground">{formatPoints(avgPF)} avg</span>
                    {s.championships > 0 && (
                      <>
                        <span className="text-[10px] text-muted-foreground/40">&middot;</span>
                        <span className={cn('text-[10px] font-semibold', i === 0 ? 'text-amber-500' : 'text-primary')}>
                          {s.championships}&times; Champ
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="hidden shrink-0 items-center gap-3 md:flex">
                  <span className="w-20 text-right font-mono text-sm text-foreground">
                    {hasPlayed ? formatRecord(s.totalWins, s.totalLosses, s.totalTies) : NONE}
                  </span>
                  <span className="w-14 text-right text-sm text-muted-foreground">
                    {hasPlayed ? `${s.winPercentage.toFixed(1)}%` : NONE}
                  </span>
                  <span className="w-16 text-right text-sm font-medium text-foreground">
                    {hasPlayed ? formatPoints(avgPF) : NONE}
                  </span>
                  <span className="w-16 text-right text-sm text-muted-foreground">
                    {hasPlayed && avgPA !== null ? formatPoints(avgPA) : NONE}
                  </span>
                </div>
                <div className="shrink-0 text-right md:hidden">
                  <p className="font-mono text-xs font-semibold text-foreground">
                    {s.totalWins}-{s.totalLosses}
                  </p>
                </div>
              </Link>
            );
          })
        : (rosters ?? []).map((roster: any, i: number) => {
            const user = (users ?? []).find(u => u.user_id === roster.owner_id);
            if (!user) return null;
            const wins = num(roster.settings?.wins);
            const losses = num(roster.settings?.losses);
            const ties = num(roster.settings?.ties);
            // Sleeper splits points into a whole part and hundredths.
            const fpts = num(roster.settings?.fpts) + num(roster.settings?.fpts_decimal) / 100;
            const fptsAgainst = num(roster.settings?.fpts_against) + num(roster.settings?.fpts_against_decimal) / 100;
            const pct = winPct(wins, losses, ties);
            const hasPlayed = played(wins, losses, ties);
            // Seeding nobody has earned is not worth badging, so the playoff
            // and bubble markers wait for a result.
            const isPlayoff = hasPlayed && playoffTeams > 0 && i < playoffTeams;
            const isBubble = hasPlayed && playoffTeams > 0 && i === playoffTeams;

            return (
              <Link
                href={`/team/${user.user_id}`}
                key={roster.roster_id}
                className={cn(
                  'relative flex items-center gap-3 rounded-md border-l-2 px-4 py-3 transition-none',
                  isPlayoff
                    ? 'border-primary bg-primary/[0.04] hover:bg-primary/[0.07]'
                    : isBubble
                      ? 'border-primary/40 bg-primary/[0.02] hover:bg-primary/[0.04]'
                      : 'border-transparent hover:bg-accent/60',
                )}
              >
                <span className={cn('w-5 shrink-0 text-center text-xs font-bold',
                  isPlayoff ? 'text-primary' : isBubble ? 'text-primary/50' : 'text-muted-foreground')}>
                  {i + 1}
                </span>
                <Avatar avatarId={teamAvatar(user)} size={26} className="shrink-0 rounded" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="line-clamp-2 text-sm font-medium leading-tight text-foreground">
                      {censor(user.metadata?.team_name || user.display_name)}
                    </span>
                    {isPlayoff && (
                      <span className="hidden shrink-0 items-center rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary md:inline-flex">
                        Playoff
                      </span>
                    )}
                    {isBubble && (
                      <span className="hidden shrink-0 items-center rounded border border-primary/20 bg-primary/[0.08] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary/60 md:inline-flex">
                        Bubble
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 md:hidden">
                    <span className="text-[10px] text-muted-foreground">
                      {hasPlayed ? `${pct.toFixed(1)}% win` : 'Not started'}
                    </span>
                    {hasPlayed && (
                      <>
                        <span className="text-[10px] text-muted-foreground/40">&middot;</span>
                        <span className="text-[10px] text-muted-foreground">{formatPoints(fpts)} PF</span>
                      </>
                    )}
                    {(isPlayoff || isBubble) && (
                      <>
                        <span className="text-[10px] text-muted-foreground/40">&middot;</span>
                        <span className={cn('text-[10px] font-semibold', isPlayoff ? 'text-primary' : 'text-primary/50')}>
                          {isPlayoff ? 'Playoff' : 'Bubble'}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="hidden shrink-0 items-center gap-3 md:flex">
                  <span className="w-20 text-right font-mono text-sm text-foreground">
                    {hasPlayed ? formatRecord(wins, losses, ties) : NONE}
                  </span>
                  <span className="w-14 text-right text-sm text-muted-foreground">
                    {hasPlayed ? `${pct.toFixed(1)}%` : NONE}
                  </span>
                  <span className="w-16 text-right text-sm font-medium text-foreground">
                    {hasPlayed ? formatPoints(fpts) : NONE}
                  </span>
                  <span className="w-16 text-right text-sm text-muted-foreground">
                    {hasPlayed ? formatPoints(fptsAgainst) : NONE}
                  </span>
                </div>

                <div className="shrink-0 text-right md:hidden">
                  <p className="font-mono text-xs font-semibold text-foreground">
                    {hasPlayed ? formatRecord(wins, losses, ties) : NONE}
                  </p>
                </div>
              </Link>
            );
          })}
    </div>
  );
}
