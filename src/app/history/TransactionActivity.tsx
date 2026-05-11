'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ScatterChart, Scatter, Cell,
} from 'recharts';
import Avatar from '@/components/ui/Avatar';
import type { EnrichedTransaction } from '@/app/api/transactions/route';
import type { EnhancedLeagueHistory } from '@/lib/enhancedHistoryApi';

// ── Chart palette — solid colors read from CSS vars injected by ThemeInjector ─

const FALLBACK = { trade: '#f59e0b', waiver: '#38bdf8', freeAgent: '#34d399' };

function useTxColors() {
  const [c, setC] = useState(FALLBACK);
  useEffect(() => {
    const s = getComputedStyle(document.documentElement);
    const get = (v: string) => s.getPropertyValue(v).trim();
    setC({
      trade:     get('--tx-trade')  || FALLBACK.trade,
      waiver:    get('--tx-waiver') || FALLBACK.waiver,
      freeAgent: get('--tx-fa')     || FALLBACK.freeAgent,
    });
  }, []);
  return c;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pearsonR(data: { x: number; y: number }[]): number {
  const n = data.length;
  if (n < 2) return 0;
  const mx = data.reduce((s, d) => s + d.x, 0) / n;
  const my = data.reduce((s, d) => s + d.y, 0) / n;
  const num   = data.reduce((s, d) => s + (d.x - mx) * (d.y - my), 0);
  const denX  = Math.sqrt(data.reduce((s, d) => s + (d.x - mx) ** 2, 0));
  const denY  = Math.sqrt(data.reduce((s, d) => s + (d.y - my) ** 2, 0));
  return denX && denY ? num / (denX * denY) : 0;
}

function linearRegression(data: { x: number; y: number }[]): { m: number; b: number } {
  const n = data.length;
  const sumX  = data.reduce((s, d) => s + d.x, 0);
  const sumY  = data.reduce((s, d) => s + d.y, 0);
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
  const sumXX = data.reduce((s, d) => s + d.x ** 2, 0);
  const denom = n * sumXX - sumX ** 2;
  const m = denom ? (n * sumXY - sumX * sumY) / denom : 0;
  const b = (sumY - m * sumX) / n;
  return { m, b };
}

function correlationLabel(r: number): string {
  if (r >  0.4)  return 'Strong positive. Active managers win more.';
  if (r >  0.15) return 'Weak positive. Slight edge for active teams.';
  if (r < -0.4)  return 'Strong negative. Less is more in this league.';
  if (r < -0.15) return 'Weak negative. Activity may hurt slightly.';
  return 'No significant correlation';
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ── Custom tooltip components ─────────────────────────────────────────────────

function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-border bg-card/95 backdrop-blur-sm px-3 py-2.5 text-xs shadow-xl">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.fill }} />
            <span className="text-muted-foreground">{p.name}</span>
          </span>
          <span className="font-mono font-semibold text-foreground">{p.value}</span>
        </div>
      ))}
      <div className="mt-1.5 pt-1.5 border-t border-border/60 flex justify-between">
        <span className="text-muted-foreground/60">Total</span>
        <span className="font-mono font-bold text-foreground">{total}</span>
      </div>
    </div>
  );
}

