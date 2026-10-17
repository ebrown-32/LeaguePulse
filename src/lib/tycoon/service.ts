/**
 * The franchise tycoon, wired to a league: real results from the archive,
 * each franchise's decisions from storage, the economy (economy.ts) in between.
 *
 *   When it starts   Opening day of the franchise's first season in the league:
 *                    every archived season is played through the economy, so a
 *                    franchise's value is its whole history, not this season's.
 *   When it stops    Today; or, for a franchise that has left the league, a week
 *                    after its last game.
 *   Game days        Each archived week of a franchise's games, counted the
 *                    Tuesday after the week's games (when they are final).
 *   Decisions        Price changes and purchases, kept per franchise under the
 *                    league's storage (`tycoon_log:<franchiseId>`), replayed in order.
 *
 * Server only.
 */

import { getRedis } from '@/lib/redisClient';
import { ensureArchive, T } from '@/lib/archive/db';
import { simulate, franchiseValue, DAY, REBALANCED_AT, type Decision, type EconomyState, type GameDay } from './economy';
import { chooseHost, type MeetingResult, type TeamGame } from '@/lib/franchise/venue';

/**
 * ESPN's own home teams, for the season the league is playing now: `season-week-roster` -> home.
 * Earlier seasons were archived before the flag was kept, and Sleeper never names one,
 * so those follow LeaguePulse's rule. Empty when the league isn't on ESPN.
 */
