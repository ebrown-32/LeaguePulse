/**
 * Alternate Timelines.
 *
 * GET  lists every completed trade in league history that can be rewound.
 * GET with ?transactionId= runs the replay and returns both timelines.
 *
 * The heavy lifting lives in `lib/sim/replay.ts`. This route's job is to load
 * real Sleeper data and hand it over in the shape that expects.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllLinkedLeagueIds } from '@/lib/api';
import { teamAvatar } from '@/lib/teamAvatar';
import { getPlayersDirectory } from '@/lib/playerStats';
import { runReplay, type ReplayWeek } from '@/lib/sim/replay';
import { lastPlayoffWeek } from '@/lib/sim/playoffs';
import type { TransactionSide, PlayerSummary } from '@/app/api/transactions/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://api.sleeper.app/v1';

async function fetchJson<T>(url: string, fallback: T, tries = 3): Promise<T> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { next: { revalidate: 3600 } });
      if (r.ok) return await r.json();
      if (r.status === 404) return fallback;
    } catch { /* retry */ }
    if (i < tries - 1) await new Promise(res => setTimeout(res, 250 * (i + 1)));
  }
  return fallback;
}

/**
 * What actually changed when this trade is rewound.
 *
 * Computed for every trade so the list can say which ones mattered. Without it
 * the only way to find the twelve trades that changed a title was to click all
 * seventy-three, which is not a feature, it is a scavenger hunt.
 */
export interface TradeImpact {
  /** A different team wins the championship. */
  championChanged: boolean;
  /** A different set of teams makes the playoffs. */
  fieldChanged: boolean;
  /** Any change to seeding order, even inside the same field. */
  seedsChanged: boolean;
  championBefore: number | null;
  championAfter:  number | null;
  /** Largest standings position change by any team. */
  biggestMove: number;
  /** How many team-weeks scored differently. */
  weeksChanged: number;
}

interface TradeSummary {
  transactionId: string;
  season: string;
  leagueId: string;
  week: number;
  rosterIds: number[];
  /** playerId -> rosterId that received them. */
  adds: Record<string, number>;
  drops: Record<string, number>;
  pickCount: number;
  /** Filled in for display. */
  playerNames: Record<string, string>;
  teamNames: Record<number, string>;
  avatars: Record<number, string>;
  /** Present on the list response; omitted on the single-trade response. */
  impact?: TradeImpact;
  /**
   * The trade as the Transactions page draws it: who received what. A trade is
   * directional, and a flat list of names cannot show that, which matters most
   * in the one tool whose subject is sending those players back.
   */
  sides: TransactionSide[];
}

/**
 * Every week of a season, in the shape the replay engine wants.
 *
 * Pulled out and memoised because the trade list now replays every trade in
 * league history to work out which ones mattered. Re-fetching seventeen weeks
 * of matchups per trade would be seventy-odd times the network for identical
 * data; loading each season once turns that into pure computation.
 */
async function loadWeeks(leagueId: string, lastWeek: number): Promise<ReplayWeek[]> {
  const batches = await Promise.all(
    Array.from({ length: lastWeek }, (_, i) =>
      fetchJson<any[]>(`${BASE}/league/${leagueId}/matchups/${i + 1}`, [])),
  );

  const weeks: ReplayWeek[] = [];
  batches.forEach((rows, i) => {
    const week = i + 1;
    if (!rows?.length) return;
    const actual = new Map<number, number>();
    const players = new Map<number, string[]>();
    const points = new Map<string, number>();
    const groups = new Map<number, number[]>();

    for (const row of rows) {
      actual.set(row.roster_id, row.points ?? 0);
      players.set(row.roster_id, row.players ?? []);
      for (const [pid, pts] of Object.entries(row.players_points ?? {})) {
        if (typeof pts === 'number') points.set(pid, pts);
      }
      if (row.matchup_id !== null && row.matchup_id !== undefined) {
        if (!groups.has(row.matchup_id)) groups.set(row.matchup_id, []);
        groups.get(row.matchup_id)!.push(row.roster_id);
      }
    }
    const pairs: [number, number][] = [];
    for (const g of groups.values()) if (g.length === 2) pairs.push([g[0], g[1]]);
    weeks.push({ week, actual, players, points, pairs });
  });
  return weeks;
}

/** The reversal a trade implies: every player back where they came from. */
function reversalsFor(trade: { adds: Record<string, number>; drops: Record<string, number> }) {
  return Object.entries(trade.adds)
    .map(([playerId, toRosterId]) => ({
      playerId,
      toRosterId: Number(toRosterId),
      fromRosterId: Number(trade.drops[playerId]),
    }))
    .filter(r => Number.isFinite(r.fromRosterId) && r.fromRosterId !== r.toRosterId);
}

