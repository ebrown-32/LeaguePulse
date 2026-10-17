/**
 * Where a matchup is played this week and how full it will be (lib/franchise/venue
 * decides the host; the tycoon economy projects the crowd). What /api/venue answers
 * and what the desk's photographers work from. Server only.
 */

import { getCurrentLeagueId } from '@/config/league';
import { getLeagueInfo, getLeagueMatchups, getLeagueRosters, getNFLState } from '@/lib/api';
import { phaseOf, weekGames, type WeekPhase } from '@/lib/nflSchedule';
import { getRedis } from '@/lib/redisClient';
import { chooseHost, firstKickoff, type HostReason } from './venue';

/** Every meeting between the two before this week, from the host's side. */
export interface Series { hostWins: number; guestWins: number; ties: number; meetings: number }
interface Stored { host: string; guest: string; reason: HostReason; series: Series | null }

export interface Venue extends Stored {
  season: string; week: number; playoff: boolean;
  kickoff: number | null; phase: WeekPhase;
  crowd: { attendance: number; capacity: number; fill: number } | null;
}

export async function venueFor(a: string, b: string, weekWanted?: number): Promise<Venue> {
  const [leagueId, nfl] = await Promise.all([getCurrentLeagueId(), getNFLState().catch(() => null as any)]);
  const season = String(nfl?.season ?? new Date().getFullYear());
  const week = weekWanted || Number(nfl?.week ?? 1);
  const [games, league] = await Promise.all([weekGames(season, week), getLeagueInfo(leagueId).catch(() => null as any)]);
  const playoff = week >= Number(league?.settings?.playoff_week_start ?? 99);

  const redis = getRedis().client;
  const key = `lp_venue_v3:${leagueId}:${season}:${week}:${[a, b].sort().join(':')}`;
  let host: Stored | null = null;
  try { const raw = redis ? await redis.get(key) : null; if (raw) host = JSON.parse(raw); } catch { /* decide again */ }
  if (!host) {
    host = await decide(leagueId, season, week, playoff, a, b);
    // An ESPN league's host is ESPN's home team; until its rows carry it (a cached week from before), decide again next time.
    if (host.reason === 'espn' || !leagueId.startsWith('espn')) await redis?.set(key, JSON.stringify(host)).catch(() => {});
  }

  // The crowd the host's stadium draws for this game.
  const [{ currentSite }, { economyOf }, { projectGame }] = await Promise.all([
    import('@/lib/archive/ingest'), import('@/lib/tycoon/service'), import('@/lib/tycoon/economy'),
  ]);
  const s = await economyOf(await currentSite(), host.host).catch(() => null);
  const crowd = s ? projectGame(s, s.prices, { postseason: playoff, key: `${season}:${week}:${host.host}` }) : null;
  return {
    season, week, playoff, ...host,
    kickoff: firstKickoff(games.map(g => g.date)),
    phase: phaseOf(games),
    crowd: crowd ? { attendance: crowd.attendance, capacity: crowd.capacity, fill: crowd.fill } : null,
  };
}

async function decide(leagueId: string, season: string, week: number, playoff: boolean, a: string, b: string): Promise<Stored> {
  const { fetchRivalriesData } = await import('@/lib/rivalries');
  const h2h = (await fetchRivalriesData().catch(() => null))?.h2h ?? {};
  const host = await chooseHostFor(leagueId, season, week, playoff, a, b, h2h);
  // The all-time series going in: every game the two have played, before this one.
  const games = (h2h[host.host]?.[host.guest]?.games ?? [])
    .filter(g => Number(g.season) < Number(season) || (g.season === season && g.week < week));
  const series: Series = {
    hostWins: games.filter(g => g.score > g.opponentScore).length,
    guestWins: games.filter(g => g.score < g.opponentScore).length,
    ties: games.filter(g => g.score === g.opponentScore).length,
    meetings: games.length,
  };
  return { ...host, series };
}

async function chooseHostFor(leagueId: string, season: string, week: number, playoff: boolean, a: string, b: string, h2h: Record<string, Record<string, { games: any[] }>>) {
  // ESPN's home team, carried on its matchup rows.
  const [rows, rosters] = await Promise.all([
    getLeagueMatchups(leagueId, week).catch(() => [] as any[]),
    getLeagueRosters(leagueId).catch(() => [] as any[]),
  ]);
  const rosterOf = new Map(rosters.map((r: any) => [String(r.owner_id), Number(r.roster_id)]));
  const home = (rows as any[]).find(r => r.is_home === true && (r.roster_id === rosterOf.get(a) || r.roster_id === rosterOf.get(b)));
  const providerHome = home ? (home.roster_id === rosterOf.get(a) ? a : b) : null;
  if (providerHome) return chooseHost({ a, b, season, week, playoff, providerHome, meetings: [], gamesOf: () => [] });

  // Otherwise the league's history decides.
  const gamesOf = (id: string) => Object.values(h2h[id] ?? {}).flatMap(e => e.games.map(g => ({ season: g.season, week: g.week, stage: g.stage, score: g.score, opponentScore: g.opponentScore })));
  const meetings = (h2h[a]?.[b]?.games ?? []).map(g => ({ season: g.season, week: g.week, stage: g.stage }));
  return chooseHost({ a, b, season, week, playoff, meetings, gamesOf });
}
