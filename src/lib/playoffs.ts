/**
 * Every season's playoffs, read from the league itself: its bracket, its
 * playoff settings and its scores. Nothing here is inferred where the league
 * says it outright.
 *
 *   The bracket       who played whom in each round, who advanced from which
 *                     game (`t1_from`), who won, and placement games (`p`: the
 *                     title game is 1, third place 3). Sleeper's own record,
 *                     and ESPN's translated to the same shape.
 *   Round weeks       from the playoff settings: teams, start week and round
 *                     type (0 one week a round, 1 a two week final, 2 two weeks
 *                     every round). A two week round is decided on the combined
 *                     total of both weeks (lib/sim/playoffs).
 *   Seeds             the provider's own playoff seed where it has one (ESPN);
 *                     otherwise final regular season standings (record, then
 *                     points for), left off when the league has divisions (the
 *                     seeding rules differ). Either is dropped if it
 *                     contradicts the bracket's byes: better none than wrong.
 *   Status            a game is final when its weeks are; a season not yet in
 *                     its playoffs says when they start.
 *
 * Server only (reads through leagueFetch).
 */

import { getAllLinkedLeagueIds, getLeagueInfo, getLeagueRosters, getLeagueUsers, getLeagueMatchups, getPlayoffBracket, getNFLState } from './api';
import { playoffRoundWeeks } from './sim/playoffs';
import { teamAvatar } from './teamAvatar';

