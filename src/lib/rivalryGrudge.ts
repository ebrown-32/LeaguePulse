/**
 * Rivalry week's grudge score: how much a game between these two managers means, from their
 * all-time series (lib/rivalries), never vibes. Pure.
 *
 * The base is the series' own rivalry score (rivalryScore: how often they've met, how even it is,
 * how close the games were, the playoffs). On top, what makes a grudge fresh:
 *
 *   a last meeting decided by under ten points        +10
 *   a playoff game between them in the last two years  +8
 *   a streak of three or more one way                  +6, the side on the wrong end wants it back
 *
 * A pair needs three meetings to have a grudge at all, and a score of 55 to make it a rivalry week.
 * At most two a week, the biggest first, so it stays an occasion.
 */

import type { GameRecord } from './rivalries';

export interface Grudge {
  score: number;
  /** The reasons, each a fact that can be checked against the series. */
  reasons: string[];
  streak: { side: 'a' | 'b'; length: number } | null;
  last: GameRecord | null;
}

export const GRUDGE_MIN = 55;
export const GRUDGE_MAX_GAMES = 2;

const order = (g: GameRecord) => Number(g.season) * 100 + g.week;

export function grudge(games: GameRecord[], base: number, aName: string, bName: string, season: string): Grudge | null {
  if (games.length < 3) return null;
  const sorted = [...games].sort((x, y) => order(x) - order(y));
  const last = sorted[sorted.length - 1];
  const reasons: string[] = [];
  let score = base;

  const margin = Math.abs(last.score - last.opponentScore);
  if (margin < 10) {
    score += 10;
    reasons.push(`Last meeting decided by ${margin.toFixed(1)} points`);
  }
  const recentPlayoff = sorted.find(g => g.isPlayoff && Number(season) - Number(g.season) <= 2);
  if (recentPlayoff) {
    score += 8;
    reasons.push(`Met in the ${recentPlayoff.season} playoffs`);
  }
  // The run at the end of the series: who's won the last few.
  let streak: Grudge['streak'] = null;
  const winner = (g: GameRecord) => (g.score > g.opponentScore ? 'a' : g.score < g.opponentScore ? 'b' : null);
  const lastSide = winner(last);
  if (lastSide) {
    let n = 0;
    for (let i = sorted.length - 1; i >= 0 && winner(sorted[i]) === lastSide; i--) n++;
    streak = { side: lastSide, length: n };
    if (n >= 3) {
      score += 6;
      reasons.push(`${lastSide === 'a' ? aName : bName} has won the last ${n}`);
    }
  }
  return { score: Math.min(100, Math.round(score)), reasons, streak, last };
}
