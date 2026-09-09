'use client';

/**
 * Alternate Timelines.
 *
 * Pick a trade, rewind it, and watch the season re-solve. Nothing here is
 * simulated: every point is a real point a real player scored in that real
 * week, so the alternate champion is an answer rather than a guess. See
 * `lib/sim/replay.ts` for exactly what the rewind does and does not touch.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { Eyebrow, fmtRecord } from './shared';
import { ArrowRightLeft, Trophy, Info, ArrowUp, ArrowDown, Filter, ChevronDown } from 'lucide-react';
import HoneycombLoader from '@/components/ui/honeycomb-loader';
import { TradeSides } from '@/components/trade/TradeSides';
import type { TransactionSide } from '@/app/api/transactions/route';

interface TradeImpact {
  championChanged: boolean;
  fieldChanged: boolean;
  seedsChanged: boolean;
  championBefore: number | null;
  championAfter: number | null;
  biggestMove: number;
  weeksChanged: number;
}

interface TradeRow {
  transactionId: string;
  season: string;
  week: number;
  rosterIds: number[];
  adds: Record<string, number>;
  pickCount: number;
  playerNames: Record<string, string>;
  teamNames: Record<string, string>;
  avatars: Record<string, string>;
  impact?: TradeImpact;
  sides: TransactionSide[];
}

/** Highest tier of consequence a trade reached, for badging and filtering. */
type Tier = 'title' | 'field' | 'seeds' | 'none';

function tierOf(t: TradeRow): Tier {
  const i = t.impact;
  if (!i) return 'none';
  if (i.championChanged) return 'title';
  if (i.fieldChanged) return 'field';
  if (i.seedsChanged) return 'seeds';
  return 'none';
}

const TIER_LABEL: Record<Exclude<Tier, 'none'>, string> = {
  title: 'Changed the title',
  field: 'Changed the field',
  seeds: 'Changed seeding',
};

interface TeamRecord {
  rosterId: number; wins: number; losses: number; ties: number; pointsFor: number;
}
interface Timeline {
  standings: TeamRecord[];
  seeds: number[];
  championRosterId: number | null;
  bracket: { round: string; a: number; b: number; aScore: number; bScore: number; winner: number }[];
}
interface ReplayResponse {
  trade: TradeRow;
  actual: Timeline;
  alternate: Timeline;
  changes: { week: number; rosterId: number; actual: number; alternate: number }[];
  affectedRosters: number[];
  notes: string[];
  season: string;
  teamNames: Record<string, string>;
  avatars: Record<string, string>;
}

