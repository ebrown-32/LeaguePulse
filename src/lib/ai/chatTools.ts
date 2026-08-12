import { z } from 'zod';
import { tool } from 'ai';
import {
  getLeagueInfo, getLeagueRosters, getLeagueUsers, getLeagueMatchups,
  getNFLState, getAllLinkedLeagueIds, getSeasonTransactions, getLeagueWeeks,
  getAdvancedTeamMetrics, generateComprehensiveLeagueHistory,
} from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { fetchRivalriesData } from '@/lib/rivalries';
import {
  getPlayersDirectory, getSeasonStats, resolveStatsSeason, buildPlayerCard,
} from '@/lib/playerStats';
import { getSnapshot } from '@/lib/fantasyProsStore';

/**
 * Tools that let the assistant query the live Sleeper league on demand.
 *
 * The static brief handed to the model is necessarily a summary: it cannot
 * carry every roster, every week's matchups, and every season's history without
 * dwarfing the context window. These tools expose the same data the app's pages
 * are built from, so the assistant can answer specific questions ("what does
 * this team's bench look like", "how did week 12 of 2024 go") by fetching
 * exactly what it needs instead of guessing or saying it lacks the record.
 *
 * Every tool reads through the existing lib functions, so the numbers here and
 * the numbers on the pages come from one source.
 */

interface TeamRef {
  rosterId: number;
  userId: string;
  teamName: string;
  manager: string;
  roster: any;
}

/** Resolve a fuzzy team/manager name the user typed to a roster. */
function matchTeam<T extends { teamName: string; manager: string }>(query: string, teams: T[]): T | null {
  const q = query.trim().toLowerCase();
  return (
    teams.find(t => t.teamName.toLowerCase() === q || t.manager.toLowerCase() === q) ??
    teams.find(t => t.teamName.toLowerCase().includes(q) || t.manager.toLowerCase().includes(q)) ??
    null
  );
}

