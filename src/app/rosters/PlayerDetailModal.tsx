'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { CloseIcon } from '@/components/icons/MediaIcons';
import { LoadingBlock } from '@/components/ui/LoadingSpinner';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { POSITION_STYLE } from './positions';
import type { PlayerCard } from '@/lib/playerStats';

interface PlayerMove {
  transactionId: string;
  type: 'trade' | 'free_agent' | 'waiver';
  season: string;
  week: number;
  created: number;
  direction: 'add' | 'drop';
  teamName: string;
  userId: string;
  avatar: string;
  waiverBid?: number;
}

interface PlayerProfile {
  height: number | null;
  weight: number | null;
  college: string | null;
  status: string | null;
  depthChartOrder: number | null;
  depthChartPosition: string | null;
}

interface PlayerOutlook {
  season: string;
  projectedPoints: number | null;
  adp: number | null;
  dynastyAdp: number | null;
}

interface PlayerDetail {
  player: PlayerCard;
  statsSeason: string;
  statLine: { label: string; value: string }[];
  profile?: PlayerProfile;
  outlook?: PlayerOutlook;
  moves: PlayerMove[];
}

function feetInches(inches: number | null): string {
  if (inches == null) return '–';
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

/**
 * Where a player sits in the dynasty market, in words.
 *
 * The ADP number alone means nothing to anyone who does not draft startups for
 * a living. The band does, and it is a plain reading of the number rather than
 * a judgement layered on top of it.
 */
function dynastyTier(adp: number | null): string | null {
  if (adp == null) return null;
  if (adp <= 12) return 'First round startup pick';
  if (adp <= 36) return 'Early startup pick';
  if (adp <= 75) return 'Solid startup asset';
  if (adp <= 150) return 'Mid startup asset';
  return 'Late startup flier';
}

const MOVE_LABEL: Record<PlayerMove['type'], string> = {
  trade: 'Trade',
  free_agent: 'Free Agent',
  waiver: 'Waiver',
};

export default function PlayerDetailModal({
  playerId, fallback, season, onClose,
}: { playerId: string | null; fallback?: PlayerCard | null; season?: string; onClose: () => void }) {
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playerId) { setDetail(null); return; }
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    fetch(`/api/rosters/player/${playerId}${season ? `?season=${season}` : ''}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && !d.error) setDetail(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [playerId, season]);

  // Escape to dismiss, and lock body scroll while open.
  useEffect(() => {
    if (!playerId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [playerId, onClose]);

  const p = detail?.player ?? fallback ?? null;
  const posStyle = p ? POSITION_STYLE[p.position] ?? POSITION_STYLE.DEFAULT : POSITION_STYLE.DEFAULT;

  return (
    <AnimatePresence>
      {playerId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            onClick={e => e.stopPropagation()}
            className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-2xl"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
            >
              <CloseIcon className="h-4 w-4" />
            </button>

            {/* Header */}
            <div className="relative overflow-hidden border-b border-border p-6">
              <div className="relative">
                <span className={cn('inline-flex rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-widest', posStyle.badge)}>
                  {p?.position ?? ','}
                </span>
                <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-foreground">
                  {p?.name ?? 'Player'}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p?.nflTeam}
                  {p?.number && <> · #{p.number}</>}
                  {p?.age != null && <> · Age {p.age}</>}
                  {p?.yearsExp != null && <> · {p.yearsExp === 0 ? 'Rookie' : `${p.yearsExp} yr exp`}</>}
                </p>
                {p?.injuryStatus && (
                  <span className="mt-2 inline-flex rounded border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rose-500">
                    {p.injuryStatus}
                  </span>
                )}
              </div>
            </div>

            {loading && !detail ? (
              <LoadingBlock size={14} />
            ) : (
              <>
                {/* ── Outlook ──
                    First, and deliberately so. Everything else on this page is
                    a record of what already happened; the reason to open a
                    player in a dynasty league is what is expected of them
                    next. */}
                {detail?.outlook && (
                  <div className="border-b border-border p-6">
                    <div className="mb-4 flex items-baseline justify-between">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Outlook
                      </h3>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                        {detail.outlook.season}
                      </span>
                    </div>

                    <div className="flex items-end gap-4">
                      <div>
                        <p className="font-display text-4xl font-bold leading-none tabular-nums text-foreground">
                          {detail.outlook.projectedPoints != null
                            ? detail.outlook.projectedPoints.toFixed(0)
                            : '–'}
                        </p>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Projected PPR
                        </p>
                      </div>

                      {/* Against last season, which is the whole argument for
                          or against a player heading into a year. */}
                      {detail.outlook.projectedPoints != null && p?.points != null && (() => {
                        const diff = detail.outlook.projectedPoints - p.points;
                        const up = diff >= 0;
                        return (
                          <div className="pb-1">
                            <p className={cn(
                              'font-display text-lg font-bold tabular-nums',
                              Math.abs(diff) < 17
                                ? 'text-muted-foreground'
                                : up ? 'text-emerald-500' : 'text-rose-500',
                            )}>
                              {up ? '+' : ''}{diff.toFixed(0)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              vs {detail.statsSeason}
                            </p>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-border bg-background/50 p-3">
                        <p className="font-display text-lg font-bold tabular-nums text-foreground">
                          {detail.outlook.dynastyAdp != null
                            ? detail.outlook.dynastyAdp.toFixed(1) : '–'}
                        </p>
                        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Dynasty ADP
                        </p>
                        {dynastyTier(detail.outlook.dynastyAdp) && (
                          <p className="mt-1 text-[10px] leading-snug text-primary">
                            {dynastyTier(detail.outlook.dynastyAdp)}
                          </p>
                        )}
                      </div>
                      <div className="rounded-xl border border-border bg-background/50 p-3">
                        <p className="font-display text-lg font-bold tabular-nums text-foreground">
                          {detail.outlook.adp != null ? detail.outlook.adp.toFixed(1) : '–'}
                        </p>
                        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Redraft ADP
                        </p>
                        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                          This season only
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                      Projections and draft positions are Sleeper&apos;s published
                      figures.
                    </p>
                  </div>
                )}

                {/* ── Profile ──
                    Skipped entirely when Sleeper holds none of it, which is
                    the case for every team defense. Six rows of dashes is
                    worse than no section. */}
                {detail?.profile && Object.values(detail.profile).some(v => v != null) && (
                  <div className="border-b border-border p-6">
                    <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Profile
                    </h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      {[
                        { label: 'Height', value: feetInches(detail.profile.height) },
                        { label: 'Weight', value: detail.profile.weight != null ? `${detail.profile.weight} lb` : '–' },
                        {
                          label: 'Depth chart',
                          value: detail.profile.depthChartOrder != null
                            ? `${detail.profile.depthChartPosition ?? p?.position ?? ''} ${detail.profile.depthChartOrder}`.trim()
                            : '–',
                        },
                        { label: 'Status', value: detail.profile.status ?? '–' },
                        { label: 'College', value: detail.profile.college ?? '–' },
                        {
                          label: 'Experience',
                          value: p?.yearsExp != null
                            ? (p.yearsExp === 0 ? 'Rookie' : `${p.yearsExp} yr`)
                            : '–',
                        },
                      ].map(row => (
                        <div key={row.label} className="flex items-baseline justify-between border-b border-border/50 pb-1.5">
                          <span className="text-[11px] text-muted-foreground">{row.label}</span>
                          <span className="truncate pl-2 text-[12px] font-semibold text-foreground">
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Season production */}
                <div className="border-b border-border p-6">
                  <div className="mb-4 flex items-baseline justify-between">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      What they actually did
                    </h3>
                    {detail && (
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                        {detail.statsSeason}
                      </span>
                    )}
                  </div>

                  {p?.points != null ? (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'PPR Pts', value: p.points.toFixed(1) },
                          { label: 'Per Game', value: p.pointsPerGame != null ? p.pointsPerGame.toFixed(1) : ',' },
                          { label: 'Pos Rank', value: p.positionRank != null ? `#${p.positionRank}` : ',' },
                        ].map(s => (
                          <div key={s.label} className="rounded-xl border border-border bg-background/50 p-3 text-center">
                            <p className="font-display text-xl font-bold tabular-nums text-foreground">{s.value}</p>
                            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{s.label}</p>
                          </div>
                        ))}
                      </div>

                      {!!detail?.statLine.length && (
                        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                          {detail.statLine.map(s => (
                            <div key={s.label} className="flex items-baseline justify-between border-b border-border/50 pb-1.5">
                              <span className="text-[11px] text-muted-foreground">{s.label}</span>
                              <span className="font-semibold tabular-nums text-foreground">{s.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No scored games in {detail?.statsSeason ?? 'this season'}.
                    </p>
                  )}
                </div>

                {/* League transaction history */}
                <div className="p-6">
                  <h3 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    League History
                  </h3>

                  {detail?.moves.length ? (
                    <ol className="space-y-3">
                      {detail.moves.map((m, i) => (
                        <li key={`${m.created}-${m.direction}-${i}`}>
                          <Link
                            href={`/transactions?tx=${m.transactionId}`}
                            className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/40"
                          >
                            <span className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                              m.direction === 'add'
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : 'bg-rose-500/15 text-rose-500',
                            )}>
                              {m.direction === 'add' ? '+' : '−'}
                            </span>
                            <Avatar avatarId={m.avatar} size={26} className="shrink-0 rounded-md" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                                {m.teamName}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {MOVE_LABEL[m.type]}
                                {m.waiverBid != null && m.waiverBid > 0 && <> · ${m.waiverBid}</>}
                                {' · '}{m.season}{m.week > 0 && <> · Wk {m.week}</>}
                              </p>
                            </div>
                            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                          </Link>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No recorded moves, rostered since joining the league, or acquired in a draft.
                    </p>
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
