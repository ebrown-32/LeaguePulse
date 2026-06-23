'use client';

import { useState, useMemo } from 'react';
import { X, TrendingUp, TrendingDown, Minus, Trophy, Sword, ArrowLeftRight } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import type { Manager, H2HEntry, GameRecord, TradeRecord, RivalriesResponse } from '@/app/api/rivalries/route';
import { track } from '@/lib/mixpanel';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Cell intensity — based on lopsidedness, not direction ────────────────────
// Returns the same value for [A][B] and [B][A] so the matrix is symmetric.
// 0 = perfectly even, 1 = completely one-sided.

function dominanceRatio(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.abs((wins / total) - 0.5) * 2; // 0 at 50/50, 1 at 100/0
}

function cellStyle(wins: number, losses: number): { bg: string; text: string } {
  const d = dominanceRatio(wins, losses);
  if (d < 0.1)  return { bg: 'bg-transparent',      text: 'text-foreground'           }; // near-even
  if (d < 0.25) return { bg: 'bg-amber-500/10',      text: 'text-amber-600 dark:text-amber-400'  }; // slight edge
  if (d < 0.5)  return { bg: 'bg-orange-500/15',     text: 'text-orange-600 dark:text-orange-400' }; // clear edge
  return           { bg: 'bg-red-500/15',             text: 'text-red-600 dark:text-red-400'    }; // dominant
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function pickLabel(pick: { round: number; season: string }): string {
  const suffix = ['1st', '2nd', '3rd'][pick.round - 1] ?? `${pick.round}th`;
  return `${pick.season} ${suffix}`;
}

function GameRow({ g, myName, theirName }: { g: GameRecord; myName: string; theirName: string }) {
  const iWon = g.score > g.opponentScore;
  return (
    <div className={`py-2 border-b border-border/40 last:border-0 ${g.isPlayoff ? 'bg-amber-500/4' : ''}`}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-muted-foreground tabular-nums text-xs w-14">{g.season} W{g.week}</span>
          {g.isPlayoff && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500 border border-amber-500/30 px-1 py-0.5 rounded">PO</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
          <div className="text-right min-w-0">
            <span className="text-[10px] text-muted-foreground block truncate max-w-[80px]">{myName}</span>
            <span className={`font-mono font-semibold tabular-nums text-sm ${iWon ? 'text-emerald-500' : 'text-muted-foreground'}`}>
              {g.score.toFixed(2)}
            </span>
          </div>
          <span className="text-muted-foreground text-xs shrink-0">vs</span>
          <div className="text-left min-w-0">
            <span className="text-[10px] text-muted-foreground block truncate max-w-[80px]">{theirName}</span>
            <span className={`font-mono font-semibold tabular-nums text-sm ${!iWon ? 'text-red-500' : 'text-muted-foreground'}`}>
              {g.opponentScore.toFixed(2)}
            </span>
          </div>
          <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${iWon ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>
            {iWon ? 'W' : 'L'}
          </span>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({
  me, them, entry, tradeHistory, onClose,
}: {
  me: Manager;
  them: Manager;
  entry: H2HEntry;
  tradeHistory: TradeRecord[];
  onClose: () => void;
}) {
  const total  = entry.wins + entry.losses;
  const margin = total > 0 ? (entry.pointsFor - entry.pointsAgainst) / total : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <Avatar avatarId={me.avatar}   size={28} className="rounded-lg shrink-0" />
              <span className="font-semibold text-sm text-foreground truncate">{me.teamName}</span>
            </div>
            <Sword className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0">
              <Avatar avatarId={them.avatar} size={28} className="rounded-lg shrink-0" />
              <span className="font-semibold text-sm text-foreground truncate">{them.teamName}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 shrink-0 ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border shrink-0">
          {[
            { label: 'Record',     value: recordLabel(entry.wins, entry.losses) },
            { label: 'Win %',      value: winPctLabel(entry.wins, entry.losses) },
            { label: 'Avg Margin', value: `${margin >= 0 ? '+' : ''}${margin.toFixed(1)}` },
          ].map(s => (
            <div key={s.label} className="px-4 py-3 text-center">
              <div className="font-bold text-foreground">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Points comparison */}
        <div className="grid grid-cols-2 divide-x divide-border border-b border-border shrink-0">
          <div className="px-4 py-3 text-center">
            <div className="font-bold text-foreground tabular-nums">{entry.pointsFor.toFixed(1)}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5 truncate">{me.teamName} pts</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="font-bold text-foreground tabular-nums">{entry.pointsAgainst.toFixed(1)}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5 truncate">{them.teamName} pts</div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Trade history */}
          {tradeHistory.length > 0 && (
            <div className="border-b border-border">
              <div className="flex items-center gap-1.5 px-5 pt-3 pb-2">
                <ArrowLeftRight className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Trade History</span>
              </div>
              <div className="px-5 pb-3 space-y-3">
                {[...tradeHistory]
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .map((trade, i) => {
                    const mySide   = trade.sides.find(s => s.userId === me.userId);
                    const theirSide = trade.sides.find(s => s.userId === them.userId);
                    return (
                      <div key={i} className="text-xs rounded-lg border border-border/50 bg-muted/20 p-3">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          {trade.season} — Week {trade.week}
                        </div>
                        <div className="space-y-1.5">
                          {[
                            { label: me.teamName,   side: mySide },
                            { label: them.teamName, side: theirSide },
                          ].map(({ label, side }) => {
                            if (!side) return null;
                            const assets: string[] = [
                              ...side.picks.map(pickLabel),
                              ...(side.playerCount > 0 ? [`${side.playerCount} player${side.playerCount > 1 ? 's' : ''}`] : []),
                            ];
                            return (
                              <div key={label} className="flex gap-2">
                                <span className="font-semibold text-foreground truncate max-w-[90px] shrink-0">{label}</span>
                                <span className="text-muted-foreground">received:</span>
                                <span className="text-foreground">
                                  {assets.length > 0 ? assets.join(', ') : '—'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Game list */}
          <div className="px-5 py-2">
            <div className="flex items-center gap-1.5 py-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Game History</span>
            </div>
            {[...entry.games]
              .sort((a, b) => Number(b.season) - Number(a.season) || a.week - b.week)
              .map((g, i) => (
                <GameRow key={i} g={g} myName={me.teamName} theirName={them.teamName} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Matrix ────────────────────────────────────────────────────────────────────

function MatrixCell({
  entry, isSelf, rowManager, colManager, onClick,
}: {
  entry: H2HEntry | null;
  isSelf: boolean;
  rowManager: Manager;
  colManager: Manager;
  onClick?: () => void;
}) {
  if (isSelf) {
    return <td className="border border-border/30 w-20 h-14 bg-muted/20" />;
  }
  if (!entry || entry.wins + entry.losses === 0) {
    return <td className="border border-border/30 w-20 h-14 text-center text-muted-foreground/30 text-xs">—</td>;
  }
  const { bg, text } = cellStyle(entry.wins, entry.losses);
  const isEven  = entry.wins === entry.losses;
  const leader  = entry.wins > entry.losses ? rowManager : entry.wins < entry.losses ? colManager : null;

  return (
    <td
      className={`border border-border/30 w-20 h-14 text-center cursor-pointer transition-opacity hover:opacity-80 ${bg} ${text}`}
      onClick={onClick}
    >
      <div className="font-bold text-sm tabular-nums leading-tight">
        {recordLabel(entry.wins, entry.losses)}
      </div>
      {isEven ? (
        <div className="text-[10px] opacity-50 mt-0.5">Even</div>
      ) : leader ? (
        <div className="flex items-center justify-center gap-1 mt-0.5">
          <Avatar avatarId={leader.avatar} size={13} className="rounded-sm shrink-0" />
          <span className="text-[10px] font-medium truncate max-w-[44px]">{leader.teamName}</span>
        </div>
      ) : null}
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
  const [detail,     setDetail]     = useState<{ me: Manager; them: Manager; entry: H2HEntry; tradeHistory: TradeRecord[] } | null>(null);

  const { managers, h2h, trades } = data;

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
    if (!entry) return;
    track('rivalry_drilldown_opened', {
      team_a: me.teamName,
      team_b: them.teamName,
      record: `${entry.wins}-${entry.losses}`,
      total_games: entry.wins + entry.losses,
    });
    setDetail({ me, them, entry, tradeHistory: trades?.[me.userId]?.[them.userId] ?? [] });
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
                      rowManager={rowM}
                      colManager={colM}
                      onClick={() => openDetail(rowM, colM)}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-3 border-t border-border/30 text-[11px] text-muted-foreground">
            <span>Read across rows. ▲ = row team leads &nbsp;·&nbsp; ▼ = row team trails</span>
            <span className="flex items-center gap-2">
              Color intensity shows how one-sided the series is:
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-border/40" />Even</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-500/20" />Slight</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-orange-500/25" />Clear</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500/25" />Dominant</span>
            </span>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <DetailPanel
          me={detail.me}
          them={detail.them}
          entry={detail.entry}
          tradeHistory={detail.tradeHistory}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
