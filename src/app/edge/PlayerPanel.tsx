'use client';

/**
 * The Edge, a player's page (a drawer over the hub) and the compare sheet.
 *
 *   The page      his season in this league's scoring: the headline numbers, every game as a bar
 *                 (coloured by where he finished at his position that week; hover for the line),
 *                 his usage week by week, the schedule ahead graded by what each defense gives
 *                 up to his position, and, where the site has a market, how leagues like this
 *                 one value him.
 *   Compare       up to three players side by side: the same numbers in columns, the best in
 *                 each row marked, and their weeks on one chart.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from '@/components/icons';
import { lockScroll } from '@/lib/scrollLock';
import { cn } from '@/lib/utils';
import { expected, grade, nextMatchup, ordinal, STARTER_RANK, type Game, type Player } from '@/lib/edge/metrics';
import { Face, InjuryTag, MatchupChip, OwnerTag, PosTag, Tile, Trend, label, n1, pct, tierClass, useEdge } from './parts';

const ease = [0.22, 1, 0.36, 1] as const;

export function statLine(p: Pick<Player, 'pos'>, g: Game): string {
  const parts: string[] = [];
  if (p.pos === 'DEF' || p.pos === 'K') return '';
  if (g.passAtt) parts.push(`${g.passYd} pass yd, ${g.passTd} TD${g.int ? `, ${g.int} INT` : ''}`);
  if (g.car) parts.push(`${g.car} carries, ${g.rushYd} yd`);
  if (g.tgt) parts.push(`${g.rec} of ${g.tgt} targets, ${g.recYd} yd`);
  if (g.td && !g.passAtt) parts.push(`${g.td} TD`);
  else if (g.td && g.passAtt && g.td > (g.passTd ?? 0)) parts.push(`${g.td - (g.passTd ?? 0)} rush TD`);
  return parts.join('; ');
}

/** Every game as a bar; the week under it, who he played under that. */
function GameLog({ p }: { p: Player }) {
  const { r } = useEdge();
  const [hot, setHot] = useState<number | null>(null);
  const by = new Map(p.games.map(g => [g.w, g]));
  const top = Math.max(15, ...p.games.map(g => g.pts));
  const avg = p.games.length ? p.games.reduce((s, g) => s + g.pts, 0) / p.games.length : 0;
  const g = hot !== null ? by.get(hot) : p.games.at(-1);
  return (
    <div>
      <div className="relative flex h-36 items-end gap-1" onMouseLeave={() => setHot(null)}>
        {/* His average, as a line across. */}
        {p.games.length > 1 && <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/25" style={{ bottom: `${(avg / top) * 100}%` }}><span className="absolute -top-4 right-0 text-[10px] font-semibold text-muted-foreground">avg {n1(avg)}</span></span>}
        {Array.from({ length: r.through }, (_, i) => {
          const w = i + 1, x = by.get(w);
          return (
            <button key={w} type="button" onMouseEnter={() => setHot(w)} onFocus={() => setHot(w)} aria-label={x ? `Week ${w}: ${x.pts} points against ${x.opp}` : `Week ${w}: did not play`}
              className="group relative flex h-full flex-1 flex-col items-center justify-end focus:outline-none">
              {x && <span className={cn('lp-num mb-0.5 text-[9.5px] font-bold', hot === w ? 'text-foreground' : 'text-muted-foreground')}>{x.pts.toFixed(0)}</span>}
              {x
                ? <motion.span initial={{ height: 0 }} animate={{ height: `${Math.max(1.5, (Math.max(0, x.pts) / top) * 78)}%` }} transition={{ duration: 0.5, delay: i * 0.025, ease }}
                    className={cn('w-full max-w-[26px] rounded-t-[4px] transition-opacity', tierClass(p.pos, x), hot !== null && hot !== w && 'opacity-45')} />
                : <span className="mb-1 h-1 w-1 rounded-full bg-muted-foreground/40" />}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {Array.from({ length: r.through }, (_, i) => {
          const x = by.get(i + 1);
          return <span key={i} className="flex-1 text-center text-[9px] leading-tight text-muted-foreground"><span className="block font-bold">{i + 1}</span><span className="block truncate">{x?.opp ?? ''}</span></span>;
        })}
      </div>
      {g && (
        <p className="mt-2 min-h-[34px] rounded-lg bg-muted/50 px-3 py-2 text-[12px] text-foreground/85">
          <b>Week {g.w} vs {g.opp}:</b> {g.pts} points, {p.pos}{g.rk}{statLine(p, g) && <>. {statLine(p, g)}</>}{g.snp !== undefined && <>, {pct(g.snp)} of snaps</>}.
        </p>
      )}
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-primary" />Top {STARTER_RANK[p.pos]} week</span>
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-foreground/30" />Middling</span>
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-red-400/70" />Bust</span>
      </p>
    </div>
  );
}

/** Lines over the season's weeks, 0 to `top`, each labelled at its end. */
function Lines({ weeks, series, top = 1, fmt }: { weeks: number; series: { name: string; cls: string; dash?: boolean; pts: { w: number; v: number }[] }[]; top?: number; fmt: (v: number) => string }) {
  const W = 320, H = 110, padR = 4;
  const x = (w: number) => (weeks <= 1 ? W / 2 : ((w - 1) / (weeks - 1)) * (W - padR));
  const y = (v: number) => H - 6 - (Math.min(top, Math.max(0, v)) / top) * (H - 16);
  const live = series.filter(s => s.pts.length);
  if (!live.length) return null;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={live.map(s => s.name).join(', ')}>
        {[0, 0.5, 1].map(k => <line key={k} x1={0} x2={W} y1={y(top * k)} y2={y(top * k)} className="stroke-border" strokeWidth={1} />)}
        {live.map(s => (
          <g key={s.name} className={s.cls}>
            <polyline fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash ? '4 4' : undefined}
              points={s.pts.map(p => `${x(p.w)},${y(p.v)}`).join(' ')} />
            {s.pts.map(p => <circle key={p.w} cx={x(p.w)} cy={y(p.v)} r={2.5} fill="currentColor"><title>{`Week ${p.w}: ${fmt(p.v)} ${s.name.toLowerCase()}`}</title></circle>)}
          </g>
        ))}
      </svg>
      <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] font-semibold">
        {live.map(s => <span key={s.name} className={cn('inline-flex items-center gap-1.5', s.cls)}><i className="h-0.5 w-4 rounded bg-current" /><span className="text-foreground/80">{s.name} <span className="lp-num">{fmt(s.pts.at(-1)!.v)}</span></span></span>)}
      </p>
    </div>
  );
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="border-t border-border px-4 py-4 sm:px-5">
      <h3 className={label}>{title}</h3>
      {note && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function bidText(v: number | null): string {
  if (v === null) return '';
  return v === 0 ? '$0' : v >= 20 ? 'over 20% of budget' : `up to ${v}% of budget`;
}

export function PlayerPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { r, byId, prof, repl, compare, toggleCompare } = useEdge();
  const p = byId.get(id);
  useEffect(() => lockScroll(), []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  if (!p || typeof document === 'undefined') return null;
  const pr = prof.get(id)!;
  const vor = pr.gp >= 2 ? pr.ppg - repl[p.pos] : null;
  const exp = expected(p);
  const ahead = (r.schedule[p.team] ?? []).slice(0, 6);
  const skill = p.pos !== 'K' && p.pos !== 'DEF';
  const share = (k: 'snp' | 'tgtSh' | 'carSh' | 'airSh') => p.games.filter(g => typeof g[k] === 'number').map(g => ({ w: g.w, v: g[k] as number }));
  // Rank among his position by points a game, of those with enough games.
  const peers = r.players.filter(x => x.pos === p.pos && (prof.get(x.id)?.gp ?? 0) >= Math.max(2, Math.floor(r.through / 3)));
  const posRank = pr.gp ? peers.filter(x => prof.get(x.id)!.ppg > pr.ppg).length + 1 : null;
  const picked = compare.includes(id);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={p.name}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.3, ease }}
        className="relative flex h-full w-full max-w-[560px] flex-col overflow-y-auto border-l border-border bg-card shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-border bg-card/95 px-4 py-3.5 backdrop-blur sm:px-5">
          <Face p={p} size={56} />
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 font-display text-[20px] font-black leading-tight text-foreground"><span className="truncate">{p.name}</span><InjuryTag inj={p.inj} /></h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><PosTag pos={p.pos} /><span className="text-[12px] font-semibold text-muted-foreground">{p.team || 'Free agent'}{p.exp !== undefined && `, ${p.exp === 0 ? 'Rookie' : `Year ${p.exp + 1}`}`}</span><OwnerTag p={p} /></p>
          </div>
          <button type="button" onClick={() => toggleCompare(id)} disabled={!picked && compare.length >= 3}
            className={cn('shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition-colors disabled:opacity-40', picked ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/70')}>
            {picked ? 'Comparing' : 'Compare'}
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid grid-cols-2 gap-2 px-4 py-4 sm:grid-cols-4 sm:px-5">
          <Tile k="Points a game" v={pr.gp ? n1(pr.ppg) : '-'} sub={posRank ? `${p.pos}${posRank} of ${peers.length}` : 'No games yet'} />
          <Tile k="Last three" v={pr.gp ? n1(pr.last3) : '-'} sub={pr.gp >= 4 ? <><Trend v={pr.trend} /> on his season</> : `${pr.gp} game${pr.gp === 1 ? '' : 's'}`} />
          <Tile k="This week" v={exp !== null ? n1(exp) : '-'} sub={<span className="inline-flex items-center gap-1">{p.proj !== null ? 'projected' : 'recent form'} <MatchupChip p={p} /></span>} />
          <Tile k="Over replacement" v={vor === null ? '-' : `${vor > 0 ? '+' : ''}${n1(vor)}`} tone={vor !== null && vor > 0 ? 'text-emerald-600 dark:text-emerald-400' : undefined} sub="a game, in a league this size" />
          <Tile k="Floor to ceiling" v={pr.gp ? `${n1(pr.floor)} - ${n1(pr.ceiling)}` : '-'} sub="a bad day, a good day" />
          <Tile k={`Top ${STARTER_RANK[p.pos]} weeks`} v={pr.gp ? `${pr.starterWeeks} of ${pr.gp}` : '-'} sub={pr.bustWeeks ? `${pr.bustWeeks} bust${pr.bustWeeks === 1 ? '' : 's'}` : 'no busts'} />
          {skill && <Tile k="Snaps" v={pct(pr.snp3) || '-'} sub={pr.snp !== null && pr.snp3 !== null ? <><Trend v={(pr.snp3 - pr.snp) * 100} digits={0} /> pts, last three</> : undefined} />}
          {skill && <Tile k="Red-zone looks" v={pr.gp ? n1(pr.rz) : '-'} sub={`a game, ${n1(pr.rz3)} lately`} />}
        </div>

        <Section title="Game log" note={`Points in ${r.scoring} scoring. Hover or tap a bar for the line.`}><GameLog p={p} /></Section>

        {skill && p.games.length > 1 && (
          <Section title="Usage" note="His share of his team's work each week.">
            <Lines weeks={r.through} fmt={v => pct(v)} series={[
              { name: 'Snaps', cls: 'text-foreground/45', pts: share('snp') },
              ...(p.pos === 'RB' ? [{ name: 'Carries', cls: 'text-primary', pts: share('carSh') }] : []),
              ...(p.pos !== 'QB' ? [{ name: 'Targets', cls: p.pos === 'RB' ? 'text-sky-500' : 'text-primary', pts: share('tgtSh') }] : []),
              ...(p.pos === 'WR' || p.pos === 'TE' ? [{ name: 'Air yards', cls: 'text-amber-500', dash: true, pts: share('airSh') }] : []),
            ]} />
          </Section>
        )}

        {ahead.length > 0 && (
          <Section title="Schedule ahead" note={`Graded by what each defense has given up to ${p.pos === 'DEF' ? 'fantasy defenses' : `${p.pos}s`} a game. A is the softest.`}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ahead.map(g => {
                const m = nextMatchup(r, p, g.w);
                const gr = grade(m?.allowed?.rank);
                return (
                  <div key={g.w} className="rounded-xl bg-muted/50 p-2 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Wk {g.w}</p>
                    <p className="mt-0.5 text-[13px] font-black text-foreground">{g.opp ? `${g.home ? '' : '@'}${g.opp}` : 'BYE'}</p>
                    {m?.allowed ? <p className="mt-0.5 text-[10.5px] text-muted-foreground"><b className={cn(gr?.tone === 'good' || gr?.tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : gr?.tone === 'bad' || gr?.tone === 'poor' ? 'text-red-600 dark:text-red-400' : 'text-foreground')}>{gr?.letter}</b>, {m.allowed.ppg}/g, {ordinal(m.allowed.rank)}</p> : <p className="mt-0.5 text-[10.5px] text-muted-foreground">&nbsp;</p>}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {p.mkt && r.field && (
          <Section title="The field" note={`${r.field.leagues.toLocaleString('en-US')} leagues like yours (${r.field.label}), through week ${r.field.week}.`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile k="Rostered" v={`${Math.round(p.mkt.rostered)}%`} />
              <Tile k="Started" v={`${Math.round(p.mkt.started)}%`} sub={p.mkt.rostered > 0 ? `${Math.round((p.mkt.started / p.mkt.rostered) * 100)}% of his managers` : undefined} />
              <Tile k="Added / dropped" v={`${p.mkt.adds.toFixed(1)}% / ${p.mkt.drops.toFixed(1)}%`} sub="of leagues, that week" />
              <Tile k="Traded for" v={`${p.mkt.traded.toFixed(1)}%`} sub="of leagues, last three weeks" />
            </div>
            {p.mkt.bid50 !== null && <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-[12.5px] text-foreground/85">Winning waiver bids: half were <b>{bidText(p.mkt.bid50)}</b>, three in four <b>{bidText(p.mkt.bid75)}</b>.</p>}
            {p.mkt.trend.length > 1 && <div className="mt-3"><Lines weeks={r.field.week} top={100} fmt={v => `${Math.round(v)}%`} series={[
              { name: 'Rostered', cls: 'text-primary', pts: p.mkt.trend.map(t => ({ w: t.w, v: t.r })) },
              { name: 'Started', cls: 'text-foreground/45', dash: true, pts: p.mkt.trend.map(t => ({ w: t.w, v: t.s })) },
            ]} /></div>}
          </Section>
        )}

        {p.games.length > 0 && (
          <Section title="Every game">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-[12px]">
                <thead><tr className="text-left text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground"><th className="py-1 pr-2">Wk</th><th className="pr-2">Opp</th><th className="pr-2 text-right">Pts</th><th className="pr-2 text-right">Finish</th>{skill && <th className="pr-2 text-right">Snaps</th>}<th>Line</th></tr></thead>
                <tbody>
                  {[...p.games].reverse().map(g => (
                    <tr key={g.w} className="border-t border-border/60">
                      <td className="lp-num py-1.5 pr-2 font-bold">{g.w}</td><td className="pr-2">{g.opp}</td>
                      <td className="lp-num pr-2 text-right font-black">{g.pts.toFixed(1)}</td>
                      <td className={cn('lp-num pr-2 text-right font-semibold', g.rk <= STARTER_RANK[p.pos] ? 'text-primary' : 'text-muted-foreground')}>{p.pos}{g.rk}</td>
                      {skill && <td className="lp-num pr-2 text-right">{pct(g.snp)}</td>}
                      <td className="text-muted-foreground">{statLine(p, g)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}

// ── Compare ──────────────────────────────────────────────────────────────────

const TINTS = ['text-primary', 'text-amber-500', 'text-sky-500'];

export function CompareSheet({ onClose }: { onClose: () => void }) {
  const { r, byId, prof, repl, compare, toggleCompare, open } = useEdge();
  const ps = useMemo(() => compare.map(id => byId.get(id)).filter((x): x is Player => Boolean(x)), [compare, byId]);
  useEffect(() => lockScroll(), []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  if (typeof document === 'undefined' || !ps.length) return null;
  const top = Math.max(20, ...ps.flatMap(p => p.games.map(g => g.pts)));
  type Row = { k: string; v: (p: Player) => number | null; f: (x: number) => string; low?: boolean };
  const rows: Row[] = [
    { k: 'Projected this week', v: p => expected(p), f: n1 },
    { k: 'Points a game', v: p => (prof.get(p.id)!.gp ? prof.get(p.id)!.ppg : null), f: n1 },
    { k: 'Last three', v: p => (prof.get(p.id)!.gp ? prof.get(p.id)!.last3 : null), f: n1 },
    { k: 'Floor', v: p => (prof.get(p.id)!.gp ? prof.get(p.id)!.floor : null), f: n1 },
    { k: 'Ceiling', v: p => (prof.get(p.id)!.gp ? prof.get(p.id)!.ceiling : null), f: n1 },
    { k: 'Starter weeks', v: p => { const x = prof.get(p.id)!; return x.gp ? x.starterWeeks / x.gp : null; }, f: x => pct(x) },
    { k: 'Over replacement', v: p => { const x = prof.get(p.id)!; return x.gp >= 2 ? x.ppg - repl[p.pos] : null; }, f: x => `${x > 0 ? '+' : ''}${n1(x)}` },
    { k: 'Snaps, last three', v: p => prof.get(p.id)!.snp3, f: x => pct(x) },
    { k: 'Target share', v: p => prof.get(p.id)!.tgtSh3, f: x => pct(x) },
    { k: 'Carry share', v: p => prof.get(p.id)!.carSh3, f: x => pct(x) },
    { k: 'Red-zone looks a game', v: p => (prof.get(p.id)!.gp ? prof.get(p.id)!.rz : null), f: n1 },
    { k: 'Matchup rank this week', v: p => nextMatchup(r, p)?.allowed?.rank ?? null, f: x => ordinal(x), low: true },
    ...(r.field ? [{ k: 'Started by the field', v: (p: Player) => p.mkt?.started ?? null, f: (x: number) => `${Math.round(x)}%` }] : []),
  ];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Compare players">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-background/75 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3, ease }}
        className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
          <h2 className="font-display text-[18px] font-black">Compare</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </header>
        <div className="p-4">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${ps.length}, minmax(0, 1fr))` }}>
            {ps.map((p, i) => (
              <div key={p.id} className="relative rounded-xl bg-muted/50 p-3 text-center">
                <button type="button" onClick={() => toggleCompare(p.id)} aria-label={`Remove ${p.name}`} className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => { onClose(); open(p.id); }} className="mx-auto flex flex-col items-center gap-1.5">
                  <Face p={p} size={48} />
                  <span className={cn('line-clamp-2 text-[13.5px] font-black leading-tight', TINTS[i])}>{p.name}</span>
                </button>
                <p className="mt-1 flex items-center justify-center gap-1.5"><PosTag pos={p.pos} /><MatchupChip p={p} /></p>
                <p className="mt-1 flex justify-center"><OwnerTag p={p} /></p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <p className={label}>Week by week</p>
            <div className="mt-2">
              <Lines weeks={r.through} top={top} fmt={v => n1(v)} series={ps.map((p, i) => ({ name: p.name.split(' ').slice(-1)[0], cls: TINTS[i], pts: p.games.map(g => ({ w: g.w, v: g.pts })) }))} />
            </div>
          </div>

          <table className="mt-4 w-full text-[13px]">
            <tbody>
              {rows.map(row => {
                const vals = ps.map(row.v);
                const real = vals.filter((x): x is number => x !== null);
                if (!real.length) return null;
                const best = row.low ? Math.min(...real) : Math.max(...real);
                return (
                  <tr key={row.k} className="border-t border-border/60">
                    <th className="w-[34%] py-2 pr-2 text-left text-[11.5px] font-semibold text-muted-foreground">{row.k}</th>
                    {vals.map((v, i) => (
                      <td key={i} className={cn('lp-num py-2 text-center tabular-nums', v !== null && v === best && real.length > 1 ? 'font-black text-foreground' : 'text-foreground/70')}>
                        {v === null ? '-' : row.f(v)}{v !== null && v === best && real.length > 1 && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" aria-label="best" />}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