async function providerHomes(rows: { season: number; week: number }[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  try {
    const { getCurrentLeagueId } = await import('@/config/league');
    const leagueId = await getCurrentLeagueId();
    if (!leagueId.startsWith('espn')) return out;
    const season = Math.max(0, ...rows.map(r => Number(r.season)));
    const weeks = [...new Set(rows.filter(r => Number(r.season) === season).map(r => r.week))];
    const { getLeagueMatchups } = await import('@/lib/api');
    await Promise.all(weeks.map(async w => {
      for (const r of await getLeagueMatchups(leagueId, w).catch(() => [] as any[])) {
        if (typeof (r as any).is_home === 'boolean') out.set(`${season}-${w}-${(r as any).roster_id}`, (r as any).is_home);
      }
    }));
  } catch { /* the rule decides */ }
  return out;
}

/** NFL kickoff: the Thursday after Labor Day (the first Monday of September), in UTC. */
export function kickoff(season: number): number {
  const sept1 = new Date(Date.UTC(season, 8, 1));
  const labor = 1 + ((8 - sept1.getUTCDay()) % 7); // first Monday
  return Date.UTC(season, 8, labor + 3);
}
/** When a week's games are final: the Tuesday after them. */
export const weekFinal = (season: number, week: number) => kickoff(season) + ((week - 1) * 7 + 5) * DAY;

interface LeagueInputs { games: Map<string, GameDay[]>; names: Map<string, string>; latestSeason: number; titles: Map<string, number[]> }

const cache = new Map<string, { at: number; inputs: LeagueInputs }>();
const CACHE_MS = 60_000;

/** Every franchise's game days in every archived season, for a league. */
export async function leagueInputs(site: string): Promise<LeagueInputs | null> {
  const hit = cache.get(site);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.inputs;
  const db = await ensureArchive().catch(() => null);
  if (!db) return null;

  // Champions, from the playoff bracket (teams.final_rank, see lib/archive).
  const champs = await db.query(`
      SELECT s.season, t.owner_id AS id FROM ${T('teams')} t JOIN ${T('seasons')} s USING (site, season_id)
      WHERE t.site = $1 AND t.final_rank = 1 AND t.owner_id IS NOT NULL`, [site]);
  const titles = new Map<string, number[]>();
  for (const r of champs.rows) titles.set(r.id, [...(titles.get(r.id) ?? []), Number(r.season)]);

  const rows = await db.query(`
      SELECT s.season, m.week, m.matchup_id, m.roster_id, m.points::float AS points, t.owner_id AS id,
        coalesce(t.team_name, mg.display_name, t.owner_id) AS name,
        coalesce((s.settings->>'playoff_week_start')::int, 0) AS playoff_start
      FROM ${T('matchups')} m JOIN ${T('seasons')} s USING (site, season_id)
      JOIN ${T('teams')} t ON t.site = m.site AND t.season_id = m.season_id AND t.roster_id = m.roster_id
      LEFT JOIN ${T('managers')} mg ON mg.site = t.site AND mg.user_id = t.owner_id
      WHERE m.site = $1 AND t.owner_id IS NOT NULL
      ORDER BY s.season, m.week`, [site]);

  // Group each week's scores to rank teams and pair opponents.
  const names = new Map<string, string>();
  const weeks = new Map<string, typeof rows.rows>();
  for (const r of rows.rows) {
    names.set(r.id, r.name);
    const k = `${r.season}-${r.week}`;
    weeks.set(k, [...(weeks.get(k) ?? []), r]);
  }
  const record = new Map<string, { w: number; g: number }>(); // per season-franchise, before each game
  const games = new Map<string, GameDay[]>();

  // Who hosted each game (lib/franchise/venue): the provider's home team where it names one,
  // otherwise LeaguePulse's rule from the league's history, as the matchup pages decide it.
  const teamGames = new Map<string, TeamGame[]>(), meetings = new Map<string, MeetingResult[]>();
  const pair = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  for (const list of weeks.values()) for (const me of list) {
    const opp = me.matchup_id == null ? null : list.find(o => o.matchup_id === me.matchup_id && o.id !== me.id);
    if (!opp) continue;
    const stage = me.playoff_start > 0 && me.week >= me.playoff_start ? 'playoff' : 'regular';
    teamGames.set(me.id, [...(teamGames.get(me.id) ?? []), { season: String(me.season), week: me.week, stage, score: me.points, opponentScore: opp.points }]);
    if (me.id < opp.id) meetings.set(pair(me.id, opp.id), [...(meetings.get(pair(me.id, opp.id)) ?? []), { season: String(me.season), week: me.week, stage }]);
  }
  const providerHome = await providerHomes(rows.rows);
  const hostOf = new Map<string, string>(); // season-week-pair -> host
  const hosted = (me: any, opp: any): boolean => {
    const k = `${me.season}-${me.week}-${pair(me.id, opp.id)}`;
    if (!hostOf.has(k)) {
      const home = providerHome.get(`${me.season}-${me.week}-${me.roster_id}`) ? me.id
        : providerHome.get(`${opp.season}-${opp.week}-${opp.roster_id}`) ? opp.id : null;
      hostOf.set(k, chooseHost({
        a: me.id, b: opp.id, season: String(me.season), week: me.week,
        playoff: me.playoff_start > 0 && me.week >= me.playoff_start,
        providerHome: home, meetings: meetings.get(pair(me.id, opp.id)) ?? [], gamesOf: id => teamGames.get(id) ?? [],
      }).host);
    }
    return hostOf.get(k) === me.id;
  };
  for (const [k, list] of [...weeks.entries()].sort(([a], [b]) => {
    const [sa, wa] = a.split('-').map(Number), [sb, wb] = b.split('-').map(Number);
    return sa - sb || wa - wb;
  })) {
    const sorted = [...list].sort((a, b) => b.points - a.points);
    const results: [string, number][] = [];
    for (const me of list) {
      const opp = me.matchup_id == null ? null : list.find(o => o.matchup_id === me.matchup_id && o.id !== me.id);
      if (!opp) continue; // a week without an opponent is not a game day
      const oppRec = record.get(`${me.season}:${opp.id}`) ?? { w: 0, g: 0 };
      const game: GameDay = {
        key: k, season: me.season, week: me.week, at: weekFinal(me.season, me.week),
        points: me.points, oppPoints: opp.points, postseason: me.playoff_start > 0 && me.week >= me.playoff_start,
        rank: sorted.findIndex(x => x.id === me.id) + 1, teams: list.length,
        opponent: opp.name, oppWinPct: oppRec.g ? oppRec.w / oppRec.g : 0.5,
        home: hosted(me, opp),
      };
      games.set(me.id, [...(games.get(me.id) ?? []), game]);
      results.push([me.id, me.points > opp.points ? 1 : me.points === opp.points ? 0.5 : 0]);
    }
    for (const [id, r] of results) {
      const key = `${list[0].season}:${id}`;
      const rec = record.get(key) ?? { w: 0, g: 0 };
      record.set(key, { w: rec.w + r, g: rec.g + 1 });
    }
  }
  const latestSeason = Math.max(0, ...rows.rows.map(r => Number(r.season)));
  const inputs = { games, names, latestSeason, titles };
  cache.set(site, { at: Date.now(), inputs });
  return inputs;
}

const LOG = (franchiseId: string) => `tycoon_log:${franchiseId}`;
const LOG_MAX = 2_000;

export async function decisionsOf(franchiseId: string): Promise<Decision[]> {
  const raw = await getRedis().client?.get(LOG(franchiseId)).catch(() => null);
  try { return raw ? JSON.parse(raw) as Decision[] : []; } catch { return []; }
}

export async function recordDecision(franchiseId: string, d: Decision): Promise<void> {
  const r = getRedis().client;
  if (!r) throw new Error('Storage is not configured');
  const log = await decisionsOf(franchiseId);
  await r.set(LOG(franchiseId), JSON.stringify([...log, d].slice(-LOG_MAX)));
}

/** A franchise's economy as of now, or null when the league has no archive yet. */
export async function economyOf(site: string, franchiseId: string, now = Date.now()): Promise<EconomyState | null> {
  const inputs = await leagueInputs(site);
  if (!inputs) return null;
  const games = inputs.games.get(franchiseId) ?? [];
  const first = games[0], last = games.at(-1);
  // A franchise that has left the league stops a week after its last game.
  const end = last && last.season < inputs.latestSeason ? Math.min(now, last.at + 7 * DAY) : now;
  return simulate({
    games, decisions: await decisionsOf(franchiseId), titles: inputs.titles.get(franchiseId) ?? [],
    start: first ? kickoff(first.season) : end, now: end, grandfatherBefore: REBALANCED_AT,
  });
}

/** Every franchise of the league, by value: the league's leaderboard. */
export async function leaderboard(site: string, ids: string[], now = Date.now()) {
  const inputs = await leagueInputs(site);
  if (!inputs) return null;
  return (await Promise.all(ids.map(async id => {
    const s = await economyOf(site, id, now);
    if (!s) return null;
    const last = [...s.games].reverse().find(g => g.home);
    return { franchiseId: id, value: franchiseValue(s), interest: Math.round(s.interest), facilities: s.facilities, lastAttendance: last?.attendance ?? null, capacity: last?.capacity ?? null };
  }))).filter((x): x is NonNullable<typeof x> => Boolean(x)).sort((a, b) => b.value - a.value);
}
