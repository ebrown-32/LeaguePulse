/**
 * The admin's league data: what each season has, what it is missing, and the
 * commissioner's entries that fill it in (see src/lib/manual).
 *
 * GET   every season (newest first) with its teams, its gaps and how much has
 *       been entered for it, the league's managers across seasons, and the
 *       entries themselves.
 * POST  { action, ... }: save or delete a move, save or delete an entered
 *       season. Everything is checked against the league's real seasons and
 *       teams before it is kept.
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { getLinkedLeagueIds, forgetLinkedLeagueIds } from '@/config/league';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers } from '@/lib/api';
import { seasonGaps } from '@/lib/coverage';
import { getManual, saveManual } from '@/lib/manual/store';
import { manualLeagueId, type ManualData, type ManualMove, type ManualSeason, type MoveType } from '@/lib/manual/model';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const deny = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

async function seasons() {
  const ids = await getLinkedLeagueIds();
  const rows = await Promise.all(ids.map(async leagueId => {
    const [league, users, rosters] = await Promise.all([
      getLeagueInfo(leagueId).catch(() => null),
      getLeagueUsers(leagueId).catch(() => []),
      getLeagueRosters(leagueId).catch(() => []),
    ]);
    if (!league) return null;
    const userById = new Map(users.map((u: any) => [u.user_id, u]));
    return {
      leagueId,
      season: String(league.season),
      provider: (league.metadata?.provider ?? 'sleeper') as 'sleeper' | 'espn' | 'manual',
      gaps: seasonGaps(league),
      teams: rosters.map((r: any) => {
        const u: any = userById.get(r.owner_id);
        return {
          rosterId: Number(r.roster_id),
          userId: String(r.owner_id ?? ''),
          managerName: u?.display_name ?? `Team ${r.roster_id}`,
          teamName: u?.metadata?.team_name || r.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
        };
      }).sort((a: any, b: any) => a.rosterId - b.rosterId),
    };
  }));
  return rows.filter((r): r is NonNullable<typeof r> => Boolean(r));
}

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return deny();
  const [list, manual] = await Promise.all([seasons(), getManual()]);
  const managers = new Map<string, string>();
  for (const s of list) for (const t of s.teams) if (t.userId && !managers.has(t.userId)) managers.set(t.userId, t.managerName);
  return NextResponse.json({
    seasons: list.map(s => ({
      ...s,
      entered: {
        trades: manual.moves.filter(m => m.leagueId === s.leagueId && m.type === 'trade').length,
        moves: manual.moves.filter(m => m.leagueId === s.leagueId && m.type !== 'trade').length,
      },
    })),
    managers: [...managers].map(([userId, name]) => ({ userId, name })).sort((a, b) => a.name.localeCompare(b.name)),
    manual,
  });
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN);

function checkMove(raw: any, season: { leagueId: string; season: string; teams: { rosterId: number }[] }): ManualMove | string {
  const type = raw?.type as MoveType;
  if (!['trade', 'waiver', 'free_agent'].includes(type)) return 'Pick a kind of move.';
  const week = num(raw.week);
  if (!(week >= 0 && week <= 18)) return 'Pick a week.';
  const teamIds = new Set(season.teams.map(t => t.rosterId));
  const teams = (Array.isArray(raw.teams) ? raw.teams : []).map(Number);
  if (teams.some((t: number) => !teamIds.has(t))) return 'Pick teams from that season.';
  if (type === 'trade' && (teams.length !== 2 || teams[0] === teams[1])) return 'A trade needs two different teams.';
  if (type !== 'trade' && teams.length !== 1) return 'Pick the team that made the move.';
  const players = (o: unknown) => Object.entries(o && typeof o === 'object' ? o : {})
    .filter(([pid, team]) => /^[A-Za-z0-9_-]{1,40}$/.test(pid) && teams.includes(Number(team)))
    .map(([pid, team]) => [pid, Number(team)] as [string, number]);
  const adds = Object.fromEntries(players(raw.adds));
  const drops = Object.fromEntries(players(raw.drops));
  if (!Object.keys(adds).length) return type === 'trade' ? 'Add at least one player to the trade.' : 'Add the player picked up.';
  const bid = num(raw.waiverBid);
  return {
    id: typeof raw.id === 'string' && /^[a-z0-9]{6,24}$/.test(raw.id) ? raw.id : Math.random().toString(36).slice(2, 12),
    leagueId: season.leagueId,
    season: season.season,
    week, type, teams, adds, drops,
    ...(type === 'waiver' && bid >= 0 ? { waiverBid: Math.round(bid) } : {}),
    ...(typeof raw.note === 'string' && raw.note.trim() ? { note: raw.note.trim().slice(0, 280) } : {}),
    createdAt: num(raw.createdAt) > 0 ? num(raw.createdAt) : Date.now(),
  };
}

function checkSeason(raw: any, realSeasons: number[], managers: Set<string>): ManualSeason | string {
  const year = num(raw?.season);
  const earliest = realSeasons.length ? Math.min(...realSeasons) : new Date().getFullYear();
  if (!(year >= 1970 && year < earliest)) return `An entered season has to be before ${earliest}, the league's first season here.`;
  const teams = Array.isArray(raw.teams) ? raw.teams : [];
  if (teams.length < 2 || teams.length > 32) return 'A season needs between 2 and 32 teams.';
  const cleanTeams = teams.map((t: any, i: number) => ({
    id: i + 1,
    managerId: typeof t.managerId === 'string' && managers.has(t.managerId) ? t.managerId : null,
    managerName: String(t.managerName ?? '').trim().slice(0, 60),
    teamName: String(t.teamName ?? '').trim().slice(0, 60) || undefined,
  }));
  if (cleanTeams.some((t: any) => !t.managerName)) return 'Every team needs a manager.';
  const ids = new Set(cleanTeams.map((t: any) => t.id));
  const games = (Array.isArray(raw.games) ? raw.games : []).map((g: any) => ({
    week: num(g.week), a: num(g.a), b: num(g.b), aScore: num(g.aScore), bScore: num(g.bScore),
  }));
  const badGame = games.findIndex((g: any) => !(g.week >= 1 && g.week <= 22) || !ids.has(g.a) || !ids.has(g.b) || g.a === g.b || !(g.aScore >= 0) || !(g.bScore >= 0));
  if (badGame >= 0) return `Game ${badGame + 1} needs a week, two different teams and both scores.`;
  const regularWeeks = num(raw.regularWeeks), playoffTeams = num(raw.playoffTeams);
  if (!(regularWeeks >= 1 && regularWeeks <= 18)) return 'Say how many weeks the regular season had.';
  const champion = ids.has(num(raw.champion)) ? num(raw.champion) : null;
  const runnerUp = ids.has(num(raw.runnerUp)) && num(raw.runnerUp) !== champion ? num(raw.runnerUp) : null;
  return {
    season: year,
    name: String(raw.name ?? '').trim().slice(0, 80) || undefined,
    teams: cleanTeams, games, regularWeeks,
    playoffTeams: playoffTeams >= 0 && playoffTeams <= cleanTeams.length ? playoffTeams : 0,
    champion, runnerUp,
    updatedAt: Date.now(),
  };
}

export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return deny();
  const body = await req.json().catch(() => null) as { action?: string; [k: string]: any } | null;
  if (!body?.action) return bad('Nothing to do.');
  const manual: ManualData = structuredClone(await getManual());

  if (body.action === 'move.save' || body.action === 'move.delete') {
    if (body.action === 'move.delete') {
      manual.moves = manual.moves.filter(m => m.id !== body.id);
    } else {
      const list = await seasons();
      const season = list.find(s => s.leagueId === body.move?.leagueId);
      if (!season) return bad('Pick one of the league’s seasons.');
      const move = checkMove(body.move, season);
      if (typeof move === 'string') return bad(move);
      manual.moves = [...manual.moves.filter(m => m.id !== move.id), move];
    }
    await saveManual(manual);
    return NextResponse.json({ ok: true, manual });
  }

  if (body.action === 'season.save' || body.action === 'season.delete') {
    if (body.action === 'season.delete') {
      const year = num(body.season);
      manual.seasons = manual.seasons.filter(s => s.season !== year);
      manual.moves = manual.moves.filter(m => m.leagueId !== manualLeagueId(year));
    } else {
      const list = await seasons();
      const real = list.filter(s => s.provider !== 'manual').map(s => Number(s.season));
      const managers = new Set(list.flatMap(s => s.teams.map(t => t.userId)));
      const season = checkSeason(body.season, real, managers);
      if (typeof season === 'string') return bad(season);
      manual.seasons = [...manual.seasons.filter(s => s.season !== season.season), season].sort((a, b) => b.season - a.season);
    }
    await saveManual(manual);
    await forgetLinkedLeagueIds();
    return NextResponse.json({ ok: true, manual });
  }

  return bad('Unknown action.');
}
