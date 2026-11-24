'use client';

/**
 * The Edge, the week's calendar: what a manager needs to know and when, a day at a time, in
 * their own time zone.
 *
 *   Waivers        the days the league's waivers run (where its provider says)
 *   Kickoffs       each window of NFL games, with the players of yours in it: their slots lock
 *                  then. The first is when Pick'em closes too.
 *   Trade deadline on its day when it's this week; otherwise under the calendar, with how far off
 *   Byes           the teams off this week, and who of yours is with them
 *   The playoffs   when they start, and how many weeks are left to get in
 *
 * Only what's known is shown: nothing here is an assumed time.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Player } from '@/lib/edge/metrics';
import { card, label, useEdge } from './parts';

interface Ev { at: number | null; kind: 'waivers' | 'kickoff' | 'deadline'; title: string; detail?: string; mine?: string[]; first?: boolean }

const DOT: Record<Ev['kind'], string> = { waivers: 'bg-violet-500', kickoff: 'bg-primary', deadline: 'bg-red-500' };
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export default function WeekCalendar({ lineup }: { lineup: Player[] }) {
  const { r, mine } = useEdge();
  const c = r.calendar;

  const days = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastGame = c.games.length ? new Date(c.games[c.games.length - 1].at) : today;
    const span = Math.min(9, Math.max(7, Math.ceil((lastGame.getTime() - today.getTime()) / 86_400_000) + 1));
    const list = Array.from({ length: span }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return { d, events: [] as Ev[] }; });
    const at = (d: Date) => list.find(x => dayKey(x.d) === dayKey(d));

    for (const day of list) {
      if (c.waiverDays.includes(day.d.getDay())) day.events.push({ at: null, kind: 'waivers', title: 'Waivers run', detail: c.faab ? `Claims go by bid, from a $${c.faab} budget` : 'Claims are processed' });
    }
    // Kickoff windows: games that start together.
    const windows = new Map<string, typeof c.games>();
    for (const g of c.games) windows.set(g.at, [...(windows.get(g.at) ?? []), g]);
    let first = true;
    for (const [iso, games] of [...windows].sort((a, b) => a[0].localeCompare(b[0]))) {
      const when = new Date(iso), day = at(when);
      const isFirst = first; first = false;
      if (!day) continue;
      const teams = new Set(games.flatMap(g => [g.home, g.away]));
      day.events.push({
        at: when.getTime(), kind: 'kickoff', first: isFirst,
        title: games.length === 1 ? `${games[0].away} at ${games[0].home}` : `${games.length} games kick off`,
        detail: games.length > 1 && games.length <= 4 ? games.map(g => `${g.away} at ${g.home}`).join(', ') : undefined,
        mine: lineup.filter(p => teams.has(p.team)).map(p => p.name),
      });
    }
    if (c.tradeDeadline?.at) {
      const when = new Date(c.tradeDeadline.at), day = at(when);
      if (day) day.events.push({ at: when.getTime(), kind: 'deadline', title: 'Trade deadline', detail: 'Trading closes for the season' });
    }
    for (const day of list) day.events.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    return list;
  }, [c, lineup]);

  const todayKey = dayKey(new Date());
  const byePlayers = mine !== null ? r.players.filter(p => p.owner === mine && c.byes.includes(p.team)) : [];
  const deadline = (() => {
    const t = c.tradeDeadline;
    if (!t) return null;
    if (t.at) { const ms = Date.parse(t.at); return ms < Date.now() ? { v: 'Passed', sub: new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } : { v: new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), sub: `${time(ms)}, ${Math.max(0, Math.ceil((ms - Date.now()) / 86_400_000))} days away` }; }
    if (t.afterWeek) return t.afterWeek < r.week ? { v: 'Passed', sub: `after week ${t.afterWeek}` } : { v: `After week ${t.afterWeek}`, sub: t.afterWeek === r.week ? 'this is the last week to trade' : `${t.afterWeek - r.week} more week${t.afterWeek - r.week === 1 ? '' : 's'} after this one` };
    return null;
  })();
  const toPlayoffs = c.playoffStart ? c.playoffStart - r.week : null;

  return (
    <section className={cn(card, 'p-3 sm:p-4')}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={label}>The week ahead</h3>
        <span className="text-[11px] text-muted-foreground">Week {r.week}, your time zone</span>
      </div>

      <ol className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-7 lg:overflow-visible">
        {days.slice(0, 7).map(({ d, events }) => {
          const today = dayKey(d) === todayKey;
          return (
            <li key={dayKey(d)} className={cn('min-w-[150px] flex-1 snap-start rounded-xl border p-2.5 lg:min-w-0', today ? 'border-primary/50 bg-primary/[0.05]' : 'border-border bg-muted/30')}>
              <p className="flex items-baseline justify-between">
                <span className={cn('text-[11px] font-black uppercase tracking-[0.1em]', today ? 'text-primary' : 'text-muted-foreground')}>{today ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className="lp-num text-[13px] font-black text-foreground">{d.getDate()}</span>
              </p>
              <ul className="mt-2 space-y-2">
                {events.map((e, i) => (
                  <li key={i} className={cn('text-[11.5px] leading-snug', e.at !== null && e.at < Date.now() && 'opacity-50')}>
                    <p className="flex items-center gap-1.5 font-bold text-foreground"><i className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[e.kind])} />{e.at !== null && <span className="lp-num text-muted-foreground">{time(e.at)}</span>}</p>
                    <p className="mt-0.5 font-semibold text-foreground">{e.title}</p>
                    {e.detail && <p className="text-muted-foreground">{e.detail}</p>}
                    {e.first && <p className="text-amber-700 dark:text-amber-400">First lock of the week. <Link href="/pickem" className="underline">Pick&apos;em</Link> closes.</p>}
                    {e.mine && e.mine.length > 0 && <p className="text-primary">Yours: {e.mine.join(', ')}</p>}
                  </li>
                ))}
                {!events.length && <li className="text-[11.5px] text-muted-foreground/70">Nothing on</li>}
              </ul>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {deadline && <div className="rounded-xl bg-muted/50 px-3 py-2"><p className={label}>Trade deadline</p><p className="mt-0.5 text-[14px] font-black text-foreground">{deadline.v}</p><p className="text-[11px] text-muted-foreground">{deadline.sub}</p></div>}
        {c.playoffStart !== null && toPlayoffs !== null && (
          <div className="rounded-xl bg-muted/50 px-3 py-2"><p className={label}>Playoffs</p><p className="mt-0.5 text-[14px] font-black text-foreground">{toPlayoffs > 0 ? `Start week ${c.playoffStart}` : 'Under way'}</p><p className="text-[11px] text-muted-foreground">{toPlayoffs > 1 ? `${toPlayoffs} regular-season weeks left, this one included` : toPlayoffs === 1 ? 'This is the last week of the regular season' : `Since week ${c.playoffStart}`}</p></div>
        )}
        <div className="rounded-xl bg-muted/50 px-3 py-2"><p className={label}>On a bye</p><p className="mt-0.5 text-[14px] font-black text-foreground">{c.byes.length ? c.byes.join(', ') : 'Nobody'}</p><p className="text-[11px] text-muted-foreground">{byePlayers.length ? `Yours: ${byePlayers.map(p => p.name).join(', ')}` : c.byes.length ? 'None of your players' : 'Every team plays'}</p></div>
      </div>
    </section>
  );
}