async function loadLeagueMeta(leagueId: string) {
  const [info, rosters, users] = await Promise.all([
    fetchJson<any>(`${BASE}/league/${leagueId}`, null),
    fetchJson<any[]>(`${BASE}/league/${leagueId}/rosters`, []),
    fetchJson<any[]>(`${BASE}/league/${leagueId}/users`, []),
  ]);
  return { info, rosters, users };
}

/** Trades sit on the transactions endpoint week by week, so we sweep the season. */
async function loadTrades(leagueId: string, weeks: number): Promise<any[]> {
  const batches = await Promise.all(
    Array.from({ length: weeks }, (_, i) =>
      fetchJson<any[]>(`${BASE}/league/${leagueId}/transactions/${i + 1}`, [])),
  );
  return batches
    .flat()
    .filter(t => t?.type === 'trade' && t?.status === 'complete');
}

/** Playoff settings for a league, in one place so both paths agree. */
function playoffShapeOf(info: any) {
  const regularSeasonWeeks = Math.max(1, (info.settings?.playoff_week_start || 15) - 1);
  const playoffTeams = info.settings?.playoff_teams || 4;
  const playoffRoundType = info.settings?.playoff_round_type ?? 0;
  return {
    regularSeasonWeeks, playoffTeams, playoffRoundType,
    hasMedianGames: !!info.settings?.league_average_match,
    lastWeek: lastPlayoffWeek(regularSeasonWeeks, playoffTeams, playoffRoundType),
  };
}

/** Reduce a full replay to the handful of facts the list needs. */
function summariseImpact(out: ReturnType<typeof runReplay>): TradeImpact {
  const a = out.actual, b = out.alternate;
  const rankOf = (tl: typeof a, rid: number) => tl.standings.findIndex(s => s.rosterId === rid);
  let biggestMove = 0;
  for (const s of a.standings) {
    const before = rankOf(a, s.rosterId), after = rankOf(b, s.rosterId);
    if (before >= 0 && after >= 0) biggestMove = Math.max(biggestMove, Math.abs(after - before));
  }
  const fieldA = [...a.seeds].sort((x, y) => x - y).join(',');
  const fieldB = [...b.seeds].sort((x, y) => x - y).join(',');
  return {
    championChanged: a.championRosterId !== b.championRosterId,
    fieldChanged: fieldA !== fieldB,
    seedsChanged: a.seeds.join(',') !== b.seeds.join(','),
    championBefore: a.championRosterId,
    championAfter:  b.championRosterId,
    biggestMove,
    weeksChanged: out.changes.length,
  };
}

