'use client';

/**
 * The Edge, Matchups: what every defense gives up to every position, a game, in this league's
 * scoring. Green gives up the most (start your players against it), red the least. Tap a cell
 * for who faces that defense this week (yours, the league's, the free agents) and the biggest
 * games anyone has had against it.
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { expected, ordinal, POSITIONS, type Player, type Pos } from '@/lib/edge/metrics';
import { Face, OwnerTag, card, heat, label, n1, useEdge } from './parts';

export default function MatchupsTab() {
  const { r, open, mine } = useEdge();
  const [sort, setSort] = useState<Pos>('WR');
  const [sel, setSel] = useState<{ def: string; pos: Pos } | null>(null);
  const defs = useMemo(() => Object.keys(r.dvp).sort((a, b) => (r.dvp[a][sort]?.rank ?? 99) - (r.dvp[b][sort]?.rank ?? 99)), [r, sort]);
  // Who each defense plays this week: the offense whose players get the matchup.
  const facing = useMemo(() => {
    const m = new Map<string, { team: string; home: boolean }>();
    for (const [team, games] of Object.entries(r.schedule)) { const g = games.find(x => x.w === r.week); if (g?.opp) m.set(g.opp, { team, home: g.home }); }
    return m;
  }, [r]);

  const picked = sel ?? (defs[0] ? { def: defs[0], pos: sort } : null);
  const detail = useMemo(() => {
    if (!picked) return null;
    const off = facing.get(picked.def)?.team;
    const now = off ? r.players.filter(p => p.pos === picked.pos && p.team === off).map(p => ({ p, e: expected(p) })).filter(x => x.e !== null).sort((a, b) => b.e! - a.e!).slice(0, 8) : [];
    const best: { p: Player; w: number; pts: number }[] = [];
    for (const p of r.players) if (p.pos === picked.pos) for (const g of p.games) if (g.opp === picked.def) best.push({ p, w: g.w, pts: g.pts });
    return { off, now, best: best.sort((a, b) => b.pts - a.pts).slice(0, 6), a: r.dvp[picked.def]?.[picked.pos] };
  }, [picked, facing, r]);

  if (!defs.length) return <p className={cn(card, 'p-6 text-center text-[13.5px] text-muted-foreground')}>Matchup numbers start once the season&apos;s first week is final.</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className={cn(card, 'overflow-x-auto')}>
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Defense</th>
              {POSITIONS.map(pos => (
                <th key={pos} className="px-1 py-2 text-center">
                  <button type="button" onClick={() => setSort(pos)} title={`Sort by points given up to ${pos === 'DEF' ? 'fantasy defenses' : `${pos}s`}`}
                    className={cn('text-[10.5px] font-bold uppercase tracking-[0.1em] hover:text-foreground', sort === pos ? 'text-foreground' : 'text-muted-foreground')}>
                    vs {pos}{sort === pos && ' ↓'}
                  </button>
                </th>
              ))}
              <th className="px-2 py-2 text-right text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Wk {r.week}</th>
            </tr>
          </thead>
          <tbody>
            {defs.map(def => {
              const f = facing.get(def);
              return (
                <tr key={def} className="border-b border-border/60 last:border-0">
                  <th className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left">
                    <span className="flex items-center gap-2 font-bold text-foreground"><Face p={{ id: def, name: def, pos: 'DEF', team: def }} size={22} />{def}</span>
                  </th>
                  {POSITIONS.map(pos => {
                    const a = r.dvp[def]?.[pos];
                    const on = picked?.def === def && picked.pos === pos;
                    return (
                      <td key={pos} className="p-0.5 text-center">
                        {a ? (
                          <button type="button" onClick={() => setSel({ def, pos })} title={`${def} gives up ${a.ppg} a game to ${pos}s: ${ordinal(a.rank)} most, over ${a.games} games`}
                            className={cn('lp-num w-full rounded-md px-1 py-1.5 font-semibold tabular-nums text-foreground transition-shadow hover:ring-2 hover:ring-foreground/20', on && 'ring-2 ring-primary')}
                            style={{ background: heat(a.rank, defs.length) }}>
                            {a.ppg.toFixed(1)}
                          </button>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-[12px] font-semibold text-muted-foreground">{f ? `${f.home ? '@' : 'vs'} ${f.team}` : 'BYE'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {picked && detail && (
        <aside className={cn(card, 'h-fit p-4 lg:sticky lg:top-20')}>
          <p className={label}>{picked.pos === 'DEF' ? 'Fantasy defenses' : `${picked.pos}s`} against</p>
          <h3 className="mt-1 flex items-center gap-2 font-display text-[20px] font-black"><Face p={{ id: picked.def, name: picked.def, pos: 'DEF', team: picked.def }} size={28} />{picked.def}</h3>
          {detail.a && <p className="mt-1 text-[12.5px] text-muted-foreground">Gives up <b className="text-foreground">{detail.a.ppg}</b> a game, <b className="text-foreground">{ordinal(detail.a.rank)}</b> most of {defs.length}.</p>}

          <p className={cn(label, 'mt-4')}>{detail.off ? `Week ${r.week}: ${detail.off}'s ${picked.pos}s get this matchup` : `On a bye in week ${r.week}`}</p>
          <ul className="mt-2 space-y-1">
            {detail.now.map(({ p, e }) => (
              <li key={p.id}>
                <button type="button" onClick={() => open(p.id)} className={cn('flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-muted/60', p.owner === mine && mine !== null && 'bg-primary/[0.06]')}>
                  <Face p={p} size={26} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-bold">{p.name}</span><OwnerTag p={p} /></span>
                  <span className="lp-num text-[13px] font-black">{n1(e)}</span>
                </button>
              </li>
            ))}
            {detail.off && !detail.now.length && <li className="text-[12.5px] text-muted-foreground">Nobody of note.</li>}
          </ul>

          {detail.best.length > 0 && (
            <>
              <p className={cn(label, 'mt-4')}>Biggest games against them</p>
              <ul className="mt-2 space-y-1">
                {detail.best.map(({ p, w, pts }) => (
                  <li key={`${p.id}-${w}`}>
                    <button type="button" onClick={() => open(p.id)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-muted/60">
                      <span className="min-w-0 flex-1 truncate text-[12.5px]"><b>{p.name}</b> <span className="text-muted-foreground">week {w}</span></span>
                      <span className="lp-num text-[12.5px] font-bold">{pts.toFixed(1)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
