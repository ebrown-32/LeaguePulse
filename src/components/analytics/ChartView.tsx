'use client';

/**
 * Draws a query result.
 *
 * Built to the dataviz rules rather than recharts' defaults: thin marks, bars
 * with 4px rounded ends sitting on the baseline, solid hairline gridlines,
 * muted axes, a legend whenever there are two or more series, and one value
 * axis only. When a result has two measures on a bar or line, the first is
 * drawn and the rest stay in the table; two measures of different scale on
 * one axis is the classic misleading chart.
 *
 * Colour: a single series takes the league's theme colour. Several series
 * take the validated categorical palette in fixed order, and a ninth series
 * is folded into "Other" rather than given a generated colour.
 */

import { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell as PieCell,
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import { cn } from '@/lib/utils';
import { autoChart, compareValues, formatCell, type Result, type Row } from '@/lib/analytics/engine';
import { datasetById, fieldOf, type QuerySpec } from '@/lib/analytics/schema';
import { SERIES_DARK, SERIES_LIGHT, MAX_SERIES, useIsDark } from '@/lib/analytics/client';

const PRIMARY = 'hsl(var(--primary))';
const INK_MUTED = 'hsl(var(--muted-foreground))';
const GRID = 'hsl(var(--border))';

/** Aggregations that can be folded: an "Other" total means something for these. */
const FOLDABLE = new Set(['sum', 'count']);

export function resolveChart(spec: QuerySpec, result: Result) {
  return spec.chart === 'auto' ? autoChart(spec, result) : spec.chart;
}

function compact(v: number, format?: string): string {
  if (format === 'pct') return `${Math.round(v * 100)}%`;
  const a = Math.abs(v);
  if (a >= 10_000) return `${(v / 1000).toFixed(a >= 100_000 ? 0 : 1)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(a < 10 ? 2 : 1);
}

export default function ChartView({ spec, result, height = 320, className }: {
  spec: QuerySpec;
  result: Result;
  height?: number;
  className?: string;
}) {
  const dark = useIsDark();
  const palette = dark ? SERIES_DARK : SERIES_LIGHT;
  const chart = resolveChart(spec, result);
  const ds = datasetById(spec.dataset)!;
  const measures = result.columns.filter(c => c.kind === 'measure');
  const dims = result.columns.filter(c => c.kind === 'dimension');
  const m0 = measures[0];

  /**
   * Long to wide for two dimensions: one row per x value, one column per
   * series. Series are ranked by their total so the fold keeps the biggest,
   * and keep a fixed colour by that rank within this chart.
   */
  const shaped = useMemo(() => {
    if (!m0 || !dims.length) return null;
    const x = dims[0].key;
    if (dims.length < 2) {
      return { data: result.rows, series: [{ key: m0.key, label: m0.label }], x, folded: false, dropped: 0 };
    }
    const s = dims[1].key;
    const totals = new Map<string, number>();
    for (const r of result.rows) totals.set(String(r[s]), (totals.get(String(r[s])) ?? 0) + Number(r[m0.key] ?? 0));
    // Time-like series (seasons, weeks) keep their natural order and their
    // colours follow it; anything else is ranked by size so a fold keeps the
    // biggest.
    const seriesOrdinal = Boolean(fieldOf(ds, s)?.ordinal);
    const ranked = [...totals.entries()]
      .sort((a, b) => (seriesOrdinal ? compareValues(a[0], b[0]) : b[1] - a[1]))
      .map(([k]) => k);
    const agg = spec.measures[0]?.agg ?? 'count';
    const canFold = FOLDABLE.has(agg) && ranked.length > MAX_SERIES;
    const keep = new Set(ranked.slice(0, canFold ? MAX_SERIES - 1 : MAX_SERIES));
    const wide = new Map<string, Row>();
    for (const r of result.rows) {
      const xv = r[x];
      const key = String(xv);
      const row = wide.get(key) ?? { [x]: xv };
      const sv = String(r[s]);
      const target = keep.has(sv) ? sv : canFold ? 'Other' : null;
      if (target) row[target] = Number(row[target] ?? 0) + Number(r[m0.key] ?? 0);
      wide.set(key, row);
    }
    const xField = fieldOf(ds, x);
    const data = [...wide.values()].sort((a, b) => (xField?.ordinal ? compareValues(a[x], b[x]) : 0));
    const series = [...keep].map(k => ({ key: k, label: k }));
    if (canFold) series.push({ key: 'Other', label: 'Other' });
    return { data, series, x, folded: canFold, dropped: canFold ? 0 : Math.max(0, ranked.length - MAX_SERIES) };
  }, [result, spec.measures, dims, m0, ds]);

  if (!m0) return <Empty className={className} height={height}>Add a value to chart it.</Empty>;
  if (!result.rows.length) return <Empty className={className} height={height}>Nothing matches these filters.</Empty>;

  // ── A single figure ──────────────────────────────────────────────────────
  if (chart === 'kpi' || !dims.length) {
    const row = result.rows[0];
    return (
      <div className={cn('flex flex-wrap items-center justify-center gap-x-12 gap-y-6 py-6', className)} style={{ minHeight: Math.min(height, 200) }}>
        {measures.slice(0, 3).map(m => (
          <div key={m.key} className="text-center">
            {/* Proportional figures at display size: tabular digits look
                loose at 48px. */}
            <p className="font-display text-[44px] font-bold leading-none tracking-[-0.03em] text-foreground sm:text-[56px]">
              {formatCell(row[m.key], m.format)}
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>
    );
  }

  if (!shaped) return null;
  const multi = shaped.series.length > 1;
  /**
   * Stack only what adds up. Totals stack into a meaningful whole; averages,
   * minimums and medians do not, and a stack of three seasons' averages drew
   * a bar at 450 for a team that averages 150.
   */
  const additive = FOLDABLE.has(spec.measures[0]?.agg ?? 'count');
  const stack = multi && additive && (chart === 'area' || chart === 'hbar');
  const colorOf = (i: number) => (multi ? palette[i % palette.length] : PRIMARY);
  const fmt = (v: unknown) => formatCell(v as any, m0.format);
  const axisTick = { fill: INK_MUTED, fontSize: 11 };
  const xFormat = (v: unknown) => formatCell(v as any, fieldOf(ds, shaped.x)?.format);

  const legend = multi && (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {shaped.series.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: colorOf(i) }} />
          <span className="text-foreground/85">{s.label}</span>
        </span>
      ))}
      {shaped.dropped > 0 && (
        <span className="text-[11px] text-muted-foreground">Showing the top {MAX_SERIES}; {shaped.dropped} more in the table</span>
      )}
    </div>
  );

  const tooltip = (
    <Tooltip
      cursor={{ fill: 'hsl(var(--foreground) / 0.04)', stroke: 'hsl(var(--foreground) / 0.15)' }}
      content={<ChartTooltip format={m0.format} xFormat={xFormat} />}
    />
  );

  // ── Donut ────────────────────────────────────────────────────────────────
  if (chart === 'donut') {
    const agg = spec.measures[0]?.agg ?? 'count';
    const sorted = [...result.rows].sort((a, b) => Number(b[m0.key]) - Number(a[m0.key]));
    // Part to whole reads at six slices or fewer; past that it is a bar chart.
    let slices = sorted.slice(0, 6).map(r => ({ name: String(r[shaped.x]), value: Number(r[m0.key] ?? 0) }));
    if (sorted.length > 6 && FOLDABLE.has(agg)) {
      slices = sorted.slice(0, 5).map(r => ({ name: String(r[shaped.x]), value: Number(r[m0.key] ?? 0) }));
      slices.push({ name: 'Other', value: sorted.slice(5).reduce((t, r) => t + Number(r[m0.key] ?? 0), 0) });
    }
    const total = slices.reduce((t, s) => t + s.value, 0);
    return (
      <div className={cn('flex flex-col items-center gap-6 sm:flex-row', className)}>
        <div className="relative shrink-0" style={{ width: Math.min(height, 260), height: Math.min(height, 260) }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%"
                   paddingAngle={1.5} stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive>
                {slices.map((s, i) => <PieCell key={s.name} fill={palette[i]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip format={m0.format} xFormat={xFormat} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-2xl font-bold text-foreground">{formatCell(total, m0.format)}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m0.label}</span>
          </div>
        </div>
        <ul className="w-full space-y-1.5">
          {slices.map((s, i) => (
            <li key={s.name} className="flex items-center gap-2 text-[12.5px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: palette[i] }} />
              <span className="min-w-0 flex-1 truncate text-foreground">{s.name}</span>
              <span className="tabular-nums text-muted-foreground">{formatCell(s.value, m0.format)}</span>
              <span className="w-10 text-right tabular-nums text-muted-foreground/70">{total ? Math.round((s.value / total) * 100) : 0}%</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ── Scatter: two measures, one point per category ────────────────────────
  if (chart === 'scatter' && measures.length >= 2) {
    const m1 = measures[1];
    const pts = result.rows.map(r => ({ name: String(r[shaped.x]), x: Number(r[m0.key] ?? 0), y: Number(r[m1.key] ?? 0) }));
    return (
      <div className={className} style={{ height }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 8, right: 24, bottom: 24, left: 4 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="0" />
            <XAxis type="number" dataKey="x" name={m0.label} tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }}
                   tickFormatter={v => compact(v, m0.format)} domain={['auto', 'auto']}
                   label={{ value: m0.label, position: 'insideBottom', offset: -14, fill: INK_MUTED, fontSize: 11 }} />
            <YAxis type="number" dataKey="y" name={m1.label} tick={axisTick} tickLine={false} axisLine={false} width={48}
                   tickFormatter={v => compact(v, m1.format)} domain={['auto', 'auto']} />
            <ZAxis range={[90, 90]} />
            <Tooltip cursor={{ strokeDasharray: '0', stroke: GRID }} content={<ScatterTooltip xLabel={m0.label} yLabel={m1.label} xf={m0.format} yf={m1.format} />} />
            <Scatter data={pts} fill={PRIMARY} stroke="hsl(var(--card))" strokeWidth={2}>
              <LabelList dataKey="name" position="top" fill="hsl(var(--foreground) / 0.75)" fontSize={10.5} offset={8} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ── Horizontal bar: rankings with long names ─────────────────────────────
  if (chart === 'hbar' && !multi) {
    const rows = shaped.data.slice(0, 25);
    const longest = Math.max(...rows.map(r => String(r[shaped.x] ?? '').length));
    const h = Math.max(160, rows.length * 30 + 24);
    return (
      <div className={className} style={{ height: h }}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={v => compact(v, m0.format)} />
            <YAxis type="category" dataKey={shaped.x} tick={{ ...axisTick, fill: 'hsl(var(--foreground) / 0.85)', fontSize: 12 }}
                   tickLine={false} axisLine={{ stroke: GRID }} width={Math.min(170, Math.max(64, longest * 7))}
                   tickFormatter={xFormat} interval={0} />
            {tooltip}
            <Bar dataKey={m0.key} fill={PRIMARY} radius={[0, 4, 4, 0]} maxBarSize={22}>
              <LabelList dataKey={m0.key} position="right" formatter={(v: unknown) => fmt(v)} fill="hsl(var(--foreground) / 0.8)" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const xAxis = (
    <XAxis dataKey={shaped.x} tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={xFormat}
           minTickGap={8} interval="preserveStartEnd" />
  );
  const yAxis = (
    <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} tickFormatter={v => compact(v, m0.format)} />
  );
  const grid = <CartesianGrid vertical={false} stroke={GRID} />;
  const margin = { top: 8, right: 12, bottom: 0, left: 0 };

  return (
    <div className={className}>
      {legend}
      <div style={{ height }}>
        <ResponsiveContainer>
          {chart === 'line' ? (
            <LineChart data={shaped.data} margin={margin}>
              {grid}{xAxis}{yAxis}{tooltip}
              {shaped.series.map((s, i) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colorOf(i)} strokeWidth={2}
                      dot={shaped.data.length <= 18 ? { r: 3, strokeWidth: 2, fill: 'hsl(var(--card))' } : false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--card))' }} connectNulls />
              ))}
            </LineChart>
          ) : chart === 'area' ? (
            <AreaChart data={shaped.data} margin={margin}>
              {grid}{xAxis}{yAxis}{tooltip}
              {shaped.series.map((s, i) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId={stack ? 'a' : undefined}
                      stroke={colorOf(i)} strokeWidth={2} fill={colorOf(i)} fillOpacity={stack ? 0.55 : multi ? 0.08 : 0.16} />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={shaped.data} margin={margin} barCategoryGap="22%" barGap={2}>
              {grid}{xAxis}{yAxis}{tooltip}
              {shaped.series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={colorOf(i)} maxBarSize={44}
                     stackId={stack ? 'a' : undefined}
                     // Rounded ends on the top segment only, and a 2px gap of
                     // surface between stacked segments rather than a border.
                     radius={!stack || i === shaped.series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                     stroke={stack ? 'hsl(var(--card))' : undefined} strokeWidth={stack ? 2 : 0} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Empty({ children, height, className }: { children: React.ReactNode; height: number; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center rounded-xl border border-dashed border-border text-[13px] text-muted-foreground', className)}
         style={{ height: Math.min(height, 220) }}>
      {children}
    </div>
  );
}

function ChartTooltip({ active, payload, label, format, xFormat }: any) {
  if (!active || !payload?.length) return null;
  const items = [...payload].filter((p: any) => p.value != null).sort((a: any, b: any) => Number(b.value) - Number(a.value));
  return (
    <div className="lp-glass min-w-[140px] rounded-xl border px-3 py-2 text-[12px] shadow-[var(--elev-3)]">
      {label != null && <p className="mb-1 font-semibold text-foreground">{xFormat ? xFormat(label) : String(label)}</p>}
      {items.slice(0, 10).map((p: any) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.name}</span>
          <span className="tabular-nums font-semibold text-foreground">{formatCell(p.value, format)}</span>
        </div>
      ))}
    </div>
  );
}

function ScatterTooltip({ active, payload, xLabel, yLabel, xf, yf }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="lp-glass rounded-xl border px-3 py-2 text-[12px] shadow-[var(--elev-3)]">
      <p className="mb-1 font-semibold text-foreground">{p.name}</p>
      <p className="text-muted-foreground">{xLabel}: <span className="font-semibold tabular-nums text-foreground">{formatCell(p.x, xf)}</span></p>
      <p className="text-muted-foreground">{yLabel}: <span className="font-semibold tabular-nums text-foreground">{formatCell(p.y, yf)}</span></p>
    </div>
  );
}
