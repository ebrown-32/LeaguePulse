/**
 * A manager's legacy: one score out of 100 that ranks every manager in the
 * league's history, weighing what a career is made of.
 *
 *   Championships   35   titles, against the league's most decorated manager
 *   Win percentage  25   steadied toward .500 by a season's worth of games, then
 *                        scored from .300 (none) to .700 (full)
 *   Wins            25   total wins: a long winning career, against the league's most
 *   Points          15   points a game, steadied toward the league's average the same
 *                        way, scored from 10% below that average (none) to 10% above (full)
 *
 * Titles and wins are shares of the league's leader; win percentage and points
 * are on fixed scales (against .500, against the league's average), so a small
 * gap between two managers is not stretched into a large one. The score means
 * the same in a high-scoring league as a low one, and a one-season hot streak
 * does not outrank a long winning career. The page shows the order, not the score.
 * Pure: the history page and the tests share it.
 */

export const LEGACY_WEIGHTS = { championships: 35, winPct: 25, wins: 25, points: 15 } as const;

/** Games of .500 (and of league-average scoring) blended into each career: about a season. */
const PRIOR_GAMES = 14;

export interface LegacyInput {
  userId: string;
  championships: number;
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  averagePointsPerGame: number;
}
export type LegacyParts = Record<keyof typeof LEGACY_WEIGHTS, number>;
export interface Legacy { userId: string; score: number; parts: LegacyParts }

const share = (v: number, max: number) => (max > 0 ? v / max : 0);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function legacyScores(managers: LegacyInput[]): Legacy[] {
  if (!managers.length) return [];
  const games = (m: LegacyInput) => m.totalWins + m.totalLosses + m.totalTies;
  const allGames = managers.reduce((n, m) => n + games(m), 0);
  const leaguePpg = allGames ? managers.reduce((s, m) => s + m.averagePointsPerGame * games(m), 0) / allGames : 0;

  const winPct = (m: LegacyInput) => (m.totalWins + m.totalTies / 2 + PRIOR_GAMES / 2) / (games(m) + PRIOR_GAMES);
  const ppg = (m: LegacyInput) => (m.averagePointsPerGame * games(m) + leaguePpg * PRIOR_GAMES) / (games(m) + PRIOR_GAMES);
  const maxTitles = Math.max(...managers.map(m => m.championships));
  const maxWins = Math.max(...managers.map(m => m.totalWins));

  return managers.map(m => {
    const parts: LegacyParts = {
      championships: share(m.championships, maxTitles),
      winPct: clamp01((winPct(m) - 0.3) / 0.4),
      wins: share(m.totalWins, maxWins),
      points: leaguePpg > 0 ? clamp01(0.5 + (ppg(m) / leaguePpg - 1) / 0.2) : 0.5,
    };
    const score = (Object.keys(LEGACY_WEIGHTS) as (keyof LegacyParts)[]).reduce((s, k) => s + LEGACY_WEIGHTS[k] * parts[k], 0);
    return { userId: m.userId, score: Math.round(score * 10) / 10, parts };
  });
}

/** Managers best first: by legacy, then titles, then wins. */
export function rankByLegacy<T extends LegacyInput>(managers: T[]): (T & { legacy: Legacy })[] {
  const scores = new Map(legacyScores(managers).map(l => [l.userId, l]));
  return managers
    .map(m => ({ ...m, legacy: scores.get(m.userId)! }))
    .sort((a, b) => b.legacy.score - a.legacy.score || b.championships - a.championships || b.totalWins - a.totalWins);
}
