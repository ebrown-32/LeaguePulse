'use client';

/**
 * The Edge, Teams: how the league's rosters stack up, and any two head to head.
 *
 *   The board     every team's best lineup by season averages, position by position, coloured by
 *                 its rank in the league; its bench, its value over replacement, what it projects
 *                 to this week, and how soft its matchups are.
 *   Head to head  two teams on one shape (each position against the league's best at it), the
 *                 gap at every position, and both best lineups for the week.
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { expected, lineupForWeek, POSITIONS, rankOf, teamStrength, type Pos, type TeamStrength } from '@/lib/edge/metrics';
import { Face, MatchupChip, TeamFace, card, heat, label, n1, useEdge } from './parts';

const AXES: (Pos | 'Bench')[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'Bench'];
const axisValue = (s: TeamStrength, a: Pos | 'Bench') => (a === 'Bench' ? s.bench : s.byPos[a]);

function Radar({ a, b, max }: { a: TeamStrength; b: TeamStrength; max: Record<string, number> }) {
  const R = 92, C = 120;
  const pt = (i: number, k: number) => { const ang = (Math.PI * 2 * i) / AXES.length - Math.PI / 2; return [C + Math.cos(ang) * R * k, C + Math.sin(ang) * R * k]; };
  const shape = (s: TeamStrength) => AXES.map((ax, i) => pt(i, Math.max(0.04, axisValue(s, ax) / (max[ax] || 1))).join(',')).join(' ');
  return (
    <svg viewBox="0 0 240 240" className="mx-auto h-60 w-60" role="img" aria-label="Both teams, position by position, against the league's best">
      {[0.25, 0.5, 0.75, 1].map(k => <polygon key={k} points={AXES.map((_, i) => pt(i, k).join(',')).join(' ')} fill="none" className="stroke-border" strokeWidth={1} />)}
      {AXES.map((ax, i) => { const [x, y] = pt(i, 1.16); return <text key={ax} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground text-[10px] font-bold">{ax}</text>; })}
      <polygon points={shape(b)} className="fill-amber-500/20 stroke-amber-500" strokeWidth={2} strokeLinejoin="round" />
      <polygon points={shape(a)} className="fill-primary/20 stroke-primary" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

export default function TeamsTab() {
  const { r, repl, team, mine, open } = useEdge();
  const strengths = useMemo(() => r.teams.map(t => teamStrength(r, t.rosterId, repl)), [r, repl]);
  const by = useMemo(() => new Map(strengths.map(s => [s.rosterId, s])), [strengths]);
  const [sort, setSort] = useState<string>('lineup');
  const opp = (id: number | null) => { const f = r.fixtures.find(x => x.includes(id ?? -1)); return f ? (f[0] === id ? f[1] : f[0]) : null; };
  const [a, setA] = useState<number>(mine ?? r.teams[0]?.rosterId ?? 0);
  const [b, setB] = useState<number>(opp(mine ?? r.teams[0]?.rosterId ?? 0) ?? r.teams[1]?.rosterId ?? 0);

  const cols: { key: string; label: string; title: string; v: (s: TeamStrength) => number | null; low?: boolean }[] = [
    ...POSITIONS.map(p => ({ key: p, label: p, title: `Points a game from the ${p}s in its best lineup`, v: (s: TeamStrength) => s.byPos[p] })),
    { key: 'lineup', label: 'Lineup', title: 'Its best lineup, by season averages', v: s => s.lineup },
    { key: 'bench', label: 'Bench', title: 'Its best four on the bench: depth', v: s => s.bench },
    { key: 'vor', label: 'VOR', title: 'The lineup\'s value over replacement', v: s => s.vor },
    { key: 'projected', label: `Wk ${r.week}`, title: 'Its best lineup this week, by projection', v: s => s.projected },
    { key: 'matchup', label: 'Sched', title: 'Its lineup\'s average matchup rank this week: lower is softer', v: s => s.matchup, low: true },
  ];
  const sorted = useMemo(() => {
    const c = cols.find(x => x.key === sort)!;
    return [...strengths].sort((x, y) => ((c.v(y) ?? -1e9) - (c.v(x) ?? -1e9)) * (c.low ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strengths, sort]);
  const max = useMemo(() => Object.fromEntries(AXES.map(ax => [ax, Math.max(0.1, ...strengths.map(s => axisValue(s, ax)))])), [strengths]);

  const sa = by.get(a), sb = by.get(b);
  const lineupOf = (id: number) => lineupForWeek(r, r.players.filter(p => p.owner === id));

  return (
    <div className="space-y-5">
      <div className={cn(card, 'overflow-x-auto')}>
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Team</th>
              {cols.map(c => (
                <th key={c.key} title={c.title} className="px-1 py-2 text-center">
                  <button type="button" onClick={() => setSort(c.key)} className={cn('text-[10.5px] font-bold uppercase tracking-[0.1em] hover:text-foreground', sort === c.key ? 'text-foreground' : 'text-muted-foreground')}>{c.label}{sort === c.key && ' ↓'}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const t = team.get(s.rosterId)!;
              return (
                <tr key={s.rosterId} className={cn('border-b border-border/60 last:border-0', s.rosterId === mine && 'bg-primary/[0.05]')}>
                  <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left">
                    <button type="button" onClick={() => setA(s.rosterId)} className="flex items-center gap-2 text-left" title="Compare this team below">
                      <TeamFace t={t} size={24} />
                      <span className="min-w-0"><span className="block max-w-[150px] truncate font-bold text-foreground">{t.name}</span><span className="lp-num block text-[11px] font-normal text-muted-foreground">{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ''}</span></span>
                    </button>
                  </th>
                  {cols.map(c => {
                    const v = c.v(s);
                    const all = strengths.map(x => c.v(x)).filter((x): x is number => x !== null);
                    const rank = v === null ? undefined : c.low ? all.filter(x => x < v).length + 1 : rankOf(all, v);
                    return <td key={c.key} className="p-0.5 text-center"><span className="lp-num block rounded-md px-1 py-1.5 font-semibold tabular-nums" style={{ background: heat(rank, all.length) }} title={rank ? `${rank} of ${all.length}` : undefined}>{v === null ? '-' : c.key === 'vor' && v > 0 ? `+${n1(v)}` : n1(v)}</span></td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sa && sb && (
        <section className={cn(card, 'p-4 sm:p-5')}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto font-display text-[18px] font-black">Head to head</h3>
            {[{ v: a, set: setA, tint: 'border-primary' }, { v: b, set: setB, tint: 'border-amber-500' }].map((s, i) => (
              <select key={i} value={s.v} onChange={e => s.set(Number(e.target.value))} aria-label={i ? 'Second team' : 'First team'}
                className={cn('h-9 max-w-[46%] rounded-lg border-2 bg-card px-2 text-[13px] font-bold text-foreground outline-none', s.tint)}>
                {r.teams.map(t => <option key={t.rosterId} value={t.rosterId}>{t.name}</option>)}
              </select>
            ))}
          </div>

          <div className="mt-4 grid items-center gap-5 md:grid-cols-[260px_minmax(0,1fr)]">
            <Radar a={sa} b={sb} max={max} />
            <div className="space-y-2">
              {AXES.map(ax => {
                const va = axisValue(sa, ax), vb = axisValue(sb, ax), top = Math.max(va, vb, 0.1);
                return (
                  <div key={ax} className="grid grid-cols-[1fr_44px_1fr] items-center gap-2">
                    <span className="flex items-center justify-end gap-2"><span className={cn('lp-num text-[12.5px] tabular-nums', va >= vb ? 'font-black text-foreground' : 'text-muted-foreground')}>{n1(va)}</span><span className="flex h-2 w-full max-w-[150px] justify-end overflow-hidden rounded-full bg-muted"><i className="h-full rounded-full bg-primary" style={{ width: `${(va / top) * 100}%` }} /></span></span>
                    <span className="text-center text-[10.5px] font-black uppercase tracking-[0.08em] text-muted-foreground">{ax}</span>
                    <span className="flex items-center gap-2"><span className="flex h-2 w-full max-w-[150px] overflow-hidden rounded-full bg-muted"><i className="h-full rounded-full bg-amber-500" style={{ width: `${(vb / top) * 100}%` }} /></span><span className={cn('lp-num text-[12.5px] tabular-nums', vb >= va ? 'font-black text-foreground' : 'text-muted-foreground')}>{n1(vb)}</span></span>
                  </div>
                );
              })}
              <p className="pt-1 text-[11.5px] text-muted-foreground">Points a game from each team&apos;s best lineup, by position. The shape sets each against the league&apos;s best at it.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[{ id: a, s: sa, tint: 'text-primary' }, { id: b, s: sb, tint: 'text-amber-500' }].map(side => (
              <div key={side.id}>
                <p className="flex items-center gap-2"><TeamFace t={team.get(side.id)} size={22} /><span className={cn('truncate text-[14px] font-black', side.tint)}>{team.get(side.id)?.name}</span><span className="lp-num ml-auto text-[14px] font-black">{n1(side.s.projected)}</span></p>
                <p className={cn(label, 'mt-0.5')}>Best lineup, week {r.week}, by projection</p>
                <ul className="mt-2 space-y-0.5">
                  {lineupOf(side.id).map((s, i) => (
                    <li key={i}>
                      {s.player ? (
                        <button type="button" onClick={() => open(s.player!.id)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-muted/60">
                          <span className="w-9 shrink-0 text-[10px] font-black uppercase text-muted-foreground">{s.slot === 'SUPER_FLEX' ? 'SFLX' : s.slot === 'FLEX' ? 'FLX' : s.slot}</span>
                          <Face p={s.player} size={24} />
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{s.player.name}</span>
                          <MatchupChip p={s.player} compact />
                          <span className="lp-num w-9 text-right text-[12.5px] font-bold">{n1(expected(s.player))}</span>
                        </button>
                      ) : <span className="block px-1 py-1 text-[12.5px] text-muted-foreground">{s.slot}: nobody to start</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
