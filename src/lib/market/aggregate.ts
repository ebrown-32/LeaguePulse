/**
 * One league's week, reduced to what the market keeps (lib/market): counts, never people.
 *
 *   players   for each player: on a roster, in a lineup (and the points he scored there), added,
 *             dropped, won on waivers (and for how much of the budget), acquired in a trade
 *   scoring   how many teams played, and their points, for the league's scoring environment
 *   trades    each trade as its sides: what each side received, with no team or manager on it
 *
 * Pure, for Node's test runner: the crawler (crawl.ts) fetches, this counts.
 */

export interface MatchupRow {
  roster_id: number;
  matchup_id?: number | null;
  points?: number | null;
  players?: string[] | null;
  starters?: string[] | null;
  players_points?: Record<string, number> | null;
}

export interface TransactionRow {
  transaction_id: string;
  type: string;
  status: string;
  status_updated?: number;
  created?: number;
  roster_ids?: number[];
  adds?: Record<string, number> | null;
  drops?: Record<string, number> | null;
  settings?: { waiver_bid?: number } | null;
  draft_picks?: { season: string; round: number; owner_id: number; previous_owner_id: number }[] | null;
  waiver_budget?: { sender: number; receiver: number; amount: number }[] | null;
}

export interface PlayerWeek {
  rostered: number; started: number; startPts: number;
  adds: number; drops: number; bids: number; bidHist: number[]; tradedFor: number;
}

export interface TradeSide { players: string[]; picks: { season: string; round: number }[]; faab: number }
export interface Trade { id: string; teams: number; sides: TradeSide[]; madeAt: number | null }

export interface WeekCounts {
  teams: number; ptsSum: number; ptsSq: number;
  players: Map<string, PlayerWeek>;
  trades: Trade[];
  adds: number;
}

/** Winning waiver bids, as a share of the budget: $0, then up to 1%, 3%, 5%, 10%, 20%, and more. */
export const BID_BUCKETS = ['$0', '1%', '3%', '5%', '10%', '20%', '20%+'] as const;
export const BID_EDGES = [0, 1, 3, 5, 10, 20, Infinity];

export function bidBucket(bid: number, budget: number): number {
  if (!(bid > 0) || !(budget > 0)) return 0;
  const pct = (bid / budget) * 100;
  for (let i = 1; i < BID_EDGES.length; i++) if (pct <= BID_EDGES[i]) return i;
  return BID_EDGES.length - 1;
}

const blank = (): PlayerWeek => ({ rostered: 0, started: 0, startPts: 0, adds: 0, drops: 0, bids: 0, bidHist: [0, 0, 0, 0, 0, 0, 0], tradedFor: 0 });

/**
 * @param budget the league's FAAB budget, or null when it doesn't bid for waivers
 * @param bestBall lineups set themselves in best ball, so nobody "started" anyone: starts aren't counted
 */
export function countWeek(matchups: MatchupRow[], transactions: TransactionRow[], opts: { budget: number | null; bestBall: boolean }): WeekCounts {
  const players = new Map<string, PlayerWeek>();
  const of = (id: string) => { let p = players.get(id); if (!p) { p = blank(); players.set(id, p); } return p; };
  const real = (id: string | null | undefined): id is string => Boolean(id) && id !== '0';
  let teams = 0, ptsSum = 0, ptsSq = 0, adds = 0;

  for (const m of matchups) {
    for (const id of new Set((m.players ?? []).filter(real))) of(id).rostered++;
    if (!opts.bestBall) {
      for (const id of new Set((m.starters ?? []).filter(real))) {
        const p = of(id);
        p.started++;
        p.startPts += Number(m.players_points?.[id] ?? 0);
      }
    }
    // The scoring environment counts games that were played, not byes or eliminated teams.
    const pts = Number(m.points ?? 0);
    if (m.matchup_id != null && pts > 0) { teams++; ptsSum += pts; ptsSq += pts * pts; }
  }

  const trades: Trade[] = [];
  for (const t of transactions) {
    if (t.status !== 'complete') continue;
    if (t.type === 'trade') {
      const rosters = [...new Set((t.roster_ids ?? []).map(Number))].sort((a, b) => a - b);
      if (rosters.length < 2) continue;
      const sides: TradeSide[] = rosters.map(rid => ({
        players: Object.entries(t.adds ?? {}).filter(([, r]) => Number(r) === rid).map(([id]) => id).filter(real).sort(),
        picks: (t.draft_picks ?? []).filter(p => Number(p.owner_id) === rid).map(p => ({ season: String(p.season), round: Number(p.round) })),
        faab: (t.waiver_budget ?? []).filter(b => Number(b.receiver) === rid).reduce((s, b) => s + Number(b.amount || 0), 0),
      }));
      for (const s of sides) for (const id of s.players) of(id).tradedFor++;
      trades.push({ id: t.transaction_id, teams: rosters.length, sides, madeAt: Number(t.status_updated ?? t.created ?? 0) || null });
      continue;
    }
    if (t.type !== 'waiver' && t.type !== 'free_agent') continue;
    for (const id of Object.keys(t.adds ?? {}).filter(real)) {
      const p = of(id);
      p.adds++;
      adds++;
      if (t.type === 'waiver' && opts.budget && t.settings?.waiver_bid != null) {
        p.bids++;
        p.bidHist[bidBucket(Number(t.settings.waiver_bid), opts.budget)]++;
      }
    }
    for (const id of Object.keys(t.drops ?? {}).filter(real)) of(id).drops++;
  }

  return { teams, ptsSum, ptsSq, players, trades, adds };
}

/**
 * The bid that would have won a share of the time, from a histogram of winning bids: the
 * bucket's upper edge, as a percent of the budget (0 for a $0 claim). Null with no bids.
 */
export function bidAt(hist: number[], share: number): number | null {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let run = 0;
  for (let i = 0; i < hist.length; i++) {
    run += hist[i];
    if (run / total >= share) return i === hist.length - 1 ? BID_EDGES[i - 1] : BID_EDGES[i];
  }
  return BID_EDGES[BID_EDGES.length - 2];
}
