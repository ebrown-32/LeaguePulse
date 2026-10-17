'use client';

/**
 * The tycoon's charts. One measure per chart (never two axes), thin marks,
 * recessive grids, a tooltip on every chart, and colors from one validated
 * categorical order (light and dark each checked against their surface).
 * Text stays in text colors; a colored mark beside it carries identity.
 */

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

/** Series colors as CSS variables, stepped separately for dark mode. */
export const CHART_VARS =
  '[--s1:#2a78d6] [--s2:#eb6834] [--s3:#1baf7a] [--s4:#eda100] [--s5:#e87ba4] dark:[--s1:#3987e5] dark:[--s2:#d95926] dark:[--s3:#199e70] dark:[--s4:#c98500] dark:[--s5:#d55181]';

const axis = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
const grid = <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" strokeOpacity={0.7} />;
const tip = {
  contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12, color: 'hsl(var(--foreground))' },
  labelStyle: { color: 'hsl(var(--muted-foreground))', marginBottom: 4 },
  cursor: { fill: 'hsl(var(--muted))', opacity: 0.5 },
};
const money = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}k`);

export function Frame({ title, note, children, height = 180 }: { title: string; note?: string; children: React.ReactNode; height?: number }) {
  return (
    <figure className="rounded-xl border border-border bg-card p-4">
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {note && <span className="text-[11.5px] text-muted-foreground">{note}</span>}
      </figcaption>
      <div style={{ height }}><ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer></div>
    </figure>
  );
}

interface CrowdGame { week: number; result: string; attendance: number; capacity: number; opponent: string; postseason: boolean }

/** How full the stadium was, game by game (a share, so a bigger stadium does not hide an emptier one). */
export function CrowdsChart({ games }: { games: CrowdGame[] }) {
  // Not "fill": the chart library reads a data field by that name as the bar's color.
  const data = games.map(g => ({ label: `${g.result} ${g.week}`, share: Math.round((g.attendance / g.capacity) * 1000) / 10, ...g }));
  return (
    <Frame title="Crowds" note="Share of seats filled; W or L and the week below">
      <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        {grid}
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval={0} />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={axis} tickLine={false} axisLine={false} unit="%" />
        <Tooltip {...tip} formatter={(_v, _n, p) => [`${p.payload.attendance.toLocaleString('en-US')} of ${p.payload.capacity.toLocaleString('en-US')} (${p.payload.share}%)`, `Week ${p.payload.week} vs ${p.payload.opponent}`]} labelFormatter={() => ''} />
        <Bar dataKey="share" fill="var(--s1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </Frame>
  );
}

/** Fan interest after each game. */
export function InterestChart({ games }: { games: { week: number; interest: number; result: string }[] }) {
  return (
    <Frame title="Fan interest" note="0 to 100, after each game">
      <LineChart data={games} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        {grid}
        <XAxis dataKey="week" tick={axis} tickLine={false} axisLine={false} tickFormatter={w => `Wk ${w}`} />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={axis} tickLine={false} axisLine={false} />
        <Tooltip {...tip} cursor={{ stroke: 'hsl(var(--border))' }} formatter={(v: number) => [v, 'Fan interest']} labelFormatter={w => `Week ${w}`} />
        <Line dataKey="interest" stroke="var(--s1)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--card))' }} activeDot={{ r: 5 }} />
      </LineChart>
    </Frame>
  );
}

const SOURCES = [
  { key: 'tickets', name: 'Tickets', color: 'var(--s1)' },
  { key: 'concessions', name: 'Concessions', color: 'var(--s2)' },
  { key: 'parking', name: 'Parking', color: 'var(--s3)' },
  { key: 'suites', name: 'Suites', color: 'var(--s4)' },
  { key: 'sponsors', name: 'Sponsors', color: 'var(--s5)' },
  { key: 'premium', name: 'Home date premium', color: 'var(--s6, var(--s1))' },
  { key: 'road', name: 'Road share and TV', color: 'var(--s7, var(--s2))' },
] as const;

/** Where each game's money came from. */
export function RevenueChart({ games }: { games: { week: number; revenue: Record<string, number> }[] }) {
  const data = games.map(g => ({ week: g.week, ...g.revenue }));
  const used = SOURCES.filter(s => data.some(d => (d as Record<string, number>)[s.key] > 0));
  return (
    <Frame title="Game day revenue" note="By source" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -6, bottom: 0 }}>
        {grid}
        <XAxis dataKey="week" tick={axis} tickLine={false} axisLine={false} tickFormatter={w => `Wk ${w}`} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={money} width={52} />
        <Tooltip {...tip} formatter={(v: number, n) => [money(v), n]} labelFormatter={w => `Week ${w}`} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }} />
        {used.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="r" fill={s.color} stroke="hsl(var(--card))" strokeWidth={2}
            radius={i === used.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={30} />
        ))}
      </BarChart>
    </Frame>
  );
}

/** The war chest over time. */
export function VCChart({ days }: { days: { at: number; vc: number }[] }) {
  const data = days.map(d => ({ day: new Date(d.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), vc: d.vc }));
  return (
    <Frame title="VC in the bank" note="Daily">
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
        <defs>
          <linearGradient id="vcfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--s1)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--s1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} minTickGap={40} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={v => v.toLocaleString('en-US')} />
        <Tooltip {...tip} cursor={{ stroke: 'hsl(var(--border))' }} formatter={(v: number) => [`${v.toLocaleString('en-US')} VC`, 'Balance']} />
        <Area dataKey="vc" stroke="var(--s1)" strokeWidth={2} fill="url(#vcfill)" />
      </AreaChart>
    </Frame>
  );
}

/**
 * What a ticket price would do: one measure per chart (profit, then crowd),
 * the same price axis, your price and the fair price marked.
 */
export function DemandCharts({ curve, current, fair }: { curve: { price: number; profit: number; attendance: number }[]; current: number; fair: number }) {
  const marks = (
    <>
      <ReferenceLine x={current} stroke="hsl(var(--foreground))" strokeWidth={1.5} label={{ value: 'You', position: 'top', fontSize: 10, fill: 'hsl(var(--foreground))' }} />
      <ReferenceLine x={fair} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" label={{ value: 'Fair', position: 'top', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
    </>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Frame title="Profit per game" note="By ticket price" height={160}>
        <LineChart data={curve} margin={{ top: 14, right: 8, left: -6, bottom: 0 }}>
          {grid}
          <XAxis dataKey="price" type="number" domain={['dataMin', 'dataMax']} tick={axis} tickLine={false} axisLine={false} tickFormatter={p => `$${p}`} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={money} width={52} />
          <Tooltip {...tip} cursor={{ stroke: 'hsl(var(--border))' }} formatter={(v: number) => [money(v), 'Profit']} labelFormatter={p => `Tickets at $${p}`} />
          {marks}
          <Line dataKey="profit" stroke="var(--s1)" strokeWidth={2} dot={false} />
        </LineChart>
      </Frame>
      <Frame title="Crowd" note="By ticket price" height={160}>
        <LineChart data={curve} margin={{ top: 14, right: 8, left: -6, bottom: 0 }}>
          {grid}
          <XAxis dataKey="price" type="number" domain={['dataMin', 'dataMax']} tick={axis} tickLine={false} axisLine={false} tickFormatter={p => `$${p}`} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={v => `${Math.round(v / 1000)}k`} />
          <Tooltip {...tip} cursor={{ stroke: 'hsl(var(--border))' }} formatter={(v: number) => [v.toLocaleString('en-US'), 'Fans']} labelFormatter={p => `Tickets at $${p}`} />
          {marks}
          <Line dataKey="attendance" stroke="var(--s1)" strokeWidth={2} dot={false} />
        </LineChart>
      </Frame>
    </div>
  );
}
