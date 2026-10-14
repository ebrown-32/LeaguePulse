'use client';

/**
 * One quiet line where an old season's data is missing, so an empty list is
 * not read as a quiet season. Kept to the minimum: shown only for the season
 * on screen, never as a banner. See src/lib/coverage.ts.
 */

import { cn } from '@/lib/utils';
import type { SeasonGaps } from '@/lib/coverage';

type Topic = 'moves' | 'lineups';

function line(g: SeasonGaps, topic: Topic): string | null {
  if (topic === 'lineups') {
    if (g.lineups) return null;
    return g.source === 'manual' ? `Lineups weren’t recorded for ${g.season}.` : `${g.source} didn’t keep lineups for ${g.season}.`;
  }
  if (g.source === 'manual' || (g.moves && g.trades)) return null;
  return `${g.source} didn’t keep transactions for ${g.season}.`;
}

export default function DataGapNote({ gap, topic, className }: { gap: SeasonGaps | null | undefined; topic: Topic; className?: string }) {
  const text = gap ? line(gap, topic) : null;
  if (!text) return null;
  return <p className={cn('text-[12px] text-muted-foreground', className)}>{text}</p>;
}

/** Seasons as "2017 to 2019", or "2017, 2019" when they do not run on. */
function seasonRange(seasons: string[]): string {
  const ys = [...new Set(seasons.map(Number))].filter(Boolean).sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const y of ys) {
    const last = runs[runs.length - 1];
    if (last && y === last[1] + 1) last[1] = y; else runs.push([y, y]);
  }
  return runs.map(([a, b]) => (a === b ? String(a) : b === a + 1 ? `${a} and ${b}` : `${a} to ${b}`)).join(', ');
}

const spanOf = (seasons: string[]) => {
  const ys = seasons.map(Number).filter(Boolean);
  return `${Math.min(...ys)} to ${Math.max(...ys)}`;
};

/**
 * The line under a list of trades: which seasons the platform kept no trades
 * for, and which seasons' trades were rebuilt from weekly rosters. Nothing
 * when every trade shown came straight from the platform.
 */
export function TradesNote({ gaps, rebuiltSeasons, className }: { gaps: SeasonGaps[]; rebuiltSeasons: string[]; className?: string }) {
  const missing = gaps.filter(g => g.source !== 'manual' && !g.trades);
  const parts = [
    missing.length && `${missing[0].source} didn’t keep trades for ${seasonRange(missing.map(g => g.season))}.`,
    // As one span: a season in between with no trades to rebuild needs no gap in the wording.
    rebuiltSeasons.length && `Trades ${rebuiltSeasons.length > 1 ? `from ${spanOf(rebuiltSeasons)}` : `for ${rebuiltSeasons[0]}`} were rebuilt from weekly rosters.`,
  ].filter(Boolean);
  if (!parts.length) return null;
  return <p className={cn('text-[12px] text-muted-foreground', className)}>{parts.join(' ')}</p>;
}