export interface PlayoffTeam {
  rosterId: number; userId: string; manager: string; team: string; avatar: string;
  seed: number | null; wins: number; losses: number; ties: number; pointsFor: number;
}
export interface PlayoffSide {
  rosterId: number | null;
  /** Where this side came from: the winner (or loser) of an earlier game. */
  from: { match: number; result: 'w' | 'l' } | null;
  /** Total over the round's weeks, once any are scored. */
  points: number | null;
  weekly: { week: number; points: number | null }[];
}
export interface PlayoffMatch {
  id: number; round: number; bracket: 'winners' | 'losers';
  /** Placement decided here: 1 the title, 3 third place, and so on. */
  placement: number | null;
  weeks: number[];
  t1: PlayoffSide; t2: PlayoffSide;
  winner: number | null; loser: number | null;
  status: 'final' | 'live' | 'upcoming';
}
export interface PlayoffSeason {
  season: string; leagueId: string;
  status: 'complete' | 'in_progress' | 'upcoming';
  settings: {
    teams: number; startWeek: number; roundType: number; rounds: number; byes: number;
    roundWeeks: number[][]; divisions: number; medianGame: boolean;
  };
  roundLabels: string[];
  seedsShown: boolean;
  teams: PlayoffTeam[];
  winners: PlayoffMatch[];
  losers: PlayoffMatch[];
  podium: { champion: number | null; runnerUp: number | null; third: number | null };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

export { roundLabels, standingsSeeds, seedsAgreeWithByes } from './playoffsCore';
import { roundLabels, standingsSeeds, seedsAgreeWithByes } from './playoffsCore';

function sideOf(m: any, which: 't1' | 't2', weeks: number[], points: Map<string, number>): PlayoffSide {
  const rosterId = num(m?.[which]);
  const fromRaw = m?.[`${which}_from`];
  const from = fromRaw && typeof fromRaw === 'object'
    ? (num(fromRaw.w) != null ? { match: fromRaw.w as number, result: 'w' as const } : num(fromRaw.l) != null ? { match: fromRaw.l as number, result: 'l' as const } : null)
    : null;
  const weekly = weeks.map(week => ({ week, points: rosterId == null ? null : points.get(`${week}:${rosterId}`) ?? null }));
  const scored = weekly.filter(w => w.points != null);
  return { rosterId, from, points: scored.length ? round2(scored.reduce((s, w) => s + (w.points ?? 0), 0)) : null, weekly };
}

async function seasonPlayoffs(leagueId: string, currentWeek: number | null, currentSeason: string): Promise<PlayoffSeason | null> {
  const league: any = await getLeagueInfo(leagueId).catch(() => null);
  if (!league) return null;
  const s = league.settings ?? {};
  const teams = Number(s.playoff_teams ?? 0);
  const startWeek = Number(s.playoff_week_start ?? 0);
  if (!teams || !startWeek) return null;
  const roundType = Number(s.playoff_round_type ?? 0);

  const [users, rosters, bracket] = await Promise.all([
    getLeagueUsers(leagueId).catch(() => [] as any[]),
    getLeagueRosters(leagueId).catch(() => [] as any[]),
    getPlayoffBracket(leagueId).catch(() => null),
  ]);
  const winnersRaw: any[] = (Array.isArray(bracket?.winners_bracket) ? bracket.winners_bracket : []).filter(Boolean);
  const losersRaw: any[] = (Array.isArray(bracket?.losers_bracket) ? bracket.losers_bracket : []).filter(Boolean);

  // Rounds: the bracket's own count where it has one, the settings' otherwise.
  const bracketRounds = Math.max(0, ...winnersRaw.map(m => Number(m.r) || 0));
  const settingsWeeks = playoffRoundWeeks(startWeek - 1, teams, roundType);
  const rounds = bracketRounds || settingsWeeks.length;
  const roundWeeks = Array.from({ length: rounds }, (_, i) => settingsWeeks[i] ?? [startWeek + i]);
  const byes = Math.max(0, 2 ** rounds - teams);

  const isCurrent = String(league.season) === currentSeason;
  const status: PlayoffSeason['status'] = league.status === 'complete' ? 'complete'
    : league.status === 'post_season' ? 'in_progress' : 'upcoming';

  // Scores for every playoff week (consolation games share the weeks).
  const lastWeek = Math.max(...roundWeeks.flat(), ...losersRaw.map(m => roundWeeks[(Number(m.r) || 1) - 1]?.at(-1) ?? 0));
  const weeks = Array.from({ length: Math.max(0, lastWeek - startWeek + 1) }, (_, i) => startWeek + i);
  const points = new Map<string, number>();
  if (status !== 'upcoming') {
    const rows = await Promise.all(weeks.map(async w => ({ w, rows: await getLeagueMatchups(leagueId, w).catch(() => [] as any[]) })));
    for (const { w, rows: list } of rows) {
      for (const m of list) if (typeof m.points === 'number' && (m.points > 0 || status === 'complete')) points.set(`${w}:${m.roster_id}`, m.points);
    }
  }
  // A week of the current season is final once the next has begun; a finished season's weeks all are.
  const weekFinal = (w: number) => !isCurrent || status === 'complete' || (currentWeek != null && w < currentWeek);

  const toMatch = (m: any, kind: 'winners' | 'losers'): PlayoffMatch => {
    const r = Number(m.r) || 1;
    const mWeeks = roundWeeks[r - 1] ?? [startWeek + r - 1];
    const t1 = sideOf(m, 't1', mWeeks, points), t2 = sideOf(m, 't2', mWeeks, points);
    const winner = num(m.w), loser = num(m.l);
    const any = t1.points != null || t2.points != null;
    return {
      id: Number(m.m), round: r, bracket: kind, placement: num(m.p), weeks: mWeeks, t1, t2, winner, loser,
      status: winner != null || (any && mWeeks.every(weekFinal)) ? 'final' : any ? 'live' : 'upcoming',
    };
  };
  const winners = winnersRaw.map(m => toMatch(m, 'winners')).sort((a, b) => a.round - b.round || (a.placement ?? 0) - (b.placement ?? 0) || a.id - b.id);
  const losers = losersRaw.map(m => toMatch(m, 'losers')).sort((a, b) => a.round - b.round || a.id - b.id);

  // Teams and seeds.
  const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));
  const divisions = Number(s.divisions ?? 0);
  const byeTeams = winners.filter(m => m.round === 2).flatMap(m => [m.t1, m.t2]).filter(sd => sd.rosterId != null && !sd.from).map(sd => sd.rosterId as number);
  const { seeds, fromProvider } = standingsSeeds(rosters);
  // Standings seeds ignore division rules, so they are only trusted without divisions.
  const seedsShown = (fromProvider || divisions < 2) && seedsAgreeWithByes(seeds, byeTeams);
  const teamsOut: PlayoffTeam[] = rosters.map((r: any) => {
    const u = userById.get(r.owner_id);
    const st = r.settings ?? {};
    return {
      rosterId: r.roster_id, userId: r.owner_id ?? '', manager: u?.display_name ?? `Team ${r.roster_id}`,
      team: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`, avatar: teamAvatar(u),
      seed: seedsShown ? seeds.get(r.roster_id) ?? null : null,
      wins: Number(st.wins ?? 0), losses: Number(st.losses ?? 0), ties: Number(st.ties ?? 0),
      pointsFor: round2(Number(st.fpts ?? 0) + Number(st.fpts_decimal ?? 0) / 100),
    };
  });

  const title = winners.find(m => m.placement === 1) ?? (status === 'complete' ? winners.filter(m => m.round === rounds && m.placement == null)[0] : undefined);
  const thirdGame = winners.find(m => m.placement === 3);
  return {
    season: String(league.season), leagueId, status,
    settings: { teams, startWeek, roundType, rounds, byes, roundWeeks, divisions, medianGame: Number(s.league_average_match ?? 0) === 1 },
    roundLabels: roundLabels(rounds), seedsShown, teams: teamsOut, winners, losers,
    podium: {
      champion: title?.winner ?? null, runnerUp: title?.loser ?? null, third: thirdGame?.winner ?? null,
    },
  };
}

const cache = new Map<string, { at: number; seasons: PlayoffSeason[] }>();
const TTL = 10 * 60_000;

/** Every linked season's playoffs, newest first. */
export async function playoffHistory(rootLeagueId: string): Promise<PlayoffSeason[]> {
  const hit = cache.get(rootLeagueId);
  if (hit && Date.now() - hit.at < TTL) return hit.seasons;
  const [ids, state] = await Promise.all([getAllLinkedLeagueIds(rootLeagueId), getNFLState().catch(() => null as any)]);
  const currentSeason = String(state?.season ?? '');
  const currentWeek = Number(state?.week ?? 0) || null;
  const seasons = (await Promise.all(ids.map(id => seasonPlayoffs(id, currentWeek, currentSeason).catch(err => {
    console.error('[playoffs]', id, err); return null;
  })))).filter((x): x is PlayoffSeason => Boolean(x)).sort((a, b) => Number(b.season) - Number(a.season));
  cache.set(rootLeagueId, { at: Date.now(), seasons });
  return seasons;
}

export interface LineupPlayer { name: string; position: string | null; points: number }
export interface MatchDetail {
  sides: { rosterId: number; weeks: { week: number; points: number | null; starters: LineupPlayer[]; bench: number | null }[] }[];
}

/** A game's lineups, week by week: each side's starters and their points, and points left on the bench. */
export async function playoffMatchDetail(leagueId: string, weeks: number[], rosterIds: number[]): Promise<MatchDetail> {
  const { getPlayersDirectory } = await import('./playerStats');
  const [players, ...weekRows] = await Promise.all([
    getPlayersDirectory().catch(() => ({} as Record<string, any>)),
    ...weeks.map(w => getLeagueMatchups(leagueId, w).catch(() => [] as any[])),
  ]);
  const name = (id: string) => {
    const p = (players as Record<string, any>)[id];
    if (!p) return null;
    if (p.position === 'DEF') return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || null;
    return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null;
  };
  return {
    sides: rosterIds.map(rosterId => ({
      rosterId,
      weeks: weeks.map((week, i) => {
        const row = (weekRows[i] as any[]).find(m => m.roster_id === rosterId);
        if (!row) return { week, points: null, starters: [], bench: null };
        const pp: Record<string, number> = row.players_points ?? {};
        const starterIds: string[] = (row.starters ?? []).filter((id: string) => id && id !== '0');
        const starters = starterIds.map(id => ({ name: name(id) ?? 'Unknown player', position: (players as any)[id]?.position ?? null, points: round2(Number(pp[id] ?? 0)) }));
        const benchIds = (row.players ?? []).filter((id: string) => id && !starterIds.includes(id));
        const hasPlayerScores = Object.keys(pp).length > 0;
        return {
          week, points: typeof row.points === 'number' ? round2(row.points) : null,
          starters: hasPlayerScores ? starters.sort((a, b) => b.points - a.points) : [],
          bench: hasPlayerScores ? round2(benchIds.reduce((s: number, id: string) => s + Number(pp[id] ?? 0), 0)) : null,
        };
      }),
    })),
  };
}
