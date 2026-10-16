import {
  getAllLinkedLeagueIds,
  getLeagueInfo,
  getLeagueUsers,
  getLeagueRosters,
  getLeagueMatchups,
  getSeasonTransactions,
  getLeagueWeeks,
  getNFLState,
  getPlayoffBracket,
} from '@/lib/api';
import { playoffRoundWeeks } from '@/lib/sim/playoffs';
import { weekPhase } from '@/lib/nflSchedule';
import { configuredRootLeagueId } from '@/config/league';
import { teamAvatar } from '@/lib/teamAvatar';

export interface Manager {
  userId: string;
  username: string;
  avatar: string;
  teamName: string;
}

export interface GameRecord {
  season: string;
  /** The week it was decided: a round over two weeks is one game, on its last week. */
  week: number;
  /** Every week it was played over (two for a two week playoff round). */
  weeks?: number[];
  score: number;
  opponentScore: number;
  /** A game in the title bracket (not a consolation game). */
  isPlayoff: boolean;
  /** Regular season, title bracket playoffs, or a consolation game after the regular season. */
  stage: Stage;
}

export type { Stage, StageRecord } from './rivalryStages';
import type { Stage, StageRecord } from './rivalryStages';
export { stageBreakdown } from './rivalryStages';

/**
 * Two managers' head to head record. The one record of it: the rivalries page,
 * franchise pages, matchup previews and the AI all read this.
 *
 *   A meeting      the two teams in the same matchup, once its weeks are final
 *                  (a week still being played is not a result). Every week the
 *                  season was played, through the league's last scored week.
 *   Two week round one meeting, decided on the combined score of both weeks:
 *                  that is how the playoff round itself is decided.
 *   Ties           counted as ties, neither a win nor a loss.
 *   Stages         the record covers every game; `byStage` splits it into the
 *                  regular season, the playoffs and consolation games, since a
 *                  provider's own head to head (ESPN's) is the regular season only.
 */
export interface H2HEntry {
  wins: number;
  losses: number;
  ties: number;
  byStage: Record<Stage, StageRecord>;
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
  const z = () => ({ wins: 0, losses: 0, ties: 0 });
  return { wins: 0, losses: 0, ties: 0, byStage: { regular: z(), playoff: z(), consolation: z() }, pointsFor: 0, pointsAgainst: 0, games: [] };
}

export async function fetchRivalriesData(): Promise<RivalriesResponse> {
  const [allLeagueIds, nflState] = await Promise.all([
    getAllLinkedLeagueIds((await configuredRootLeagueId())!),
    getNFLState().catch(() => null as any),
  ]);
  const currentSeason = String(nflState?.season ?? '');

  const managerMap = new Map<string, Manager>();
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

    const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));
    for (const u of users) {
      if (!managerMap.has(u.user_id)) {
        managerMap.set(u.user_id, {
          userId:   u.user_id,
          username: u.display_name ?? u.username ?? 'Unknown',
          avatar: teamAvatar(u),
          teamName: u.metadata?.team_name || u.display_name || 'Unknown',
        });
      }
    }

    const rosterToUser = new Map<number, string>();
    const userToRoster = new Map<string, number>();
    for (const r of rosters) {
      const user = userById.get(r.owner_id);
      if (user) {
        rosterToUser.set(r.roster_id, r.owner_id);
        userToRoster.set(r.owner_id, r.roster_id);
      }
    }

    // Every week of the season, through the league's last scored week; this
    // season's only once final. (A fixed playoff start + 4, capped at week 17,
    // dropped the final week of leagues whose playoffs run to week 18.)
    const totalWeeks = await getLeagueWeeks(leagueId);
    const [weekly, allTransactions, bracket] = await Promise.all([
      Promise.all(
        Array.from({ length: totalWeeks }, (_, i) =>
          getLeagueMatchups(leagueId, i + 1).catch(() => [])
        )
      ),
      getSeasonTransactions(leagueId, totalWeeks).catch(() => []),
      getPlayoffBracket(leagueId).catch(() => null),
    ]);
    const final = String(season) === currentSeason
      ? await Promise.all(weekly.map(async (_, i) => (await weekPhase(String(season), i + 1).catch(() => 'upcoming')) === 'final'))
      : weekly.map(() => true);
    for (const tx of allTransactions) {
      if (tx.type !== 'trade') continue;
      const tradeUserIds = tx.roster_ids
        .map(rId => rosterToUser.get(rId))
        .filter((uid): uid is string => !!uid);
      if (tradeUserIds.length < 2) continue;

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

    // The games: a week each in the regular season; a playoff round over two
    // weeks is one game, on the combined score, recorded on its last week.
    const roundWeeks = playoffRoundWeeks(
      playoffWeekStart - 1, Number(leagueInfo.settings?.playoff_teams ?? 4), Number(leagueInfo.settings?.playoff_round_type ?? 0));
    const units: number[][] = [];
    for (let w = 1; w <= totalWeeks; w++) {
      const round = roundWeeks.find(r => r.includes(w));
      if (!round) units.push([w]);
      else if (round[0] === w) units.push(round.filter(x => x <= totalWeeks));
    }
    const titleGames: any[] = Array.isArray(bracket?.winners_bracket) ? bracket.winners_bracket.filter(Boolean) : [];
    const inTitleBracket = (week: number, r1: number, r2: number) => {
      if (!titleGames.length) return week >= playoffWeekStart;
      const round = roundWeeks.findIndex(r => r.includes(week)) + 1;
      return round > 0 && titleGames.some(m => Number(m.r) === round && [m.t1, m.t2].includes(r1) && [m.t1, m.t2].includes(r2));
    };

    for (const unit of units) {
      if (!unit.length || !unit.every(w => final[w - 1])) continue;
      const last = unit[unit.length - 1];
      // Who played whom: the pairing in the round's last week.
      const byMatchup = new Map<number, any[]>();
      for (const m of (weekly[last - 1] ?? [])) {
        if (m.matchup_id == null) continue;
        byMatchup.set(m.matchup_id, [...(byMatchup.get(m.matchup_id) ?? []), m]);
      }
      const total = (rosterId: number) => unit.reduce((sum, w) =>
        sum + Number((weekly[w - 1] ?? []).find((m: any) => m.roster_id === rosterId)?.points ?? 0), 0);

      for (const pair of byMatchup.values()) {
        if (pair.length !== 2) continue;
        const [a, b] = pair;
        const u1 = rosterToUser.get(a.roster_id);
        const u2 = rosterToUser.get(b.roster_id);
        if (!u1 || !u2 || u1 === u2) continue;

        const s1 = Math.round(total(a.roster_id) * 100) / 100;
        const s2 = Math.round(total(b.roster_id) * 100) / 100;
        // Scheduled but unplayed fixtures come back 0-0: not a game.
        if (s1 === 0 && s2 === 0) continue;

        ensure(u1, u2);
        ensure(u2, u1);

        h2h[u1][u2].pointsFor     += s1;
        h2h[u1][u2].pointsAgainst += s2;
        h2h[u2][u1].pointsFor     += s2;
        h2h[u2][u1].pointsAgainst += s1;

        const isPlayoff = inTitleBracket(last, a.roster_id, b.roster_id);
        const stage: Stage = last < playoffWeekStart ? 'regular' : isPlayoff ? 'playoff' : 'consolation';
        const s12 = h2h[u1][u2].byStage[stage], s21 = h2h[u2][u1].byStage[stage];

        if (s1 > s2)      { h2h[u1][u2].wins++;   h2h[u2][u1].losses++; s12.wins++;   s21.losses++; }
        else if (s2 > s1) { h2h[u1][u2].losses++; h2h[u2][u1].wins++;   s12.losses++; s21.wins++; }
        else              { h2h[u1][u2].ties++;   h2h[u2][u1].ties++;   s12.ties++;   s21.ties++; }

        const weeks = unit.length > 1 ? unit : undefined;
        h2h[u1][u2].games.push({ season, week: last, weeks, score: s1, opponentScore: s2, isPlayoff, stage });
        h2h[u2][u1].games.push({ season, week: last, weeks, score: s2, opponentScore: s1, isPlayoff, stage });
      }
    }
  }

  const uniqueSeasons = [...new Set(seasons)].sort((a, b) => Number(b) - Number(a));

  return {
    managers: [...managerMap.values()],
    h2h,
    trades,
    seasons: uniqueSeasons,
  };
}

