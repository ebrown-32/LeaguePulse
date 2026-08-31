'use client';

import { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, ResponsiveContainer, Cell,
  Tooltip, ReferenceLine,
} from 'recharts';
import { POSITION_COLOR } from './positions';
import type { AnalysisPlayer } from '@/app/api/rosters/analysis/route';

/**
 * Two attributes plotted against each other, one dot per player.
 *
 * The axes are the reader's to choose. A fixed chart answers one question; the
 * point of this page is the questions nobody thought to precompute, and age
 * against projection, weight against production and price against output are
 * different arguments about the same roster.
 *
 * Median lines rather than a trend line: with two hundred points a regression
 * implies a model, and the useful read here is simply which quadrant a player
 * sits in. Older and still projected well is a different asset from young and
 * cheap, and the crosshair is what makes that legible.
 */

export type Axis = 'age' | 'weight' | 'height' | 'yearsExp' | 'points'
  | 'pointsPerGame' | 'projectedPoints' | 'adp';

export const AXIS_LABEL: Record<Axis, string> = {
  age: 'Age',
  weight: 'Weight (lb)',
  height: 'Height (in)',
  yearsExp: 'Experience (yrs)',
  points: 'Points last season',
  pointsPerGame: 'Points per game',
  projectedPoints: 'Projected points',
  adp: 'Draft position (ADP)',
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export default function RosterScatter({
  players, x, y, onPick,
}: {
  players: AnalysisPlayer[];
  x: Axis;
  y: Axis;
  onPick: (p: AnalysisPlayer) => void;
}) {
  // A player missing either axis cannot be placed. Dropping them is honest;
  // plotting them at zero would invent a data point.
  const data = useMemo(
    () => players
      .filter(p => p[x] != null && p[y] != null)
      .map(p => ({ ...p, _x: p[x] as number, _y: p[y] as number })),
    [players, x, y],
  );

  const mx = useMemo(() => median(data.map(d => d._x)), [data]);
  const my = useMemo(() => median(data.map(d => d._y)), [data]);

  const missing = players.length - data.length;

  if (!data.length) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-border">
        <p className="px-6 text-center text-xs text-muted-foreground">
          No player has both {AXIS_LABEL[x].toLowerCase()} and {AXIS_LABEL[y].toLowerCase()} on record.
        </p>
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 28, left: 4 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} />
          <XAxis
            type="number" dataKey="_x" name={AXIS_LABEL[x]}
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
            label={{
              value: AXIS_LABEL[x], position: 'insideBottom', offset: -16,
              style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' },
            }}
            // ADP counts the right way round: pick 1 is the most valuable, so
            // a plain ascending axis would put the best players at the far end
            // and read backwards against every other measure here.
            reversed={x === 'adp'}
          />
          <YAxis
            type="number" dataKey="_y" name={AXIS_LABEL[y]}
            domain={['dataMin', 'dataMax']}
            width={38}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
            reversed={y === 'adp'}
          />
          <ZAxis range={[38, 38]} />

          {mx != null && (
            <ReferenceLine x={mx} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.35} strokeDasharray="3 3" />
          )}
          {my != null && (
            <ReferenceLine y={my} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.35} strokeDasharray="3 3" />
          )}

          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: 'hsl(var(--border))' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as AnalysisPlayer & { _x: number; _y: number };
              return (
                <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
                  <p className="text-[13px] font-semibold text-foreground">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.position} · {p.nflTeam} · {p.ownerName}
                  </p>
                  <p className="mt-1 text-[11px] text-foreground">
                    {AXIS_LABEL[x]}: <span className="font-semibold tabular-nums">{p._x}</span>
                  </p>
                  <p className="text-[11px] text-foreground">
                    {AXIS_LABEL[y]}: <span className="font-semibold tabular-nums">{p._y}</span>
                  </p>
                </div>
              );
            }}
          />

          <Scatter
            data={data}
            onClick={(d: { payload?: AnalysisPlayer }) => { if (d?.payload) onPick(d.payload); }}
            className="cursor-pointer"
          >
            {data.map(d => (
              <Cell
                key={d.playerId}
                fill={POSITION_COLOR[d.position] ?? POSITION_COLOR.DEFAULT}
                fillOpacity={d.starter ? 0.95 : 0.4}
                stroke={POSITION_COLOR[d.position] ?? POSITION_COLOR.DEFAULT}
                strokeWidth={d.starter ? 1.5 : 1}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      <p className="mt-1 px-1 text-[10px] leading-relaxed text-muted-foreground">
        Solid dots are starters, faded are bench. Dashed lines mark the median of
        each axis across the players shown.
        {missing > 0 && ` ${missing} player${missing === 1 ? '' : 's'} not plotted, missing one of these two values.`}
      </p>
    </div>
  );
}
