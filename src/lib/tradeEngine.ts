const SLEEPER_BASE = 'https://api.sleeper.app/v1';

const RELEVANT_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

// Minimum roster spots typically needed at each position
const MIN_STARTERS: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };

export const POSITION_COLORS: Record<string, string> = {
  QB:  'text-amber-400  bg-amber-400/10  border-amber-400/30',
  RB:  'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  WR:  'text-sky-400    bg-sky-400/10    border-sky-400/30',
  TE:  'text-violet-400 bg-violet-400/10 border-violet-400/30',
  K:   'text-slate-400  bg-slate-400/10  border-slate-400/30',
  DEF: 'text-rose-400   bg-rose-400/10   border-rose-400/30',
};

export interface PlayerValue {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  avgPPG: number;
  totalPoints: number;
  gamesPlayed: number;
  value: number; // position-normalized 0–100 percentile
}

export interface TradeProposal {
  id: string;
  sideA: { rosterId: number; teamName: string; record: string; gives: PlayerValue[] };
  sideB: { rosterId: number; teamName: string; record: string; gives: PlayerValue[] };
  label: string;
  labelVariant: 'green' | 'blue' | 'amber' | 'purple' | 'red';
  tagline: string;
  rationale: string;
  fairness: number; // 0–100, 50 = balanced
}

interface TeamProfile {
  rosterId: number;
  teamName: string;
  record: string;
  wins: number;
  losses: number;
  winPct: number;
  isContender: boolean;
  isRebuilding: boolean;
  byPos: Record<string, PlayerValue[]>;
  players: PlayerValue[];
}

