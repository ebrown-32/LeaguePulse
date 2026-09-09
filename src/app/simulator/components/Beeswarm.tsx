'use client';

/**
 * Every simulated season as one dot.
 *
 * A percentage tells you the answer; this tells you the shape of it. Six
 * hundred dots is enough to read the distribution's weight and its tails at a
 * glance, and few enough to lay out without a force simulation: dots are
 * bucketed by win total and stacked, which is deterministic and instant.
 */

import { useMemo } from 'react';
import { Eyebrow } from './shared';
import type { TeamOutcome } from '@/lib/sim/types';

interface Props {
  outcome: TeamOutcome;
  maxWins: number;
  /** Wins needed to make the field in the median run, for the marker line. */
  cutoffWins: number | null;
  teamName: string;
}

const W = 720, H = 150, PAD_L = 8, PAD_R = 8, PAD_B = 24, PAD_T = 10;

export default function Beeswarm({ outcome, maxWins, cutoffWins, teamName }: Props) {
  const { dots, xOf } = useMemo(() => {
    const xOf = (wins: number) =>
      PAD_L + (wins / Math.max(1, maxWins)) * (W - PAD_L - PAD_R);

    // Tallest column decides the spacing, so the cloud always fits its box.
    // Fixed spacing looked right for a flat distribution and shot straight out
    // of the frame for a peaked one.
    const tally = new Map<number, number>();
    for (const w of outcome.sampleWins) {
      const k = Math.round(w);
      tally.set(k, (tally.get(k) ?? 0) + 1);
    }
    const tallest = Math.max(1, ...tally.values());
    const usable = (H - PAD_T - PAD_B) / 2;
    const gap = Math.min(4.2, usable / Math.max(1, Math.ceil(tallest / 2)));

    // Stack within each win total, alternating above and below the axis so the
    // cloud grows symmetrically rather than hanging off one edge.
    const counts = new Map<number, number>();
    const mid = PAD_T + (H - PAD_T - PAD_B) / 2;
    const dots = outcome.sampleWins.map(w => {
      const k = Math.round(w);
      const n = counts.get(k) ?? 0;
      counts.set(k, n + 1);
      const rank = Math.ceil(n / 2);
      const dir  = n % 2 === 0 ? -1 : 1;
      return { x: xOf(k), y: mid + dir * rank * gap, w: k };
    });
    return { dots, xOf };
  }, [outcome.sampleWins, maxWins]);

  const made = cutoffWins === null ? null
    : outcome.sampleWins.filter(w => w >= cutoffWins).length / Math.max(1, outcome.sampleWins.length);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Eyebrow>Every simulated season</Eyebrow>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{teamName}</p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {outcome.sampleWins.length} runs shown, evenly sampled
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label={`Distribution of simulated final win totals for ${teamName}`}
      >
        {cutoffWins !== null && (
          <>
            <line
              x1={xOf(cutoffWins)} x2={xOf(cutoffWins)} y1={PAD_T} y2={H - PAD_B}
              stroke="hsl(var(--foreground) / 0.4)" strokeWidth={1} strokeDasharray="3 3"
            />
            {/* No label on the line itself. At the top it ran through the
                tallest column of dots, and on the baseline it collided with the
                axis numbers, so the caption below names it instead. */}
          </>
        )}

        {dots.map((d, i) => (
          <circle
            key={i} cx={d.x} cy={d.y} r={1.9}
            fill={cutoffWins !== null && d.w >= cutoffWins
              ? 'hsl(var(--primary) / 0.75)'
              : 'hsl(var(--muted-foreground) / 0.35)'}
          />
        ))}

        {Array.from({ length: 8 }, (_, i) => {
          const wins = Math.round((maxWins / 7) * i);
          return (
            <text
              key={i} x={xOf(wins)} y={H - PAD_B + 14} textAnchor="middle"
              className="fill-muted-foreground" style={{ fontSize: 9 }}
            >
              {wins}
            </text>
          );
        })}
      </svg>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">
          Final wins
          {cutoffWins !== null && (
            <span className="ml-2">
              <span className="mr-1 inline-block h-px w-3 align-middle border-t border-dashed border-foreground/40" />
              cut is around {cutoffWins}
            </span>
          )}
        </span>
        <span className="tabular-nums text-foreground">
          Best run {outcome.bestUniverse.wins}, worst run {outcome.worstUniverse.wins}
          {made !== null && <span className="ml-2 text-muted-foreground">
            {Math.round(made * 100)}% clear it
          </span>}
        </span>
      </div>
    </div>
  );
}
