'use client';

/**
 * The Edge, My week: one team's week, worked through.
 *
 *   The call      the lineup as it's set against the best one the roster can field by projection,
 *                 and each swap that gets there, with the reasons that can be checked: the
 *                 projections, the matchups, recent form, and what leagues like this one do.
 *   The matchup   both teams' best lineups, projected.
 *   The lineup    every slot: who's in it, what he projects, his matchup, his range.
 *   The wire      free agents who project over someone in the lineup.
 *
 * Projections are Sleeper's, in this league's scoring; a player without one goes by recent form.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { eligible, expected, grade, lineupForWeek, nextMatchup, ordinal, sidelined, startValue, type Player } from '@/lib/edge/metrics';
import WeekCalendar from './WeekCalendar';
import { Face, InjuryTag, MatchupChip, PosTag, TeamFace, Tile, card, label, n1, useEdge } from './parts';

const SLOT: Record<string, string> = { SUPER_FLEX: 'SFLX', FLEX: 'FLX', REC_FLEX: 'W/T', WRRB_FLEX: 'W/R' };

export default function WeekTab() {
  const { r, prof, team, mine, setMine, open } = useEdge();
  const roster = useMemo(() => r.players.filter(p => p.owner === mine), [r, mine]);
  const best = useMemo(() => lineupForWeek(r, roster), [roster, r]);
  const isLocked = (p: Player) => r.locked.includes(p.team);

  // Free agents who project over the weakest starter they could replace.
  const wire = useMemo(() => {
    const out: { p: Player; over: Player; gain: number }[] = [];
    for (const fa of r.players) {
      if (fa.owner !== null || fa.proj === null || r.locked.includes(fa.team) || startValue(r, fa) === null) continue;
      const rivals = best.filter(s => s.player && eligible(s.slot).includes(fa.pos)).map(s => s.player!);
      if (!rivals.length) continue;
      const worst = rivals.reduce((a, b) => ((expected(a) ?? 0) <= (expected(b) ?? 0) ? a : b));
      const gain = fa.proj - (expected(worst) ?? 0);
      if (gain >= 0.5) out.push({ p: fa, over: worst, gain });
    }
    return out.sort((a, b) => b.gain - a.gain).slice(0, 6);
  }, [r, best]);

  if (mine === null || !team.has(mine)) {
    return (
      <div className="space-y-4">
      <div className={cn(card, 'p-5')}>
        <h3 className="font-display text-[20px] font-black">Which team is yours?</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">Pick it once and The Edge works your week: the lineup calls, the matchup, the wire.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {r.teams.map(t => (
            <button key={t.rosterId} type="button" onClick={() => setMine(t.rosterId)} className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:border-primary/60 hover:bg-primary/5">
              <TeamFace t={t} size={28} /><span className="truncate text-[13px] font-bold">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
      <WeekCalendar lineup={[]} />
      </div>
    );
  }

  const me = team.get(mine)!;
  const set = roster.filter(p => p.starting);
  const bestIds = new Set(best.map(s => s.player?.id).filter(Boolean) as string[]);
  const sum = (ps: (Player | null)[]) => ps.reduce((s, p) => s + (p ? expected(p) ?? 0 : 0), 0);
  const bestTotal = sum(best.map(s => s.player)), setTotal = sum(set);
  // Each swap: someone the best lineup starts who's on the bench, for someone it sits.
  const ins = best.map(s => s.player).filter((p): p is Player => Boolean(p && !p.starting));
  const outs = set.filter(p => !bestIds.has(p.id));
  const swaps = ins.map(i => {
    const fitsSame = (o: Player) => r.slots.some(s => eligible(s).includes(i.pos) && eligible(s).includes(o.pos));
    const k = outs.findIndex(fitsSame);
    const o = k >= 0 ? outs.splice(k, 1)[0] : null;
    return { i, o };
  });

  const oppId = (() => { const f = r.fixtures.find(x => x.includes(mine)); return f ? (f[0] === mine ? f[1] : f[0]) : null; })();
  const oppBest = oppId !== null ? sum(lineupForWeek(r, r.players.filter(p => p.owner === oppId)).map(s => s.player)) : null;

  const why = (p: Player): string[] => {
    const out: string[] = [];
    const m = nextMatchup(r, p), pr = prof.get(p.id)!;
    if (p.proj !== null) out.push(`projects ${n1(p.proj)}`);
    if (m?.bye) out.push('on a bye');
    else if (m?.allowed) { const g = grade(m.allowed.rank); out.push(`${m.home ? 'home to' : 'at'} ${m.opp}, who give up the ${ordinal(m.allowed.rank)} most to ${p.pos}s${g ? ` (${g.letter})` : ''}`); }
    if (pr.gp >= 4 && Math.abs(pr.trend) >= 2) out.push(`${pr.trend > 0 ? 'up' : 'down'} ${n1(Math.abs(pr.trend))} a game over his last three`);
    if (p.mkt && p.mkt.rostered >= 5) out.push(`started by ${Math.round((p.mkt.started / p.mkt.rostered) * 100)}% of the managers who have him`);
    if (p.inj) out.push(`listed ${p.inj.toLowerCase()}`);
    return out;
  };

  const flagged = set.filter(p => !isLocked(p) && (nextMatchup(r, p)?.bye || sidelined(p)));
  // Sidelined on the bench with a projection that would have started: worth a second look if the listing's wrong.
  const benchedOut = roster.filter(p => !p.starting && sidelined(p) && p.proj !== null && best.some(s => s.player && eligible(s.slot).includes(p.pos) && (expected(s.player) ?? 0) < p.proj!));

  return (
    <div className="space-y-4">
      <section className={cn(card, 'bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-5')}>
        <div className="flex flex-wrap items-center gap-3">
          <TeamFace t={me} size={40} />
          <div className="min-w-0 flex-1">
            <p className={label}>Week {r.week}, {r.scoring}</p>
            <h3 className="line-clamp-2 font-display text-[19px] font-black leading-tight sm:text-[22px]">{me.name}</h3>
          </div>
          <button type="button" onClick={() => setMine(null)} className="text-[12.5px] font-semibold text-primary hover:underline">Not your team?</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile k="Lineup as set" v={set.length ? n1(setTotal) : '-'} sub={set.length ? 'projected' : 'not set yet'} />
          <Tile k="Best lineup" v={n1(bestTotal)} sub={set.length && bestTotal - setTotal >= 0.1 ? `+${n1(bestTotal - setTotal)} on the table` : 'projected'} tone={set.length && bestTotal - setTotal >= 0.1 ? 'text-emerald-600 dark:text-emerald-400' : undefined} />
          {oppId !== null && oppBest !== null && <Tile k={`vs ${team.get(oppId)?.name ?? 'opponent'}`} v={n1(oppBest)} sub="their best lineup" />}
          {oppBest !== null && <Tile k="The gap" v={`${bestTotal - oppBest >= 0 ? '+' : ''}${n1(bestTotal - oppBest)}`} sub={bestTotal >= oppBest ? 'you project ahead' : 'you project behind'} tone={bestTotal >= oppBest ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} />}
        </div>
      </section>

      <WeekCalendar lineup={best.map(s => s.player).filter((p): p is Player => Boolean(p))} />

      {flagged.length > 0 && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-foreground">
          <b>In your lineup and not playing:</b> {flagged.map(p => `${p.name} (${nextMatchup(r, p)?.bye ? 'bye' : p.inj})`).join(', ')}.
        </p>
      )}

      {benchedOut.length > 0 && (
        <p className="rounded-xl bg-muted/60 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
          Left out because they&apos;re listed as not playing: {benchedOut.map(p => `${p.name} (${p.inj}, would project ${n1(p.proj)})`).join(', ')}.
        </p>
      )}
      {r.locked.length > 0 && <p className="text-[12px] text-muted-foreground">Week {r.week} is under way: players whose games have kicked off are locked where they are.</p>}

      <section>
        <h3 className={label}>The calls</h3>
        {swaps.length ? (
          <ul className="mt-2 grid gap-3 md:grid-cols-2">
            {swaps.map(({ i, o }) => (
              <li key={i.id} className={cn(card, 'p-3.5')}>
                <p className="flex items-center justify-between text-[10.5px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                  Start{o && <span className="lp-num text-[13px] tracking-normal">+{n1((expected(i) ?? 0) - (expected(o) ?? 0))}</span>}
                </p>
                {[{ p: i, verb: null as string | null }, ...(o ? [{ p: o, verb: 'Sit' }] : [])].map(({ p, verb }) => (
                  <div key={p.id}>
                    {verb && <p className="mt-3 text-[10.5px] font-black uppercase tracking-[0.14em] text-muted-foreground">{verb}</p>}
                    <button type="button" onClick={() => open(p.id)} className="mt-1.5 flex w-full items-center gap-2.5 text-left">
                      <Face p={p} size={36} />
                      <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-[14px] font-black">{p.name}</span><InjuryTag inj={p.inj} /></span><span className="mt-0.5 flex items-center gap-1.5"><PosTag pos={p.pos} /><MatchupChip p={p} /></span></span>
                      <span className="lp-num text-[17px] font-black">{n1(expected(p))}</span>
                    </button>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{why(p).join('; ')}.</p>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className={cn(card, 'mt-2 p-4 text-[13.5px] text-foreground')}>{set.length ? 'Your lineup is the best one this roster can field by projection. Nothing to change.' : 'No lineup is set yet. The best one by projection is below.'}</p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className={cn(card, 'p-3 sm:p-4')}>
          <h3 className={label}>The best lineup, slot by slot</h3>
          <ul className="mt-2">
            {best.map((s, k) => {
              const p = s.player;
              const pr = p ? prof.get(p.id)! : null;
              return (
                <li key={k} className="border-b border-border/60 last:border-0">
                  {p && pr ? (
                    <button type="button" onClick={() => open(p.id)} className="flex w-full items-center gap-2.5 px-1 py-2 text-left hover:bg-muted/40">
                      <span className="w-9 shrink-0 text-[10px] font-black uppercase text-muted-foreground">{SLOT[s.slot] ?? s.slot}</span>
                      <Face p={p} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5"><span className="truncate text-[13.5px] font-bold">{p.name}</span><InjuryTag inj={p.inj} />{!p.starting && set.length > 0 && <span className="rounded bg-emerald-500/15 px-1 py-px text-[9.5px] font-black text-emerald-700 dark:text-emerald-300">ON YOUR BENCH</span>}{isLocked(p) && <span className="rounded bg-muted px-1 py-px text-[9.5px] font-black text-muted-foreground">LOCKED</span>}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground"><MatchupChip p={p} />{(pr.gp > 0 || p.mkt) && <span className="lp-num hidden sm:inline">{[pr.gp > 0 ? `${n1(pr.floor)} to ${n1(pr.ceiling)} range` : '', p.mkt ? `the field starts him ${Math.round(p.mkt.started)}%` : ''].filter(Boolean).join(', ')}</span>}</span>
                      </span>
                      <span className="text-right"><span className="lp-num block text-[15px] font-black">{n1(expected(p))}</span><span className="lp-num block text-[10.5px] text-muted-foreground">{pr.gp ? `${n1(pr.ppg)} avg` : ''}</span></span>
                    </button>
                  ) : <p className="px-1 py-2.5 text-[12.5px] text-muted-foreground"><b className="mr-2 text-[10px] uppercase">{SLOT[s.slot] ?? s.slot}</b>Nobody on the roster to start here.</p>}
                </li>
              );
            })}
          </ul>
        </section>

        <aside className={cn(card, 'h-fit p-4')}>
          <h3 className={label}>On the wire</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">Free agents who project over someone in your best lineup.</p>
          <ul className="mt-2 space-y-1">
            {wire.map(({ p, over, gain }) => (
              <li key={p.id}>
                <button type="button" onClick={() => open(p.id)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-muted/60">
                  <Face p={p} size={30} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-bold">{p.name}</span><span className="mt-0.5 flex items-center gap-1.5"><PosTag pos={p.pos} /><MatchupChip p={p} compact /></span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">over {over.name}{p.mkt?.bid50 != null && `, bids ${p.mkt.bid50 === 0 ? '$0' : `to ${p.mkt.bid50}%`}`}</span></span>
                  <span className="lp-num text-[13px] font-black text-emerald-600 dark:text-emerald-400">+{n1(gain)}</span>
                </button>
              </li>
            ))}
            {!wire.length && <li className="text-[12.5px] text-muted-foreground">Nobody available projects over your starters.</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
