/**
 * Rivalry week: the week's biggest grudge matches, from the managers' all-time series. Server only.
 *
 *   Chosen     each of the week's games is scored on its series (lib/rivalryGrudge), and the top
 *              one or two over the bar are the week's rivalry games. Chosen once, before kickoff,
 *              and kept: a rivalry billed on Tuesday is still the rivalry on Sunday.
 *   The hype   The Desk Weekly opens with a trailer for next week's (lib/ai/podcast), both
 *              stadiums dress for it (banners in both teams' colours, RIVALRY WEEK on the boards),
 *              and the rivalries page and Pick'em lead with it.
 *   The shame  once the week is final, the loser's stadium has a plane circling it for a week,
 *              towing the winner's banner. Settled the first time anyone asks after the final
 *              whistle (the stadium, the Desk, the cron), from the real scores.
 *
 * Stored per league and week (`lp_rivalry_week:<league>:<season>:<week>`), the banners in
 * `lp_rivalry_shame` (by Sleeper user id). Tenant-scoped, like everything in Redis.
 */

import 'server-only';
import { getLeagueMatchups, getLeagueRosters, getLeagueUsers } from '@/lib/api';
import { getRedis } from '@/lib/redisClient';
import { weekPhase } from '@/lib/nflSchedule';
import { teamAvatar } from '@/lib/teamAvatar';
import { fetchRivalriesData, finishedSeries } from '@/lib/rivalries';
import { grudge, GRUDGE_MAX_GAMES, GRUDGE_MIN } from './rivalryGrudge';

export interface RivalSide { userId: string; rosterId: number; teamName: string; avatar: string; color: string }
export interface RivalryGame {
  matchupId: number;
  a: RivalSide;
  b: RivalSide;
  /** All time, from a's side. */
  series: { aWins: number; bWins: number; ties: number; meetings: number };
  label: string;
  score: number;
  reasons: string[];
  last: { season: string; week: number; aScore: number; bScore: number } | null;
  /** Once it's been played: who won (null for a tie). */
  winner?: string | null;
  final?: { a: number; b: number };
}
export interface RivalryWeek {
  season: string; week: number; games: RivalryGame[]; chosenAt: string;
  settled?: boolean;
  /** When it was first settled: results are counted again from fresh scores for two days after (stat corrections). */
  settledAt?: string;
}
export interface Shame { by: string; byUserId: string; byColor: string; loser: string; season: string; week: number; score: [number, number]; until: string }

