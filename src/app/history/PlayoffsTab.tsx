'use client';

/**
 * The history page's playoffs: every season's bracket, as the league played
 * it (lib/playoffs). Pick a season; see its champion, its playoff format, the
 * bracket round by round with connectors from each game to the next, its
 * placement games and its consolation games; open any game for its weeks and
 * lineups.
 *
 * Accuracy rules the view keeps: a round's score is the total of its weeks
 * (two week rounds are decided on the sum); seeds only where the league's
 * own seeding is known; a season whose playoffs have not started shows its
 * format and, labelled, the standings as they are, never a bracket of games
 * that have not happened.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { ChevronDown, Trophy, X, Zap } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { MatchDetail, PlayoffMatch, PlayoffSeason, PlayoffTeam } from '@/lib/playoffs';

const EASE = [0.22, 1, 0.36, 1] as const;
const fmt = (n: number | null) => (n == null ? '-' : n.toFixed(2));
const weeksText = (w: number[]) => (w.length === 1 ? `Week ${w[0]}` : `Weeks ${w[0]} and ${w.at(-1)}`);
const ROUND_TYPE = ['One week a round', 'Two week championship', 'Two weeks a round'];
const placeName = (p: number) => (p === 1 ? 'Championship' : p === 3 ? 'Third place' : `${p}th place`);

export default function PlayoffsTab() {
  const [seasons, setSeasons] = useState<PlayoffSeason[] | null>(null);
  const [error, setError] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [open, setOpen] = useState<PlayoffMatch | null>(null);

  useEffect(() => {
    fetch('/api/history/playoffs').then(r => (r.ok ? r.json() : Promise.reject())).then(d => {
      setSeasons(d.seasons);
      // The latest season with a result to show, else the latest.
      setPick((d.seasons.find((s: PlayoffSeason) => s.status !== 'upcoming') ?? d.seasons[0])?.season ?? null);
    }).catch(() => setError('Could not load the playoffs.'));
  }, []);

  const season = seasons?.find(s => s.season === pick) ?? null;
  const teams = useMemo(() => new Map((season?.teams ?? []).map(t => [t.rosterId, t])), [season]);

  if (error) return <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">{error}</p>;
  if (!seasons) return <Skeleton />;
  if (!seasons.length) return <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No playoff settings found for this league.</p>;

  return (
    <div className="space-y-6">
      <SeasonRail seasons={seasons} value={pick} onChange={setPick} />
      <AnimatePresence mode="wait">
        {season && (
          <motion.div key={season.season} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }} className="space-y-6">
            <SeasonHeader season={season} teams={teams} />
            {season.status === 'upcoming'
              ? <Upcoming season={season} />
              : (
                <>
                  <Bracket season={season} teams={teams} onOpen={setOpen} />
                  <PlacementGames season={season} teams={teams} onOpen={setOpen} />
                  <Consolation season={season} teams={teams} onOpen={setOpen} />
                </>
              )}
          </motion.div>
        )}
      </AnimatePresence>
      <GameSheet season={season} match={open} teams={teams} onClose={() => setOpen(null)} />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-9 w-20 animate-pulse rounded-full bg-muted" />)}</div>
      <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      <div className="grid grid-cols-2 gap-6">{[0, 1].map(i => <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />)}</div>
    </div>
  );
}

// ── Seasons ──────────────────────────────────────────────────────────────────

function SeasonRail({ seasons, value, onChange }: { seasons: PlayoffSeason[]; value: string | null; onChange: (s: string) => void }) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {seasons.map(s => {
        const champ = s.teams.find(t => t.rosterId === s.podium.champion);
        const on = s.season === value;
        return (
          <button key={s.season} onClick={() => onChange(s.season)} aria-pressed={on}
            className={cn('relative inline-flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[13px] font-semibold transition-colors', on ? 'text-background' : 'text-muted-foreground hover:text-foreground')}>
            {on && <motion.span layoutId="po-season" className="absolute inset-0 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-muted">
              {champ ? <Avatar avatarId={champ.avatar} size={24} className="rounded-full" /> : <Trophy className="h-3 w-3 text-muted-foreground" />}
            </span>
            <span className="relative tabular-nums">{s.season}</span>
          </button>
        );
      })}
    </div>
  );
}

function SeasonHeader({ season: s, teams }: { season: PlayoffSeason; teams: Map<number, PlayoffTeam> }) {
  const champ = s.podium.champion != null ? teams.get(s.podium.champion) : null;
  const runner = s.podium.runnerUp != null ? teams.get(s.podium.runnerUp) : null;
  const third = s.podium.third != null ? teams.get(s.podium.third) : null;
  const final = s.winners.find(m => m.placement === 1) ?? s.winners.filter(m => m.round === s.settings.rounds)[0];
  const champSide = final && champ ? (final.t1.rosterId === champ.rosterId ? final.t1 : final.t2) : null;
  const runnerSide = final && champ ? (final.t1.rosterId === champ.rosterId ? final.t2 : final.t1) : null;
  const allWeeks = s.settings.roundWeeks.flat();
  const chips = [
    `${s.settings.teams} teams`,
    allWeeks.length ? `Weeks ${allWeeks[0]} to ${allWeeks.at(-1)}` : null,
    ROUND_TYPE[s.settings.roundType] ?? null,
    s.settings.byes ? `Top ${s.settings.byes} ${s.settings.byes === 1 ? 'seed gets a bye' : 'seeds get byes'}` : null,
  ].filter(Boolean) as string[];

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-amber-400/15 blur-3xl" />
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        {champ ? (
          <div className="flex items-center gap-4">
            <motion.div initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="relative">
              <Avatar avatarId={champ.avatar} size={64} className="rounded-2xl" />
              <span className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow"><Trophy className="h-3.5 w-3.5" /></span>
            </motion.div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">{s.season} champion</p>
              <Link href={`/team/${champ.userId}`} className="block truncate font-display text-2xl font-bold tracking-tight hover:underline">{champ.team}</Link>
              <p className="text-[13px] text-muted-foreground">
                {champ.manager}
                {champSide && runnerSide && runner && <>, beat {runner.team} {fmt(champSide.points)} to {fmt(runnerSide.points)}{final!.weeks.length > 1 ? ` over ${final!.weeks.length} weeks` : ''}</>}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{s.season} playoffs</p>
            <p className="font-display text-2xl font-bold tracking-tight">{s.status === 'upcoming' ? 'Still to come' : 'In progress'}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 sm:max-w-[45%] sm:justify-end">
          {chips.map(c => <span key={c} className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground">{c}</span>)}
        </div>
      </div>
      {(runner || third) && (
        <div className="relative flex flex-wrap gap-x-6 gap-y-1 border-t border-border/60 px-5 py-3 text-[13px] sm:px-6">
          {runner && <span><span className="text-muted-foreground">Runner up</span> <span className="font-semibold">{runner.team}</span></span>}
          {third && <span><span className="text-muted-foreground">Third</span> <span className="font-semibold">{third.team}</span></span>}
        </div>
      )}
    </section>
  );
}

function Upcoming({ season: s }: { season: PlayoffSeason }) {
  const picture = s.seedsShown ? s.teams.filter(t => t.seed != null && t.seed <= s.settings.teams).sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0)) : [];
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <p className="text-[15px] font-semibold">The {s.season} playoffs start in week {s.settings.startWeek}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {s.settings.teams} teams, {s.settings.rounds} rounds: {s.settings.roundWeeks.map((w, i) => `${s.roundLabels[i].toLowerCase()} ${weeksText(w).toLowerCase()}`).join(', ')}.
      </p>
      {picture.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">If the regular season ended today</p>
          <ol className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {picture.map((t, i) => (
              <motion.li key={t.rosterId} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, ease: EASE }}
                className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
                <span className="w-6 text-center text-[13px] font-bold tabular-nums text-muted-foreground">{t.seed}</span>
                <Avatar avatarId={t.avatar} size={28} className="rounded-lg" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{t.team}</span>
                <span className="text-[12.5px] tabular-nums text-muted-foreground">{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ''}</span>
              </motion.li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

// ── The bracket ──────────────────────────────────────────────────────────────

/** Where a side came from: the bracket's own link, or the earlier game its team won. */
function sourceOf(m: PlayoffMatch, side: 't1' | 't2', all: PlayoffMatch[]): number | null {
  const s = m[side];
  if (s.from) return s.from.result === 'w' ? s.from.match : null;
  if (s.rosterId == null) return null;
  return all.find(x => x.round === m.round - 1 && x.winner === s.rosterId)?.id ?? null;
}

