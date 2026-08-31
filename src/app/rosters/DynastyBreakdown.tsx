'use client';

import { useMemo } from 'react';
import { POSITION_COLOR } from './positions';
import { cn } from '@/lib/utils';
import type { AnalysisPlayer } from '@/app/api/rosters/analysis/route';

/**
 * Where a roster's dynasty value actually sits.
 *
 * Built on Sleeper's published dynasty startup ADP, which is a real market
 * price rather than anything computed here. That matters: dynasty worth is not
 * this year's projection, it is what the rest of the world would pay knowing a
 * player's age and situation, and inventing a score out of age and points
 * would be a guess dressed up as a number.
 *
 * ADP counts downward, so a lower number is a better asset. Every chart below
 * inverts it for display and says so, and a player Sleeper prices at nothing
 * is left out of the value charts rather than treated as worthless.
 */

/** Dynasty windows. Coarse on purpose: the question is which side of the
 *  curve a roster sits on, not whether someone is 26 or 27. */
const BANDS = [
  { key: 'young',  label: '24 and under', min: 0,  max: 24, color: '#10b981' },
  { key: 'prime',  label: '25 to 27',     min: 25, max: 27, color: '#0ea5e9' },
  { key: 'late',   label: '28 to 30',     min: 28, max: 30, color: '#f59e0b' },
  { key: 'old',    label: '31 and over',  min: 31, max: 99, color: '#f43f5e' },
] as const;

function bandOf(age: number | null) {
  if (age == null) return null;
  return BANDS.find(b => age >= b.min && age <= b.max) ?? null;
}

/** Top of the dynasty market. A startup draft in an 8 team league is ~200
 *  picks, so the top 100 is roughly "a starter somebody would want". */
const ELITE = 50;
const NOTABLE = 150;