async function leagueContext() {
  const leagueId = await getCurrentLeagueId();
  const [league, rosters, users, nflState] = await Promise.all([
    getLeagueInfo(leagueId), getLeagueRosters(leagueId), getLeagueUsers(leagueId), getNFLState(),
  ]);
  const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));
  const teams: TeamRef[] = rosters.map((r: any) => {
    const u = userById.get(r.owner_id);
    return {
      rosterId: r.roster_id,
      userId: r.owner_id,
      teamName: u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`,
      manager: u?.display_name ?? '',
      roster: r,
    };
  });
  return { leagueId, league, teams, nflState };
}

export async function buildChatTools() {
  return {
    listTeams: tool({
      description:
        'List every team in the league with its manager and current record. Use this first when ' +
        'the user names a team you are unsure about, or to answer "who is in the league".',
      inputSchema: z.object({}),
      execute: async () => {
        const { teams } = await leagueContext();
        return teams.map(t => ({
          teamName: t.teamName,
          manager: t.manager,
          record: `${t.roster.settings?.wins ?? 0}-${t.roster.settings?.losses ?? 0}`,
          pointsFor: Number((t.roster.settings?.fpts ?? 0) + (t.roster.settings?.fpts_decimal ?? 0) / 100),
        }));
      },
    }),

    getRoster: tool({
      description:
        'Full current roster for one team: every starter and bench player with position, NFL team, ' +
        'age, injury status and fantasy points in the most recent scored season.',
      inputSchema: z.object({
        team: z.string().describe('Team name or manager name; partial matches work'),
      }),
      execute: async ({ team }) => {
        const { teams, nflState } = await leagueContext();
        const match = matchTeam(team, teams);
        if (!match) return { error: `No team matching "${team}".`, available: teams.map(t => t.teamName) };

        const statsSeason = await resolveStatsSeason(nflState?.season ?? String(new Date().getFullYear()));
        const [players, stats] = await Promise.all([getPlayersDirectory(), getSeasonStats(statsSeason)]);
        const starterIds: string[] = (match.roster.starters ?? []).filter((id: string) => id && id !== '0');
        const starterSet = new Set(starterIds);
        const card = (id: string) => buildPlayerCard(id, players, stats);

        return {
          teamName: match.teamName,
          manager: match.manager,
          statsSeason,
          starters: starterIds.map(card),
          bench: (match.roster.players ?? [])
            .filter((id: string) => id && !starterSet.has(id))
            .map(card),
        };
      },
    }),

    getMatchups: tool({
      description:
        'Matchups for a given week of the current season, with both teams and their scores. ' +
        'Omit the week to get the current one.',
      inputSchema: z.object({
        week: z.number().int().min(1).max(18).optional().describe('NFL week; defaults to current'),
      }),
      execute: async ({ week }) => {
        const { leagueId, teams, nflState } = await leagueContext();
        const wk = week ?? Number(nflState?.week ?? 1);
        const raw = await getLeagueMatchups(leagueId, wk);
        const byRoster = new Map(teams.map(t => [t.rosterId, t]));
        const pairs = new Map<number, any[]>();
        for (const m of raw as any[]) {
          if (!pairs.has(m.matchup_id)) pairs.set(m.matchup_id, []);
          pairs.get(m.matchup_id)!.push(m);
        }
        return {
          week: wk,
          matchups: [...pairs.values()].map(pair => pair.map(m => ({
            team: byRoster.get(m.roster_id)?.teamName ?? `Roster ${m.roster_id}`,
            points: m.points ?? 0,
          }))),
        };
      },
    }),

    getHeadToHead: tool({
      description:
        'All-time head to head record between two teams, including every past meeting with scores.',
      inputSchema: z.object({
        teamA: z.string(),
        teamB: z.string(),
      }),
      execute: async ({ teamA, teamB }) => {
        const [{ teams }, rivalries] = await Promise.all([leagueContext(), fetchRivalriesData()]);
        const a = matchTeam(teamA, teams), b = matchTeam(teamB, teams);
        if (!a || !b) return { error: 'Could not match both teams.', available: teams.map(t => t.teamName) };
        const entry = (rivalries as any).h2h?.[a.userId]?.[b.userId];
        if (!entry) return { teamA: a.teamName, teamB: b.teamName, meetings: 0, note: 'They have never played.' };
        return {
          teamA: a.teamName,
          teamB: b.teamName,
          record: `${entry.wins}-${entry.losses}`,
          pointsFor: Number(entry.pointsFor.toFixed(1)),
          pointsAgainst: Number(entry.pointsAgainst.toFixed(1)),
          // Label each game explicitly. Handing over a raw isPlayoff flag had
          // the model describing regular season week 6 as a playoff win.
          games: (entry.games ?? []).map((g: any) => ({
            season: g.season,
            week: g.week,
            stage: g.isPlayoff ? 'playoffs' : 'regular season',
            score: `${g.score} to ${g.opponentScore}`,
            winner: g.score > g.opponentScore ? a.teamName : b.teamName,
          })),
        };
      },
    }),

    getTransactions: tool({
      description:
        'Completed transactions for the current season: trades, waiver claims and free agent moves, ' +
        'with who moved where. Filter by type to answer trade questions specifically.',
      inputSchema: z.object({
        type: z.enum(['trade', 'waiver', 'free_agent', 'all']).default('all'),
        limit: z.number().int().min(1).max(60).default(25),
      }),
      execute: async ({ type, limit }) => {
        const { leagueId, teams } = await leagueContext();
        const weeks = await getLeagueWeeks(leagueId).catch(() => 18);
        const [txs, players] = await Promise.all([
          getSeasonTransactions(leagueId, weeks),
          getPlayersDirectory(),
        ]);
        const nameOf = (pid: string) => {
          const p = players[pid] ?? {};
          return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || pid;
        };
        const byRoster = new Map(teams.map(t => [t.rosterId, t.teamName]));
        const rows = (txs as any[])
          .filter(t => t.status === 'complete')
          .filter(t => (type === 'all' ? true : t.type === type))
          .map(t => ({
            type: t.type,
            week: t.leg ?? 0,
            detail: (t.roster_ids ?? []).map((rid: number) => {
              const got = Object.entries(t.adds ?? {}).filter(([, r]) => r === rid).map(([pid]) => nameOf(pid));
              const lost = Object.entries(t.drops ?? {}).filter(([, r]) => r === rid).map(([pid]) => nameOf(pid));
              const team = byRoster.get(rid) ?? `Roster ${rid}`;
              return `${team}${got.length ? ` receives ${got.join(', ')}` : ''}${lost.length ? ` drops ${lost.join(', ')}` : ''}`;
            }).join(' | '),
          }));
        return { total: rows.length, transactions: rows.slice(0, limit) };
      },
    }),

    getHistory: tool({
      description:
        'All-time league history: champions by season, total seasons, and record-book highs. ' +
        'Use for questions about past winners and all-time records.',
      inputSchema: z.object({}),
      execute: async () => {
        const { leagueId } = await leagueContext();
        const linked = await getAllLinkedLeagueIds(leagueId);
        const comp = await generateComprehensiveLeagueHistory(linked);
        return {
          totalSeasons: comp.allTimeStats?.totalSeasons ?? 0,
          champions: (comp.records ?? [])
            .filter((r: any) => r.type === 'championship')
            .map((r: any) => ({ season: r.season, winner: r.username })),
          records: (comp.records ?? []).filter((r: any) => r.type !== 'championship').slice(0, 12),
        };
      },
    }),

    getTeamMetrics: tool({
      description:
        'Advanced per-team metrics for the current season: consistency, efficiency, luck, ' +
        'points for and against. The same numbers the Next Gen page shows.',
      inputSchema: z.object({}),
      execute: async () => {
        const { leagueId } = await leagueContext();
        return await getAdvancedTeamMetrics(leagueId);
      },
    }),

    getExpertRankings: tool({
      description:
        'FantasyPros expert consensus rankings (weekly or dynasty) for a position, including each ' +
        'expert\'s individual rank. Only the top 10 per board are available on the free tier.',
      inputSchema: z.object({
        mode: z.enum(['weekly', 'dynasty']).default('dynasty'),
        position: z.enum(['ALL', 'QB', 'RB', 'WR', 'TE']).default('ALL'),
      }),
      execute: async ({ mode, position }) => {
        const snapshot = await getSnapshot();
        const board = snapshot?.boards?.[mode]?.[position];
        if (!board) return { error: 'No cached rankings for that board yet.' };
        return {
          mode, position,
          totalRanked: board.totalRanked,
          experts: board.experts,
          lastUpdated: board.lastUpdated,
          players: board.players.map(p => ({
            rank: p.rankEcr, name: p.name, team: p.team, position: p.position,
            posRank: p.posRank, range: `${p.rankMin}-${p.rankMax}`, age: p.age,
          })),
        };
      },
    }),
  };
}
