/**
 * Server-only player directory + season stat lines from Sleeper.
 *
 * Both payloads are far too large to ship to the browser (the player dump is
 * ~19MB, season stats ~1.9MB), so everything here stays behind API routes and
 * is cached at module level — same pattern the transactions route already uses,
 * since Next's data cache caps out at 2MB.
 */

const BASE = 'https://api.sleeper.app/v1';

const PLAYERS_TTL_MS = 24 * 60 * 60 * 1000; // 24h — this dump changes slowly
const STATS_TTL_MS   = 60 * 60 * 1000;      // 1h  — in-season this moves weekly

let playersCache: { data: Record<string, any>; ts: number } | null = null;
const statsCache = new Map<string, { data: Record<string, any>; ts: number }>();
let statsSeasonCache: { season: string; ts: number } | null = null;

export interface PlayerCard {
  playerId:   string;
  name:       string;
  position:   string;
  nflTeam:    string;
  number:     string | null;
  age:        number | null;
  yearsExp:   number | null;
  injuryStatus: string | null;
  /** Null when the player has no scored games in the stats season. */
  points:     number | null;
  gamesPlayed: number | null;
  pointsPerGame: number | null;
  positionRank: number | null;
}

export async function getPlayersDirectory(): Promise<Record<string, any>> {
  if (playersCache && Date.now() - playersCache.ts < PLAYERS_TTL_MS) return playersCache.data;
  const data = await fetch(`${BASE}/players/nfl`, { cache: 'no-store' }).then(r => r.json());
  playersCache = { data, ts: Date.now() };
  return data;
}

export async function getSeasonStats(season: string): Promise<Record<string, any>> {
  const hit = statsCache.get(season);
  if (hit && Date.now() - hit.ts < STATS_TTL_MS) return hit.data;
  const res = await fetch(`${BASE}/stats/nfl/regular/${season}`, { cache: 'no-store' });
  const data = res.ok ? await res.json() : {};
  statsCache.set(season, { data, ts: Date.now() });
  return data;
}

/**
 * Sleeper's own full-season projections, keyed by player id.
 *
 * Same shape as the stats payload, so `pts_ppr` means the same thing on both
 * and past and projected production are directly comparable. These are a real
 * published forecast, not anything derived here: roughly a thousand players
 * carry one, and everyone else has none rather than a zero.
 *
 * Cached on the stats TTL. It is a 2.5MB payload that moves at most daily.
 */
export async function getSeasonProjections(season: string): Promise<Record<string, any>> {
  const key = `proj:${season}`;
  const hit = statsCache.get(key);
  if (hit && Date.now() - hit.ts < STATS_TTL_MS) return hit.data;
  const res = await fetch(`${BASE}/projections/nfl/regular/${season}`, { cache: 'no-store' });
  const data = res.ok ? await res.json() : {};
  statsCache.set(key, { data, ts: Date.now() });
  return data;
}

/** Rows keyed TEAM_XXX are league-wide aggregates, not players. */
function isPlayerRow(id: string): boolean {
  return !id.startsWith('TEAM_');
}

function scoredCount(stats: Record<string, any>): number {
  let n = 0;
  for (const [id, v] of Object.entries(stats)) {
    if (isPlayerRow(id) && typeof v?.pts_ppr === 'number') n++;
  }
  return n;
}

/**
 * The season whose stats we should actually show.
 *
 * A league sitting in preseason has a "current" season with no games played,
 * where every stat line would render as a dash. Rather than hardcode a year,
 * this probes the current season and falls back to the previous one when it
 * hasn't produced meaningful data yet.
 */
export async function resolveStatsSeason(currentSeason: string): Promise<string> {
  if (statsSeasonCache && Date.now() - statsSeasonCache.ts < STATS_TTL_MS) {
    return statsSeasonCache.season;
  }
  let season = currentSeason;
  const current = await getSeasonStats(currentSeason);
  if (scoredCount(current) < 50) {
    season = String(Number(currentSeason) - 1);
  }
  statsSeasonCache = { season, ts: Date.now() };
  return season;
}

export function buildPlayerCard(
  playerId: string,
  players: Record<string, any>,
  stats: Record<string, any>,
): PlayerCard {
  const p  = players[playerId] ?? {};
  const st = stats[playerId] ?? {};
  const points = typeof st.pts_ppr === 'number' ? st.pts_ppr : null;
  const gp     = typeof st.gp === 'number' ? st.gp : null;

  const name = p.full_name
    || [p.first_name, p.last_name].filter(Boolean).join(' ')
    || `Player ${playerId}`;

  return {
    playerId,
    name,
    position: p.position ?? '—',
    nflTeam:  p.team ?? 'FA',
    number:   p.number != null ? String(p.number) : null,
    age:      typeof p.age === 'number' ? p.age : null,
    yearsExp: typeof p.years_exp === 'number' ? p.years_exp : null,
    injuryStatus: p.injury_status || null,
    points,
    gamesPlayed: gp,
    pointsPerGame: points != null && gp ? Number((points / gp).toFixed(1)) : null,
    positionRank: typeof st.pos_rank_ppr === 'number' ? st.pos_rank_ppr : null,
  };
}

/** Position-relevant stat lines — only fields Sleeper actually returns. */
export function statLineFor(position: string, st: Record<string, any>): { label: string; value: string }[] {
  // Sleeper omits zero-valued counting stats entirely. When the player has a
  // stat row at all, a missing key means "none", not "unknown" — rendering a
  // dash there implies we couldn't find the data.
  const hasRow = Object.keys(st).length > 0;
  const num = (v: any, digits = 0) =>
    typeof v === 'number' ? v.toFixed(digits) : hasRow ? (0).toFixed(digits) : '—';
  switch (position) {
    case 'QB':
      return [
        { label: 'Pass Yds', value: num(st.pass_yd) },
        { label: 'Pass TD',  value: num(st.pass_td) },
        { label: 'INT',      value: num(st.pass_int) },
        { label: 'Rush Yds', value: num(st.rush_yd) },
        { label: 'Rush TD',  value: num(st.rush_td) },
      ];
    case 'RB':
      return [
        { label: 'Carries',  value: num(st.rush_att) },
        { label: 'Rush Yds', value: num(st.rush_yd) },
        { label: 'Rush TD',  value: num(st.rush_td) },
        { label: 'Rec',      value: num(st.rec) },
        { label: 'Rec Yds',  value: num(st.rec_yd) },
        { label: 'Rec TD',   value: num(st.rec_td) },
      ];
    case 'WR':
    case 'TE':
      return [
        { label: 'Targets', value: num(st.rec_tgt) },
        { label: 'Rec',     value: num(st.rec) },
        { label: 'Rec Yds', value: num(st.rec_yd) },
        { label: 'Rec TD',  value: num(st.rec_td) },
        { label: 'YPR',     value: st.rec && st.rec_yd ? (st.rec_yd / st.rec).toFixed(1) : '—' },
      ];
    case 'K':
      return [
        { label: 'FG Made', value: num(st.fgm) },
        { label: 'FG Att',  value: num(st.fga) },
        { label: 'XP Made', value: num(st.xpm) },
      ];
    case 'DEF':
      return [
        { label: 'Sacks',    value: num(st.sack, 1) },
        { label: 'INT',      value: num(st.int) },
        { label: 'Fum Rec',  value: num(st.fum_rec) },
        { label: 'Def TD',   value: num(st.def_td) },
        { label: 'Pts Allow', value: num(st.pts_allow) },
      ];
    default:
      return [];
  }
}