function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-lg border border-border bg-card/95 backdrop-blur-sm px-3 py-2.5 text-xs shadow-xl min-w-[160px]">
      <div className="flex items-center gap-2 mb-2">
        <Avatar avatarId={d.avatar} size={24} className="rounded-md shrink-0" />
        <span className="font-semibold text-foreground">{d.name}</span>
        {d.championships > 0 && (
          <span className="ml-auto text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">
            {d.championships}×🏆
          </span>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Transactions</span>
          <span className="font-mono font-semibold text-foreground">{d.x}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Win rate</span>
          <span className="font-mono font-semibold text-foreground">{d.y.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

// ── Trend line rendered as a custom scatter shape ─────────────────────────────

function TrendLineDot() { return null as any; }

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({ label, value, sub, avatar: av }: { label: string; value: string; sub?: string; avatar?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        {av !== undefined && <Avatar avatarId={av} size={24} className="rounded-lg shrink-0" />}
        <p className="font-display text-lg font-bold text-foreground leading-tight">{value}</p>
      </div>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{sub}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  historyData: EnhancedLeagueHistory;
}

export default function TransactionActivity({ historyData }: Props) {
  const txColors = useTxColors();

  const C = useMemo(() => ({
    trade:     txColors.trade,
    waiver:    txColors.waiver,
    freeAgent: txColors.freeAgent,
    champDot:  txColors.trade,
    grid:      'rgba(148,163,184,0.12)',
    tick:      '#64748b',
    trendLine: 'rgba(139,92,246,0.55)',
    plainDot:  '#475569',
  }), [txColors]);

  const [transactions, setTransactions] = useState<EnrichedTransaction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/transactions')
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setTransactions(d.transactions ?? []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const { allTimeStats } = historyData;

  // ── Per-manager transaction stats ─────────────────────────────────────────

  const managerStats = useMemo(() => {
    // Regular-season only for correlation analysis
    const seasonal = transactions.filter(t => !t.isOffseason);

    const tally = new Map<string, { trades: number; waivers: number; freeAgents: number }>();
    for (const tx of seasonal) {
      const uniqueUserIds = new Set(tx.sides.map(s => s.userId).filter(Boolean));
      for (const uid of uniqueUserIds) {
        const e = tally.get(uid) ?? { trades: 0, waivers: 0, freeAgents: 0 };
        if (tx.type === 'trade')      e.trades++;
        else if (tx.type === 'waiver') e.waivers++;
        else                           e.freeAgents++;
        tally.set(uid, e);
      }
    }

    return allTimeStats
      .map(m => {
        const t = tally.get(m.userId) ?? { trades: 0, waivers: 0, freeAgents: 0 };
        return {
          ...m,
          trades:     t.trades,
          waivers:    t.waivers,
          freeAgents: t.freeAgents,
          total:      t.trades + t.waivers + t.freeAgents,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [transactions, allTimeStats]);

  // ── Bar chart data (top 12 managers by activity) ──────────────────────────

  const barData = useMemo(() =>
    managerStats.slice(0, 12).map(m => ({
      name:      truncate(m.username, 12),
      Trades:    m.trades,
      Waivers:   m.waivers,
      'FA Adds': m.freeAgents,
    })),
    [managerStats]
  );

  // ── Scatter data: total moves vs win rate ────────────────────────────────

  const scatterData = useMemo(() =>
    managerStats
      .filter(m => (m.totalWins + m.totalLosses) > 0)
      .map(m => ({
        x:             m.total,
        y:             m.winPercentage * 100,
        name:          m.username,
        avatar:        m.avatar,
        championships: m.championships,
        userId:        m.userId,
      })),
    [managerStats]
  );

  const { m: slope, b: intercept } = useMemo(() =>
    scatterData.length >= 2 ? linearRegression(scatterData) : { m: 0, b: 0 },
    [scatterData]
  );

  const r = useMemo(() => pearsonR(scatterData), [scatterData]);

  const trendPoints = useMemo(() => {
    if (scatterData.length < 2) return [];
    const xs = scatterData.map(d => d.x);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    return [
      { x: xMin, y: slope * xMin + intercept },
      { x: xMax, y: slope * xMax + intercept },
    ];
  }, [scatterData, slope, intercept]);

  // ── Season activity trend ─────────────────────────────────────────────────

  const seasonTrend = useMemo(() => {
    const map = new Map<string, { Trades: number; Waivers: number; 'FA Adds': number }>();
    const seen = new Set<string>(); // dedup trades (each trade has 2 sides)
    for (const tx of transactions) {
      if (tx.isOffseason) continue;
      if (!map.has(tx.season)) map.set(tx.season, { Trades: 0, Waivers: 0, 'FA Adds': 0 });
      const s = map.get(tx.season)!;
      if (tx.type === 'trade') {
        if (!seen.has(tx.transactionId)) { s.Trades++; seen.add(tx.transactionId); }
      } else if (tx.type === 'waiver') {
        s.Waivers++;
      } else {
        s['FA Adds']++;
      }
    }
    return [...map.entries()]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([season, counts]) => ({ season, ...counts }));
  }, [transactions]);

  // ── Insight values ────────────────────────────────────────────────────────

  const topManager    = managerStats[0];
  const mostTrader    = [...managerStats].sort((a, b) => b.trades - a.trades)[0];
  const mostWaiver    = [...managerStats].sort((a, b) => b.waivers + b.freeAgents - a.waivers - a.freeAgents)[0];
  const corrText = correlationLabel(r);

  // ── Loading / error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
            <div className="h-4 w-40 rounded bg-muted mb-4" />
            <div className="h-48 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  const axisProps = { tick: { fill: C.tick, fontSize: 10 }, axisLine: false, tickLine: false };

  return (
    <div className="space-y-8">

      {/* ── Insight strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <InsightCard
          label="Most Active"
          value={topManager?.username ?? '—'}
          sub={`${topManager?.total ?? 0} total moves`}
          avatar={topManager?.avatar}
        />
        <InsightCard
          label="Top Trader"
          value={mostTrader?.username ?? '—'}
          sub={`${mostTrader?.trades ?? 0} trades made`}
          avatar={mostTrader?.avatar}
        />
        <InsightCard
          label="Waiver King"
          value={mostWaiver?.username ?? '—'}
          sub={`${(mostWaiver?.waivers ?? 0) + (mostWaiver?.freeAgents ?? 0)} pickups`}
          avatar={mostWaiver?.avatar}
        />
        <InsightCard
          label="Activity ↔ Wins"
          value={`r = ${r.toFixed(2)}`}
          sub={corrText}
        />
      </div>

      {/* ── Transaction volume per manager ─────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <SectionHeader
          title="Transaction Volume by Manager"
          sub="All moves."
        />
        <ResponsiveContainer width="100%" height={Math.max(220, barData.length * 32)}>
          <BarChart
            data={barData}
            layout="vertical"
            margin={{ top: 0, right: 20, left: 8, bottom: 0 }}
            barSize={14}
          >
            <CartesianGrid horizontal={false} stroke={C.grid} />
            <XAxis type="number" {...axisProps} />
            <YAxis type="category" dataKey="name" width={88} {...axisProps} tick={{ fill: C.tick, fontSize: 10 }} />
            <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
            <Legend
              iconType="circle"
              iconSize={7}
              formatter={(v: string) => <span style={{ color: C.tick, fontSize: 10 }}>{v}</span>}
            />
            <Bar dataKey="Trades"    stackId="a" fill={C.trade}     radius={[0, 0, 0, 0]} />
            <Bar dataKey="Waivers"   stackId="a" fill={C.waiver}    radius={[0, 0, 0, 0]} />
            <Bar dataKey="FA Adds"   stackId="a" fill={C.freeAgent} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Activity vs win rate correlation ───────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <SectionHeader
          title="Activity vs. Win Rate"
          sub="Regular-season transactions per manager plotted against all-time win percentage."
        />
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-[11px] font-medium" style={{ color: 'hsl(var(--primary))' }}>
          <span className="font-mono">r = {r.toFixed(2)}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{corrText}</span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
            <CartesianGrid stroke={C.grid} />
            <XAxis dataKey="x" type="number" name="Transactions" {...axisProps} label={{ value: 'Transactions', position: 'insideBottom', offset: -4, fill: C.tick, fontSize: 10 }} />
            <YAxis dataKey="y" type="number" name="Win %" domain={[0, 100]} {...axisProps} tickFormatter={v => `${v}%`} />
            <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3', stroke: C.grid }} />

            {/* Regression trend line as 2-point scatter with line */}
            {trendPoints.length === 2 && (
              <Scatter
                data={trendPoints}
                line={{ stroke: C.trendLine, strokeWidth: 1.5, strokeDasharray: '5 3' }}
                shape={<TrendLineDot />}
                legendType="none"
              />
            )}

            {/* Manager dots */}
            <Scatter data={scatterData} shape={(props: any) => {
              const { cx, cy, payload } = props;
              const isChamp = payload.championships > 0;
              return (
                <g>
                  <circle cx={cx} cy={cy} r={isChamp ? 7 : 5} fill={isChamp ? C.champDot : C.plainDot} opacity={0.85} />
                  {isChamp && <circle cx={cx} cy={cy} r={10} fill="none" stroke={C.champDot} strokeWidth={1} opacity={0.4} />}
                  <text x={cx} y={cy + 18} textAnchor="middle" fill={C.tick} fontSize={9}>
                    {payload.name.split(' ')[0]}
                  </text>
                </g>
              );
            }} />
          </ScatterChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground/60">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400/80 inline-block" /> Champion</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500/80 inline-block" /> No title</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-px border-t border-dashed border-violet-400/60" /> Trend</span>
        </div>
      </div>

      {/* ── League activity by season ───────────────────────────────────── */}
      {seasonTrend.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <SectionHeader
            title="League Activity by Season"
            sub="Total transactions per season."
          />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={seasonTrend} margin={{ top: 0, right: 20, left: -10, bottom: 0 }} barSize={28}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="season" {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
              <Legend
                iconType="circle"
                iconSize={7}
                formatter={(v: string) => <span style={{ color: C.tick, fontSize: 10 }}>{v}</span>}
              />
              <Bar dataKey="Trades"    stackId="a" fill={C.trade}     radius={[0, 0, 0, 0]} />
              <Bar dataKey="Waivers"   stackId="a" fill={C.waiver}    radius={[0, 0, 0, 0]} />
              <Bar dataKey="FA Adds"   stackId="a" fill={C.freeAgent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

    </div>
  );
}
