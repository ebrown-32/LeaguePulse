/**
 * The best lineup a manager could have started, given what was on their roster.
 *
 * This is the foundation of coaching efficiency: what a team actually scored
 * means little without knowing what it could have scored. Sleeper reports
 * points for every rostered player, not just the starters, so the counterfactual
 * is fully determined by data rather than estimated.
 *
 * Metric concept credited to the Fantasy Football Metrics Weekly Report
 * (github.com/uberfastman/fantasy-football-metrics-weekly-report). This is an
 * independent TypeScript implementation over the Sleeper API; no code from that
 * GPL-3.0 project is used here.
 */

/** Which fantasy positions may fill each Sleeper roster slot. */
const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  WRRB_WRT: ['RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
  DL: ['DL'],
  LB: ['LB'],
  DB: ['DB'],
};

/** Slots that are not part of the starting lineup. */
const NON_STARTING = new Set(['BN', 'IR', 'TAXI']);

export interface LineupPlayer {
  playerId: string;
  points: number;
  /** Sleeper's fantasy_positions, e.g. ['RB'] or ['WR','TE']. */
  positions: string[];
}

export interface OptimalLineup {
  /** Total points of the best legal lineup. */
  total: number;
  /** Slot label to the player filling it. */
  assignments: { slot: string; playerId: string; points: number }[];
  /** Starting slots that no rostered player could legally fill. */
  unfilled: string[];
}

/** The starting slots of a league, in order, excluding bench and IR. */
export function startingSlots(rosterPositions: string[] | undefined): string[] {
  return (rosterPositions ?? []).filter(s => !NON_STARTING.has(s));
}

function eligible(slot: string, player: LineupPlayer): boolean {
  const allowed = SLOT_ELIGIBILITY[slot];
  // An unrecognised slot accepts the position that shares its name, which is
  // how Sleeper names every simple slot, so new ones degrade sensibly.
  if (!allowed) return player.positions.includes(slot);
  return player.positions.some(p => allowed.includes(p));
}

/**
 * Maximum-points legal lineup.
 *
 * Players are considered highest-scoring first, and each is placed via an
 * augmenting path that may shuffle already-placed players into other slots
 * they are eligible for. Bipartite matchings form a transversal matroid, so
 * taking players in descending order of points and keeping any that can be
 * added without displacing another yields the true maximum, not an
 * approximation. That matters: a greedy pass that filled FLEX before RB would
 * quietly understate the optimal score and inflate everyone's efficiency.
 */
export function optimalLineup(
  players: LineupPlayer[],
  rosterPositions: string[] | undefined,
): OptimalLineup {
  const slots = startingSlots(rosterPositions);
  if (!slots.length) return { total: 0, assignments: [], unfilled: [] };

  // slotIndex -> playerIndex
  const filledBy = new Array<number>(slots.length).fill(-1);
  const order = players
    .map((p, i) => i)
    .sort((a, b) => players[b].points - players[a].points);

  /** Kuhn's augmenting path: can this player take a slot, shuffling others? */
  const place = (playerIdx: number, seen: boolean[]): boolean => {
    for (let s = 0; s < slots.length; s++) {
      if (seen[s] || !eligible(slots[s], players[playerIdx])) continue;
      seen[s] = true;
      if (filledBy[s] === -1 || place(filledBy[s], seen)) {
        filledBy[s] = playerIdx;
        return true;
      }
    }
    return false;
  };

  for (const idx of order) {
    // A negative-scoring player is worse than an empty slot, and Sleeper does
    // produce negative scores (a defense giving up 40, a fumbling kicker).
    if (players[idx].points <= 0) continue;
    place(idx, new Array(slots.length).fill(false));
  }

  const assignments: OptimalLineup['assignments'] = [];
  const unfilled: string[] = [];
  let total = 0;
  slots.forEach((slot, s) => {
    const p = filledBy[s] === -1 ? null : players[filledBy[s]];
    if (!p) { unfilled.push(slot); return; }
    total += p.points;
    assignments.push({ slot, playerId: p.playerId, points: p.points });
  });

  return { total: Number(total.toFixed(2)), assignments, unfilled };
}

/**
 * How much of the available points a manager actually started.
 *
 * Returns null rather than a number when there is no optimal score to divide
 * by, which happens on a bye week or before any game has been played. A zero
 * there would read as "terrible management" rather than "no games yet".
 */
export function coachingEfficiency(actual: number, optimal: number): number | null {
  if (!optimal) return null;
  return Number(((actual / optimal) * 100).toFixed(2));
}