export async function generateTradeProposals(leagueId: string): Promise<TradeProposal[]> {
  // 1. NFL state → current week & season
  const nflState = await fetch(`${SLEEPER_BASE}/state/nfl`).then(r => r.json());
  const currentWeek = Math.max(1, nflState.week ?? 1);

  // 2. League data in parallel
  const [rosters, users, allPlayers] = await Promise.all([
    fetch(`${SLEEPER_BASE}/league/${leagueId}/rosters`).then(r => r.json()),
    fetch(`${SLEEPER_BASE}/league/${leagueId}/users`).then(r => r.json()),
    fetch(`${SLEEPER_BASE}/players/nfl`).then(r => r.json()),
  ]);

  // 3. Matchup history — fetch all completed weeks in parallel
  const weeksToFetch = Math.min(currentWeek, 14);
  const matchupWeeks: any[][] = await Promise.all(
    Array.from({ length: weeksToFetch }, (_, i) => i + 1).map(week =>
      fetch(`${SLEEPER_BASE}/league/${leagueId}/matchups/${week}`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
    )
  );

  // 4. Aggregate player fantasy points from matchup history
  const playerPointsByWeek: Record<string, number[]> = {};

  for (const weekMatchups of matchupWeeks) {
    for (const matchup of (weekMatchups ?? [])) {
      const pp: Record<string, number> = matchup.players_points ?? {};
      for (const pid of (matchup.players ?? [])) {
        if (!playerPointsByWeek[pid]) playerPointsByWeek[pid] = [];
        playerPointsByWeek[pid].push(pp[pid] ?? 0);
      }
    }
  }

  // 5. Build player value objects for all currently rostered players
  const rosteredPlayerIds = new Set<string>();
  for (const roster of rosters) {
    for (const pid of (roster.players ?? [])) rosteredPlayerIds.add(pid);
  }

  const playerValues: Record<string, PlayerValue> = {};
  for (const pid of rosteredPlayerIds) {
    const meta = allPlayers[pid];
    if (!meta) continue;
    const pos: string = meta.fantasy_positions?.[0] ?? meta.position ?? '';
    if (!RELEVANT_POSITIONS.includes(pos as any)) continue;

    const points = playerPointsByWeek[pid] ?? [];
    const totalPoints = points.reduce((a, b) => a + b, 0);
    const gamesPlayed = points.filter(p => p > 0).length;
    const avgPPG = gamesPlayed > 0 ? totalPoints / gamesPlayed : 0;

    playerValues[pid] = {
      playerId: pid,
      name: `${meta.first_name ?? ''} ${meta.last_name ?? ''}`.trim() || 'Unknown',
      position: pos,
      nflTeam: meta.team ?? 'FA',
      avgPPG,
      totalPoints,
      gamesPlayed,
      value: 0,
    };
  }

  // 6. Normalize value within position to 0–100 percentile
  const byPosition = groupBy(Object.values(playerValues), p => p.position);
  for (const players of Object.values(byPosition)) {
    const sorted = [...players].sort((a, b) => a.avgPPG - b.avgPPG);
    sorted.forEach((p, i) => {
      playerValues[p.playerId].value = sorted.length <= 1
        ? 50
        : Math.round((i / (sorted.length - 1)) * 100);
    });
  }

  // 7. Build team profiles
  const userLookup = new Map<string, any>(users.map((u: any) => [u.user_id, u]));

  const teams: TeamProfile[] = rosters.map((roster: any) => {
    const user = userLookup.get(roster.owner_id);
    const teamName: string =
      user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
    const wins: number = roster.settings?.wins ?? 0;
    const losses: number = roster.settings?.losses ?? 0;
    const record = `${wins}-${losses}`;
    const totalGames = wins + losses;
    const winPct = totalGames > 0 ? wins / totalGames : 0.5;

    const players = (roster.players ?? [])
      .map((pid: string) => playerValues[pid])
      .filter(Boolean) as PlayerValue[];

    const byPos: Record<string, PlayerValue[]> = {};
    for (const pos of RELEVANT_POSITIONS) {
      byPos[pos] = players
        .filter(p => p.position === pos)
        .sort((a, b) => b.avgPPG - a.avgPPG);
    }

    return {
      rosterId: roster.roster_id,
      teamName,
      record,
      wins,
      losses,
      winPct,
      isContender: winPct >= 0.6,
      isRebuilding: winPct <= 0.35,
      byPos,
      players,
    };
  });

  // 8. Generate proposals
  const proposals: TradeProposal[] = [];

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      proposals.push(...positionalSwaps(teams[i], teams[j]));
      proposals.push(...starForDepth(teams[i], teams[j]));
    }
  }

  // 9. Deduplicate by team pair, rank, and return top 15
  const seen = new Set<string>();
  const unique = proposals.filter(p => {
    const key = `${Math.min(p.sideA.rosterId, p.sideB.rosterId)}-${Math.max(p.sideA.rosterId, p.sideB.rosterId)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique
    .sort((a, b) => {
      const balanceA = 50 - Math.abs(a.fairness - 50);
      const balanceB = 50 - Math.abs(b.fairness - 50);
      const valueA = avgValue(a.sideA.gives) + avgValue(a.sideB.gives);
      const valueB = avgValue(b.sideA.gives) + avgValue(b.sideB.gives);
      return (balanceB + valueB) - (balanceA + valueA);
    })
    .slice(0, 16);
}

function positionalSwaps(a: TeamProfile, b: TeamProfile): TradeProposal[] {
  const trades: TradeProposal[] = [];

  for (const posA of RELEVANT_POSITIONS) {
    for (const posB of RELEVANT_POSITIONS) {
      if (posA === posB) continue;

      const minA = MIN_STARTERS[posA] ?? 1;
      const minB = MIN_STARTERS[posB] ?? 1;

      const aSurplusA = (a.byPos[posA]?.length ?? 0) >= minA + 2;
      const aNeedsB   = (a.byPos[posB]?.length ?? 0) <= minB;
      const bSurplusB = (b.byPos[posB]?.length ?? 0) >= minB + 2;
      const bNeedsA   = (b.byPos[posA]?.length ?? 0) <= minA;

      if (!aSurplusA || !aNeedsB || !bSurplusB || !bNeedsA) continue;

      // Trade their luxury #2 at the surplus position
      const fromA = a.byPos[posA][1];
      const fromB = b.byPos[posB][1];
      if (!fromA || !fromB) continue;

      const fairness = calcFairness([fromA], [fromB]);
      if (fairness < 22 || fairness > 78) continue;

      const balanced = fairness >= 35 && fairness <= 65;

      trades.push({
        id: `swap-${a.rosterId}-${b.rosterId}-${posA}-${posB}`,
        sideA: { rosterId: a.rosterId, teamName: a.teamName, record: a.record, gives: [fromA] },
        sideB: { rosterId: b.rosterId, teamName: b.teamName, record: b.record, gives: [fromB] },
        label: balanced ? 'Win-Win' : 'Slight Edge',
        labelVariant: balanced ? 'green' : 'blue',
        tagline: balanced
          ? 'Both rosters get exactly what they need'
          : 'One side edges it — but both improve',
        rationale: swapRationale(a, b, fromA, fromB, posA, posB),
        fairness,
      });
    }
  }

  return trades;
}

function starForDepth(a: TeamProfile, b: TeamProfile): TradeProposal[] {
  const trades: TradeProposal[] = [];

  for (const pos of RELEVANT_POSITIONS) {
    for (const [seller, buyer] of [[a, b], [b, a]]) {
      const star = seller.byPos[pos]?.[0];
      if (!star || star.value < 72) continue;

      // Build a 2-player package from the buyer
      const pkg: PlayerValue[] = [];
      let pkgVal = 0;

      for (const p of RELEVANT_POSITIONS) {
        for (const player of (buyer.byPos[p] ?? [])) {
          if (pkg.length >= 2) break;
          if (player.playerId === star.playerId) continue;
          if (player.value >= 35 && pkgVal + player.value <= star.value * 1.25) {
            pkg.push(player);
            pkgVal += player.value;
          }
        }
        if (pkg.length >= 2) break;
      }

      if (pkg.length < 2) continue;

      const fairness = calcFairness([star], pkg);
      if (fairness < 25 || fairness > 75) continue;

      const sellerSide  = seller.rosterId === a.rosterId
        ? { rosterId: a.rosterId, teamName: a.teamName, record: a.record, gives: [star] }
        : { rosterId: b.rosterId, teamName: b.teamName, record: b.record, gives: [star] };
      const buyerSide = buyer.rosterId === a.rosterId
        ? { rosterId: a.rosterId, teamName: a.teamName, record: a.record, gives: pkg }
        : { rosterId: b.rosterId, teamName: b.teamName, record: b.record, gives: pkg };

      const isSell = seller.isRebuilding;

      trades.push({
        id: `star-${seller.rosterId}-${buyer.rosterId}-${pos}`,
        sideA: seller.rosterId === a.rosterId ? sellerSide : buyerSide,
        sideB: seller.rosterId === b.rosterId ? sellerSide : buyerSide,
        label: isSell ? 'Sell High' : 'Big Swing',
        labelVariant: isSell ? 'purple' : 'amber',
        tagline: isSell
          ? `${seller.teamName} cashes in before the window closes`
          : `${buyer.teamName} goes all-in for a championship run`,
        rationale: starRationale(seller, buyer, star, pkg, isSell),
        fairness,
      });
    }
  }

  return trades;
}

function calcFairness(sideA: PlayerValue[], sideB: PlayerValue[]): number {
  const valA = sideA.reduce((s, p) => s + p.value, 0);
  const valB = sideB.reduce((s, p) => s + p.value, 0);
  const total = valA + valB;
  if (total === 0) return 50;
  return Math.round((valB / total) * 100);
}

const SWAP_RATIONALES = [
  (a: TeamProfile, b: TeamProfile, pA: PlayerValue, pB: PlayerValue, posA: string, posB: string) =>
    `${a.teamName} has been stacking ${posA}s all season while their ${posB} situation is quietly killing them. ${b.teamName} is the mirror image — deep at ${posB}, starving for ${posA}. ${pA.name} for ${pB.name} fixes both rosters.`,
  (a: TeamProfile, b: TeamProfile, pA: PlayerValue, pB: PlayerValue, posA: string, posB: string) =>
    `${pA.name} is a luxury for ${a.teamName} — they can't start him every week. Same story for ${b.teamName} with ${pB.name}. One manager's bench piece is another manager's difference-maker.`,
  (a: TeamProfile, b: TeamProfile, pA: PlayerValue, pB: PlayerValue, posA: string, posB: string) =>
    `The logic is simple: ${a.teamName} has ${posA} depth most managers dream of and a ${posB} situation they'd rather forget. This is the exact trade that turns a 6-win team into a contender.`,
];

function swapRationale(a: TeamProfile, b: TeamProfile, pA: PlayerValue, pB: PlayerValue, posA: string, posB: string): string {
  const pick = SWAP_RATIONALES[Math.abs(a.rosterId + b.rosterId) % SWAP_RATIONALES.length];
  return pick(a, b, pA, pB, posA, posB);
}

function starRationale(seller: TeamProfile, buyer: TeamProfile, star: PlayerValue, pkg: PlayerValue[], isSell: boolean): string {
  const names = pkg.map(p => p.name).join(' + ');
  if (isSell) {
    return `${seller.teamName} is ${seller.record} and the playoffs are slipping away. ${star.name} is the most tradeable asset on their roster. Getting ${names} back isn't a white flag — it's a smart rebuild. Sell before the value drops.`;
  }
  return `${buyer.teamName} decides enough is enough. Trading ${names} for ${star.name} is the kind of move that either wins the championship or makes for a great off-season story. No regrets.`;
}

function avgValue(players: PlayerValue[]): number {
  if (!players.length) return 0;
  return players.reduce((s, p) => s + p.value, 0) / players.length;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