function Bracket({ season: s, teams, onOpen }: { season: PlayoffSeason; teams: Map<number, PlayoffTeam>; onOpen: (m: PlayoffMatch) => void }) {
  // The main path: games that decide the title, not placement games.
  const main = useMemo(() => s.winners.filter(m => m.placement == null || m.placement === 1), [s]);
  const rounds = useMemo(() => Array.from({ length: s.settings.rounds }, (_, i) => main.filter(m => m.round === i + 1)), [s, main]);
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<number, HTMLDivElement>());
  const [paths, setPaths] = useState<string[]>([]);

  const measure = useCallback(() => {
    const root = box.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    const out: string[] = [];
    for (const m of main) for (const side of ['t1', 't2'] as const) {
      const src = sourceOf(m, side, main);
      const a = src != null ? cards.current.get(src) : null, b = cards.current.get(m.id);
      if (!a || !b) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const x1 = ra.right - base.left + root.scrollLeft, y1 = ra.top + ra.height / 2 - base.top;
      const x2 = rb.left - base.left + root.scrollLeft, y2 = rb.top + rb.height * (side === 't1' ? 0.32 : 0.68) - base.top;
      const mid = x1 + (x2 - x1) / 2;
      out.push(`M${x1},${y1} H${mid} V${y2} H${x2}`);
    }
    // Only when something moved: setting the same paths again would render forever.
    setPaths(prev => (prev.join('|') === out.join('|') ? prev : out));
  }, [main]);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <section>
      <div ref={box} className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <svg className="pointer-events-none absolute left-0 top-0 h-full overflow-visible" style={{ width: box.current?.scrollWidth ?? '100%' }} aria-hidden>
          {paths.map((d, i) => (
            <motion.path key={d} d={d} fill="none" className="stroke-border" strokeWidth={2} strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 0.3 + i * 0.08, ease: EASE }} />
          ))}
        </svg>
        <div className="relative grid min-w-max gap-10" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(240px, 300px))` }}>
          {rounds.map((games, i) => (
            <div key={i} className="flex flex-col">
              <div className="mb-3">
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">{s.roundLabels[i]}</p>
                <p className="text-[11.5px] text-muted-foreground">{weeksText(s.settings.roundWeeks[i] ?? [])}{(s.settings.roundWeeks[i]?.length ?? 1) > 1 ? ', combined score' : ''}</p>
              </div>
              <div className="flex flex-1 flex-col justify-around gap-6">
                {games.map((m, j) => (
                  <motion.div key={m.id} ref={el => { if (el) cards.current.set(m.id, el); else cards.current.delete(m.id); }}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 + j * 0.05, duration: 0.4, ease: EASE }}
                    onAnimationComplete={measure}>
                    <MatchCard m={m} teams={teams} onOpen={() => onOpen(m)} title={m.placement === 1} />
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MatchCard({ m, teams, onOpen, title }: { m: PlayoffMatch; teams: Map<number, PlayoffTeam>; onOpen: () => void; title?: boolean }) {
  const upset = isUpset(m, teams);
  return (
    <button onClick={onOpen} disabled={m.t1.rosterId == null && m.t2.rosterId == null}
      className={cn('group w-full overflow-hidden rounded-2xl border bg-card text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-16px_rgba(0,0,0,0.35)] disabled:pointer-events-none',
        title && m.winner != null ? 'border-amber-400/60' : 'border-border')}>
      {(['t1', 't2'] as const).map(side => <SideRow key={side} m={m} side={side} teams={teams} />)}
      <div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{m.status === 'final' ? 'Final' : m.status === 'live' ? 'In progress' : 'To be played'}{m.weeks.length > 1 ? `, ${m.weeks.length} weeks` : ''}</span>
        <span className="flex items-center gap-2">
          {upset && <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400"><Zap className="h-3 w-3" />Upset</span>}
          <span className="opacity-0 transition group-hover:opacity-100">Details</span>
        </span>
      </div>
    </button>
  );
}

function SideRow({ m, side, teams }: { m: PlayoffMatch; side: 't1' | 't2'; teams: Map<number, PlayoffTeam> }) {
  const s = m[side];
  const t = s.rosterId != null ? teams.get(s.rosterId) : null;
  const won = m.winner != null && m.winner === s.rosterId;
  const lost = m.winner != null && m.winner !== s.rosterId;
  if (!t) {
    return (
      <div className="flex h-11 items-center px-3 text-[12.5px] italic text-muted-foreground">
        {s.from ? `${s.from.result === 'w' ? 'Winner' : 'Loser'} of game ${s.from.match}` : 'To be decided'}
      </div>
    );
  }
  return (
    <div className={cn('flex h-11 items-center gap-2.5 px-3', won && 'bg-primary/[0.06]')}>
      {t.seed != null && <span className="w-4 text-center text-[11px] font-bold tabular-nums text-muted-foreground">{t.seed}</span>}
      <Avatar avatarId={t.avatar} size={22} className="rounded-md" />
      <span className={cn('min-w-0 flex-1 truncate text-[13.5px]', won ? 'font-bold' : lost ? 'text-muted-foreground' : 'font-medium')}>{t.team}</span>
      {won && m.placement === 1 && <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
      <span className={cn('text-[13.5px] tabular-nums', won ? 'font-bold' : 'text-muted-foreground')}>{fmt(s.points)}</span>
    </div>
  );
}

function isUpset(m: PlayoffMatch, teams: Map<number, PlayoffTeam>): boolean {
  if (m.winner == null || m.loser == null) return false;
  const w = teams.get(m.winner)?.seed, l = teams.get(m.loser)?.seed;
  return w != null && l != null && w > l;
}

function PlacementGames({ season: s, teams, onOpen }: { season: PlayoffSeason; teams: Map<number, PlayoffTeam>; onOpen: (m: PlayoffMatch) => void }) {
  const games = s.winners.filter(m => m.placement != null && m.placement > 1);
  if (!games.length) return null;
  return (
    <section>
      <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em]">Placement games</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {games.map(m => (
          <div key={m.id}>
            <p className="mb-1.5 text-[12px] text-muted-foreground">{placeName(m.placement!)}, {weeksText(m.weeks).toLowerCase()}</p>
            <MatchCard m={m} teams={teams} onOpen={() => onOpen(m)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Consolation({ season: s, teams, onOpen }: { season: PlayoffSeason; teams: Map<number, PlayoffTeam>; onOpen: (m: PlayoffMatch) => void }) {
  const [open, setOpen] = useState(false);
  const games = s.losers.filter(m => m.t1.rosterId != null || m.t2.rosterId != null);
  if (!games.length) return null;
  const rounds = [...new Set(games.map(g => g.round))].sort((a, b) => a - b);
  return (
    <section className="rounded-2xl border border-border bg-card">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span>
          <span className="block text-[14.5px] font-semibold">Consolation games</span>
          <span className="block text-[12.5px] text-muted-foreground">{games.length} game{games.length === 1 ? '' : 's'} for the teams outside the title race</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-muted-foreground"><ChevronDown className="h-4 w-4" /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
            <div className="space-y-4 border-t border-border px-5 py-4">
              {rounds.map(r => (
                <div key={r}>
                  <p className="mb-2 text-[12px] text-muted-foreground">Round {r}, {weeksText(games.find(g => g.round === r)!.weeks).toLowerCase()}</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {games.filter(g => g.round === r).map(m => <MatchCard key={m.id} m={m} teams={teams} onOpen={() => onOpen(m)} />)}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ── A game, in detail ────────────────────────────────────────────────────────

function Scoreline({ m, side: { side, team }, index }: { m: PlayoffMatch; side: { side: PlayoffMatch['t1']; team: PlayoffTeam | null }; index: number }) {
  const won = m.winner != null && m.winner === side.rosterId;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', index === 1 ? 'items-end text-right' : 'items-start')}>
      {team ? <Avatar avatarId={team.avatar} size={44} className="rounded-xl" /> : <span className="h-11 w-11 rounded-xl bg-muted" />}
      <p className={cn('max-w-full truncate text-[14px] font-semibold', !won && m.winner != null && 'text-muted-foreground')}>{team?.team ?? 'To be decided'}</p>
      {team && <p className="text-[11.5px] text-muted-foreground">{team.seed != null ? `Seed ${team.seed}, ` : ''}{team.wins}-{team.losses}{team.ties ? `-${team.ties}` : ''} in the regular season</p>}
      <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + index * 0.08 }}
        className={cn('font-display text-3xl font-bold tabular-nums tracking-tight', won ? 'text-foreground' : 'text-muted-foreground')}>{fmt(side.points)}</motion.p>
    </div>
  );
}

function GameSheet({ season, match: m, teams, onClose }: { season: PlayoffSeason | null; match: PlayoffMatch | null; teams: Map<number, PlayoffTeam>; onClose: () => void }) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setDetail(null); setFailed(false);
    if (!m || !season) return;
    setWeek(m.weeks[0] ?? null);
    const rosters = [m.t1.rosterId, m.t2.rosterId].filter((x): x is number => x != null);
    if (!rosters.length) return;
    fetch(`/api/history/playoffs/match?league=${encodeURIComponent(season.leagueId)}&weeks=${m.weeks.join(',')}&rosters=${rosters.join(',')}`)
      .then(r => (r.ok ? r.json() : Promise.reject())).then(setDetail).catch(() => setFailed(true));
  }, [m, season]);
  useEffect(() => {
    if (!m) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [m, onClose]);

  const label = m && season
    ? (m.bracket === 'losers' ? `Consolation, round ${m.round}` : m.placement && m.placement > 1 ? placeName(m.placement) : season.roundLabels[m.round - 1])
    : '';
  const sides = m ? (['t1', 't2'] as const).map(k => ({ side: m[k], team: m[k].rosterId != null ? teams.get(m[k].rosterId!) ?? null : null })) : [];
  const margin = m && m.t1.points != null && m.t2.points != null ? Math.abs(m.t1.points - m.t2.points) : null;

  return (
    <AnimatePresence>
      {m && season && (
        <motion.div key="sheet" className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={`${season.season} ${label}`}
            initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{season.season}, {weeksText(m.weeks).toLowerCase()}</p>
                <p className="font-display text-lg font-bold tracking-tight">{label}</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-y-auto p-5">
              {/* Scoreboard */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <Scoreline m={m} side={sides[0]} index={0} />
                <span className="text-[12px] font-semibold text-muted-foreground">vs</span>
                <Scoreline m={m} side={sides[1]} index={1} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[12px]">
                {margin != null && m.status === 'final' && <span className="rounded-full bg-muted px-2.5 py-1 font-medium">Decided by {margin.toFixed(2)}</span>}
                {m.weeks.length > 1 && <span className="rounded-full bg-muted px-2.5 py-1 font-medium">Combined over {m.weeks.length} weeks</span>}
                {isUpset(m, teams) && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-600 dark:text-rose-400"><Zap className="h-3 w-3" />Upset</span>}
              </div>

              {/* Week by week */}
              {m.weeks.length > 1 && (
                <div className="mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${m.weeks.length}, minmax(0, 1fr))` }}>
                  {m.weeks.map((w, wi) => (
                    <div key={w} className="rounded-xl bg-muted/40 px-3 py-2 text-center">
                      <p className="text-[11px] text-muted-foreground">Week {w}</p>
                      <p className="text-[13px] tabular-nums"><span className="font-semibold">{fmt(m.t1.weekly[wi]?.points ?? null)}</span> <span className="text-muted-foreground">to</span> <span className="font-semibold">{fmt(m.t2.weekly[wi]?.points ?? null)}</span></p>
                    </div>
                  ))}
                </div>
              )}

              {/* Lineups */}
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[13px] font-semibold">Lineups</p>
                  {m.weeks.length > 1 && (
                    <div className="inline-flex rounded-full border border-border p-0.5">
                      {m.weeks.map(w => (
                        <button key={w} onClick={() => setWeek(w)} aria-pressed={week === w}
                          className={cn('rounded-full px-3 py-1 text-[12px] font-semibold transition', week === w ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>Week {w}</button>
                      ))}
                    </div>
                  )}
                </div>
                {failed ? <p className="text-[13px] text-muted-foreground">Could not load the lineups.</p>
                  : !detail ? <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map(i => <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted" />)}</div>
                  : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {detail.sides.map(sd => {
                        const wk = sd.weeks.find(x => x.week === week) ?? sd.weeks[0];
                        const team = teams.get(sd.rosterId);
                        const top = Math.max(1, ...(wk?.starters ?? []).map(p => p.points));
                        return (
                          <div key={sd.rosterId} className="rounded-2xl border border-border bg-card p-3.5">
                            <p className="mb-2 flex items-baseline justify-between gap-2">
                              <span className="truncate text-[13px] font-semibold">{team?.team}</span>
                              <span className="text-[13px] font-bold tabular-nums">{fmt(wk?.points ?? null)}</span>
                            </p>
                            {wk && wk.starters.length ? (
                              <ul className="space-y-1.5">
                                {wk.starters.map((p, pi) => (
                                  <li key={`${p.name}${pi}`} className="grid grid-cols-[34px_1fr_44px] items-center gap-2 text-[12.5px]">
                                    <span className="text-[10.5px] font-bold text-muted-foreground">{p.position ?? ''}</span>
                                    <span className="relative min-w-0">
                                      <motion.span className="absolute inset-y-0 left-0 rounded bg-primary/10" initial={{ width: 0 }} animate={{ width: `${(p.points / top) * 100}%` }} transition={{ duration: 0.5, delay: pi * 0.03, ease: EASE }} />
                                      <span className="relative block truncate px-1.5 py-0.5">{p.name}</span>
                                    </span>
                                    <span className="text-right font-semibold tabular-nums">{p.points.toFixed(1)}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="text-[12.5px] text-muted-foreground">No player scores were kept for this week.</p>}
                            {wk?.bench != null && <p className="mt-2.5 border-t border-border/60 pt-2 text-[11.5px] text-muted-foreground">{wk.bench.toFixed(1)} points on the bench</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