// ── Series between two managers ──────────────────────────────────────────────

/**
 * Rivalry intensity from the actual series, not vibes.
 *
 * Four signals, each normalised to 0-1: how often they have met, how evenly
 * split it is, how close the games were, and whether any of it happened in the
 * playoffs. A 6-6 series of nail-biters scores far higher than a lopsided
 * 10-2, which is what "rivalry" should mean.
 */
export function rivalryScore(
  games: GameRecord[], aWins: number, bWins: number,
): { score: number; label: string } {
  const total = games.length;
  if (!total) return { score: 0, label: 'No history' };

  const volume  = Math.min(total / 12, 1);
  const winPct  = aWins / Math.max(aWins + bWins, 1);
  const balance = 1 - Math.abs(winPct - 0.5) * 2;

  const avgMargin = games.reduce((s, g) => s + Math.abs(g.score - g.opponentScore), 0) / total;
  const closeness = 1 - Math.min(avgMargin / 40, 1);

  const playoffs = Math.min(games.filter(g => g.isPlayoff).length / 3, 1);

  const score = Math.round(100 * (0.30 * volume + 0.30 * balance + 0.25 * closeness + 0.15 * playoffs));
  const label =
    score >= 75 ? 'Blood feud' :
    score >= 55 ? 'Real rivalry' :
    score >= 35 ? 'Warming up' :
    total >= 2  ? 'Occasional' : 'First meeting';
  return { score, label };
}

export interface Series {
  games: GameRecord[];
  aWins: number;
  bWins: number;
  rivalryScore: number;
  rivalryLabel: string;
}

/**
 * The finished series between two managers, from a's side.
 *
 * Only finished meetings count. The rivalry record is built from weeks where
 * anyone scored, so a matchup still being played showed up as a past meeting
 * with a winner and was counted in the series record.
 */
export async function finishedSeries(
  data: RivalriesResponse, a: string, b: string, currentSeason: string,
  weekPhase: (season: string, week: number) => Promise<string>,
): Promise<Series> {
  const entry = data.h2h?.[a]?.[b];
  const liveWeeks = new Set<string>();
  const current = String(currentSeason);
  const weeksInSeason = [...new Set((entry?.games ?? [])
    .filter(g => String(g.season) === current).map(g => g.week))];
  await Promise.all(weeksInSeason.map(async w => {
    if ((await weekPhase(current, w).catch(() => 'upcoming')) !== 'final') liveWeeks.add(`${current}|${w}`);
  }));
  const games = (entry?.games ?? []).filter(g => !liveWeeks.has(`${g.season}|${g.week}`));
  const aWins = games.filter(g => g.score > g.opponentScore).length;
  const bWins = games.filter(g => g.score < g.opponentScore).length;
  const { score, label } = rivalryScore(games, aWins, bWins);
  return { games, aWins, bWins, rivalryScore: score, rivalryLabel: label };
}

