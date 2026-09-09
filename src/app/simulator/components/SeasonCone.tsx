'use client';

/**
 * The Cone: where a team's record is heading, and how wide the uncertainty is.
 *
 * Real banked wins are drawn as a solid line up to today. From there the shape
 * opens into the 10th-to-90th percentile band of simulated finishes, with the
 * median running through it. Hand rolled SVG rather than a chart library, so it
 * inherits the palette straight from the admin panel and adds nothing to the
 * bundle.
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Eyebrow } from './shared';
import type { SimLeague, TeamOutcome } from '@/lib/sim/types';

interface Props {
  league: SimLeague;
  outcome: TeamOutcome;
  teamName: string;
  maxWins: number;
}

const W = 720, H = 240, PAD_L = 34, PAD_R = 14, PAD_T = 14, PAD_B = 26;

export default function SeasonCone({ league, outcome, teamName, maxWins }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const { path, band, actual, xOf, yOf, weeks, startWins } = useMemo(() => {
    const cone = outcome.cone;
    const firstWeek = cone.length ? cone[0].week : league.weeksPlayed + 1;
    const lastWeek  = league.regularSeasonWeeks;
    const startWeek = Math.max(0, firstWeek - 1);

    const xOf = (wk: number) =>
      PAD_L + ((wk - startWeek) / Math.max(1, lastWeek - startWeek)) * (W - PAD_L - PAD_R);
    const yOf = (wins: number) =>
      H - PAD_B - (wins / Math.max(1, maxWins)) * (H - PAD_T - PAD_B);

    // Wins already banked, the anchor the cone grows out of.
    const startWins = outcome.cone.length
      ? league.teams.find(t => t.rosterId === outcome.rosterId)!.wins
      : 0;

    const pts = [{ week: startWeek, p10: startWins, p50: startWins, p90: startWins }, ...cone];
    const line = (key: 'p10' | 'p50' | 'p90') =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.week).toFixed(1)},${yOf(p[key]).toFixed(1)}`).join(' ');

    const upper = pts.map(p => `${xOf(p.week).toFixed(1)},${yOf(p.p90).toFixed(1)}`);
    const lower = [...pts].reverse().map(p => `${xOf(p.week).toFixed(1)},${yOf(p.p10).toFixed(1)}`);

    return {
      path: line('p50'),
      band: `M${upper.join(' L')} L${lower.join(' L')} Z`,
      actual: startWins,
      xOf, yOf,
      weeks: pts,
      startWins,
    };
  }, [outcome, league, maxWins]);

  const hovered = hover === null ? null : weeks.find(w => w.week === hover) ?? null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Eyebrow>The cone</Eyebrow>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{teamName}</p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Shaded band holds 80% of simulated seasons
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Projected win total for ${teamName} through week ${league.regularSeasonWeeks}`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Horizontal guides at sensible win totals. */}
        {Array.from({ length: 5 }, (_, i) => {
          const wins = Math.round((maxWins / 4) * i);
          return (
            <g key={i}>
              <line
                x1={PAD_L} x2={W - PAD_R} y1={yOf(wins)} y2={yOf(wins)}
                stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="2 4"
              />
              <text
                x={PAD_L - 6} y={yOf(wins) + 3} textAnchor="end"
                className="fill-muted-foreground" style={{ fontSize: 9 }}
              >
                {wins}
              </text>
            </g>
          );
        })}

        {/* The band, then the median through it. */}
        <path d={band} fill="hsl(var(--primary) / 0.16)" />
        <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" />

        {/* Where the real season ends and the simulation begins. */}
        {league.weeksPlayed > 0 && (
          <>
            <line
              x1={xOf(league.weeksPlayed)} x2={xOf(league.weeksPlayed)}
              y1={PAD_T} y2={H - PAD_B}
              stroke="hsl(var(--foreground) / 0.35)" strokeWidth={1}
            />
            <text
              x={xOf(league.weeksPlayed) + 4} y={PAD_T + 9}
              className="fill-muted-foreground" style={{ fontSize: 9 }}
            >
              now
            </text>
          </>
        )}
        <circle cx={xOf(weeks[0].week)} cy={yOf(actual)} r={3.5} fill="hsl(var(--primary))" />

        {/* Week ticks plus an invisible hit target for each. */}
        {weeks.slice(1).map(w => (
          <g key={w.week}>
            <rect
              x={xOf(w.week) - 10} y={PAD_T} width={20} height={H - PAD_T - PAD_B}
              fill="transparent" onMouseEnter={() => setHover(w.week)}
            />
            {w.week % 2 === 0 && (
              <text
                x={xOf(w.week)} y={H - PAD_B + 13} textAnchor="middle"
                className="fill-muted-foreground" style={{ fontSize: 9 }}
              >
                {w.week}
              </text>
            )}
          </g>
        ))}

        {hovered && (
          <g>
            <line
              x1={xOf(hovered.week)} x2={xOf(hovered.week)} y1={PAD_T} y2={H - PAD_B}
              stroke="hsl(var(--primary) / 0.5)" strokeWidth={1}
            />
            <circle cx={xOf(hovered.week)} cy={yOf(hovered.p50)} r={3.5} fill="hsl(var(--primary))" />
          </g>
        )}
      </svg>

      <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums">
        <span className="text-muted-foreground">
          {hovered ? `Week ${hovered.week}` : `Through week ${league.regularSeasonWeeks}`}
        </span>
        <span className="text-foreground">
          {hovered
            ? `${hovered.p10} to ${hovered.p90} wins, median ${hovered.p50}`
            : `${outcome.p5Wins} to ${outcome.p95Wins} wins, median ${Math.round(outcome.avgWins)}`}
        </span>
      </div>
    </div>
  );
}
