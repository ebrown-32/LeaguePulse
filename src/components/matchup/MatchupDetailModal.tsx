'use client';

/**
 * Matchup drilldown.
 *
 * A full height sheet on a phone, a centred panel on a desktop. It opens
 * instantly with what the card already knew, then fills in: the forecast first,
 * because that is the tab it opens on, and the slower history and rosters only
 * when those tabs are asked for.
 *
 * ── Why it felt slow ──────────────────────────────────────────────────────────
 *
 * One request fetched everything before anything rendered, including every
 * season's head to head history, so the default tab waited on data it never
 * showed. On a cold server it also refit the forecast calibration from scratch.
 * The request is now split, the calibration is stored, responses are cached
 * here for the session, and a card starts fetching the moment it is touched.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { CloseIcon } from '@/components/icons/MediaIcons';
import { cn } from '@/lib/utils';
import type { PlayerCard } from '@/lib/playerStats';
import MatchupForecastView from './MatchupForecastView';
import type { StarterLine, MatchupForecast } from '@/lib/sim/matchupOdds';
import type { WeekPhase } from '@/lib/nflSchedule';

interface Side {
  userId: string;
  teamName: string;
  manager: string;
  avatar: string;
  starters: PlayerCard[];
  bench: PlayerCard[];
}

interface Live {
  season: string;
  week: number;
  phase: WeekPhase;
  forecast: MatchupForecast;
  lines: [StarterLine[], StarterLine[]];
}

interface Extras {
  statsSeason: string;
  sides: [Side, Side];
  h2h: {
    aWins: number; bWins: number; meetings: number; aPoints: number; bPoints: number;
    games: { season: string; week: number; score: number; opponentScore: number; isPlayoff: boolean }[];
    rivalryScore: number;
    rivalryLabel: string;
  };
}

export interface MatchupTarget {
  a: { userId: string; teamName: string; avatar: string };
  b: { userId: string; teamName: string; avatar: string };
  /** The week being viewed, so the forecast matches the card you clicked. */
  week?: number;
}

type Tab = 'forecast' | 'history' | 'rosters';

// ── Session cache and prefetch ───────────────────────────────────────────────

const cache = new Map<string, Promise<any>>();
const keyOf = (t: MatchupTarget, part: 'forecast' | 'extras') =>
  `${t.a.userId}|${t.b.userId}|${t.week ?? ''}|${part}`;

function load(t: MatchupTarget, part: 'forecast' | 'extras'): Promise<any> {
  const k = keyOf(t, part);
  const hit = cache.get(k);
  if (hit) return hit;
  const wk = t.week ? `&week=${t.week}` : '';
  const p = fetch(`/api/matchup?a=${t.a.userId}&b=${t.b.userId}${wk}&part=${part}`)
    .then(r => r.json())
    .then(d => { if (d?.error) throw new Error(d.error); return d; })
    // A failed fetch must not be cached, or a retry would replay the failure.
    .catch(e => { cache.delete(k); throw e; });
  cache.set(k, p);
  // Forecasts move while games are live; let them refresh after a minute.
  if (part === 'forecast') setTimeout(() => cache.delete(k), 60_000);
  return p;
}

/**
 * Start loading before the tap lands. Called on hover and touch start, which
 * arrive a noticeable fraction of a second before the click on a phone.
 */