export default function DynastyBreakdown({
  squad, league, teamName,
}: {
  squad: AnalysisPlayer[];
  /** Every rostered player in the league, for the comparison line. */
  league: AnalysisPlayer[];
  teamName: string;
}) {
  const priced = useMemo(
    () => squad.filter(p => p.dynastyAdp != null)
      .sort((a, b) => (a.dynastyAdp as number) - (b.dynastyAdp as number)),
    [squad],
  );

  const byBand = useMemo(() => BANDS.map(band => {
    const inBand = priced.filter(p => bandOf(p.age)?.key === band.key);
    return {
      ...band,
      total: inBand.length,
      elite: inBand.filter(p => (p.dynastyAdp as number) <= ELITE).length,
      notable: inBand.filter(p => (p.dynastyAdp as number) <= NOTABLE).length,
    };
  }), [priced]);

  const byPosition = useMemo(() => {
    const positions = ['QB', 'RB', 'WR', 'TE'];
    return positions.map(pos => ({
      pos,
      notable: priced.filter(p => p.position === pos && (p.dynastyAdp as number) <= NOTABLE).length,
      best: priced.find(p => p.position === pos) ?? null,
    }));
  }, [priced]);

  const eliteCount = priced.filter(p => (p.dynastyAdp as number) <= ELITE).length;
  const notableCount = priced.filter(p => (p.dynastyAdp as number) <= NOTABLE).length;

  /** Average age of the assets that actually carry the value. */
  const coreAge = useMemo(() => {
    const ages = priced.slice(0, 10).map(p => p.age).filter((a): a is number => a != null);
    return ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : null;
  }, [priced]);

  /** The same figure for every team, so "young" has something to mean. */
  const leagueCoreAge = useMemo(() => {
    const byTeam = new Map<number, AnalysisPlayer[]>();
    for (const p of league) {
      if (p.dynastyAdp == null) continue;
      byTeam.set(p.rosterId, [...(byTeam.get(p.rosterId) ?? []), p]);
    }
    const ages: number[] = [];
    for (const list of byTeam.values()) {
      const top = [...list].sort((a, b) => (a.dynastyAdp as number) - (b.dynastyAdp as number)).slice(0, 10);
      const a = top.map(p => p.age).filter((x): x is number => x != null);
      if (a.length) ages.push(a.reduce((s, x) => s + x, 0) / a.length);
    }
    return ages.length ? ages.reduce((s, x) => s + x, 0) / ages.length : null;
  }, [league]);

  if (!priced.length) {
    return (
      <section className="lp-glass rounded-xl border p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Sleeper publishes no dynasty prices for anyone on this roster.
        </p>
      </section>
    );
  }

  const maxBand = Math.max(1, ...byBand.map(b => b.total));
  const topTen = priced.slice(0, 10);
  const worstAdp = Math.max(...topTen.map(p => p.dynastyAdp as number));

  return (
    <div className="space-y-4">
      {/* ── Headline read ───────────────────────────────────────────── */}
      <section className="lp-glass rounded-xl border p-4">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Dynasty value
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div>
            <p className="font-display text-2xl font-bold tabular-nums text-foreground">{eliteCount}</p>
            <p className="text-[10px] text-muted-foreground">top {ELITE} assets</p>
          </div>
          <div>
            <p className="font-display text-2xl font-bold tabular-nums text-foreground">{notableCount}</p>
            <p className="text-[10px] text-muted-foreground">top {NOTABLE} assets</p>
          </div>
          <div>
            <p className="font-display text-2xl font-bold tabular-nums text-foreground">
              {coreAge ? coreAge.toFixed(1) : '–'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              age of top 10
              {leagueCoreAge != null && coreAge != null && (() => {
                // Half a year either side is the same roster in practice, and
                // calling a 0.1 gap "older" made every team look distinctive
                // when almost none of them are.
                const gap = coreAge - leagueCoreAge;
                if (Math.abs(gap) < 0.5) {
                  return <span className="ml-1 font-semibold text-muted-foreground">in line</span>;
                }
                return (
                  <span className={cn('ml-1 font-semibold', gap < 0 ? 'text-emerald-500' : 'text-amber-500')}>
                    {gap < 0 ? 'younger' : 'older'}
                  </span>
                );
              })()}
            </p>
          </div>
        </div>
        {leagueCoreAge != null && (
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            The league averages {leagueCoreAge.toFixed(1)} across its ten most valuable
            players. {teamName} is at {coreAge?.toFixed(1) ?? '–'}.
          </p>
        )}
      </section>

      {/* ── Value by age ────────────────────────────────────────────── */}
      <section className="lp-glass overflow-hidden rounded-xl border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Where the value sits
          </h2>
        </div>
        <div className="space-y-3 p-4">
          {byBand.map(b => (
            <div key={b.key}>
              <div className="mb-1 flex items-baseline justify-between text-[11px]">
                <span className="font-semibold text-foreground">{b.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {b.total} player{b.total === 1 ? '' : 's'}
                  {b.notable > 0 && `, ${b.notable} in the top ${NOTABLE}`}
                </span>
              </div>
              {/* The full bar is everyone in the band; the solid part is the
                  ones the market actually rates. A roster can be young and
                  still hold nothing anybody wants, and that gap is the point. */}
              <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full opacity-30"
                  style={{ width: `${(b.total / maxBand) * 100}%`, backgroundColor: b.color }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${(b.notable / maxBand) * 100}%`, backgroundColor: b.color }}
                />
              </div>
            </div>
          ))}
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Faded is everyone on the roster in that age range. Solid is the ones
            inside the dynasty top {NOTABLE}.
          </p>
        </div>
      </section>

      {/* ── The assets themselves ───────────────────────────────────── */}
      <section className="lp-glass overflow-hidden rounded-xl border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Most valuable assets
          </h2>
        </div>
        <div className="space-y-2 p-4">
          {topTen.map(p => {
            const adp = p.dynastyAdp as number;
            // Longest bar is the best asset. Scaled against the tenth so the
            // shape of a roster's top end is visible rather than everything
            // being pinned near the same length.
            const width = Math.max(6, ((worstAdp - adp) / Math.max(1, worstAdp - (topTen[0].dynastyAdp as number))) * 92 + 8);
            const band = bandOf(p.age);
            return (
              <div key={p.playerId} className="flex items-center gap-2">
                <span
                  className="w-7 shrink-0 text-center text-[9px] font-bold"
                  style={{ color: POSITION_COLOR[p.position] ?? POSITION_COLOR.DEFAULT }}
                >
                  {p.position}
                </span>
                <span className="relative h-5 flex-1 overflow-hidden rounded-md bg-muted/60">
                  <span
                    className="absolute inset-y-0 left-0 rounded-md opacity-80"
                    style={{ width: `${width}%`, backgroundColor: band?.color ?? '#94a3b8' }}
                  />
                  <span className="absolute inset-y-0 left-2 flex items-center truncate text-[11px] font-semibold text-foreground">
                    {p.name}
                  </span>
                </span>
                <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                  {p.age ?? '–'}
                </span>
                <span className="w-10 shrink-0 text-right text-[11px] font-bold tabular-nums text-foreground">
                  {adp.toFixed(0)}
                </span>
              </div>
            );
          })}
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Bars are coloured by age band. The right hand number is dynasty startup
            ADP, so lower is better and a longer bar is the more valuable asset.
          </p>
        </div>
      </section>

      {/* ── Value by position ───────────────────────────────────────── */}
      <section className="lp-glass overflow-hidden rounded-xl border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            By position
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          {byPosition.map(({ pos, notable, best }) => (
            <div key={pos} className="rounded-lg border border-border p-3">
              <span
                className="inline-flex h-6 items-center rounded px-2 text-[10px] font-bold text-white"
                style={{ backgroundColor: POSITION_COLOR[pos] }}
              >
                {pos}
              </span>
              <p className="mt-2 font-display text-xl font-bold tabular-nums text-foreground">
                {notable}
              </p>
              <p className="text-[10px] text-muted-foreground">in the top {NOTABLE}</p>
              {best && (
                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                  best: <span className="text-foreground">{best.name}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
        Dynasty value here is Sleeper&apos;s published startup ADP, a market price
        that already accounts for age and situation. Nothing on this page computes
        a value score of its own. {squad.length - priced.length} player
        {squad.length - priced.length === 1 ? ' has' : 's have'} no dynasty price and
        {squad.length - priced.length === 1 ? ' is' : ' are'} left out of these charts.
      </p>
    </div>
  );
}