const KEY = (league: string, season: string, week: number) => `lp_rivalry_week:${league}:${season}:${week}`;
const SHAME = 'lp_rivalry_shame';
const SHAME_MS = 7 * 24 * 3_600_000;
/** Colours for a side with none of its own, by its id, so it's the same every time. */
const FALLBACK = ['#E0352B', '#2F6FED', '#F2A900', '#16A34A', '#9333EA', '#EA580C', '#0891B2', '#DB2777'];
const fallbackColor = (id: string) => FALLBACK[[...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % FALLBACK.length];

const rgb = (hex: string) => { const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const distance = (x: string, y: string) => { const [a, b] = [rgb(x), rgb(y)]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };

/** Two sides in colours you can tell apart: b gets the fallback farthest from a's when theirs is too close. */
export function apart(a: string, b: string): string {
  if (distance(a, b) >= 110) return b;
  return [...FALLBACK].sort((x, y) => distance(a, y) - distance(a, x))[0];
}

async function colours(ids: string[]): Promise<Map<string, string>> {
  const out = new Map(ids.map(id => [id, fallbackColor(id)]));
  try {
    const [{ currentTenant }, { getFranchises }] = await Promise.all([import('@/lib/tenant/context'), import('@/lib/franchise/store')]);
    const t = await currentTenant();
    if (!t) return out;
    const fr = await getFranchises(t.slug, ids);
    for (const [id, f] of fr) { const c = f.look?.primary ?? f.color; if (c) out.set(id, c); }
  } catch { /* the fallbacks */ }
  return out;
}

/** Score a week's games and pick its rivalries. Stores nothing. */
export async function chooseRivalries(leagueId: string, season: string, week: number): Promise<RivalryWeek> {
  const [rows, rosters, users, data] = await Promise.all([
    getLeagueMatchups(leagueId, week).catch(() => [] as any[]),
    getLeagueRosters(leagueId).catch(() => [] as any[]),
    getLeagueUsers(leagueId).catch(() => [] as any[]),
    fetchRivalriesData().catch(() => null),
  ]);
  const empty = { season, week, games: [], chosenAt: new Date().toISOString() };
  if (!data || !rows?.length) return empty;
  const userById = new Map<string, any>((users ?? []).map((u: any) => [u.user_id, u]));
  const ownerOf = new Map<number, string>((rosters ?? []).map((r: any) => [r.roster_id, String(r.owner_id ?? '')]));
  const pairs = new Map<number, any[]>();
  for (const r of rows) if (r.matchup_id != null) pairs.set(r.matchup_id, [...(pairs.get(r.matchup_id) ?? []), r]);

  const scored: (Omit<RivalryGame, 'a' | 'b'> & { a: Omit<RivalSide, 'color'>; b: Omit<RivalSide, 'color'> })[] = [];
  for (const [matchupId, pair] of pairs) {
    if (pair.length !== 2) continue;
    const [ra, rb] = pair;
    const ua = ownerOf.get(ra.roster_id), ub = ownerOf.get(rb.roster_id);
    if (!ua || !ub) continue;
    const side = (rosterId: number, userId: string) => {
      const u = userById.get(userId);
      return { userId, rosterId, teamName: u?.metadata?.team_name || u?.display_name || `Team ${rosterId}`, avatar: teamAvatar(u) };
    };
    const a = side(ra.roster_id, ua), b = side(rb.roster_id, ub);
    const sr = await finishedSeries(data, ua, ub, season, weekPhase).catch(() => null);
    if (!sr) continue;
    // This week's own game isn't history yet.
    const games = sr.games.filter(g => !(String(g.season) === season && g.week >= week));
    const g = grudge(games, sr.rivalryScore, a.teamName, b.teamName, season);
    if (!g || g.score < GRUDGE_MIN) continue;
    const aWins = games.filter(x => x.score > x.opponentScore).length;
    const bWins = games.filter(x => x.score < x.opponentScore).length;
    scored.push({
      matchupId, a, b,
      series: { aWins, bWins, ties: games.length - aWins - bWins, meetings: games.length },
      label: g.score >= 75 ? 'Blood feud' : 'Grudge match',
      score: g.score,
      reasons: g.reasons,
      last: g.last ? { season: String(g.last.season), week: g.last.week, aScore: g.last.score, bScore: g.last.opponentScore } : null,
    });
  }
  const top = scored.sort((x, y) => y.score - x.score).slice(0, GRUDGE_MAX_GAMES);
  const col = await colours(top.flatMap(g => [g.a.userId, g.b.userId]));
  return { ...empty, games: top.map(g => {
    const a = col.get(g.a.userId)!;
    return { ...g, a: { ...g.a, color: a }, b: { ...g.b, color: apart(a, col.get(g.b.userId)!) } };
  }) };
}

/**
 * The week's rivalries: as chosen and kept, or chosen now if the week hasn't kicked off. A week
 * already under way that was never chosen has none: a rivalry is billed before the game.
 */
export async function rivalryWeek(leagueId: string, season: string, week: number): Promise<RivalryWeek | null> {
  const r = getRedis().client;
  const raw = await r?.get(KEY(leagueId, season, week)).catch(() => null);
  if (raw) {
    try {
      const rw = JSON.parse(raw) as RivalryWeek;
      return { ...rw, games: rw.games.map(g => ({ ...g, b: { ...g.b, color: apart(g.a.color, g.b.color) } })) };
    } catch { /* choose again */ }
  }
  if ((await weekPhase(season, week).catch(() => 'upcoming')) !== 'upcoming') return null;
  const chosen = await chooseRivalries(leagueId, season, week);
  // Kept once the week's matchups exist, even with no rivalry in it: a quiet week stays quiet.
  if (r) await r.set(KEY(leagueId, season, week), JSON.stringify(chosen)).catch(() => {});
  return chosen;
}

/** Two days of stat corrections after a week's final, then the result stands. */
const RECHECK_MS = 48 * 3_600_000;

/**
 * A finished rivalry week's results, and the loser's banner, from the real scores. Counted again
 * on each ask for two days after it's first settled: a stat correction can flip a close game, and
 * then the banner moves to the right stadium. The week of shame runs from the first settling.
 */
async function settle(leagueId: string, rw: RivalryWeek): Promise<RivalryWeek> {
  if (!rw.games.length) return rw;
  if (rw.settled && rw.settledAt && Date.now() - Date.parse(rw.settledAt) > RECHECK_MS) return rw;
  if ((await weekPhase(rw.season, rw.week).catch(() => 'upcoming')) !== 'final') return rw;
  const rows = await getLeagueMatchups(leagueId, rw.week).catch(() => [] as any[]);
  const pts = new Map<number, number>((rows ?? []).map((x: any) => [x.roster_id, Number(x.points ?? 0)]));
  // No scores at all is a failed read, not a result.
  if (rw.games.some(g => !pts.get(g.a.rosterId) && !pts.get(g.b.rosterId))) return rw;
  const r = getRedis().client;
  let shame: Record<string, Shame> = {};
  try { shame = JSON.parse((await r?.get(SHAME)) ?? '{}'); } catch { /* none */ }
  const settledAt = rw.settledAt ?? new Date().toISOString();
  const until = new Date(Date.parse(settledAt) + SHAME_MS).toISOString();
  const games = rw.games.map(g => {
    const a = pts.get(g.a.rosterId) ?? 0, b = pts.get(g.b.rosterId) ?? 0;
    const winner = a === b ? null : a > b ? g.a.userId : g.b.userId;
    // This game's banner, counted afresh: off both stadiums, then up over the loser's.
    for (const id of [g.a.userId, g.b.userId]) if (shame[id]?.season === rw.season && shame[id]?.week === rw.week) delete shame[id];
    if (winner) {
      const [w, l] = winner === g.a.userId ? [g.a, g.b] : [g.b, g.a];
      shame[l.userId] = { by: w.teamName, byUserId: w.userId, byColor: w.color, loser: l.teamName, season: rw.season, week: rw.week, score: [Math.max(a, b), Math.min(a, b)], until };
    }
    return { ...g, winner, final: { a, b } };
  });
  const done = { ...rw, games, settled: true, settledAt };
  await Promise.all([
    r?.set(KEY(leagueId, rw.season, rw.week), JSON.stringify(done)),
    r?.set(SHAME, JSON.stringify(shame)),
  ]).catch(() => {});
  return done;
}

export interface RivalryNow {
  /** The rivalries of the week coming up or being played. */
  upcoming: RivalryWeek | null;
  /** The week before's, settled once it's final. */
  last: RivalryWeek | null;
}

/** This week's rivalries and last week's results, settling last week's as it goes. */
export async function rivalryNow(): Promise<RivalryNow> {
  const [{ pickemSeason }] = await Promise.all([import('./pickem')]);
  const s = await pickemSeason();
  const w = Math.max(1, s.nflWeek);
  const thisPhase = await weekPhase(s.season, w).catch(() => 'upcoming');
  // The billing: this week's rivalries until it's final; while it's being played, next week's are
  // chosen too (so the Desk can trail them), and lead once this week's are settled or if it had none.
  const [cur, nxt, a, b] = await Promise.all([
    thisPhase === 'final' ? null : rivalryWeek(s.leagueId, s.season, w).catch(() => null),
    thisPhase === 'upcoming' ? null : rivalryWeek(s.leagueId, s.season, w + 1).catch(() => null),
    rivalryWeek(s.leagueId, s.season, thisPhase === 'final' ? w : w - 1).catch(() => null),
    w - 2 >= 1 ? rivalryWeek(s.leagueId, s.season, thisPhase === 'final' ? w - 1 : w - 2).catch(() => null) : null,
  ]);
  const upcoming = cur?.games.length ? cur : nxt;
  const settled = await Promise.all([a, b].map(x => (x ? settle(s.leagueId, x).catch(() => x) : null)));
  return { upcoming: upcoming && upcoming.games.length ? upcoming : null, last: settled[0]?.games.length ? settled[0] : null };
}

/** The rivalries of one week, for the Desk: `week` is the week coming up after the episode's. */
export async function rivalryFor(week: number): Promise<RivalryWeek | null> {
  const { pickemSeason } = await import('./pickem');
  const s = await pickemSeason();
  const rw = await rivalryWeek(s.leagueId, s.season, week).catch(() => null);
  return rw?.games.length ? rw : null;
}

export interface Dressing {
  rivalry: { week: number; opponent: string; opponentColor: string; label: string; record: string } | null;
  shame: Shame | null;
}

/** How a franchise's stadium is dressed right now: for a rivalry game, and with a loss to live down. */
export async function dressingFor(userId: string): Promise<Dressing> {
  const now = await rivalryNow().catch(() => ({ upcoming: null, last: null }));
  let rivalry: Dressing['rivalry'] = null;
  const g = now.upcoming?.games.find(x => x.a.userId === userId || x.b.userId === userId);
  if (g && now.upcoming) {
    const mine = g.a.userId === userId;
    const [w, l] = mine ? [g.series.aWins, g.series.bWins] : [g.series.bWins, g.series.aWins];
    rivalry = { week: now.upcoming.week, opponent: (mine ? g.b : g.a).teamName, opponentColor: (mine ? g.b : g.a).color, label: g.label, record: `${w}-${l}${g.series.ties ? `-${g.series.ties}` : ''}` };
  }
  let shame: Shame | null = null;
  try {
    const all = JSON.parse((await getRedis().client?.get(SHAME)) ?? '{}') as Record<string, Shame>;
    const s = all[userId];
    if (s && Date.parse(s.until) > Date.now()) shame = s;
  } catch { /* none */ }
  return { rivalry, shame };
}