export function prefetchMatchup(t: MatchupTarget) {
  load(t, 'forecast').catch(() => {});
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MatchupDetailModal({
  target, onClose,
}: { target: MatchupTarget | null; onClose: () => void }) {
  const reduce = useReducedMotion();
  const [live, setLive] = useState<Live | null | undefined>(undefined);   // undefined = loading
  const [extras, setExtras] = useState<Extras | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('forecast');

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLive(undefined); setExtras(undefined); setTab('forecast');

    load(target, 'forecast')
      .then(d => { if (!cancelled) setLive(d.live ?? null); })
      .catch(() => { if (!cancelled) setLive(null); });
    // History and rosters start right behind, so switching tabs rarely waits,
    // but nothing on the first screen depends on them.
    load(target, 'extras')
      .then(d => { if (!cancelled) setExtras(d); })
      .catch(() => { if (!cancelled) setExtras(null); });

    return () => { cancelled = true; };
  }, [target]);

  // With no live fixture, history is the useful default.
  useEffect(() => { if (live === null) setTab('history'); }, [live]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [target, onClose]);

  // Swipe the sheet down to dismiss it, as a native sheet would.
  const onDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose();
  }, [onClose]);

  const tabs: { id: Tab; label: string }[] = [
    ...(live !== null ? [{ id: 'forecast' as Tab, label: 'Forecast' }] : []),
    { id: 'history', label: 'History' },
    { id: 'rosters', label: 'Rosters' },
  ];

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          key="scrim"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          // Above the chat button, which sits at z-72 and used to float over
          // the sheet's content.
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            role="dialog" aria-modal="true"
            aria-label={`${target.a.teamName} vs ${target.b.teamName}`}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag={reduce ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
            onClick={e => e.stopPropagation()}
            className="relative flex h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-border bg-card shadow-2xl sm:h-auto sm:max-h-[88vh] sm:rounded-2xl"
          >
            {/* Grab handle */}
            <div className="flex shrink-0 justify-center pb-1 pt-2.5 sm:hidden">
              <span className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
            </div>

            {/* Header, sticky: who is playing, and a way out. */}
            <div className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-1 sm:px-6 sm:pt-5">
              {/* `draggable={false}`: a link is natively draggable, and that
                  browser drag swallowed the swipe that dismisses the sheet. */}
              <Link href={`/team/${target.a.userId}`} draggable={false} className="flex min-w-0 flex-1 items-center gap-2">
                <Avatar avatarId={target.a.avatar} size={28} className="shrink-0 rounded-lg" />
                <span className="truncate text-[13px] font-semibold text-foreground">{target.a.teamName}</span>
              </Link>
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">vs</span>
              <Link href={`/team/${target.b.userId}`} draggable={false} className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <span className="truncate text-right text-[13px] font-semibold text-foreground">{target.b.teamName}</span>
                <Avatar avatarId={target.b.avatar} size={28} className="shrink-0 rounded-lg" />
              </Link>
              <button
                onClick={onClose} aria-label="Close"
                className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Segmented tabs */}
            <div className="shrink-0 px-4 pb-3 sm:px-6">
              <div className="relative flex rounded-xl bg-muted p-1">
                {tabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'relative z-10 flex-1 rounded-lg py-1.5 text-[12px] font-semibold transition-colors',
                      tab === t.id ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {tab === t.id && (
                      <motion.span
                        layoutId="matchup-tab"
                        className="absolute inset-0 -z-10 rounded-lg bg-card shadow-sm"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrolling body. `touch-pan-y` keeps inner scrolling from being
                read as a drag on the sheet. */}
            <div
              className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:px-6"
              onPointerDownCapture={e => e.stopPropagation()}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                >
                  {tab === 'forecast' && (
                    live === undefined ? <ForecastSkeleton /> :
                    live ? (
                      <MatchupForecastView
                        a={target.a} b={target.b}
                        week={live.week} phase={live.phase}
                        forecast={live.forecast} lines={live.lines}
                      />
                    ) : <Empty>No forecast for this pairing this week.</Empty>
                  )}

                  {tab === 'history' && (
                    extras === undefined ? <ListSkeleton /> :
                    extras ? <History extras={extras} /> :
                    <Empty>Could not load the history for this matchup.</Empty>
                  )}

                  {tab === 'rosters' && (
                    extras === undefined ? <ListSkeleton /> :
                    extras ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <StarterList side={extras.sides[0]} statsSeason={extras.statsSeason} />
                        <StarterList side={extras.sides[1]} statsSeason={extras.statsSeason} />
                      </div>
                    ) : <Empty>Could not load rosters.</Empty>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function History({ extras }: { extras: Extras }) {
  const h = extras.h2h;
  const decided = h.aWins + h.bWins;
  if (!h.meetings) return <Empty>These two have never played each other.</Empty>;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[28px] font-bold leading-none tabular-nums text-primary">{h.aWins}</span>
          <span className="text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {h.rivalryLabel}
          </span>
          <span className="text-[28px] font-bold leading-none tabular-nums text-foreground/70">{h.bWins}</span>
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
          <motion.div className="bg-primary" initial={{ width: 0 }}
            animate={{ width: `${(h.aWins / Math.max(decided, 1)) * 100}%` }}
            transition={{ type: 'spring', stiffness: 110, damping: 22 }} />
          <motion.div className="bg-foreground/30" initial={{ width: 0 }}
            animate={{ width: `${(h.bWins / Math.max(decided, 1)) * 100}%` }}
            transition={{ type: 'spring', stiffness: 110, damping: 22 }} />
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {h.meetings} meeting{h.meetings === 1 ? '' : 's'}, {h.aPoints.toFixed(0)} to {h.bPoints.toFixed(0)} points,
          rivalry {h.rivalryScore}/100
        </p>
      </section>

      <ul className="overflow-hidden rounded-xl border border-border">
        {h.games.map((g, i) => {
          const aWon = g.score > g.opponentScore;
          return (
            <motion.li
              key={`${g.season}-${g.week}-${i}`}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              className={cn('grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-2.5',
                i > 0 && 'border-t border-border/60')}
            >
              <span className={cn('text-right text-[14px] font-semibold tabular-nums',
                aWon ? 'text-foreground' : 'text-muted-foreground/60')}>
                {g.score.toFixed(1)}
              </span>
              <span className="min-w-[4.5rem] text-center text-[10px] text-muted-foreground">
                {g.season} wk {g.week}
                {g.isPlayoff && <span className="ml-1 font-bold text-primary">PO</span>}
              </span>
              <span className={cn('text-[14px] font-semibold tabular-nums',
                !aWon ? 'text-foreground' : 'text-muted-foreground/60')}>
                {g.opponentScore.toFixed(1)}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function StarterList({ side, statsSeason }: { side: Side; statsSeason: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <Avatar avatarId={side.avatar} size={20} className="rounded-md" />
        <span className="truncate text-[12px] font-semibold text-foreground">{side.teamName}</span>
        <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
          {statsSeason}
        </span>
      </div>
      <ul>
        {side.starters.map((p, i) => (
          <li key={p.playerId} className={cn('flex items-center gap-2 px-3 py-2', i > 0 && 'border-t border-border/50')}>
            <span className="w-8 shrink-0 text-[10px] font-bold uppercase text-muted-foreground">{p.position}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{p.name}</span>
            <span className="shrink-0 text-[12px] font-semibold tabular-nums text-foreground">
              {p.points != null ? p.points.toFixed(1) : '--'}
            </span>
          </li>
        ))}
        {!side.starters.length && <li className="px-3 py-3 text-[12px] text-muted-foreground">No starters set.</li>}
      </ul>
    </div>
  );
}

// ── States ───────────────────────────────────────────────────────────────────

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-[13px] text-muted-foreground">{children}</p>;
}

/** Shaped like the real forecast, so nothing jumps when it arrives. */
function ForecastSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading forecast">
      <div className="rounded-2xl border border-border p-4">
        <div className="lp-skeleton h-4 w-24 rounded-full" />
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="lp-skeleton h-14 rounded-xl" />
          <span className="w-4" />
          <div className="lp-skeleton h-14 rounded-xl" />
        </div>
        <div className="lp-skeleton mt-4 h-2 rounded-full" />
        <div className="lp-skeleton mt-3 h-3 w-3/4 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="lp-skeleton h-16 rounded-xl" />
        <div className="lp-skeleton h-16 rounded-xl" />
      </div>
      <div className="space-y-px overflow-hidden rounded-xl border border-border">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="lp-skeleton h-11" />)}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <div className="lp-skeleton h-24 rounded-2xl" />
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="lp-skeleton h-10 rounded-lg" />)}
    </div>
  );
}
