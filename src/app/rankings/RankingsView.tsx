'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import Avatar from '@/components/ui/Avatar';
import { LoadingBlock } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'] as const;
type Position = (typeof POSITIONS)[number];

const MODES = [
  { id: 'weekly', label: 'Weekly', blurb: 'Start/sit consensus for this week' },
  { id: 'dynasty', label: 'Dynasty', blurb: 'Long-term asset value' },
] as const;
type Mode = (typeof MODES)[number]['id'];

interface Owner { userId: string; teamName: string; avatar: string }
interface ExpertRank { id: string; name: string; twitter: string | null; rank: number; delta: number }

interface EcrPlayer {
  playerId: number;
  name: string; team: string; position: string;
  posRank: string | null;
  rankEcr: number; rankMin: number | null; rankMax: number | null; rankStd: number | null;
  byeWeek: string | null; opponent: string | null; ownedAvg: number | null;
  age: string | null; url: string | null;
  experts: ExpertRank[];
  highestOn: ExpertRank | null; lowestOn: ExpertRank | null;
  ownedBy: Owner | null;
}

interface Board {
  position: Position; mode: Mode;
  totalRanked: number; returned: number; experts: number;
  lastUpdated: string | null;
  players: EcrPlayer[];
  panel: { id: string; name: string; twitter: string | null; publishedAt: string | null }[];
}

interface Snapshot {
  season: string; week: number; scoring: string; fetchedAt: string;
  boards: Partial<Record<Mode, Partial<Record<Position, Board>>>>;
}

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Expert spread: where the field placed him, min to max. */
function SpreadBar({ p, board }: { p: EcrPlayer; board: Board }) {
  if (p.rankMin == null || p.rankMax == null) return null;
  const scale = Math.max(...board.players.map(x => x.rankMax ?? 0), 1);
  const left = (p.rankMin / scale) * 100;
  const width = Math.max(((p.rankMax - p.rankMin) / scale) * 100, 1.5);
  const consensus = (p.rankEcr / scale) * 100;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="absolute inset-y-0 rounded-full bg-primary/40" style={{ left: `${left}%`, width: `${width}%` }} />
      {/* consensus tick, so the bar shows position within the range too */}
      <div className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${consensus}%` }} />
    </div>
  );
}

/** Every expert's individual call, with the outliers called out. */
function ExpertPanel({ p }: { p: EcrPlayer }) {
  if (!p.experts.length) {
    return <p className="text-[11px] text-muted-foreground">No per-expert breakdown on this board.</p>;
  }
  const worst = Math.max(...p.experts.map(e => Math.abs(e.delta)), 1);
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {p.experts.length} experts ranked him
      </p>
      <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {p.experts.map(e => (
          <li key={e.id} className="flex items-center gap-2 text-[11px]">
            <span className="w-7 shrink-0 text-right font-semibold tabular-nums text-foreground">{e.rank}</span>
            {/* deviation from consensus, drawn from the centre */}
            <span className="relative h-3 w-10 shrink-0">
              <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
              <span
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/60"
                style={
                  e.delta < 0
                    ? { right: '50%', width: `${(Math.abs(e.delta) / worst) * 50}%` }
                    : { left: '50%', width: `${(Math.abs(e.delta) / worst) * 50}%` }
                }
              />
            </span>
            {e.twitter ? (
              <a
                href={`https://twitter.com/${e.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-muted-foreground hover:text-primary"
              >
                {e.name}
              </a>
            ) : (
              <span className="min-w-0 truncate text-muted-foreground">{e.name}</span>
            )}
          </li>
        ))}
      </ul>
      {p.highestOn && p.lowestOn && p.highestOn.rank !== p.lowestOn.rank && (
        <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          Highest: <span className="font-semibold text-foreground">{p.highestOn.name}</span> at {p.highestOn.rank}
          {'  ·  '}
          Lowest: <span className="font-semibold text-foreground">{p.lowestOn.name}</span> at {p.lowestOn.rank}
        </p>
      )}
    </div>
  );
}

