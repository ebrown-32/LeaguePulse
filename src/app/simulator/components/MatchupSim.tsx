'use client';

/**
 * Win Probability, on the real schedule.
 *
 * Pick a week, and these are the games that are actually being played that
 * week. An earlier version let you pair any two teams together, which was a
 * mistake: the league has a real schedule, and "who wins my game on Sunday" is
 * the question people actually have. Free pairing is still here behind a
 * toggle, for the "how would I do against the best team" question.
 *
 * The detail view puts both score distributions on one axis with the contested
 * range hatched. That band is the point: its width is what "coin flip" looks
 * like.
 */

import { useEffect, useMemo, useState } from 'react';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { Eyebrow, RollingPct, TeamChips } from './shared';
import { RotateCcw, CalendarDays, Users } from 'lucide-react';
import type { SimLeague, MatchupSimResult, MatchupSimRequest, SimTeam } from '@/lib/sim/types';

interface Props {
  league: SimLeague;
  runMatchup: (r: MatchupSimRequest) => Promise<MatchupSimResult | null>;
}

const W = 720, H = 210, PAD_L = 10, PAD_R = 10, PAD_T = 12, PAD_B = 26;
const ITER = 10000;
const SEED = 987654;

export default function MatchupSim({ league, runMatchup }: Props) {
  const teams = league.teams;

  /**
   * A team's expected score for one week.
   *
   * This is where Sleeper's weekly projections earn their keep: a team missing
   * three starters to byes should not be simulated at its season average in
   * that specific game. Free pairing has no week, so it falls back to the level.
   */
  const meanFor = (t: SimTeam, wk: number | null) =>
    (wk !== null ? t.weeklyMean?.[wk] : undefined) ?? t.mean;
  const byRoster = useMemo(
    () => new Map(teams.map(t => [t.rosterId, t])), [teams]);

  const weeks = useMemo(
    () => [...new Set(league.remaining.map(g => g.week))].sort((a, b) => a - b),
    [league.remaining],
  );

  const [mode, setMode] = useState<'schedule' | 'custom'>('schedule');
  const [week, setWeek] = useState(weeks[0] ?? 1);
  const [pickIdx, setPickIdx] = useState(0);
  const [aAdj, setAAdj] = useState(0);
  const [bAdj, setBAdj] = useState(0);

  // Free-pairing selections, only used in custom mode.
  const [customA, setCustomA] = useState(teams[0]?.rosterId ?? 0);
  const [customB, setCustomB] = useState(teams[1]?.rosterId ?? 0);

  const weekGames = useMemo(
    () => league.remaining.filter(g => g.week === week),
    [league.remaining, week],
  );

  // Which two teams the detail view is about.
  const pair = useMemo(() => {
    if (mode === 'custom') {
      return { a: byRoster.get(customA), b: byRoster.get(customB) };
    }
    const g = weekGames[Math.min(pickIdx, weekGames.length - 1)];
    return g
      ? { a: byRoster.get(g.homeRosterId), b: byRoster.get(g.awayRosterId) }
      : { a: undefined, b: undefined };
  }, [mode, weekGames, pickIdx, customA, customB, byRoster]);

  // Odds for every game in the week, so the list itself is informative rather
  // than being a menu you have to click through one at a time.
  const [weekOdds, setWeekOdds] = useState<(MatchupSimResult | null)[]>([]);
  useEffect(() => {
    if (mode !== 'schedule' || weekGames.length === 0) { setWeekOdds([]); return; }
    let live = true;
    Promise.all(weekGames.map(g => {
      const a = byRoster.get(g.homeRosterId), b = byRoster.get(g.awayRosterId);
      if (!a || !b) return Promise.resolve(null);
      return runMatchup({
        a: { mean: meanFor(a, g.week), sd: a.sd },
        b: { mean: meanFor(b, g.week), sd: b.sd },
        residuals: league.residuals, iterations: ITER, seed: SEED,
      });
    })).then(rs => { if (live) setWeekOdds(rs); });
    return () => { live = false; };
  }, [mode, weekGames, byRoster, league.residuals, runMatchup]);

  // Reset adjustments whenever the game being examined changes, otherwise a
  // slider left at +30 silently follows you to the next matchup.
  useEffect(() => { setAAdj(0); setBAdj(0); }, [week, pickIdx, mode, customA, customB]);

  const [detail, setDetail] = useState<MatchupSimResult | null>(null);
  useEffect(() => {
    const { a, b } = pair;
    if (!a || !b) { setDetail(null); return; }
    let live = true;
    const wk = mode === 'schedule' ? week : null;
    runMatchup({
      a: { mean: meanFor(a, wk) + aAdj, sd: a.sd },
      b: { mean: meanFor(b, wk) + bAdj, sd: b.sd },
      residuals: league.residuals, iterations: ITER, seed: SEED,
    }).then(r => { if (live && r) setDetail(r); });
    return () => { live = false; };
  }, [pair, aAdj, bAdj, mode, week, league.residuals, runMatchup]);

  const chart = useMemo(() => {
    if (!detail) return null;
    const bins = detail.aBins.length;
    const peak = Math.max(...detail.aBins, ...detail.bBins) || 1;
    const xOf = (i: number) => PAD_L + (i / (bins - 1)) * (W - PAD_L - PAD_R);
    const yOf = (v: number) => H - PAD_B - (v / peak) * (H - PAD_T - PAD_B);

    // Cosmetic smoothing. The histogram is visibly jagged at ten thousand
    // draws and the reader is here for the shape, not the sampling noise.
    const once = (arr: number[]) => arr.map((_, i) => {
      const l = arr[i - 1] ?? arr[i], r = arr[i + 1] ?? arr[i];
      return (l + arr[i] * 2 + r) / 4;
    });
    const area = (arr: number[]) => {
      const s = once(once(once(arr)));
      const top = s.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' L');
      return `M${xOf(0).toFixed(1)},${(H - PAD_B).toFixed(1)} L${top} L${xOf(bins - 1).toFixed(1)},${(H - PAD_B).toFixed(1)} Z`;
    };
    const overlap = detail.aBins.map((v, i) => Math.min(v, detail.bBins[i]));
    return {
      aPath: area(detail.aBins), bPath: area(detail.bBins), oPath: area(overlap),
      xOf, bins, scoreAt: (i: number) => detail.binStart + i * detail.binWidth,
    };
  }, [detail]);

  const { a, b } = pair;

  return (
    <div className="space-y-4">
      {/* Mode + week */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow>Pick a game</Eyebrow>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {mode === 'schedule'
                ? 'These are the real matchups on the schedule.'
                : 'Any two teams, whether or not they actually play.'}
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {([['schedule', 'Schedule', CalendarDays], ['custom', 'Any two', Users]] as const)
              .map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  mode === id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'schedule' ? (
          <>
            <div className="mt-3 flex flex-wrap gap-1">
              {weeks.map(w => (
                <button
                  key={w}
                  onClick={() => { setWeek(w); setPickIdx(0); }}
                  aria-pressed={week === w}
                  className={cn(
                    'min-w-[34px] rounded-md border px-1.5 py-1 text-[11px] font-semibold tabular-nums transition-colors',
                    week === w
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {w}
                </button>
              ))}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {weekGames.map((g, i) => {
                const ha = byRoster.get(g.homeRosterId), aw = byRoster.get(g.awayRosterId);
                if (!ha || !aw) return null;
                const odds = weekOdds[i];
                const active = pickIdx === i;
                const homeFav = (odds?.aWinOdds ?? 0.5) >= 0.5;
                return (
                  <button
                    key={i}
                    onClick={() => setPickIdx(i)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-lg border p-2.5 text-left transition-colors',
                      active ? 'border-primary bg-primary/[0.06]' : 'border-border hover:border-primary/40',
                    )}
                  >
                    {([
                      { t: ha, pct: odds?.aWinOdds, fav: homeFav },
                      { t: aw, pct: odds?.bWinOdds, fav: !homeFav },
                    ] as { t: SimTeam; pct: number | undefined; fav: boolean }[])
                      .map(({ t, pct, fav }, k) => (
                        <div key={k} className={cn('flex items-center gap-2', k === 0 && 'mb-1.5')}>
                          <Avatar avatarId={t.avatar} size={20} className="shrink-0 rounded-md" />
                          <span className={cn(
                            'min-w-0 flex-1 truncate text-[12px]',
                            fav ? 'font-bold text-foreground' : 'text-muted-foreground',
                          )}>
                            {t.teamName}
                          </span>
                          <span className={cn(
                            'shrink-0 text-[12px] tabular-nums',
                            fav ? 'font-bold text-foreground' : 'text-muted-foreground',
                          )}>
                            {pct === undefined ? '--' : `${(pct * 100).toFixed(0)}%`}
                          </span>
                        </div>
                      ))}
                  </button>
                );
              })}
              {weekGames.length === 0 && (
                <p className="col-span-full py-6 text-center text-[13px] text-muted-foreground">
                  No games left to simulate. The regular season is complete.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <TeamChips label="Team one" teams={teams} value={customA}
                       onChange={setCustomA} disabledId={customB} />
            <TeamChips label="Team two" teams={teams} value={customB}
                       onChange={setCustomB} disabledId={customA} />
          </div>
        )}
      </div>

      {a && b && (
        <>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <Eyebrow>Win probability</Eyebrow>
              {mode === 'schedule' && (
                <span className="text-[11px] text-muted-foreground">Week {week}</span>
              )}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="flex items-center gap-2">
                <Avatar avatarId={a.avatar} size={30} className="shrink-0 rounded-lg" />
                <div className="min-w-0">
                  <RollingPct value={detail?.aWinOdds ?? 0}
                              className="text-[26px] font-bold leading-none text-foreground" />
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {a.teamName}
                    <span className="ml-1.5 tabular-nums">median {detail?.aMedian.toFixed(1) ?? '--'}</span>
                  </p>
                </div>
              </div>

              <div className="hidden px-2 text-center sm:block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">vs</span>
              </div>

              <div className="flex items-center gap-2 sm:flex-row-reverse sm:text-right">
                <Avatar avatarId={b.avatar} size={30} className="shrink-0 rounded-lg" />
                <div className="min-w-0">
                  <RollingPct value={detail?.bWinOdds ?? 0}
                              className="text-[26px] font-bold leading-none text-foreground" />
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {b.teamName}
                    <span className="ml-1.5 tabular-nums">median {detail?.bMedian.toFixed(1) ?? '--'}</span>
                  </p>
                </div>
              </div>
            </div>

            {chart && detail && (
              <svg
                viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full"
                style={{ aspectRatio: `${W} / ${H}` }}
                role="img"
                aria-label={`Simulated score distributions for ${a.teamName} and ${b.teamName}`}
              >
                <defs>
                  <pattern id="sim-overlap" width="6" height="6" patternUnits="userSpaceOnUse"
                           patternTransform="rotate(45)">
                    <rect width="6" height="6" fill="hsl(var(--primary) / 0.14)" />
                    <line x1="0" y1="0" x2="0" y2="6"
                          stroke="hsl(var(--primary) / 0.55)" strokeWidth={1.6} />
                  </pattern>
                </defs>
                <path d={chart.aPath} fill="hsl(var(--primary) / 0.22)"
                      stroke="hsl(var(--primary))" strokeWidth={1.75} />
                <path d={chart.bPath} fill="hsl(var(--foreground) / 0.10)"
                      stroke="hsl(var(--foreground) / 0.5)" strokeWidth={1.75} strokeDasharray="4 3" />
                <path d={chart.oPath} fill="url(#sim-overlap)" />

                {Array.from({ length: 6 }, (_, i) => {
                  const bin = Math.round((chart.bins - 1) * (i / 5));
                  return (
                    <text key={i} x={chart.xOf(bin)} y={H - PAD_B + 14} textAnchor="middle"
                          className="fill-muted-foreground" style={{ fontSize: 9 }}>
                      {Math.round(chart.scoreAt(bin))}
                    </text>
                  );
                })}
              </svg>
            )}

            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[11px]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-muted-foreground">Points scored</span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="inline-block h-0 w-4 border-t-2 border-[hsl(var(--primary))]" />
                  <span className="max-w-[100px] truncate">{a.teamName}</span>
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="inline-block h-0 w-4 border-t-2 border-dashed border-foreground/50" />
                  <span className="max-w-[100px] truncate">{b.teamName}</span>
                </span>
              </div>
              {detail && (
                <span className="text-foreground">
                  Typical margin {detail.medianMargin.toFixed(1)}
                  <span className="ml-2 text-muted-foreground">hatched band is where either team wins</span>
                </span>
              )}
            </div>
          </div>

          {/* What-if sliders */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Eyebrow>Adjust</Eyebrow>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Shift a team&apos;s expected score to stand in for an injury, a bench call, or a hot streak.
                </p>
              </div>
              {(aAdj !== 0 || bAdj !== 0) && (
                <button
                  onClick={() => { setAAdj(0); setBAdj(0); }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </button>
              )}
            </div>

            <div className="mt-4 space-y-4">
              {([[a, aAdj, setAAdj], [b, bAdj, setBAdj]] as const).map(([team, adj, set], i) => (
                <div key={i}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="truncate text-[12px] font-medium text-foreground">{team.teamName}</span>
                    <span className={cn(
                      'text-[12px] font-bold tabular-nums',
                      adj > 0 ? 'text-emerald-500' : adj < 0 ? 'text-red-500' : 'text-muted-foreground',
                    )}>
                      {adj > 0 ? '+' : ''}{adj} pts
                    </span>
                  </div>
                  <input
                    type="range" min={-40} max={40} step={1} value={adj}
                    onChange={e => set(Number(e.target.value))}
                    aria-label={`Adjust ${team.teamName} expected score`}
                    className="w-full accent-[hsl(var(--primary))]"
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
