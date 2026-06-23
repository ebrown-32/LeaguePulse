import { NextResponse } from 'next/server';
import {
  getAllLinkedLeagueIds,
  getLeagueInfo,
  getLeagueUsers,
  getLeagueRosters,
  getLeagueMatchups,
  getSeasonTransactions,
} from '@/lib/api';
import { INITIAL_LEAGUE_ID } from '@/config/league';

export const dynamic = 'force-dynamic';

export interface Manager {
  userId: string;
  username: string;
  avatar: string;
  teamName: string;
}

export interface GameRecord {
  season: string;
  week: number;
  score: number;
  opponentScore: number;
  isPlayoff: boolean;
}

export interface H2HEntry {
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  games: GameRecord[];
}

export interface TradePick {
  round: number;
  season: string;
}

export interface TradeSide {
  userId: string;
  playerCount: number;
  picks: TradePick[];
}

export interface TradeRecord {
  season: string;
  week: number;
  timestamp: number;
  sides: TradeSide[];
}

export interface RivalriesResponse {
  managers: Manager[];
  h2h: Record<string, Record<string, H2HEntry>>;
  trades: Record<string, Record<string, TradeRecord[]>>;
  seasons: string[];
}

function emptyEntry(): H2HEntry {
  return { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: [] };
}

export async function GET() {
  if (!INITIAL_LEAGUE_ID) {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }

  try {
    const allLeagueIds = await getAllLinkedLeagueIds(INITIAL_LEAGUE_ID);

    // Stable manager registry across all seasons keyed by userId
    const managerMap = new Map<string, Manager>();
    // h2h[u1][u2] = u1's record vs u2
    const h2h: Record<string, Record<string, H2HEntry>> = {};
    const trades: Record<string, Record<string, TradeRecord[]>> = {};
    const seasons: string[] = [];

    const ensure = (u1: string, u2: string) => {
      h2h[u1] ??= {};
      h2h[u1][u2] ??= emptyEntry();
    };

    const addTrade = (u1: string, u2: string, record: TradeRecord) => {
      trades[u1] ??= {};
      trades[u1][u2] ??= [];
      trades[u1][u2].push(record);
    };

    for (const leagueId of allLeagueIds) {
      const [leagueInfo, users, rosters] = await Promise.all([
        getLeagueInfo(leagueId),
        getLeagueUsers(leagueId),
        getLeagueRosters(leagueId),
      ]);

      if (!leagueInfo) continue;

      const season: string = leagueInfo.season ?? '';
      if (season) seasons.push(season);

      const playoffWeekStart: number = leagueInfo.settings?.playoff_week_start ?? 14;

      // Build userId -> Manager
      const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));
      for (const u of users) {
        if (!managerMap.has(u.user_id)) {
          managerMap.set(u.user_id, {
            userId:   u.user_id,
            username: u.display_name ?? u.username ?? 'Unknown',
            avatar:   u.avatar ?? '',
            teamName: u.metadata?.team_name || u.display_name || 'Unknown',
          });
        }
      }

      // Build rosterId <-> userId maps
      const rosterToUser = new Map<number, string>();
      const userToRoster = new Map<string, number>();
      for (const r of rosters) {
        const user = userById.get(r.owner_id);
        if (user) {
          rosterToUser.set(r.roster_id, r.owner_id);
          userToRoster.set(r.owner_id, r.roster_id);
        }
      }

      // Fetch all weeks — regular season + playoffs (up to week 17 max)
      const totalWeeks = Math.min(playoffWeekStart + 4, 17);
      const [allMatchups, allTransactions] = await Promise.all([
        Promise.all(
          Array.from({ length: totalWeeks }, (_, i) =>
            getLeagueMatchups(leagueId, i + 1).catch(() => [])
          )
        ),
        getSeasonTransactions(leagueId, totalWeeks).catch(() => []),
      ]);

      // Process trades
      for (const tx of allTransactions) {
        if (tx.type !== 'trade') continue;
        const tradeUserIds = tx.roster_ids
          .map(rId => rosterToUser.get(rId))
          .filter((uid): uid is string => !!uid);
        if (tradeUserIds.length < 2) continue;

        // For each pair of users involved in this trade
        for (let i = 0; i < tradeUserIds.length; i++) {
          for (let j = i + 1; j < tradeUserIds.length; j++) {
            const u1 = tradeUserIds[i];
            const u2 = tradeUserIds[j];
            const r1 = userToRoster.get(u1);
            const r2 = userToRoster.get(u2);

            const sideOf = (userId: string, rosterId: number | undefined): TradeSide => {
              if (rosterId === undefined) return { userId, playerCount: 0, picks: [] };
              const playerCount = Object.values(tx.adds ?? {}).filter(rId => rId === rosterId).length;
              const picks = (tx.draft_picks ?? [])
                .filter((p: any) => p.owner_id === rosterId)
                .map((p: any): TradePick => ({ round: p.round, season: p.season ?? season }));
              return { userId, playerCount, picks };
            };

            const record: TradeRecord = {
              season,
              week: tx.leg,
              timestamp: tx.status_updated,
              sides: [sideOf(u1, r1), sideOf(u2, r2)],
            };

            addTrade(u1, u2, record);
            addTrade(u2, u1, record);
          }
        }
      }

      allMatchups.forEach((weekMatchups, wi) => {
        const week = wi + 1;
        const isPlayoff = week >= playoffWeekStart;

        // Group by matchup_id to find pairs
        const byMatchup = new Map<number, any[]>();
        for (const m of (weekMatchups ?? [])) {
          if (!m.matchup_id) continue;
          const arr = byMatchup.get(m.matchup_id) ?? [];
          arr.push(m);
          byMatchup.set(m.matchup_id, arr);
        }

        for (const pair of byMatchup.values()) {
          if (pair.length !== 2) continue;
          const [a, b] = pair;
          const u1 = rosterToUser.get(a.roster_id);
          const u2 = rosterToUser.get(b.roster_id);
          if (!u1 || !u2 || u1 === u2) continue;

          const s1 = a.points ?? 0;
          const s2 = b.points ?? 0;

          ensure(u1, u2);
          ensure(u2, u1);

          h2h[u1][u2].pointsFor     += s1;
          h2h[u1][u2].pointsAgainst += s2;
          h2h[u2][u1].pointsFor     += s2;
          h2h[u2][u1].pointsAgainst += s1;

          if (s1 > s2) { h2h[u1][u2].wins++; h2h[u2][u1].losses++; }
          else         { h2h[u1][u2].losses++; h2h[u2][u1].wins++; }

          h2h[u1][u2].games.push({ season, week, score: s1, opponentScore: s2, isPlayoff });
          h2h[u2][u1].games.push({ season, week, score: s2, opponentScore: s1, isPlayoff });
        }
      });
    }

    const uniqueSeasons = [...new Set(seasons)].sort((a, b) => Number(b) - Number(a));

    return NextResponse.json({
      managers: [...managerMap.values()],
      h2h,
      trades,
      seasons: uniqueSeasons,
    } satisfies RivalriesResponse);
  } catch (err) {
    console.error('[api/rivalries]', err);
    return NextResponse.json({ error: 'Failed to load rivalry data' }, { status: 500 });
  }
}
