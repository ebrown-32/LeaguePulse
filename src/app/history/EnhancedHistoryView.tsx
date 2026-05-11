'use client';

import React, { useState, useEffect, useRef } from 'react';
import Avatar from '@/components/ui/Avatar';
import {
  Trophy,
  Flame,
  Zap,
  TrendingDown,
  Heart,
  BarChart3,
  ShieldCheck,
  Users,
  Activity,
} from 'lucide-react';
import TransactionActivity from './TransactionActivity';
import { getCurrentLeagueId } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { formatPoints } from '@/lib/utils';
import {
  generateEnhancedLeagueHistory,
  type EnhancedLeagueHistory,
} from '@/lib/enhancedHistoryApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnhancedHistoryViewProps {
  currentWeek: number;
}

type Tab = 'managers' | 'champions' | 'records' | 'activity';

// ─── Constants ────────────────────────────────────────────────────────────────

const RECORD_CATEGORIES = [
  { type: 'highScore',          label: 'Highest Score',    icon: Flame,              unit: 'pts',    higher: true  },
  { type: 'lowScore',           label: 'Lowest Score',     icon: TrendingDown, unit: 'pts',    higher: false },
  { type: 'blowout',            label: 'Biggest Blowouts', icon: Zap,              unit: 'margin', higher: true  },
  { type: 'closeGame',          label: 'Closest Games',    icon: Heart,             unit: 'margin', higher: false },
  { type: 'playoffHighScore',   label: 'Playoff High',     icon: Flame,              unit: 'pts',    higher: true  },
  { type: 'playoffLowScore',    label: 'Playoff Low',      icon: TrendingDown, unit: 'pts',    higher: false },
  { type: 'regularSeasonChamp', label: 'Reg Season Title', icon: ShieldCheck,       unit: 'wins',   higher: true  },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1 ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' :
    rank === 2 ? 'bg-muted text-muted-foreground border-border' :
    rank === 3 ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                 'bg-transparent text-muted-foreground/60 border-border/40';
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold shrink-0 border ${cls}`}>
      {rank}
    </span>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
      <div className="font-semibold text-sm text-foreground tabular-nums">{value}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EnhancedHistoryView({ currentWeek }: EnhancedHistoryViewProps) {
  const [loading, setLoading]                       = useState(true);
  const [error, setError]                           = useState<string | null>(null);
  const [historyData, setHistoryData]               = useState<EnhancedLeagueHistory | null>(null);
  const [processingStatus, setProcessingStatus]     = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [activeTab, setActiveTab]                   = useState<Tab>('managers');
  const [activeRecord, setActiveRecord]             = useState('highScore');
  const lastUpdateRef                               = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const leagueId = await getCurrentLeagueId();
        const data = await generateEnhancedLeagueHistory(leagueId, (pct, msg) => {
          if (cancelled) return;
          // Throttle to max ~8 updates/sec so rapid callbacks don't fight the CSS transition
          const now = Date.now();
          if (now - lastUpdateRef.current > 120) {
            lastUpdateRef.current = now;
            setProcessingProgress(pct);
            setProcessingStatus(msg);
          }
        });
        if (!cancelled) setHistoryData(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        if (!cancelled) { setLoading(false); setProcessingStatus(''); setProcessingProgress(0); }
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6">
        <div className="text-center">
          <Trophy className="h-10 w-10 text-amber-500/40 mx-auto mb-4" />
          <p className="text-sm font-semibold text-foreground">Building League History</p>
          <p className="text-xs text-muted-foreground mt-1">{processingStatus || 'Fetching seasons…'}</p>
        </div>
        <div className="w-full max-w-xs space-y-1.5">
          <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${processingProgress}%` }}
            />
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] text-muted-foreground">Processing seasons</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(processingProgress)}%</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) return <ErrorMessage title="Error" message={error} />;
  if (!historyData) return null;

  const { leagueMetadata, allTimeStats, records } = historyData;

  // ── Derived data ──────────────────────────────────────────────────────────

  const sortedManagers = [...allTimeStats].sort((a, b) => {
    if (Math.abs(b.winPercentage - a.winPercentage) > 0.0001) return b.winPercentage - a.winPercentage;
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    return b.championships - a.championships;
  });
  const maxWinPct = sortedManagers[0]?.winPercentage ?? 1;

  const championRecords = records
    .filter(r => r.type === 'championship')
    .sort((a, b) => parseInt(b.season) - parseInt(a.season));

  const titleCounts = championRecords.reduce<Record<string, number>>((acc, r) => {
    acc[r.userId] = (acc[r.userId] ?? 0) + 1;
    return acc;
  }, {});

  const runnerUpBySeason = records
    .filter(r => r.type === 'runnerUp')
    .reduce<Record<string, (typeof records)[0]>>((acc, r) => { acc[r.season] = r; return acc; }, {});

  const uniqueChampions = new Set(championRecords.map(r => r.userId)).size;

  const activeCategory = RECORD_CATEGORIES.find(c => c.type === activeRecord) ?? RECORD_CATEGORIES[0];
  const ActiveCategoryIcon = activeCategory.icon;

  const categoryRecords = records
    .filter(r => r.type === activeRecord)
    .sort((a, b) => activeCategory.higher ? b.value - a.value : a.value - b.value)
    .slice(0, 10);

  const catMax = categoryRecords[0]?.value ?? 1;
  const catMin = categoryRecords[categoryRecords.length - 1]?.value ?? 0;
  const catRange = catMax - catMin || 1;

  const tabs: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'managers',  label: 'Managers',    Icon: Users     },
    { id: 'champions', label: 'Champions',   Icon: Trophy    },
    { id: 'records',   label: 'Record Book', Icon: BarChart3 },
    { id: 'activity',  label: 'Activity',    Icon: Activity  },
  ];

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Overview strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[
          { label: 'Seasons',          value: String(leagueMetadata.totalSeasons) },
          { label: 'Games Played',     value: String(Math.round(leagueMetadata.totalGamesPlayed)) },
          { label: 'Unique Champions', value: String(uniqueChampions) },
          { label: 'All-Time High',    value: formatPoints(leagueMetadata.allTimeHighScore) },
          { label: 'League Avg',       value: formatPoints(leagueMetadata.averageLeagueScore) },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-card border border-border rounded-xl px-4 py-3"
          >
            <div className="font-display text-xl font-bold text-foreground tabular-nums">{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-border">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────── */}
      <div>

          {/* ══ Managers ═════════════════════════════════════════════════ */}
          <div className={activeTab !== 'managers' ? 'hidden' : ''}>
              {/* Column headers (desktop only) */}
              <div className="hidden md:flex items-center gap-3 px-4 py-2 mb-1">
                <span className="w-7 shrink-0" />
                <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Manager</span>
                <span className="w-24 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Record</span>
                <span className="w-16 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Win %</span>
                <span className="w-16 text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Titles</span>
                <span className="w-20 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Avg Pts</span>
                <span className="w-14 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Seasons</span>
              </div>

              <div className="space-y-1.5">
                {sortedManagers.map((manager, i) => {
                  const isGoat  = i === 0;
                  const barPct  = maxWinPct > 0 ? (manager.winPercentage / maxWinPct) * 100 : 0;
                  const repeat  = manager.championships > 1;

                  return (
                    <div key={manager.userId}>
                      {/* Desktop row */}
                      <div className={`hidden md:flex items-center gap-3 px-4 py-4 rounded-xl border transition-colors ${
                        isGoat
                          ? 'border-amber-500/20 bg-amber-500/[0.03]'
                          : 'border-border/60 hover:border-border hover:bg-accent/30'
                      }`}>
                        <RankBadge rank={i + 1} />

                        {/* Avatar + name + bar */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar avatarId={manager.avatar} size={38} className="rounded-xl shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-foreground truncate">{manager.username}</span>
                              {isGoat && (
                                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/25">
                                  GOAT
                                </span>
                              )}
                              {repeat && !isGoat && (
                                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                  {manager.championships}× Champ
                                </span>
                              )}
                            </div>
                            {/* Win % bar */}
                            <div className="mt-1.5 h-0.5 w-28 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${isGoat ? 'bg-amber-500' : 'bg-primary'}`}
                                style={{ width: `${barPct}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <span className="w-24 text-right font-mono text-sm text-foreground">
                          {manager.totalWins}–{manager.totalLosses}{manager.totalTies > 0 ? `–${manager.totalTies}` : ''}
                        </span>
                        <span className={`w-16 text-right text-sm font-bold tabular-nums ${isGoat ? 'text-amber-500' : 'text-foreground'}`}>
                          {(manager.winPercentage * 100).toFixed(1)}%
                        </span>

                        {/* Titles (trophy icons) */}
                        <div className="w-16 flex items-center justify-center gap-0.5">
                          {manager.championships > 0 ? (
                            <>
                              {Array.from({ length: Math.min(manager.championships, 3) }).map((_, j) => (
                                <Trophy key={j} className="h-3.5 w-3.5 text-amber-500" />
                              ))}
                              {manager.championships > 3 && (
                                <span className="text-[10px] font-bold text-amber-500">+{manager.championships - 3}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground/30 text-sm">—</span>
                          )}
                        </div>

                        <span className="w-20 text-right text-sm text-foreground tabular-nums">
                          {formatPoints(manager.averagePointsPerGame)}
                        </span>
                        <span className="w-14 text-right text-sm text-muted-foreground tabular-nums">
                          {manager.seasonsPlayed}
                        </span>
                      </div>

                      {/* Mobile card */}
                      <div className={`md:hidden rounded-xl border p-4 ${
                        isGoat ? 'border-amber-500/20 bg-amber-500/[0.03]' : 'border-border bg-card'
                      }`}>
                        <div className="flex items-center gap-3 mb-3">
                          <RankBadge rank={i + 1} />
                          <Avatar avatarId={manager.avatar} size={36} className="rounded-xl shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-sm text-foreground truncate">{manager.username}</span>
                              {isGoat && (
                                <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/25">
                                  GOAT
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{manager.seasonsPlayed} seasons</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`font-bold text-sm tabular-nums ${isGoat ? 'text-amber-500' : 'text-foreground'}`}>
                              {(manager.winPercentage * 100).toFixed(1)}%
                            </div>
                            <div className="text-xs font-mono text-muted-foreground">
                              {manager.totalWins}–{manager.totalLosses}
                            </div>
                          </div>
                        </div>

                        {/* Win% bar */}
                        <div className="h-0.5 bg-muted rounded-full overflow-hidden mb-3">
                          <div
                            className={`h-full rounded-full ${isGoat ? 'bg-amber-500' : 'bg-primary'}`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <StatPill
                            label="Titles"
                            value={manager.championships > 0 ? String(manager.championships) : '—'}
                          />
                          <StatPill label="Avg Pts" value={formatPoints(manager.averagePointsPerGame)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
          </div>

          {/* ══ Champions ════════════════════════════════════════════════ */}
          <div className={activeTab !== 'champions' ? 'hidden' : ''}>
              {championRecords.length === 0 ? (
                <div className="text-center py-20">
                  <Trophy className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No championship data yet</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {championRecords.map((champion, i) => {
                    const runnerUp    = runnerUpBySeason[champion.season];
                    const isMostRecent = i === 0;
                    const champCount  = titleCounts[champion.userId] ?? 0;

                    return (
                      <div
                        key={`${champion.season}-${champion.userId}`}
                        className={`flex items-center gap-4 md:gap-5 rounded-xl border px-5 py-4 md:py-5 ${
                          isMostRecent
                            ? 'border-amber-500/25 bg-amber-500/[0.04]'
                            : 'border-border bg-card'
                        }`}
                      >
                        {/* Year */}
                        <div className="w-14 shrink-0 text-center">
                          <div className={`font-display text-2xl font-bold leading-none ${isMostRecent ? 'text-amber-500' : 'text-foreground'}`}>
                            {champion.season}
                          </div>
                          {isMostRecent && (
                            <div className="text-[9px] font-bold uppercase tracking-wider text-amber-500/60 mt-1">Latest</div>
                          )}
                        </div>

                        <div className="w-px h-10 bg-border shrink-0" />

                        {/* Champion avatar + name */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="relative shrink-0">
                            <Avatar
                              avatarId={champion.avatar}
                              size={44}
                              className={`rounded-xl ${isMostRecent ? 'ring-2 ring-amber-500/40' : ''}`}
                            />
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow">
                              <Trophy className="h-2.5 w-2.5 text-white" />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-foreground truncate">{champion.username}</span>
                              {champCount > 1 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                                  {champCount}× Champ
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">League Champion</div>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="hidden sm:flex items-center gap-6 shrink-0">
                          {champion.details?.record && (
                            <div className="text-right">
                              <div className="font-mono font-bold text-sm text-foreground">{champion.details.record}</div>
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Record</div>
                            </div>
                          )}
                          {(champion.details?.pointsFor ?? 0) > 0 && (
                            <div className="text-right">
                              <div className="font-display font-bold text-sm text-foreground">
                                {Math.round(champion.details!.pointsFor as number)}
                              </div>
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Pts For</div>
                            </div>
                          )}
                        </div>

                        {/* Runner-up */}
                        {runnerUp && (
                          <div className="hidden md:flex items-center gap-2.5 shrink-0 pl-4 border-l border-border">
                            <Avatar avatarId={runnerUp.avatar} size={28} className="rounded-lg shrink-0" />
                            <div>
                              <div className="text-xs font-medium text-foreground truncate max-w-[90px]">{runnerUp.username}</div>
                              <div className="text-[10px] text-muted-foreground">Runner-up</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>

          {/* ══ Record Book ══════════════════════════════════════════════ */}
          <div className={`space-y-4 ${activeTab !== 'records' ? 'hidden' : ''}`}>

              {/* Category pills (horizontal scroll) */}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                {RECORD_CATEGORIES.map(cat => {
                  const CatIcon = cat.icon;
                  return (
                    <button
                      key={cat.type}
                      onClick={() => setActiveRecord(cat.type)}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                        activeRecord === cat.type
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-muted-foreground border-border hover:text-foreground'
                      }`}
                    >
                      <CatIcon className="h-3.5 w-3.5 shrink-0" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              {/* Leaderboard */}
              <div className="space-y-1.5">
                  {categoryRecords.length === 0 ? (
                    <div className="text-center py-16">
                      <ActiveCategoryIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground">No records for this category yet</p>
                    </div>
                  ) : (
                    categoryRecords.map((record, i) => {
                      const rank    = record.contextualRank ?? i + 1;
                      const isFirst = rank === 1;

                      const displayValue =
                        activeCategory.unit === 'pts'    ? formatPoints(record.value) :
                        activeCategory.unit === 'margin' ? record.value.toFixed(2)    :
                                                           String(record.value);

                      const barWidth = activeCategory.higher
                        ? ((record.value - catMin) / catRange) * 100
                        : ((catMax - record.value) / catRange) * 100;

                      return (
                        <div
                          key={`${record.season}-${record.type}-${record.userId}-${record.week ?? 'season'}`}
                          className={`flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-colors ${
                            isFirst
                              ? 'border-amber-500/20 bg-amber-500/[0.03]'
                              : 'border-border bg-card hover:bg-accent/30'
                          }`}
                        >
                          <RankBadge rank={rank} />
                          <Avatar avatarId={record.avatar} size={34} className="rounded-lg shrink-0" />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-foreground">{record.username}</span>
                              {record.isPlayoff && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                                  Playoffs
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>{record.season}{record.week ? ` · Week ${record.week}` : ''}</span>
                              {record.details?.opponent && (
                                <span className="text-muted-foreground/60">vs {record.details.opponent}</span>
                              )}
                              {record.details?.winnerScore !== undefined && record.details?.loserScore !== undefined && (
                                <span className="text-muted-foreground/60 font-mono">
                                  {record.details.winnerScore.toFixed(1)}–{record.details.loserScore.toFixed(1)}
                                </span>
                              )}
                            </div>

                            {/* Relative bar */}
                            <div className="mt-2 h-0.5 w-32 md:w-56 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isFirst ? 'bg-amber-500' : 'bg-primary/50'}`}
                                style={{ width: `${Math.max(barWidth, 6)}%` }}
                              />
                            </div>
                          </div>

                          {/* Value */}
                          <div className="text-right shrink-0">
                            <div className={`font-display text-xl font-bold tabular-nums ${isFirst ? 'text-amber-500' : 'text-foreground'}`}>
                              {displayValue}
                            </div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                              {activeCategory.unit || 'record'}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
              </div>

          </div>

          {/* ══ Activity ═════════════════════════════════════════════════ */}
          <div className={activeTab !== 'activity' ? 'hidden' : ''}>
            <TransactionActivity historyData={historyData} />
          </div>

      </div>
    </div>
  );
}