export default function RankingsView() {
  const [data, setData] = useState<{ configured: boolean; snapshot: Snapshot | null } | null>(null);
  const [mode, setMode] = useState<Mode>('weekly');
  const [position, setPosition] = useState<Position>('ALL');
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/fantasypros/rankings')
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ configured: false, snapshot: null }));
  }, []);

  const snapshot = data?.snapshot;
  const board = snapshot?.boards?.[mode]?.[position];
  const activeMode = MODES.find(m => m.id === mode)!;

  const subtitle = snapshot
    ? `${activeMode.blurb} · ${snapshot.scoring} · ${snapshot.season}`
    : 'FantasyPros expert consensus';

  return (
    <PageLayout title="Player Rankings" subtitle={subtitle}>
      {!data ? (
        <LoadingBlock size={16} />
      ) : !data.configured ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm font-semibold text-foreground">FantasyPros is not configured</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Set <code className="rounded bg-muted px-1 py-0.5">FANTASY_PROS</code> to enable expert rankings.
          </p>
        </div>
      ) : !snapshot ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm font-semibold text-foreground">No rankings pulled yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Rankings refresh once a day on a schedule.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Mode: the two boards are different questions, so this leads. */}
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {MODES.map(m => (
              <button
                key={m.id}
                onClick={() => { setMode(m.id); setOpen(null); }}
                className={cn(
                  'relative rounded-md px-4 py-1.5 text-xs font-semibold transition-colors',
                  mode === m.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {mode === m.id && (
                  <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-md bg-primary"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                )}
                <span className="relative">{m.label}</span>
              </button>
            ))}
          </div>

          <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
            {POSITIONS.map(pos => (
              <button
                key={pos}
                onClick={() => { setPosition(pos); setOpen(null); }}
                className={cn(
                  'relative shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  pos === position ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {pos === position && (
                  <motion.span layoutId="rank-tab" className="absolute inset-0 rounded-lg border border-primary/40 bg-primary/10"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                )}
                <span className="relative">{pos === 'ALL' ? 'Overall' : pos}</span>
              </button>
            ))}
          </div>

          {board ? (
            <>
              <AnimatePresence mode="wait">
                <motion.ul
                  key={`${mode}-${position}`}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-1.5"
                >
                  {board.players.map(p => {
                    const expanded = open === p.playerId;
                    return (
                      <li key={p.playerId} className="overflow-hidden rounded-xl border border-border bg-card">
                        <button
                          onClick={() => setOpen(expanded ? null : p.playerId)}
                          aria-expanded={expanded}
                          className="w-full p-3 text-left transition-colors hover:bg-muted/40"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-7 shrink-0 text-center font-display text-lg font-bold tabular-nums text-primary">
                              {p.rankEcr}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold text-foreground">{p.name}</span>
                                <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                  {p.posRank ?? p.position} · {p.team}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                                {p.age && <span>age {p.age}</span>}
                                {p.opponent && <span>{p.opponent}</span>}
                                {p.byeWeek && <span>bye {p.byeWeek}</span>}
                                {p.ownedAvg != null && <span>{p.ownedAvg.toFixed(0)}% rostered</span>}
                                {p.experts.length > 0 && <span>{p.experts.length} experts</span>}
                              </div>
                            </div>

                            <div className="shrink-0">
                              {p.ownedBy ? (
                                <Link
                                  href={`/team/${p.ownedBy.userId}`}
                                  onClick={e => e.stopPropagation()}
                                  className="group flex items-center gap-1.5"
                                  title={`Rostered by ${p.ownedBy.teamName}`}
                                >
                                  <Avatar avatarId={p.ownedBy.avatar} size={22} className="rounded-md" />
                                  <span className="hidden max-w-[7rem] truncate text-[11px] text-muted-foreground group-hover:text-primary sm:inline">
                                    {p.ownedBy.teamName}
                                  </span>
                                </Link>
                              ) : (
                                <span className="rounded border border-border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Free agent
                                </span>
                              )}
                            </div>

                            <ChevronDown
                              className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                                expanded && 'rotate-180')}
                            />
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            <SpreadBar p={p} board={board} />
                            <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/70">
                              {p.rankMin != null && p.rankMax != null ? `${p.rankMin}-${p.rankMax}` : ''}
                            </span>
                          </div>
                        </button>

                        <AnimatePresence initial={false}>
                          {expanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <div className="border-t border-border p-3">
                                <ExpertPanel p={p} />
                                {p.url && (
                                  <a
                                    href={p.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-3 inline-block text-[11px] font-medium text-primary hover:underline"
                                  >
                                    Full analysis on FantasyPros →
                                  </a>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </li>
                    );
                  })}
                </motion.ul>
              </AnimatePresence>

              <p className="text-center text-[10px] text-muted-foreground">
                Top {board.returned} of {board.totalRanked} ranked · {board.experts} experts
                {board.lastUpdated && ` · FantasyPros updated ${board.lastUpdated}`}
                {snapshot.fetchedAt && ` · cached ${relativeTime(snapshot.fetchedAt)}`}
              </p>

              {board.panel.length > 0 && (
                <details className="rounded-xl border border-border bg-card p-4">
                  <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    The {board.panel.length}-expert panel
                  </summary>
                  <ul className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    {board.panel.map(e => (
                      <li key={e.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                        {e.twitter ? (
                          <a href={`https://twitter.com/${e.twitter}`} target="_blank" rel="noopener noreferrer"
                            className="truncate text-foreground hover:text-primary">
                            {e.name}
                          </a>
                        ) : (
                          <span className="truncate text-foreground">{e.name}</span>
                        )}
                        {e.publishedAt && (
                          <span className="shrink-0 tabular-nums text-muted-foreground/70">
                            {e.publishedAt.slice(5, 10)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              No {activeMode.label.toLowerCase()} {position} board in the latest snapshot.
            </p>
          )}
        </div>
      )}
    </PageLayout>
  );
}