export default function AlternateTimelines() {
  const [trades, setTrades] = useState<TradeRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [season, setSeason] = useState<string>('all');
  const [onlyMatters, setOnlyMatters] = useState(false);
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/simulator/replay')
      .then(r => r.json())
      .then(d => setTrades(d.trades ?? []))
      .catch(() => setTrades([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    fetch(`/api/simulator/replay?transactionId=${selected}`)
      .then(r => r.json())
      .then(d => { setReplay(d.error ? null : d); setLoading(false); })
      .catch(() => { setReplay(null); setLoading(false); });
  }, [selected]);

  if (trades === null) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card py-16">
        <HoneycombLoader style={{ ['--honeycomb-size' as string]: '14px' }} />
      </div>
    );
  }

  // The route only returns trades from seasons that have actually been played,
  // since a season with no results cannot be replayed.
  const seasons = [...new Set(trades.map(t => t.season))].sort((a, b) => Number(b) - Number(a));
  const inSeason = season === 'all' ? trades : trades.filter(t => t.season === season);
  const visible = onlyMatters
    ? inSeason.filter(t => tierOf(t) !== 'none')
    : inSeason;

  const titleCount = inSeason.filter(t => tierOf(t) === 'title').length;
  const movedCount = inSeason.filter(t => tierOf(t) !== 'none').length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Eyebrow>Rewind a trade</Eyebrow>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Put the players back where they started and replay the rest of the season with the points they really scored.
          </p>

          {/* The headline finding, so the interesting trades are named before
              you click anything. */}
          <p className="mt-2 text-[13px] text-foreground">
            <span className="font-semibold">{titleCount}</span> of {inSeason.length} changed who won
            the title, and <span className="font-semibold">{movedCount}</span> changed something.
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {seasons.length > 1 && (['all', ...seasons] as const).map(s => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  season === s
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {s === 'all' ? 'All seasons' : s}
              </button>
            ))}
            {seasons.length > 1 && <span className="mx-1 h-4 w-px bg-border" />}
            <button
              onClick={() => setOnlyMatters(v => !v)}
              aria-pressed={onlyMatters}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                onlyMatters
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              <Filter className="h-3 w-3" />
              Only ones that mattered
            </button>
          </div>
        </div>

        <div className="max-h-[440px] overflow-y-auto divide-y divide-border/60">
          {visible.map(t => {
            const names = Object.keys(t.adds).map(p => t.playerNames[p]).filter(Boolean);
            const isSel = selected === t.transactionId;
            const tier = tierOf(t);
            const imp = t.impact;
            return (
              <div key={t.transactionId}>
              <button
                onClick={() => setSelected(t.transactionId)}
                aria-expanded={isSel}
                className={cn(
                  // A left rail carries the tier, so consequence is legible when
                  // scanning the column rather than only when reading a badge.
                  'flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors',
                  tier === 'title' ? 'border-l-primary'
                    : tier === 'field' ? 'border-l-primary/40'
                    : 'border-l-transparent',
                  isSel ? 'bg-primary/[0.06]' : 'hover:bg-accent/40',
                )}
              >
                <ArrowRightLeft className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  isSel ? 'text-primary'
                    : tier === 'title' ? 'text-primary/70'
                    : 'text-muted-foreground/50',
                )} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      {t.season} week {t.week}
                    </span>
                    <div className="flex items-center gap-1">
                      {t.rosterIds.map(rid => (
                        <Avatar
                          key={rid} avatarId={t.avatars[String(rid)] ?? null} size={16}
                          className="rounded-full"
                        />
                      ))}
                    </div>
                    {tier !== 'none' && (
                      <span className={cn(
                        'rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide',
                        tier === 'title'
                          ? 'bg-primary text-primary-foreground'
                          : tier === 'field'
                            ? 'border border-primary/40 bg-primary/10 text-primary'
                            : 'border border-border text-muted-foreground',
                      )}>
                        {TIER_LABEL[tier]}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1 truncate text-[12px] text-foreground">
                    <span className="truncate">
                      {names.length ? names.join(', ') : 'Draft picks only'}
                      {t.pickCount > 0 && (
                        <span className="ml-1.5 text-muted-foreground">
                          + {t.pickCount} pick{t.pickCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </span>
                    <ChevronDown className={cn(
                      'h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform',
                      isSel && 'rotate-180',
                    )} />
                  </p>
                  {/* Say what changed, not just that something did. */}
                  {tier === 'title' && imp?.championAfter !== null && imp?.championAfter !== undefined && (
                    <p className="mt-0.5 truncate text-[11px] text-primary">
                      {t.teamNames[String(imp.championAfter)]} wins instead of{' '}
                      {imp.championBefore !== null ? t.teamNames[String(imp.championBefore)] : 'nobody'}
                    </p>
                  )}
                  {tier === 'field' && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      A different team makes the playoffs
                    </p>
                  )}
                </div>
              </button>

              {/* The trade itself, drawn exactly as the Transactions page draws
                  it. Which way the players went is the whole subject here, and
                  a comma separated list of names cannot show it. */}
              {isSel && t.sides.length >= 2 && (
                <div className="border-t border-border/50 bg-muted/20 pb-1">
                  <TradeSides sides={t.sides} compact linkTeams={false} />
                </div>
              )}
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {onlyMatters
                ? 'No trades in this season changed the standings, the field or the title.'
                : 'No trades to rewind. Only seasons that have actually been played can be replayed.'}
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card py-14">
          <HoneycombLoader style={{ ['--honeycomb-size' as string]: '14px' }} />
          <span className="text-[13px] text-muted-foreground">Replaying the season</span>
        </div>
      )}

      {replay && !loading && <TimelineDiff data={replay} />}
    </div>
  );
}

function TimelineDiff({ data }: { data: ReplayResponse }) {
  const { actual, alternate, teamNames, avatars } = data;
  const rankIn = (tl: Timeline, rid: number) => tl.standings.findIndex(s => s.rosterId === rid);
  const championChanged = actual.championRosterId !== alternate.championRosterId;

  const name = (rid: number) => teamNames[String(rid)] ?? `Team ${rid}`;

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className={cn(
        'rounded-xl border p-4',
        championChanged ? 'border-primary/40 bg-primary/[0.06]' : 'border-border bg-card',
      )}>
        <div className="flex items-start gap-3">
          <Trophy className={cn('mt-0.5 h-5 w-5 shrink-0', championChanged ? 'text-primary' : 'text-muted-foreground/50')} />
          <div className="min-w-0">
            <Eyebrow>{data.season} title</Eyebrow>
            {actual.championRosterId === null && alternate.championRosterId === null ? (
              // A season still in progress has no playoff weeks to replay, so
              // the standings are the whole story here.
              <p className="mt-1 text-[15px] text-foreground">
                This season has not reached the playoffs yet.
                <span className="ml-1 text-muted-foreground">
                  Compare the standings below to see what the trade has changed so far.
                </span>
              </p>
            ) : championChanged ? (
              <p className="mt-1 text-[15px] font-semibold text-foreground">
                Reverse this trade and{' '}
                <span className="text-primary">
                  {alternate.championRosterId !== null ? name(alternate.championRosterId) : 'nobody'}
                </span>{' '}
                wins instead of{' '}
                {actual.championRosterId !== null ? name(actual.championRosterId) : 'nobody'}.
              </p>
            ) : (
              <p className="mt-1 text-[15px] text-foreground">
                {actual.championRosterId !== null ? name(actual.championRosterId) : 'The same team'}
                {' '}still wins the title.
                <span className="ml-1 text-muted-foreground">The trade moved the standings, not the trophy.</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Standings, side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {([['What happened', actual, false], ['Without the trade', alternate, true]] as const)
          .map(([label, tl, isAlt]) => (
          <div key={label} className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <Eyebrow>{label}</Eyebrow>
            </div>
            <div className="divide-y divide-border/60">
              {tl.standings.map((s, i) => {
                const otherRank = rankIn(isAlt ? actual : alternate, s.rosterId);
                const moved = isAlt && otherRank !== -1 ? otherRank - i : 0;
                const inField = tl.seeds.includes(s.rosterId);
                const isChamp = tl.championRosterId === s.rosterId;
                const affected = data.affectedRosters.includes(s.rosterId);

                return (
                  <motion.div
                    key={s.rosterId}
                    layout="position"
                    transition={{ type: 'spring', stiffness: 340, damping: 32 }}
                    className={cn(
                      'flex items-center gap-2.5 px-4 py-2.5',
                      affected && 'bg-primary/[0.04]',
                    )}
                  >
                    <span className={cn(
                      'w-4 text-center text-[11px] font-bold tabular-nums',
                      inField ? 'text-primary' : 'text-muted-foreground/40',
                    )}>
                      {i + 1}
                    </span>
                    <Avatar avatarId={avatars[String(s.rosterId)] ?? null} size={24} className="shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-foreground">
                        {name(s.rosterId)}
                        {isChamp && <Trophy className="ml-1.5 inline h-3 w-3 text-primary" />}
                      </p>
                    </div>
                    {moved !== 0 && (
                      <span className={cn(
                        'flex items-center gap-0.5 text-[10px] font-bold tabular-nums',
                        moved > 0 ? 'text-emerald-500' : 'text-red-500',
                      )}>
                        {moved > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {Math.abs(moved)}
                      </span>
                    )}
                    <span className="w-14 text-right text-[11px] tabular-nums text-muted-foreground">
                      {fmtRecord(s.wins, s.losses, s.ties)}
                    </span>
                    <span className="w-14 text-right text-[11px] tabular-nums text-muted-foreground/70">
                      {s.pointsFor.toFixed(0)}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* The brackets, side by side. This is where a changed champion actually
          becomes legible: you can see which semifinal swapped an opponent. */}
      {(actual.bracket.length > 0 || alternate.bracket.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {([['Real bracket', actual], ['Alternate bracket', alternate]] as const).map(([label, tl]) => (
            <div key={label} className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <Eyebrow>{label}</Eyebrow>
              </div>
              <div className="divide-y divide-border/60">
                {tl.bracket.map((g, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      {g.round}
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {([[g.a, g.aScore], [g.b, g.bScore]] as const).map(([rid, score]) => {
                        const won = g.winner === rid;
                        const newcomer = !actual.seeds.includes(rid) && alternate.seeds.includes(rid);
                        return (
                          <div key={rid} className="flex items-center gap-2">
                            <Avatar avatarId={avatars[String(rid)] ?? null} size={18} className="shrink-0 rounded" />
                            <span className={cn(
                              'min-w-0 flex-1 truncate text-[12px]',
                              won ? 'font-bold text-foreground' : 'text-muted-foreground',
                            )}>
                              {name(rid)}
                              {newcomer && (
                                <span className="ml-1.5 rounded border border-primary/30 bg-primary/10 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-primary">
                                  new
                                </span>
                              )}
                            </span>
                            <span className={cn(
                              'shrink-0 text-[12px] tabular-nums',
                              won ? 'font-bold text-foreground' : 'text-muted-foreground',
                            )}>
                              {score.toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {tl.bracket.length === 0 && (
                  <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                    No playoff weeks have been played yet.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Week by week deltas for the teams involved */}
      {data.changes.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <Eyebrow>Weeks that changed</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.changes.map((c, i) => {
              const d = c.alternate - c.actual;
              return (
                <span
                  key={i}
                  title={`${name(c.rosterId)} week ${c.week}: ${c.actual.toFixed(1)} becomes ${c.alternate.toFixed(1)}`}
                  className={cn(
                    'inline-flex items-baseline gap-1 rounded border px-1.5 py-0.5 text-[10px] tabular-nums',
                    d > 0
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
                  )}
                >
                  <span className="font-semibold">W{c.week}</span>
                  {d > 0 ? '+' : ''}{d.toFixed(1)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {data.notes.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-start gap-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
            <ul className="space-y-1 text-[12px] leading-relaxed text-muted-foreground">
              {data.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
