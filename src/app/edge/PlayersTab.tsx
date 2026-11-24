'use client';

/**
 * The Edge, Players: every fantasy-relevant player in one table, in this league's scoring.
 * Search, filter by position and by who has him here, sort by any column, tick up to three to
 * compare, tap a row for his page. `only`: a preset (the Waivers tab is this table, free agents
 * only, sorted by what they're expected to score).
 */

import { useMemo, useState } from 'react';
import { Search } from '@/components/icons';
import { cn } from '@/lib/utils';
import { expected, nextMatchup, STARTER_RANK, type Player, type Pos, type Profile } from '@/lib/edge/metrics';
import { Face, InjuryTag, MatchupChip, OwnerTag, PosFilter, PosTag, Spark, Trend, card, inPos, n1, pct, useEdge } from './parts';

type SortKey = 'exp' | 'ppg' | 'last3' | 'trend' | 'floor' | 'ceiling' | 'starter' | 'snp' | 'usage' | 'rz' | 'vor' | 'matchup' | 'rostered' | 'started' | 'adds' | 'total';
type Who = 'all' | 'fa' | 'mine' | number;

interface Col { key: SortKey; label: string; title: string; wide?: boolean; field?: boolean }
const COLS: Col[] = [
  { key: 'matchup', label: 'Next', title: 'This week\'s opponent, graded by what it gives up to his position (A is the softest)' },
  { key: 'exp', label: 'Proj', title: 'Projected points this week, in your league\'s scoring' },
  { key: 'ppg', label: 'PPG', title: 'Points a game, in your league\'s scoring' },
  { key: 'last3', label: 'L3', title: 'Points a game over his last three, and the change from his season' },
  { key: 'floor', label: 'Floor', title: 'His 20th percentile game: a bad day', wide: true },
  { key: 'ceiling', label: 'Ceil', title: 'His 80th percentile game: a good day', wide: true },
  { key: 'starter', label: 'Start wks', title: 'Weeks he finished a starter at his position (top 12 QB/TE, top 24 RB/WR)', wide: true },
  { key: 'snp', label: 'Snap', title: 'Share of his team\'s offensive snaps, last three games', wide: true },
  { key: 'usage', label: 'Usage', title: 'Share of his team\'s targets (receivers, tight ends) or carries (backs), last three games', wide: true },
  { key: 'rz', label: 'RZ', title: 'Red-zone looks a game: targets and carries inside the 20', wide: true },
  { key: 'vor', label: 'VOR', title: 'Points a game over a replacement-level player at his position in a league this size' },
  { key: 'rostered', label: 'Rost', title: 'Share of leagues like yours that roster him', field: true, wide: true },
  { key: 'started', label: 'Start', title: 'Share of leagues like yours that started him last week', field: true },
];

const usage = (p: Player, pr: Profile) => (p.pos === 'RB' ? pr.carSh3 : p.pos === 'QB' || p.pos === 'K' || p.pos === 'DEF' ? null : pr.tgtSh3);

