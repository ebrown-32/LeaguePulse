'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { CloseIcon } from '@/components/icons/MediaIcons';
import { cn } from '@/lib/utils';
import type { PlayerCard } from '@/lib/playerStats';

interface Side {
  userId: string;
  teamName: string;
  manager: string;
  avatar: string;
  starters: PlayerCard[];
  bench: PlayerCard[];
}

interface Detail {
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
}

type Tab = 'h2h' | 'rosters';

function StarterList({ side, statsSeason }: { side: Side; statsSeason: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Avatar avatarId={side.avatar} size={22} className="rounded-md" />
        <span className="truncate text-sm font-semibold text-foreground">{side.teamName}</span>
      </div>
      <ul className="space-y-1">
        {side.starters.map(p => (
          <li key={p.playerId} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
            <span className="w-9 shrink-0 text-[10px] font-bold text-muted-foreground">{p.position}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{p.name}</span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
              {p.points != null ? p.points.toFixed(1) : 'n/a'}
            </span>
          </li>
        ))}
        {!side.starters.length && (
          <li className="text-xs text-muted-foreground">No starters set.</li>
        )}
      </ul>
      <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        {statsSeason} production
      </p>
    </div>
  );
}

export default function MatchupDetailModal({
  target, onClose,
}: { target: MatchupTarget | null; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('h2h');

  useEffect(() => {
    if (!target) { setDetail(null); return; }
    let cancelled = false;
    setLoading(true); setDetail(null); setTab('h2h');
    fetch(`/api/matchup?a=${target.a.userId}&b=${target.b.userId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && !d.error) setDetail(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [target, onClose]);

  const h2h = detail?.h2h;
  const decided = (h2h?.aWins ?? 0) + (h2h?.bWins ?? 0);
  const total = h2h?.meetings ?? 0;

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            onClick={e => e.stopPropagation()}
            className="relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-2xl"
          >
            <button
              onClick={onClose} aria-label="Close"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-muted/80 text-muted-foreground backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
            >
              <CloseIcon className="h-4 w-4" />
            </button>

            {/* Header */}
            <div className="border-b border-border p-5 pr-14 sm:p-6 sm:pr-16">
              <div className="flex items-center gap-3">
                <Link href={`/team/${target.a.userId}`} className="group flex min-w-0 flex-1 items-center gap-2">
                  <Avatar avatarId={target.a.avatar} size={36} className="shrink-0 rounded-lg" />
                  <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                    {target.a.teamName}
                  </span>
                </Link>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">vs</span>
                <Link href={`/team/${target.b.userId}`} className="group flex min-w-0 flex-1 items-center justify-end gap-2">
                  <span className="truncate text-right text-sm font-semibold text-foreground group-hover:text-primary">
                    {target.b.teamName}
                  </span>
                  <Avatar avatarId={target.b.avatar} size={36} className="shrink-0 rounded-lg" />
                </Link>
              </div>

              {h2h && total > 0 && (
                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-display text-lg font-bold tabular-nums text-foreground">{h2h.aWins}</span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {h2h.rivalryLabel} · {h2h.rivalryScore}/100
                    </span>
                    <span className="font-display text-lg font-bold tabular-nums text-foreground">{h2h.bWins}</span>
                  </div>
                  {/* Series bar: share of all meetings won by each side. */}
                  <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="bg-primary" style={{ width: `${(h2h.aWins / Math.max(decided, 1)) * 100}%` }} />
                    <div className="bg-muted-foreground/50" style={{ width: `${(h2h.bWins / Math.max(decided, 1)) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                    {total} meeting{total === 1 ? '' : 's'} · {h2h.aPoints.toFixed(1)} to {h2h.bPoints.toFixed(1)} total points
                  </p>
                </div>
              )}
            </div>

            {loading && !detail ? (
              <div className="flex justify-center py-16"><LoadingSpinner className="h-7 w-7" /></div>
            ) : !detail ? (
              <p className="p-6 text-sm text-muted-foreground">Could not load this matchup.</p>
            ) : (
              <>
                <div className="flex gap-1 border-b border-border px-5 sm:px-6">
                  {(['h2h', 'rosters'] as Tab[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        'border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors',
                        tab === t
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t === 'h2h' ? 'Previous Meetings' : 'Rosters'}
                    </button>
                  ))}
                </div>

                <div className="p-5 sm:p-6">
                  {tab === 'h2h' && (
                    detail.h2h.games.length ? (
                      <ul className="space-y-1.5">
                        {detail.h2h.games.map((g, i) => {
                          const aWon = g.score > g.opponentScore;
                          return (
                            <li key={`${g.season}-${g.week}-${i}`}
                              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                              <span className="w-24 shrink-0 text-[11px] text-muted-foreground">
                                {g.season} wk {g.week}{g.isPlayoff && <span className="ml-1 text-primary">PO</span>}
                              </span>
                              <span className={cn('flex-1 text-right text-sm font-semibold tabular-nums',
                                aWon ? 'text-foreground' : 'text-muted-foreground')}>
                                {g.score.toFixed(1)}
                              </span>
                              <span className="text-[10px] font-semibold text-muted-foreground">vs</span>
                              <span className={cn('flex-1 text-sm font-semibold tabular-nums',
                                !aWon ? 'text-foreground' : 'text-muted-foreground')}>
                                {g.opponentScore.toFixed(1)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        These two have never played each other.
                      </p>
                    )
                  )}

                  {tab === 'rosters' && (
                    <div className="grid gap-6 sm:grid-cols-2">
                      <StarterList side={detail.sides[0]} statsSeason={detail.statsSeason} />
                      <StarterList side={detail.sides[1]} statsSeason={detail.statsSeason} />
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
