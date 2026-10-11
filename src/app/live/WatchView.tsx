'use client';

/**
 * Game Day: which games to have on, where your players are, and every play
 * they make, refreshed every twenty seconds while games are on.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PageLayout } from '@/components/layout/PageLayout';
import Avatar from '@/components/ui/Avatar';
import { StatusPill, WinBar, SectionHeader } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { Radio, Target, Clock, Swords, ChevronDown, Activity } from '@/components/icons';
import { useNow } from '@/lib/useLiveFeed';
import type { WatchGuide, WatchGame, WatchPlayer } from '@/lib/live/watchGuide';
import type { FeedPlay } from '@/lib/live/playFeed';

const TEAM_KEY = 'lp_my_team_v1';

function readTeam(): string | null { try { return localStorage.getItem(TEAM_KEY); } catch { return null; } }
function writeTeam(id: string | null) {
  try {
    if (id) localStorage.setItem(TEAM_KEY, id);
    else localStorage.removeItem(TEAM_KEY);
  } catch { /* private mode: the choice just will not stick */ }
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
}

export default function WatchView() {
  const reduce = useReducedMotion();
  const [user, setUser] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<{ guide: WatchGuide | null; feed: FeedPlay[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [feedSide, setFeedSide] = useState<'all' | 'mine' | 'theirs'>('all');
  /** Phones only: the plays panel would otherwise sit below every game. */
  const [mobileTab, setMobileTab] = useState<'games' | 'plays'>('games');
  const seenPlays = useRef<Set<string> | null>(null);
  const [freshPlays, setFreshPlays] = useState<Set<string>>(new Set());
  const now = useNow(30_000);

  useEffect(() => { setUser(readTeam()); }, []);

  // Poll: every 20 seconds with games on, every 2 minutes otherwise, and not
  // at all in a hidden tab.
  useEffect(() => {
    if (user === undefined) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const d = await fetch(`/api/watch${user ? `?user=${user}` : ''}`, { cache: 'no-store' }).then(r => r.json());
        if (cancelled) return;
        if (d.error) throw new Error(d.error);
        const ids = new Set<string>((d.feed ?? []).map((p: FeedPlay) => p.id));
        if (seenPlays.current) setFreshPlays(new Set([...ids].filter(id => !seenPlays.current!.has(id))));
        seenPlays.current = ids;
        setData(d); setError(null);
        const live = (d.guide?.games ?? []).some((g: WatchGame) => g.state === 'in');
        if (document.visibilityState === 'visible') timer = setTimeout(load, live ? 20_000 : 120_000);
      } catch (e: any) {
        if (!cancelled) { setError(e.message ?? 'Could not load'); timer = setTimeout(load, 60_000); }
      }
    };
    load();
    const onVis = () => { if (document.visibilityState === 'visible') { if (timer) clearTimeout(timer); load(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [user]);

  const guide = data?.guide ?? null;
  const live = guide?.games.filter(g => g.state === 'in') ?? [];
  const upcoming = guide?.games.filter(g => g.state === 'pre') ?? [];
  const done = guide?.games.filter(g => g.state === 'post') ?? [];
  const nameOf = useMemo(() => {
    const m = new Map<string, WatchPlayer>();
    for (const g of guide?.games ?? []) for (const p of [...g.mine, ...g.theirs]) m.set(p.playerId, p);
    return m;
  }, [guide]);

  const choose = (id: string | null) => { writeTeam(id); setUser(id); setData(null); seenPlays.current = null; setPicking(false); };
  const showPicker = user === null || picking;

  return (
    <PageLayout
      title={<span className="inline-flex items-center gap-3">Game Day{live.length > 0 && <StatusPill status="live" label={`${live.length} live`} />}</span>}
      subtitle="Which games to have on, where your players are, and every play they make."
    >
      {/* ── Who are you? ─────────────────────────────────────────────────── */}
      {guide && showPicker && (
        <section className="lp-surface rounded-2xl p-4 sm:p-5">
          <SectionHeader icon={Target} title="Which team is yours?" />
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Games are ranked by how much they can swing your matchup. Saved on this device only.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {guide.teams.map(t => (
              <button key={t.userId} onClick={() => choose(t.userId)}
                className={cn('lp-lift flex items-center gap-2.5 rounded-xl border p-2.5 text-left',
                  user === t.userId ? 'border-primary bg-primary/10' : 'border-border bg-background/60')}>
                <Avatar avatarId={t.avatar} size={32} className="shrink-0 rounded-[10px]" />
                <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">{t.teamName}</span>
              </button>
            ))}
          </div>
          <button onClick={() => choose(null)} className="mt-3 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
            Just watching: rank games for the whole league
          </button>
        </section>
      )}

      {/* ── Your matchup ─────────────────────────────────────────────────── */}
      {guide?.me && guide.opponent && guide.winProb != null && !picking && (
        <section className="lp-surface lp-edge rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar avatarId={guide.me.avatar} size={40} className="shrink-0 rounded-xl" />
              <div className="min-w-0">
                <p className="line-clamp-2 font-display text-[13px] font-bold leading-tight text-foreground sm:text-[15px]">{guide.me.teamName}</p>
                <p className="text-[11px] text-muted-foreground">You</p>
              </div>
            </div>
            <div className="text-center">
              <p className="font-display text-[28px] font-bold leading-none tracking-[-0.03em] text-foreground">{pct(guide.winProb)}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">to win</p>
            </div>
            <div className="flex min-w-0 flex-row-reverse items-center gap-2.5 text-right">
              <Avatar avatarId={guide.opponent.avatar} size={40} className="shrink-0 rounded-xl" />
              <div className="min-w-0">
                <p className="line-clamp-2 font-display text-[13px] font-bold leading-tight text-foreground sm:text-[15px]">{guide.opponent.teamName}</p>
                <p className="text-[11px] text-muted-foreground">Opponent</p>
              </div>
            </div>
          </div>
          <WinBar p={guide.winProb} className="mt-3" />
          <div className="mt-2 flex justify-between">
            <span className="text-[11px] text-muted-foreground">Week {guide.week}</span>
            <button onClick={() => setPicking(true)} className="text-[11px] font-semibold text-primary">Not you?</button>
          </div>
        </section>
      )}

      {error && !data && <p className="text-[13px] text-red-500">{error}</p>}
      {!data && !error && (
        <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="lp-skeleton h-40 rounded-2xl" />)}</div>
      )}

      {guide?.me && (
        <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1 lg:hidden">
          {([['games', 'Games'], ['plays', `Plays${data?.feed.length ? ` (${data.feed.length})` : ''}`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setMobileTab(id)}
              className={cn('flex-1 rounded-lg py-1.5 text-[13px] font-semibold',
                mobileTab === id ? 'bg-card text-foreground shadow-[var(--elev-1)]' : 'text-muted-foreground')}>
              {label}
            </button>
          ))}
        </div>
      )}

      {guide && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className={cn('min-w-0 space-y-6', guide.me && mobileTab === 'plays' && 'hidden lg:block')}>
            {live.length > 0 && (
              <GameGroup title="On now" icon={Radio} games={live} mine={!!guide.me} reduce={!!reduce} />
            )}
            {upcoming.length > 0 && <Upcoming games={upcoming} mine={!!guide.me} reduce={!!reduce} />}
            {done.length > 0 && <Finished games={done} mine={!!guide.me} />}
            {!guide.games.length && (
              <p className="rounded-2xl border border-dashed border-border p-10 text-center text-[13px] text-muted-foreground">
                No NFL games this week.
              </p>
            )}
          </div>

          {/* ── Plays ────────────────────────────────────────────────────── */}
          {guide.me && (
            <aside className={cn('lg:sticky lg:top-24 lg:self-start', mobileTab === 'games' && 'hidden lg:block')}>
              <section className="lp-surface rounded-2xl p-4">
                <SectionHeader icon={Activity} title="Your plays" meta={data?.feed.length ? `${data.feed.length}` : undefined} />
                <div className="mt-3 flex gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
                  {([['all', 'Both'], ['mine', 'Yours'], ['theirs', 'Theirs']] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setFeedSide(id)}
                      className={cn('flex-1 rounded-md py-1 text-[12px] font-semibold',
                        feedSide === id ? 'bg-card text-foreground shadow-[var(--elev-1)]' : 'text-muted-foreground')}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 max-h-[70vh] space-y-1.5 overflow-y-auto pr-1">
                  {(data?.feed ?? []).filter(p => feedSide === 'all' || p.side === feedSide).length === 0 ? (
                    <p className="py-10 text-center text-[12.5px] text-muted-foreground">
                      {live.length ? 'No plays from your matchup yet.' : 'Plays appear here as your players make them.'}
                    </p>
                  ) : (
                    <AnimatePresence initial={false}>
                      {(data?.feed ?? []).filter(p => feedSide === 'all' || p.side === feedSide).map(p => (
                        <motion.div key={p.id} layout={!reduce}
                          initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                          className={cn('rounded-xl border p-2.5',
                            p.scoring ? 'border-primary/40 bg-primary/[0.06]' : 'border-border/70',
                            freshPlays.has(p.id) && 'lp-arrive')}>
                          <div className="flex items-center gap-2">
                            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', p.side === 'mine' ? 'bg-primary' : 'bg-foreground/40')} />
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">
                              {nameOf.get(p.playerId)?.name ?? 'Player'}
                              <span className="ml-1.5 font-normal text-muted-foreground">{p.side === 'mine' ? 'yours' : 'theirs'}</span>
                            </span>
                            {p.scoring && <span className="rounded bg-primary px-1.5 py-px text-[9.5px] font-bold uppercase text-primary-foreground">TD</span>}
                            {p.points != null && p.points !== 0 && (
                              <span title="Estimated from the play. Sleeper's total is official."
                                className={cn('shrink-0 text-[12px] font-bold tabular-nums',
                                  p.points > 0 ? (p.side === 'mine' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground') : 'text-red-500')}>
                                ≈{p.points > 0 ? '+' : ''}{p.points.toFixed(1)}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{p.text}</p>
                          <p className="mt-1 text-[10.5px] text-muted-foreground/70">
                            {p.matchup} · Q{p.period} {p.clock}
                            {p.at && <> · {agoShort(new Date(p.at).getTime(), now)}</>}
                          </p>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
                <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground/80">
                  ≈ points are estimated from each play with this league&apos;s scoring. Sleeper&apos;s totals are official.
                </p>
              </section>
            </aside>
          )}
        </div>
      )}
    </PageLayout>
  );
}

function agoShort(at: number, now: number): string {
  const m = Math.round((now - at) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function GameGroup({ title, icon, games, mine, reduce }: {
  title: string; icon: typeof Radio; games: WatchGame[]; mine: boolean; reduce: boolean;
}) {
  const max = Math.max(0.0001, ...games.map(g => (mine ? g.leverage : g.leagueLeverage)));
  return (
    <section>
      <SectionHeader icon={icon} title={title} meta={`${games.length}`} />
      <div className="mt-3 space-y-3">
        {games.map((g, i) => (
          <motion.div key={g.id} layout={!reduce}
            initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.04 }}>
            <GameCard g={g} mine={mine} relative={(mine ? g.leverage : g.leagueLeverage) / max} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/**
 * Games still to come, by kickoff window, the biggest stakes first within
 * each. "What do I watch at 1pm" is a question about one window at a time;
 * one list in stake order put a Monday night game above the morning ones.
 */
function Upcoming({ games, mine, reduce }: { games: WatchGame[]; mine: boolean; reduce: boolean }) {
  const slots = new Map<string, WatchGame[]>();
  for (const g of [...games].sort((a, b) => a.kickoff.localeCompare(b.kickoff))) {
    slots.set(g.kickoff, [...(slots.get(g.kickoff) ?? []), g]);
  }
  const stake = (g: WatchGame) => (mine ? g.leverage : g.leagueLeverage);
  const max = Math.max(0.0001, ...games.map(stake));
  return (
    <section>
      <SectionHeader icon={Clock} title="Up next" meta={`${games.length}`} />
      <div className="mt-3 space-y-5">
        {[...slots.entries()].map(([kickoff, list]) => (
          <div key={kickoff}>
            <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {kickoffLabel(kickoff)}
              <span className="h-px flex-1 bg-border" />
            </p>
            <div className="space-y-3">
              {list.sort((a, b) => stake(b) - stake(a)).map((g, i) => (
                <motion.div key={g.id} layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.04 }}>
                  <GameCard g={g} mine={mine} relative={stake(g) / max} />
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GameCard({ g, mine, relative }: { g: WatchGame; mine: boolean; relative: number }) {
  const live = g.state === 'in';
  const stake = mine ? g.leverage : g.leagueLeverage;
  const nothing = mine ? g.leverage < 0.005 : g.leagueStarters === 0;
  return (
    <article className={cn('lp-surface overflow-hidden rounded-2xl', g.hot && 'ring-2 ring-red-500/60', nothing && 'opacity-75')}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3 font-display text-[17px] font-bold text-foreground">
              <TeamScore abbr={g.away.abbr} score={g.away.score} show={g.state !== 'pre'} ball={g.possession === g.away.abbr} />
              <span className="text-[11px] font-semibold text-muted-foreground">@</span>
              <TeamScore abbr={g.home.abbr} score={g.home.score} show={g.state !== 'pre'} ball={g.possession === g.home.abbr} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-foreground">
              <span className={cn(live && 'font-semibold text-red-500')}>{live ? g.detail : g.state === 'pre' ? kickoffLabel(g.kickoff) : 'Final'}</span>
              {g.broadcast && <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-px font-semibold text-foreground/80"><Radio className="h-3 w-3" />{g.broadcast}</span>}
              {g.hot && <span className="font-bold text-red-500">Your guys in the red zone</span>}
            </p>
          </div>
          {/* What is riding on it */}
          <div className="w-28 shrink-0 text-right sm:w-36">
            <p className={cn('font-display text-[20px] font-bold leading-none tabular-nums', nothing ? 'text-muted-foreground' : 'text-foreground')}>
              {/* The gap between a good game and a bad one for your players,
                  shown as plus or minus half of it either side of where you
                  stand now. "55% of your win chance" summed past 100% across
                  games and read as a share, which it is not. */}
              {mine ? (nothing ? '--' : `±${Math.round(stake * 50)}%`) : g.leagueStarters}
            </p>
            <p className="mt-1 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {mine ? (nothing ? 'nothing at stake' : 'swing to your odds') : 'league starters'}
            </p>
            {!nothing && (
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(6, relative * 100)}%` }} />
              </div>
            )}
          </div>
        </div>

        {live && <FieldStrip g={g} />}

        {(g.mine.length > 0 || g.theirs.length > 0) && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {g.mine.length > 0 && <PlayerList label="Yours" players={g.mine} tone="mine" />}
            {g.theirs.length > 0 && <PlayerList label="Theirs" players={g.theirs} tone="theirs" />}
          </div>
        )}
      </div>
    </article>
  );
}

function TeamScore({ abbr, score, show, ball }: { abbr: string; score: number; show: boolean; ball: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {abbr}
      {show && <span className="tabular-nums">{score}</span>}
      {ball && <span className="h-1.5 w-2.5 rounded-full bg-amber-700/80 dark:bg-amber-500/80" aria-label="has the ball" title="Has the ball" />}
    </span>
  );
}

/**
 * Where the ball is, as a field.
 *
 * Drawn from the side of the team with the ball, driving left to right, so
 * "how close to scoring" reads the same way in every game. The right hand
 * twenty yards are the red zone.
 */
function FieldStrip({ g }: { g: WatchGame }) {
  const reduce = useReducedMotion();
  if (g.yardsToEndzone == null || !g.possession) {
    return g.detail ? <p className="mt-3 text-[12px] text-muted-foreground">{g.lastPlay ?? g.detail}</p> : null;
  }
  const at = Math.max(0, Math.min(100, 100 - g.yardsToEndzone));
  const defending = g.possession === g.home.abbr ? g.away.abbr : g.home.abbr;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[10.5px] font-semibold text-muted-foreground">
        <span>{g.possession} ball</span>
        <span className={cn(g.redZone && 'font-bold text-red-500')}>{g.downDistance}</span>
      </div>
      <div className="relative mt-1.5 h-7 overflow-hidden rounded-md bg-emerald-700/[0.14] ring-1 ring-inset ring-emerald-700/20 dark:bg-emerald-500/[0.12]">
        {/* End zones and the red zone */}
        <div className="absolute inset-y-0 left-0 w-[6%] bg-foreground/[0.06]" />
        <div className="absolute inset-y-0 right-0 flex w-[6%] items-center justify-center bg-primary/25 text-[8px] font-bold uppercase tracking-wider text-foreground/60 [writing-mode:vertical-rl]">{defending}</div>
        <div className={cn('absolute inset-y-0 right-[6%] w-[17.6%]', g.redZone ? 'bg-red-500/15' : 'bg-red-500/[0.05]')} />
        {/* Yard lines every ten */}
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="absolute inset-y-0 w-px bg-foreground/10" style={{ left: `${6 + (i + 1) * 8.8}%` }} />
        ))}
        <motion.div
          className="absolute top-1/2 h-3.5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-amber-800 shadow ring-2 ring-background dark:bg-amber-600"
          initial={false}
          animate={{ left: `${6 + at * 0.88}%` }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      {g.lastPlay && <p className="mt-1.5 line-clamp-2 text-[11.5px] text-muted-foreground">{g.lastPlay}</p>}
    </div>
  );
}

function PlayerList({ label, players, tone }: { label: string; players: WatchPlayer[]; tone: 'mine' | 'theirs' }) {
  return (
    <div className={cn('rounded-xl border p-2.5', tone === 'mine' ? 'border-primary/25 bg-primary/[0.04]' : 'border-border bg-background/40')}>
      <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <ul className="mt-1.5 space-y-1">
        {players.map(p => (
          <li key={p.playerId} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-7 shrink-0 text-[10px] font-bold text-muted-foreground">{p.position}</span>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{p.name}</span>
            {p.onOffense && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-red-500" title="His team has the ball">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                </span>
                ball
              </span>
            )}
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {p.phase === 'upcoming' || p.points == null
                ? <>{p.projected != null ? p.projected.toFixed(1) : '--'}<span className="ml-0.5 text-[9.5px]">proj</span></>
                : <span className="font-semibold text-foreground">{p.points.toFixed(1)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Finished({ games, mine }: { games: WatchGame[]; mine: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between">
        <SectionHeader icon={Swords} title="Final" meta={`${games.length}`} />
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {games.map(g => <GameCard key={g.id} g={g} mine={mine} relative={0} />)}
        </div>
      )}
    </section>
  );
}
