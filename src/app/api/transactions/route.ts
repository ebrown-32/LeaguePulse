import { NextResponse } from 'next/server';
import { getAllLinkedLeagueIds } from '@/lib/api';

export const revalidate = 1800;

const BASE = 'https://api.sleeper.app/v1';

export interface PlayerSummary {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
}

export interface DraftPickSummary {
  season: string;
  round: number;
  forRosterId: number;
  fromRosterId: number;
}

export interface TransactionSide {
  rosterId: number;
  userId: string;
  teamName: string;
  avatar: string;
  adds: PlayerSummary[];
  drops: PlayerSummary[];
  picksIn: DraftPickSummary[];
  picksOut: DraftPickSummary[];
}

export interface EnrichedTransaction {
  transactionId: string;
  type: 'trade' | 'free_agent' | 'waiver';
  created: number;
  week: number;
  season: string;
  isOffseason: boolean;
  sides: TransactionSide[];
  waiverBid?: number;
}

export interface TransactionsResponse {
  transactions: EnrichedTransaction[];
  seasons: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolvePlayer(pid: string, allPlayers: Record<string, any>): PlayerSummary {
  const meta = allPlayers[pid];
  return {
    id: pid,
    name: meta ? `${meta.first_name ?? ''} ${meta.last_name ?? ''}`.trim() : `Player ${pid}`,
    position: meta?.fantasy_positions?.[0] ?? meta?.position ?? '?',
    nflTeam: meta?.team ?? 'FA',
  };
}

function enrichTransactions(
  rawTxs: any[],
  season: string,
  isOffseason: boolean,
  rosters: any[],
  users: any[],
  allPlayers: Record<string, any>,
): EnrichedTransaction[] {
  const userByOwnerId = new Map<string, any>(users.map(u => [u.user_id, u]));
  const rosterById    = new Map<number, any>(rosters.map(r => [r.roster_id, r]));

  const getRoster  = (rosterId: number) => rosterById.get(rosterId);
  const getUser    = (rosterId: number) => { const r = getRoster(rosterId); return r ? userByOwnerId.get(r.owner_id) : null; };
  const teamName   = (rosterId: number) => { const u = getUser(rosterId); return u?.metadata?.team_name || u?.display_name || `Team ${rosterId}`; };
  const avatar     = (rosterId: number) => getUser(rosterId)?.avatar || '';
  const userId     = (rosterId: number) => getRoster(rosterId)?.owner_id || '';

  return rawTxs.flatMap((tx: any) => {
    const rosterIds: number[] = tx.roster_ids ?? [];
    const adds:  Record<string, number> = tx.adds  ?? {};
    const drops: Record<string, number> = tx.drops ?? {};
    const picks: any[] = tx.draft_picks ?? [];

    const sides: TransactionSide[] = rosterIds.map(rosterId => ({
      rosterId,
      userId:   userId(rosterId),
      teamName: teamName(rosterId),
      avatar:   avatar(rosterId),
      adds:  Object.entries(adds).filter(([, rid]) => rid === rosterId).map(([pid]) => resolvePlayer(pid, allPlayers)),
      drops: Object.entries(drops).filter(([, rid]) => rid === rosterId).map(([pid]) => resolvePlayer(pid, allPlayers)),
      picksIn:  picks.filter(p => p.owner_id === rosterId).map(p => ({ season: p.season, round: p.round, forRosterId: p.owner_id, fromRosterId: p.previous_owner_id })),
      picksOut: picks.filter(p => p.previous_owner_id === rosterId).map(p => ({ season: p.season, round: p.round, forRosterId: p.owner_id, fromRosterId: p.previous_owner_id })),
    }));

    // Drop transactions that would render nothing. Trades need at least 2 sides, others need at least 1.
    const minSides = tx.type === 'trade' ? 2 : 1;
    if (sides.length < minSides) return [];

    return [{
      transactionId: tx.transaction_id,
      type: tx.type as 'trade' | 'free_agent' | 'waiver',
      created: tx.created,
      week: tx.leg,
      season,
      isOffseason,
      sides,
      ...(tx.waiver_budget?.[0]?.amount !== undefined ? { waiverBid: tx.waiver_budget[0].amount } : {}),
    }];
  });
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const initialId = process.env.NEXT_PUBLIC_LEAGUE_ID;
  if (!initialId) return NextResponse.json({ error: 'No league configured' }, { status: 400 });

  try {
    const [nflState, allLeagueIds, allPlayers] = await Promise.all([
      fetch(`${BASE}/state/nfl`).then(r => r.json()),
      getAllLinkedLeagueIds(initialId),
      // 19 MB. Route-level revalidate covers caching; only fetched once per window.
      fetch(`${BASE}/players/nfl`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]);

    const currentNFLWeek = Math.max(1, nflState.week ?? 1);

    // Fetch all seasons in parallel: info + rosters + users + transactions per week
    const seasonData = await Promise.all(allLeagueIds.map(async leagueId => {
      const [info, rosters, users] = await Promise.all([
        fetch(`${BASE}/league/${leagueId}`, { next: { revalidate: 86400 } }).then(r => r.json()),
        fetch(`${BASE}/league/${leagueId}/rosters`, { next: { revalidate: 3600 } }).then(r => r.json()),
        fetch(`${BASE}/league/${leagueId}/users`,   { next: { revalidate: 3600 } }).then(r => r.json()),
      ]);

      const season = info.season as string;
      const status = info.status as string;
      const isOffseason = status === 'pre_draft';
      const isActive    = status === 'in_season' || status === 'post_season' || status === 'drafting';

      // Offseason (pre_draft): fetch up to current NFL week (transactions accumulate from week 1).
      // Active season: same cap. Completed seasons: through week 22 to capture playoffs.
      const maxWeek = (isOffseason || isActive) ? Math.max(1, currentNFLWeek) : 22;
      const ttl     = (isActive || isOffseason) ? 1800 : 86400;

      const weekBatches = await Promise.all(
        Array.from({ length: maxWeek }, (_, i) =>
          fetch(`${BASE}/league/${leagueId}/transactions/${i + 1}`, { next: { revalidate: ttl } })
            .then(r => r.ok ? r.json() : [])
            .catch(() => [])
        )
      );

      const rawTxs = weekBatches.flat().filter((t: any) =>
        t.status === 'complete' && ['trade', 'free_agent', 'waiver'].includes(t.type)
      );
      return { season, isOffseason, rosters, users, rawTxs };
    }));

    // Enrich and merge all transactions
    const all: EnrichedTransaction[] = seasonData.flatMap(({ season, isOffseason, rosters, users, rawTxs }) =>
      enrichTransactions(rawTxs, season, isOffseason, rosters, users, allPlayers)
    );

    all.sort((a, b) => b.created - a.created);

    const seasons = [...new Set(all.map(t => t.season))].sort((a, b) => Number(b) - Number(a));

    return NextResponse.json({ transactions: all, seasons } satisfies TransactionsResponse);
  } catch (err) {
    console.error('[api/transactions]', err);
    return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 });
  }
}