export async function GET(req: NextRequest) {
  const currentLeagueId = process.env.NEXT_PUBLIC_LEAGUE_ID;
  if (!currentLeagueId) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_LEAGUE_ID is not set' }, { status: 500 });
  }
  const wanted = req.nextUrl.searchParams.get('transactionId');

  const linked = await getAllLinkedLeagueIds(currentLeagueId);
  const metas = await Promise.all(linked.map(async id => ({ id, ...(await loadLeagueMeta(id)) })));
  const valid = metas.filter(m => m.info && m.rosters.length);

  const directory = await getPlayersDirectory().catch(() => ({} as Record<string, any>));
  const nameOf = (id: string) => {
    const p = directory?.[id];
    if (!p) return `Player ${id}`;
    return p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || `Player ${id}`;
  };
  const positionOf = (id: string) => (directory?.[id]?.position as string) ?? null;
  const playerSummary = (id: string): PlayerSummary => {
    const p = directory?.[id];
    return {
      id,
      name: nameOf(id),
      position: p?.position ?? '--',
      nflTeam:  p?.team ?? 'FA',
    };
  };

  // ── Catalogue every rewindable trade ───────────────────────────────────────
  const trades: TradeSummary[] = [];
  for (const m of valid) {
    // A season with nothing scored yet has no results to replay, so its trades
    // are not offered. Without this the list led with the current season's
    // preseason trades, every one of which rewinds to an empty timeline.
    const scoredLegs = m.info.settings?.last_scored_leg ?? 0;
    if (scoredLegs < 1 && m.info.status !== 'complete') continue;

    const regularSeasonWeeks = Math.max(1, (m.info.settings?.playoff_week_start || 15) - 1);
    const raw = await loadTrades(m.id, regularSeasonWeeks);
    const userById = new Map(m.users.map((u: any) => [u.user_id, u]));
    const teamNames: Record<number, string> = {};
    const avatars: Record<number, string> = {};
    for (const r of m.rosters) {
      const u: any = userById.get(r.owner_id);
      teamNames[r.roster_id] = u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`;
      avatars[r.roster_id] = teamAvatar(u);
    }
    const userIdOf = (rid: number) =>
      m.rosters.find((r: any) => r.roster_id === rid)?.owner_id ?? '';

    for (const t of raw) {
      const adds: Record<string, number> = t.adds ?? {};
      const drops: Record<string, number> = t.drops ?? {};
      const picks: any[] = t.draft_picks ?? [];
      const names: Record<string, string> = {};
      for (const pid of Object.keys(adds)) names[pid] = nameOf(pid);

      // Same shape the Transactions route produces, so both pages render the
      // trade through one component.
      const sides: TransactionSide[] = (t.roster_ids ?? []).map((rid: number) => ({
        rosterId: rid,
        userId:   userIdOf(rid),
        teamName: teamNames[rid] ?? `Team ${rid}`,
        avatar:   avatars[rid] ?? '',
        adds:  Object.entries(adds).filter(([, r]) => r === rid).map(([pid]) => playerSummary(pid)),
        drops: Object.entries(drops).filter(([, r]) => r === rid).map(([pid]) => playerSummary(pid)),
        picksIn:  picks.filter(p => p.owner_id === rid)
          .map(p => ({ season: p.season, round: p.round, forRosterId: p.owner_id, fromRosterId: p.previous_owner_id })),
        picksOut: picks.filter(p => p.previous_owner_id === rid)
          .map(p => ({ season: p.season, round: p.round, forRosterId: p.owner_id, fromRosterId: p.previous_owner_id })),
      }));
      trades.push({
        transactionId: t.transaction_id,
        season: m.info.season,
        leagueId: m.id,
        week: t.leg ?? 1,
        rosterIds: t.roster_ids ?? [],
        adds,
        drops: t.drops ?? {},
        pickCount: (t.draft_picks ?? []).length,
        playerNames: names,
        teamNames, avatars,
        sides,
      });
    }
  }
  trades.sort((a, b) =>
    Number(b.season) - Number(a.season) || b.week - a.week);

  // ── Which trades actually mattered ─────────────────────────────────────────
  // Replay every one. The week data is loaded once per season and shared, so
  // this is arithmetic rather than network, and it turns the list from a
  // scavenger hunt into something you can read.
  if (!wanted) {
    const bySeason = new Map<string, TradeSummary[]>();
    for (const t of trades) {
      if (!bySeason.has(t.leagueId)) bySeason.set(t.leagueId, []);
      bySeason.get(t.leagueId)!.push(t);
    }

    await Promise.all([...bySeason.entries()].map(async ([leagueId, seasonTrades]) => {
      const m = valid.find(v => v.id === leagueId);
      if (!m) return;
      const shape = playoffShapeOf(m.info);
      const weeks = await loadWeeks(leagueId, shape.lastWeek);
      if (weeks.length === 0) return;

      for (const t of seasonTrades) {
        const reversals = reversalsFor(t);
        if (reversals.length === 0) {
          // Picks only: nothing in this season's scoring can change.
          t.impact = {
            championChanged: false, fieldChanged: false, seedsChanged: false,
            championBefore: null, championAfter: null, biggestMove: 0, weeksChanged: 0,
          };
          continue;
        }
        try {
          const out = runReplay({
            weeks,
            regularSeasonWeeks: shape.regularSeasonWeeks,
            playoffTeams: shape.playoffTeams,
            playoffRoundType: shape.playoffRoundType,
            hasMedianGames: shape.hasMedianGames,
            rosterSlots: m.info.roster_positions ?? [],
            positionOf,
            reversals,
            fromWeek: t.week,
          });
          t.impact = summariseImpact(out);
        } catch {
          // One bad trade must not take down the whole list.
          t.impact = undefined;
        }
      }
    }));

    return NextResponse.json({ trades });
  }

  // ── Run one replay in full ─────────────────────────────────────────────────
  const trade = trades.find(t => t.transactionId === wanted);
  if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

  const meta = valid.find(m => m.id === trade.leagueId)!;
  const shape = playoffShapeOf(meta.info);
  const weeks = await loadWeeks(trade.leagueId, shape.lastWeek);

  const out = runReplay({
    weeks,
    regularSeasonWeeks: shape.regularSeasonWeeks,
    playoffTeams: shape.playoffTeams,
    playoffRoundType: shape.playoffRoundType,
    hasMedianGames: shape.hasMedianGames,
    rosterSlots: meta.info.roster_positions ?? [],
    positionOf,
    reversals: reversalsFor(trade),
    fromWeek: trade.week,
  });

  if (trade.pickCount > 0) {
    out.notes.push(
      `${trade.pickCount} draft pick${trade.pickCount === 1 ? '' : 's'} also changed hands. ` +
      `Picks affect a later rookie draft, outside this season, so they are left as they were.`);
  }

  return NextResponse.json({
    trade,
    ...out,
    season: trade.season,
    regularSeasonWeeks: shape.regularSeasonWeeks,
    teamNames: trade.teamNames,
    avatars: trade.avatars,
  });
}
