/**
 * Pick'em's scoring, pure, so the page, the Desk and the tests share one set of rules.
 *
 *   A pick       one manager's call on one of the week's other matchups: which side wins.
 *   The lock     one pick a week a manager can stake: worth two if it's right, nothing if not.
 *   A point      each right pick; a tie (both sides on the same score) scores nobody.
 *   An upset     a right pick on the underdog earns a bonus on top: +1 when the forecast gave
 *                it under 40% when it was picked, +2 under 25%. The odds are the ones at the
 *                moment of the pick, kept with it, so a late swing can't make or unmake one.
 *   The table    the season's points, then right picks, then the best single week, then the name.
 *   The sim      a manager who doesn't pick a week gets a simulated card when it locks, so the
 *                rest of the league always has a full table to beat: each game picked by a coin
 *                weighted with the pre-game odds (a sensible, beatable predictor), no lock. A sim
 *                card scores like any other but pays nothing, and the Cup goes to someone who played.
 *
 * A manager never picks their own game: it isn't on their card, and a pick for it is ignored.
 */

export interface WeekPicks {
  /** matchupId to the roster picked to win. */
  picks: Record<string, number>;
  /** The matchup staked, worth double. */
  lock?: number | null;
  /** matchupId to the picked side's chance of winning, from the forecast, when it was picked. */
  odds?: Record<string, number>;
  at: string;
  /** Simulated: the manager didn't pick this week. */
  auto?: boolean;
}

/** Below these, a right pick is an upset: the bonus it earns. */
export const UPSET = { odds: 0.4, big: 0.25 } as const;
export function upsetBonus(odds: number | undefined): number {
  if (odds === undefined || !Number.isFinite(odds)) return 0;
  return odds < UPSET.big ? 2 : odds < UPSET.odds ? 1 : 0;
}

/**
 * What Pick'em pays a franchise, in the tycoon's units (one is $4,000, lib/tycoon/economy): every
 * point (upsets and locks included) is $100k into its bank the Tuesday a week goes final, and the
 * Cup is $5M. Enough to matter (a good week buys a hot dog cart), never more than a home game.
 */
export const PICKEM_PAY = { perPoint: 25, cup: 1_250, unit: 4_000 } as const;

/** What a manager has won this season, in dollars. */
export const pickemDollars = (points: number, champion: boolean) => (points * PICKEM_PAY.perPoint + (champion ? PICKEM_PAY.cup : 0)) * PICKEM_PAY.unit;

/** The Cup's holder: the top of the table among managers who picked at least one week themselves. */
export function cupHolder(rows: TableRow[]): string | null {
  return rows.find(r => r.simWeeks < r.weeks)?.userId ?? null;
}

/** A number from 0 to 1 that's the same every time for the same words. */
function unit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return (h >>> 0) / 2 ** 32;
}

/**
 * The sim's card for a manager who didn't pick: every game but their own, each side picked with
 * its pre-game chance of winning (a coin flip where there were no odds), the same every time for
 * the same seed. No lock.
 */
export function simulatePicks(
  slate: { matchupId: number; a: { rosterId: number }; b: { rosterId: number } }[],
  ownRoster: number | null, aOdds: Map<number, number>, seed: string, at: string,
): WeekPicks {
  const picks: Record<string, number> = {}, odds: Record<string, number> = {};
  for (const g of slate) {
    if (ownRoster !== null && (g.a.rosterId === ownRoster || g.b.rosterId === ownRoster)) continue;
    const pa = aOdds.get(g.matchupId) ?? 0.5;
    const takeA = unit(`${seed}:${g.matchupId}`) < pa;
    picks[String(g.matchupId)] = takeA ? g.a.rosterId : g.b.rosterId;
    odds[String(g.matchupId)] = Math.round((takeA ? pa : 1 - pa) * 1000) / 1000;
  }
  return { picks, odds, lock: null, at, auto: true };
}

/** A finished game: who won it (null for a tie). */
export interface Result { matchupId: number; winner: number | null; rosters: [number, number] }

export interface WeekScore { points: number; right: number; wrong: number; lockRight: boolean | null; made: number; upsets?: number; auto?: boolean }

/** One manager's week, against the week's results. Games without a result yet aren't counted. */
export function scoreWeek(p: WeekPicks | undefined, results: Result[], ownRoster: number | null): WeekScore {
  const out: WeekScore = { points: 0, right: 0, wrong: 0, lockRight: null, made: 0, upsets: 0 };
  if (!p) return out;
  if (p.auto) out.auto = true;
  for (const r of results) {
    if (ownRoster !== null && r.rosters.includes(ownRoster)) continue;
    const pick = p.picks[String(r.matchupId)];
    if (pick === undefined || !r.rosters.includes(pick)) continue;
    out.made++;
    if (r.winner === null) continue;
    const locked = p.lock === r.matchupId;
    if (pick === r.winner) {
      out.right++;
      out.points += locked ? 2 : 1;
      if (locked) out.lockRight = true;
      const bonus = upsetBonus(p.odds?.[String(r.matchupId)]);
      if (bonus) { out.points += bonus; out.upsets!++; }
    } else {
      out.wrong++;
      if (locked) out.lockRight = false;
    }
  }
  return out;
}

export interface TableRow {
  userId: string;
  points: number;
  right: number;
  wrong: number;
  weeks: number;
  bestWeek: number;
  locksRight: number;
  locksPlayed: number;
  /** Right picks on underdogs. */
  upsets: number;
  /** Weeks the sim picked for them. */
  simWeeks: number;
  /** Each week's points, by week, for the sparkline. */
  byWeek: Record<number, number>;
}

/** The season so far, best first. */
export function seasonTable(rows: Map<string, TableRow>): TableRow[] {
  return [...rows.values()].sort((a, b) =>
    b.points - a.points || b.right - a.right || b.bestWeek - a.bestWeek || a.userId.localeCompare(b.userId));
}

export function addWeek(rows: Map<string, TableRow>, userId: string, week: number, s: WeekScore) {
  if (!s.made) return;
  const r = rows.get(userId) ?? { userId, points: 0, right: 0, wrong: 0, weeks: 0, bestWeek: 0, locksRight: 0, locksPlayed: 0, upsets: 0, simWeeks: 0, byWeek: {} };
  r.points += s.points; r.right += s.right; r.wrong += s.wrong; r.weeks++; r.upsets += s.upsets ?? 0; if (s.auto) r.simWeeks++;
  r.bestWeek = Math.max(r.bestWeek, s.points);
  if (s.lockRight !== null) { r.locksPlayed++; if (s.lockRight) r.locksRight++; }
  r.byWeek[week] = s.points;
  rows.set(userId, r);
}

/**
 * A week's best and worst predictors, among managers who picked at least half the slate: one
 * pick, right or wrong, says nothing. Ties go to whoever got more (or fewer) right.
 */
export function weekExtremes(scores: { userId: string; s: WeekScore }[], slate: number) {
  const played = scores.filter(x => x.s.right + x.s.wrong >= Math.max(1, Math.ceil(slate / 2)));
  if (played.length < 2) return null;
  const acc = (x: { s: WeekScore }) => x.s.right / Math.max(1, x.s.right + x.s.wrong);
  const sorted = [...played].sort((a, b) => b.s.points - a.s.points || acc(b) - acc(a) || b.s.right - a.s.right);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  if (best.s.points === worst.s.points) return null;
  return { best, worst };
}
