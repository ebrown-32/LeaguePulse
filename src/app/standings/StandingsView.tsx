'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingBlock } from '@/components/ui/LoadingSpinner';
import Avatar from '@/components/ui/Avatar';
import Hint from '@/components/ui/Hint';
import { cn } from '@/lib/utils';

/**
 * The table.
 *
 * Record alone hides most of what a season is: a 6-2 built on the two worst
 * teams reads the same as a 6-2 that beat everyone. Differential, all-play and
 * form are here so the table says which one you are looking at, and the
 * playoff cut is drawn on it rather than left to be counted.
 */

interface Row {
  rank: number;
  rosterId: number;
  userId: string;
  teamName: string;
  manager: string;
  avatar: string;
  wins: number; losses: number; ties: number; winPct: number;
  pointsFor: number; pointsAgainst: number; differential: number;
  form: ('W' | 'L' | 'T')[];
  streak: number;
  allPlayWins: number; allPlayLosses: number; allPlayPct: number;
  inPlayoffs: boolean;
  gamesBack: number;
}
interface Standings {
  medianMatch: boolean;
  season: string;
  throughWeek: number;
  leagueName: string;
  playoffTeams: number;
  rows: Row[];
}

const HELP = {
  diff: 'Points for minus points against. The quickest read on whether a record is earned or scheduled.',
  allPlay: 'Win rate if every team played every other team every week. Removes the schedule entirely.',
  form: 'The last five results, most recent first.',
  gb: 'Games behind the last team currently holding a playoff place.',
};

function FormPips({ form }: { form: Row['form'] }) {
  if (!form.length) return <span className="text-muted-foreground">n/a</span>;
  return (
    <span className="inline-flex gap-1">
      {form.map((r, i) => (
        <span
          key={i}
          title={r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Tie'}
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold',
            r === 'W' ? 'bg-emerald-500/15 text-emerald-500'
              : r === 'L' ? 'bg-rose-500/15 text-rose-500'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

export default function StandingsView() {
  const [data, setData] = useState<Standings | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState('current');
  const [seasons, setSeasons] = useState<string[]>([]);

  useEffect(() => {
    setData(null);
    setReason(null);
    fetch(`/api/standings?season=${season}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setError(null);
        setData(d.standings);
        setReason(d.reason ?? null);
        if (d.seasons?.length) setSeasons(d.seasons);
      })
      .catch(() => setError('Could not load standings.'));
  }, [season]);

  const subtitle = data
    ? (data.season === 'all-time'
        ? `${data.leagueName}, every season, ${data.throughWeek} weeks played`
        : `${data.leagueName}, ${data.season} through week ${data.throughWeek}`)
    : 'Record, form and who is actually in the hunt.';

  return (
    <PageLayout title="Standings" subtitle={subtitle}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          value={season}
          aria-label="Season"
          onChange={e => setSeason(e.target.value)}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-base text-foreground focus:border-primary focus:outline-none sm:text-xs"
        >
          <option value="current">This season</option>
          <option value="all-time">All time</option>
          {seasons.map(s => <option key={s} value={s}>{s} season</option>)}
        </select>
        {season === 'all-time' && (
          <span className="text-[11px] text-muted-foreground">
            Combined across every season, by manager rather than by roster slot.
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-500">{error}</div>
      )}
      {!data && !error && !reason && <LoadingBlock size={16} />}
      {reason && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{reason}</p>
          <p className="mt-1 text-xs text-muted-foreground">The table fills in once week 1 is played.</p>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="px-3 py-2.5 text-left font-bold">#</th>
                    <th className="px-2 py-2.5 text-left font-bold">Team</th>
                    <th className="px-2.5 py-2.5 text-right font-bold">W-L</th>
                    <th className="px-2.5 py-2.5 text-right font-bold">PF</th>
                    <th className="px-2.5 py-2.5 text-right font-bold">PA</th>
                    <th className="px-2.5 py-2.5 text-right font-bold">
                      <Hint label="Diff" side="bottom">{HELP.diff}</Hint>
                    </th>
                    <th className="px-2.5 py-2.5 text-right font-bold">
                      <Hint label="All-play" side="bottom">{HELP.allPlay}</Hint>
                    </th>
                    <th className="px-2.5 py-2.5 text-right font-bold">Streak</th>
                    <th className="px-2.5 py-2.5 text-right font-bold">
                      <Hint label="Form" side="bottom">{HELP.form}</Hint>
                    </th>
                    {data.playoffTeams > 0 && (
                      <th className="px-2.5 py-2.5 text-right font-bold">
                        <Hint label="GB" side="bottom">{HELP.gb}</Hint>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => {
                    // The line the table is really about: everything above it
                    // is in, everything below is not.
                    const cutoff = data.playoffTeams > 0 && r.rank === data.playoffTeams;
                    return (
                      <motion.tr
                        key={r.userId || r.rosterId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 12) * 0.02 }}
                        className={cn(
                          'border-b border-border last:border-0 hover:bg-muted/30',
                          cutoff && 'border-b-2 border-b-primary/40',
                        )}
                      >
                        <td className="px-3 py-2">
                          <span className={cn(
                            'inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold tabular-nums',
                            r.inPlayoffs ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
                          )}>
                            {r.rank}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar avatarId={r.avatar} size={24} className="shrink-0" />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-foreground">{r.teamName}</span>
                              <span className="block truncate text-[11px] text-muted-foreground">{r.manager}</span>
                            </span>
                          </div>
                        </td>
                        <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-foreground">
                          {r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ''}
                        </td>
                        <td className="px-2.5 py-2 text-right tabular-nums text-foreground">{r.pointsFor}</td>
                        <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">{r.pointsAgainst}</td>
                        <td className={cn('px-2.5 py-2 text-right font-semibold tabular-nums',
                          r.differential > 0 ? 'text-emerald-500' : r.differential < 0 ? 'text-rose-500' : '')}>
                          {r.differential > 0 ? '+' : ''}{r.differential}
                        </td>
                        <td className="px-2.5 py-2 text-right tabular-nums text-foreground">{r.allPlayPct}%</td>
                        <td className={cn('px-2.5 py-2 text-right font-semibold tabular-nums',
                          r.streak > 0 ? 'text-emerald-500' : r.streak < 0 ? 'text-rose-500' : 'text-muted-foreground')}>
                          {r.streak === 0 ? 'n/a' : `${r.streak > 0 ? 'W' : 'L'}${Math.abs(r.streak)}`}
                        </td>
                        <td className="px-2.5 py-2 text-right"><FormPips form={r.form} /></td>
                        {data.playoffTeams > 0 && (
                          <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">
                            {r.inPlayoffs ? 'in' : r.gamesBack > 0 ? r.gamesBack : '0'}
                          </td>
                        )}
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(data.playoffTeams > 0 || data.medianMatch) && (
              <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                {data.playoffTeams > 0 && (
                  <>The line sits under place {data.playoffTeams}: this league takes {data.playoffTeams} into
                  the playoffs. Seeded on record, with total points as the tiebreak. </>
                )}
                {data.medianMatch && (
                  <>This league plays median matches, so each week is two games: one against your
                  opponent and one against the league median.</>
                )}
              </p>
            )}
          </section>
        </div>
      )}
    </PageLayout>
  );
}
