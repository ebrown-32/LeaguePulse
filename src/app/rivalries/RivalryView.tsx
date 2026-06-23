'use client';

import { useState, useMemo } from 'react';
import { X, TrendingUp, TrendingDown, Minus, Trophy, Sword } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import type { Manager, H2HEntry, GameRecord, RivalriesResponse } from '@/app/api/rivalries/route';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(wins: number, total: number) {
  if (total === 0) return 0;
  return wins / total;
}

function winPctLabel(wins: number, losses: number) {
  const total = wins + losses;
  if (total === 0) return '—';
  return `${((wins / total) * 100).toFixed(0)}%`;
}

function recordLabel(wins: number, losses: number) {
  return `${wins}–${losses}`;
}

function avg(pts: number, games: number) {
  return games === 0 ? 0 : pts / games;
}

// ── Cell color ────────────────────────────────────────────────────────────────

function cellColor(wins: number, losses: number): string {
  const total = wins + losses;
  if (total === 0) return '';
  const w = pct(wins, total);
  if (w > 0.6)  return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  if (w < 0.4)  return 'bg-red-500/12 text-red-600 dark:text-red-400';
  return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function GameRow({ g, myName, theirName }: { g: GameRecord; myName: string; theirName: string }) {
  const iWon = g.score > g.opponentScore;
  return (
    <div className={`flex items-center justify-between py-2 border-b border-border/40 last:border-0 text-sm ${g.isPlayoff ? 'bg-amber-500/4' : ''}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-muted-foreground tabular-nums w-14 shrink-0">
          {g.season} W{g.week}
        </span>
        {g.isPlayoff && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500 border border-amber-500/30 px-1 py-0.5 rounded">PO</span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`font-mono font-semibold tabular-nums ${iWon ? 'text-emerald-500' : 'text-muted-foreground'}`}>
          {g.score.toFixed(2)}
        </span>
        <span className="text-muted-foreground text-xs">vs</span>
        <span className={`font-mono font-semibold tabular-nums ${!iWon ? 'text-red-500' : 'text-muted-foreground'}`}>
          {g.opponentScore.toFixed(2)}
        </span>
        <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${iWon ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>
          {iWon ? 'W' : 'L'}
        </span>
      </div>
    </div>
  );
}

function DetailPanel({
  me, them, entry, onClose,
}: {
  me: Manager;
  them: Manager;
  entry: H2HEntry;
  onClose: () => void;
}) {
  const total  = entry.wins + entry.losses;
  const margin = total > 0 ? (entry.pointsFor - entry.pointsAgainst) / total : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Avatar avatarId={me.avatar}   size={28} className="rounded-lg" />
              <span className="font-semibold text-sm text-foreground">{me.teamName}</span>
            </div>
            <Sword className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-1.5">
              <Avatar avatarId={them.avatar} size={28} className="rounded-lg" />
              <span className="font-semibold text-sm text-foreground">{them.teamName}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          {[
            { label: 'Record',    value: recordLabel(entry.wins, entry.losses) },
            { label: 'Win %',     value: winPctLabel(entry.wins, entry.losses) },
            { label: 'Avg Margin',value: `${margin >= 0 ? '+' : ''}${margin.toFixed(1)}` },
          ].map(s => (
            <div key={s.label} className="px-4 py-3 text-center">
              <div className="font-bold text-foreground">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Game list */}
        <div className="max-h-72 overflow-y-auto px-5 py-2">
          {[...entry.games]
            .sort((a, b) => Number(b.season) - Number(a.season) || a.week - b.week)
            .map((g, i) => (
              <GameRow key={i} g={g} myName={me.teamName} theirName={them.teamName} />
            ))}
        </div>
      </div>
    </div>
  );
}

// ── Matrix ────────────────────────────────────────────────────────────────────

function MatrixCell({
  entry,
  isSelf,
  onClick,
}: {
  entry: H2HEntry | null;
  isSelf: boolean;
  onClick?: () => void;
}) {
  if (isSelf) {
    return <td className="border border-border/30 w-20 h-12 bg-muted/20" />;
  }
  if (!entry || entry.wins + entry.losses === 0) {
    return <td className="border border-border/30 w-20 h-12 text-center text-muted-foreground/30 text-xs">—</td>;
  }
  const color = cellColor(entry.wins, entry.losses);
  return (
    <td
      className={`border border-border/30 w-20 h-12 text-center cursor-pointer transition-opacity hover:opacity-75 ${color}`}
      onClick={onClick}
    >
      <div className="font-bold text-sm tabular-nums leading-tight">{recordLabel(entry.wins, entry.losses)}</div>
      <div className="text-[10px] opacity-70">{winPctLabel(entry.wins, entry.losses)}</div>
    </td>
  );
}

// ── Rivalry cards ─────────────────────────────────────────────────────────────

function RivalryCard({
  m1, m2, e1, e2, onClick,
}: {
  m1: Manager; m2: Manager; e1: H2HEntry; e2: H2HEntry; onClick: () => void;
}) {
  const total   = e1.wins + e1.losses;
  const margin  = total > 0 ? Math.abs(e1.pointsFor - e1.pointsAgainst) / total : 0;
  const leader  = e1.wins > e1.losses ? m1 : e1.wins < e1.losses ? m2 : null;
  const isEven  = e1.wins === e1.losses;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors p-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar avatarId={m1.avatar} size={32} className="rounded-lg shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-sm text-foreground truncate">{m1.teamName}</div>
            <div className={`text-xs font-mono font-bold ${e1.wins >= e1.losses ? 'text-emerald-500' : 'text-red-500'}`}>
              {recordLabel(e1.wins, e1.losses)}
            </div>
          </div>
        </div>

        <div className="text-center shrink-0 px-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{total} games</div>
          {isEven
            ? <Minus className="h-3.5 w-3.5 mx-auto text-amber-500 mt-0.5" />
            : leader
              ? <Trophy className="h-3.5 w-3.5 mx-auto text-amber-500 mt-0.5" style={{ transform: leader === m1 ? 'scaleX(-1)' : undefined }} />
              : null
          }
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <div className="text-right min-w-0">
            <div className="font-semibold text-sm text-foreground truncate">{m2.teamName}</div>
            <div className={`text-xs font-mono font-bold ${e2.wins >= e2.losses ? 'text-emerald-500' : 'text-red-500'}`}>
              {recordLabel(e2.wins, e2.losses)}
            </div>
          </div>
          <Avatar avatarId={m2.avatar} size={32} className="rounded-lg shrink-0" />
        </div>
      </div>

      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${(e1.wins / Math.max(total, 1)) * 100}%` }}
        />
      </div>
    </button>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function RivalryView({ data }: { data: RivalriesResponse }) {
  const [view,       setView]       = useState<'matrix' | 'cards'>('matrix');
  const [detail,     setDetail]     = useState<{ me: Manager; them: Manager; entry: H2HEntry } | null>(null);

  const { managers, h2h } = data;

  // Sort managers by total games played (most active first)
  const sortedManagers = useMemo(() => {
    return [...managers].sort((a, b) => {
      const aGames = Object.values(h2h[a.userId] ?? {}).reduce((s, e) => s + e.wins + e.losses, 0);
      const bGames = Object.values(h2h[b.userId] ?? {}).reduce((s, e) => s + e.wins + e.losses, 0);
      return bGames - aGames;
    });
  }, [managers, h2h]);

  // All unique pairs for cards view
  const pairs = useMemo(() => {
    const seen = new Set<string>();
    const result: { m1: Manager; m2: Manager; e1: H2HEntry; e2: H2HEntry; total: number }[] = [];
    for (const m1 of sortedManagers) {
      for (const m2 of sortedManagers) {
        if (m1.userId === m2.userId) continue;
        const key = [m1.userId, m2.userId].sort().join('-');
        if (seen.has(key)) continue;
        seen.add(key);
        const e1 = h2h[m1.userId]?.[m2.userId];
        const e2 = h2h[m2.userId]?.[m1.userId];
        if (!e1 || !e2) continue;
        const total = e1.wins + e1.losses;
        if (total === 0) continue;
        result.push({ m1, m2, e1, e2, total });
      }
    }
    return result.sort((a, b) => b.total - a.total);
  }, [sortedManagers, h2h]);

  // Notable rivalries
  const highestScoring = [...pairs].sort((a, b) => {
    const avgA = (a.e1.pointsFor + a.e1.pointsAgainst) / Math.max(a.total, 1);
    const avgB = (b.e1.pointsFor + b.e1.pointsAgainst) / Math.max(b.total, 1);
    return avgB - avgA;
  })[0];
  const mostLopsided = [...pairs].sort((a, b) => {
    const skewA = Math.abs(a.e1.wins - a.e1.losses) / Math.max(a.total, 1);
    const skewB = Math.abs(b.e1.wins - b.e1.losses) / Math.max(b.total, 1);
    return skewB - skewA;
  })[0];
  const mostEvenly = [...pairs].sort((a, b) => {
    const skewA = Math.abs(a.e1.wins - a.e1.losses);
    const skewB = Math.abs(b.e1.wins - b.e1.losses);
    return skewA - skewB || b.total - a.total;
  })[0];

  const openDetail = (me: Manager, them: Manager) => {
    const entry = h2h[me.userId]?.[them.userId];
    if (entry) setDetail({ me, them, entry });
  };

  return (
    <div className="space-y-6">

      {/* Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Highest Scoring', pair: highestScoring, desc: (p: typeof highestScoring) => {
            const total = p.e1.pointsFor + p.e1.pointsAgainst;
            return `${total.toFixed(1)} combined pts`;
          }},
          { label: 'Most Dominant', pair: mostLopsided, desc: (p: typeof mostLopsided) => {
            const leaderEntry = p.e1.wins > p.e1.losses ? p.e1 : p.e2;
            const leader      = p.e1.wins > p.e1.losses ? p.m1 : p.m2;
            const record      = recordLabel(leaderEntry.wins, leaderEntry.losses);
            return `${leader.teamName} leads ${record} · ${leaderEntry.pointsFor.toFixed(1)} pts scored`;
          }},
          { label: 'Most Even', pair: mostEvenly, desc: (p: typeof mostEvenly) => {
            const total = p.e1.pointsFor + p.e1.pointsAgainst;
            return `${p.e1.wins}–${p.e1.losses} · ${total.toFixed(1)} combined pts`;
          }},
        ].map(({ label, pair, desc }) => pair && (
          <button
            key={label}
            onClick={() => openDetail(pair.m1, pair.m2)}
            className="rounded-xl border border-border bg-card p-4 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{label}</div>
            <div className="flex items-center gap-2">
              <Avatar avatarId={pair.m1.avatar} size={24} className="rounded-md shrink-0" />
              <span className="text-xs font-semibold text-foreground truncate">{pair.m1.teamName}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">vs</span>
              <Avatar avatarId={pair.m2.avatar} size={24} className="rounded-md shrink-0" />
              <span className="text-xs font-semibold text-foreground truncate">{pair.m2.teamName}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{desc(pair as any)}</div>
          </button>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 w-fit">
        {(['cards', 'matrix'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
              view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Cards view */}
      {view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pairs.map(({ m1, m2, e1, e2 }) => (
            <RivalryCard
              key={`${m1.userId}-${m2.userId}`}
              m1={m1} m2={m2} e1={e1} e2={e2}
              onClick={() => openDetail(m1, m2)}
            />
          ))}
        </div>
      )}

      {/* Matrix view */}
      {view === 'matrix' && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="border-collapse min-w-full">
            <thead>
              <tr>
                <th className="border border-border/30 bg-muted/40 p-2 min-w-[120px]" />
                {sortedManagers.map(m => (
                  <th key={m.userId} className="border border-border/30 bg-muted/40 p-2 min-w-[80px]">
                    <div className="flex flex-col items-center gap-1">
                      <Avatar avatarId={m.avatar} size={24} className="rounded-md" />
                      <span className="text-[10px] font-semibold text-foreground leading-tight text-center line-clamp-2 max-w-[72px]">
                        {m.teamName}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedManagers.map(rowM => (
                <tr key={rowM.userId}>
                  <td className="border border-border/30 bg-muted/20 p-2">
                    <div className="flex items-center gap-2">
                      <Avatar avatarId={rowM.avatar} size={24} className="rounded-md shrink-0" />
                      <span className="text-xs font-semibold text-foreground truncate max-w-[80px]">{rowM.teamName}</span>
                    </div>
                  </td>
                  {sortedManagers.map(colM => (
                    <MatrixCell
                      key={colM.userId}
                      entry={h2h[rowM.userId]?.[colM.userId] ?? null}
                      isSelf={rowM.userId === colM.userId}
                      onClick={() => openDetail(rowM, colM)}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground p-3 border-t border-border/30">
            Each cell shows that manager's record <em>against</em> the column manager.
          </p>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <DetailPanel
          me={detail.me}
          them={detail.them}
          entry={detail.entry}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