export default function PlayersTab({ only }: { only?: 'fa' }) {
  const { r, prof, repl, team, mine, open, compare, toggleCompare } = useEdge();
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<Pos | 'ALL' | 'FLEX'>('ALL');
  const [who, setWho] = useState<Who>(only ?? 'all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: only ? 'exp' : 'ppg', dir: -1 });
  const [shown, setShown] = useState(60);
  const hasField = Boolean(r.field);

  const value = (p: Player, k: SortKey): number | null => {
    const pr = prof.get(p.id)!;
    switch (k) {
      case 'exp': return expected(p);
      case 'ppg': return pr.gp ? pr.ppg : null;
      case 'last3': return pr.gp ? pr.last3 : null;
      case 'trend': return pr.gp ? pr.trend : null;
      case 'floor': return pr.gp ? pr.floor : null;
      case 'ceiling': return pr.gp ? pr.ceiling : null;
      case 'starter': return pr.gp ? pr.starterWeeks : null;
      case 'snp': return pr.snp3;
      case 'usage': return usage(p, pr);
      case 'rz': return pr.gp ? pr.rz : null;
      case 'vor': return pr.gp >= 2 ? pr.ppg - repl[p.pos] : null;
      // Softer matchups first when sorted "high": a low rank is a soft defense.
      case 'matchup': { const m = nextMatchup(r, p); return m?.allowed ? -m.allowed.rank : null; }
      case 'rostered': return p.mkt?.rostered ?? null;
      case 'started': return p.mkt?.started ?? null;
      case 'adds': return p.mkt?.adds ?? null;
      case 'total': return pr.total;
    }
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = r.players.filter(p =>
      inPos(p, pos) &&
      (who === 'all' || (who === 'fa' ? p.owner === null : who === 'mine' ? p.owner === mine : p.owner === who)) &&
      (!needle || p.name.toLowerCase().includes(needle) || p.team.toLowerCase() === needle));
    return list.map(p => ({ p, v: value(p, sort.key) })).sort((a, b) => {
      if (a.v === null && b.v === null) return 0;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      return (a.v - b.v) * sort.dir;
    }).map(x => x.p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, q, pos, who, sort, mine, prof, repl]);

  const cols = COLS.filter(c => hasField || !c.field);
  const th = (c: Col) => (
    <th key={c.key} title={c.title} aria-sort={sort.key === c.key ? (sort.dir === -1 ? 'descending' : 'ascending') : undefined}
      className={cn('whitespace-nowrap px-2 py-2 text-right', c.wide && 'hidden lg:table-cell')}>
      <button type="button" onClick={() => setSort(s => ({ key: c.key, dir: s.key === c.key ? (s.dir === -1 ? 1 : -1) : -1 }))}
        className={cn('text-[10.5px] font-bold uppercase tracking-[0.1em] hover:text-foreground', sort.key === c.key ? 'text-foreground' : 'text-muted-foreground')}>
        {c.label}{sort.key === c.key && <span aria-hidden>{sort.dir === -1 ? ' ↓' : ' ↑'}</span>}
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => { setQ(e.target.value); setShown(60); }} placeholder="Search a player or a team (KC)" aria-label="Search players"
            className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-[13.5px] outline-none placeholder:text-muted-foreground focus:border-primary" />
        </label>
        <PosFilter value={pos} onChange={v => { setPos(v); setShown(60); }} />
        {!only && (
          <select value={String(who)} onChange={e => { const v = e.target.value; setWho(v === 'all' || v === 'fa' || v === 'mine' ? v : Number(v)); setShown(60); }} aria-label="Whose players"
            className="h-9 rounded-lg border border-border bg-card px-2 text-[13px] font-semibold text-foreground outline-none focus:border-primary">
            <option value="all">Everyone</option>
            <option value="fa">Free agents</option>
            {mine !== null && <option value="mine">My team</option>}
            {r.teams.map(t => <option key={t.rosterId} value={t.rosterId}>{t.name}</option>)}
          </select>
        )}
        <span className="ml-auto text-[12px] text-muted-foreground">{rows.length} players, {r.scoring}, through week {r.through}</span>
      </div>

      <div className={cn(card, 'overflow-x-auto')}>
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Player</th>
              {cols.map(th)}
              <th className="hidden px-2 py-2 text-right text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground sm:table-cell" title="His games, week by week: a starter's finish in colour, a bust in red">Games</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map(p => {
              const pr = prof.get(p.id)!;
              const picked = compare.includes(p.id);
              const vor = pr.gp >= 2 ? pr.ppg - repl[p.pos] : null;
              const u = usage(p, pr);
              const cell = (c: Col): React.ReactNode => {
                switch (c.key) {
                  case 'matchup': return <MatchupChip p={p} />;
                  case 'exp': { const e = expected(p); return e === null ? '' : <span className={cn(p.proj === null && 'text-muted-foreground')} title={p.proj === null ? 'No projection this week: his recent average' : undefined}>{n1(e)}</span>; }
                  case 'ppg': return <b className="font-black">{pr.gp ? n1(pr.ppg) : ''}</b>;
                  case 'last3': return pr.gp ? <span className="inline-flex items-baseline gap-1">{n1(pr.last3)}<Trend v={pr.trend} /></span> : '';
                  case 'floor': return pr.gp ? n1(pr.floor) : '';
                  case 'ceiling': return pr.gp ? n1(pr.ceiling) : '';
                  case 'starter': return pr.gp ? <span title={`Top ${STARTER_RANK[p.pos]} at ${p.pos} in ${pr.starterWeeks} of ${pr.gp} games`}>{pr.starterWeeks}<span className="text-muted-foreground">/{pr.gp}</span></span> : '';
                  case 'snp': return pct(pr.snp3);
                  case 'usage': return u === null ? '' : <span className="inline-flex items-baseline gap-1">{pct(u)}{p.pos === 'RB' ? (pr.carSh !== null && <Trend v={(pr.carSh3! - pr.carSh) * 100} digits={0} />) : (pr.tgtSh !== null && <Trend v={(pr.tgtSh3! - pr.tgtSh) * 100} digits={0} />)}</span>;
                  case 'rz': return pr.gp && pr.rz ? n1(pr.rz) : '';
                  case 'vor': return vor === null ? '' : <span className={cn(vor >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>{vor > 0 ? '+' : ''}{n1(vor)}</span>;
                  case 'rostered': return p.mkt ? `${Math.round(p.mkt.rostered)}%` : '';
                  case 'started': return p.mkt ? `${Math.round(p.mkt.started)}%` : '';
                  default: return '';
                }
              };
              return (
                <tr key={p.id} onClick={() => open(p.id)} className={cn('group cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40', p.owner === mine && mine !== null && 'bg-primary/[0.04]')}>
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 group-hover:bg-muted/40">
                    <div className="flex items-center gap-2.5">
                      <input type="checkbox" checked={picked} disabled={!picked && compare.length >= 3} onClick={e => e.stopPropagation()} onChange={() => toggleCompare(p.id)}
                        aria-label={`Compare ${p.name}`} className="h-3.5 w-3.5 shrink-0 accent-[hsl(var(--primary))]" />
                      <Face p={p} size={32} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5"><span className="truncate font-bold text-foreground">{p.name}</span><InjuryTag inj={p.inj} /></p>
                        <p className="mt-0.5 flex items-center gap-1.5"><PosTag pos={p.pos} /><span className="text-[11px] text-muted-foreground">{p.team || 'FA'}</span><OwnerTag p={p} /></p>
                      </div>
                    </div>
                  </td>
                  {cols.map(c => <td key={c.key} className={cn('lp-num whitespace-nowrap px-2 py-2 text-right tabular-nums', c.wide && 'hidden lg:table-cell')}>{cell(c)}</td>)}
                  <td className="hidden px-2 py-2 sm:table-cell"><span className="flex justify-end"><Spark p={p} through={r.through} /></span></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={cols.length + 2} className="px-4 py-10 text-center text-[13.5px] text-muted-foreground">No players match that.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > shown && (
        <button type="button" onClick={() => setShown(s => s + 80)} className="mx-auto block rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-semibold text-foreground hover:bg-muted/50">
          Show more ({rows.length - shown} left)
        </button>
      )}
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Every number is from final NFL games, scored with this league&apos;s settings. {team.size} teams here, so replacement level is the best player a league this size leaves unstarted.
        {r.field && <> Rostered and started shares are from {r.field.leagues.toLocaleString('en-US')} leagues like yours ({r.field.label}), week {r.field.week}.</>}
      </p>
    </div>
  );
}
