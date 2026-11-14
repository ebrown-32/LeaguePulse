/**
 * Pick'em: every week, every manager calls the league's other matchups. Server only.
 *
 *   The card      the week's matchups but your own, with the forecast's favourite for a hint.
 *                 One pick a game, and one lock a week (worth double, lib/pickemScore).
 *   The lock      picks close at the week's first NFL kickoff (ESPN's schedule), and every card
 *                 is opened to the league then: who picked what, and the split on each game.
 *   The table     the regular season's points; whoever leads it when the regular season is over
 *                 lifts the Pick'em Cup.
 *   The Desk      The Desk Weekly hears the week's best and worst predictors (pickemForDesk), and
 *                 roasts the worst by name.
 *
 * Who's picking:
 *   A manager signed in to their franchise (hosted, lib/platform/visitorPass) picks for it, and
 *   only they can. A team nobody has claimed (and every team on a self-hosted site, which has no
 *   accounts) is held by a key: the first browser to pick for it keeps one, and later picks for
 *   that team need it. Friends' leagues trust each other; this stops a mis-tap, not a hacker.
 *
 * Stored per week, regular season only (the playoffs leave most managers nothing to pick):
 * `lp_pickem:<league>:<season>:<week>`, a manager's picks by their Sleeper user id. Tenant-scoped
 * like everything in Redis.
 */

import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getLeagueInfo, getLeagueMatchups, getLeagueRosters, getLeagueUsers, getNFLState } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { getRedis } from '@/lib/redisClient';
import { weekPhase } from '@/lib/nflSchedule';
import { teamAvatar } from '@/lib/teamAvatar';
import { addWeek, cupHolder, scoreWeek, simulatePicks, seasonTable, weekExtremes, type Result, type TableRow, type WeekPicks, type WeekScore } from './pickemScore';

export type { WeekPicks, TableRow } from './pickemScore';
export { PICKEM_PAY, pickemDollars } from './pickemScore';

export interface PickemTeam { rosterId: number; userId: string; teamName: string; avatar: string; points: number }
export interface PickemGame {
  matchupId: number;
  a: PickemTeam;
  b: PickemTeam;
  /** The forecast's chance side A wins, before kickoff; null without lineups yet. */
  aWinProb: number | null;
  /** Once the week is final: the roster that won (null for a tie). Undefined before. */
  winner?: number | null;
  /** After the lock: how many picked each side. */
  split?: { a: number; b: number };
}
export interface PickemWeek {
  season: string;
  week: number;
  phase: 'open' | 'locked' | 'final';
  /** The first kickoff, when picks close (ISO); null when ESPN has no schedule for it. */
  locksAt: string | null;
  games: PickemGame[];
  /** Managers with a card in, by user id: their picks show once the week's locked. */
  entered: string[];
}

const KEY = (league: string, season: string, week: number) => `lp_pickem:${league}:${season}:${week}`;
const KEYS = (league: string) => `lp_pickem_keys:${league}`;
/** The open week's odds, kept as they were before kickoff, for the sim (see withSims). */
const ODDS = (league: string, season: string, week: number) => `lp_pickem_odds:${league}:${season}:${week}`;

function redis() {
  const r = getRedis().client;
  if (!r) throw new Error('Pick\'em needs storage (REDIS_URL) to keep the picks.');
  return r;
}

async function readWeek(league: string, season: string, week: number): Promise<Record<string, WeekPicks>> {
  const raw = await getRedis().client?.get(KEY(league, season, week)).catch(() => null);
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

// ── The season ───────────────────────────────────────────────────────────────

export interface PickemSeason {
  leagueId: string;
  season: string;
  /** The NFL's current week. */
  nflWeek: number;
  /** The last week of the regular season. */
  lastWeek: number;
  /** Whether the regular season is over (the Cup is decided). */
  over: boolean;
}

export async function pickemSeason(): Promise<PickemSeason> {
  const [leagueId, state] = await Promise.all([getCurrentLeagueId(), getNFLState().catch(() => null as any)]);
  const info = await getLeagueInfo(leagueId).catch(() => null as any);
  const season = String(info?.season ?? state?.season ?? new Date().getFullYear());
  const lastWeek = Math.max(1, Number(info?.settings?.playoff_week_start ?? 15) - 1);
  const stateSeason = String(state?.season ?? season);
  // Sleeper's week in the offseason is 0 or 1 of the next season: before the season, week 1.
  let nflWeek = Number(state?.display_week ?? state?.week ?? 1) || 1;
  if (stateSeason !== season) nflWeek = Number(stateSeason) > Number(season) ? lastWeek + 1 : 1;
  if (state?.season_type === 'post' || state?.season_type === 'off') nflWeek = Math.max(nflWeek, lastWeek + 1);
  const over = nflWeek > lastWeek && (await weekPhase(season, lastWeek, stateSeason === season).catch(() => 'upcoming')) === 'final';
  return { leagueId, season, nflWeek, lastWeek, over };
}

async function teams(leagueId: string) {
  const [rosters, users] = await Promise.all([getLeagueRosters(leagueId).catch(() => [] as any[]), getLeagueUsers(leagueId).catch(() => [] as any[])]);
  const userById = new Map<string, any>((users ?? []).map((u: any) => [u.user_id, u]));
  const byRoster = new Map<number, Omit<PickemTeam, 'points'>>();
  for (const r of rosters ?? []) {
    const u = userById.get(r.owner_id);
    byRoster.set(r.roster_id, { rosterId: r.roster_id, userId: String(r.owner_id ?? ''), teamName: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`, avatar: teamAvatar(u) });
  }
  return byRoster;
}

/** The week's games, as pairs, with their scores so far. */
async function games(leagueId: string, week: number, byRoster: Awaited<ReturnType<typeof teams>>): Promise<Omit<PickemGame, 'aWinProb'>[]> {
  const rows = await getLeagueMatchups(leagueId, week).catch(() => [] as any[]);
  const by = new Map<number, any[]>();
  for (const r of rows ?? []) if (r.matchup_id != null) by.set(r.matchup_id, [...(by.get(r.matchup_id) ?? []), r]);
  const out: Omit<PickemGame, 'aWinProb'>[] = [];
  for (const [id, pair] of [...by.entries()].sort((x, y) => x[0] - y[0])) {
    if (pair.length !== 2) continue;
    const side = (r: any): PickemTeam => ({ ...(byRoster.get(r.roster_id) ?? { rosterId: r.roster_id, userId: '', teamName: `Team ${r.roster_id}`, avatar: '' }), points: Number(r.points ?? 0) });
    out.push({ matchupId: id, a: side(pair[0]), b: side(pair[1]) });
  }
  return out;
}

const resultOf = (g: Omit<PickemGame, 'aWinProb'>): Result => ({
  matchupId: g.matchupId,
  rosters: [g.a.rosterId, g.b.rosterId],
  winner: g.a.points === g.b.points ? null : g.a.points > g.b.points ? g.a.rosterId : g.b.rosterId,
});

/** When the week's first NFL game kicks off. */
async function firstKickoff(season: string, week: number): Promise<string | null> {
  const { espnScoreboardWeek } = await import('@/lib/live/espn');
  const games = await espnScoreboardWeek(season, week).catch(() => []);
  const times = games.map(g => Date.parse(g.kickoff)).filter(Number.isFinite).sort((a, b) => a - b);
  return times.length ? new Date(times[0]).toISOString() : null;
}

/** Where a week stands for picking. */
async function phaseFor(season: string, week: number, current: boolean): Promise<{ phase: PickemWeek['phase']; locksAt: string | null }> {
  const [nfl, locksAt] = await Promise.all([weekPhase(season, week, current).catch(() => 'upcoming' as const), firstKickoff(season, week)]);
  if (nfl === 'final') return { phase: 'final', locksAt };
  if (nfl === 'live' || (locksAt && Date.parse(locksAt) <= Date.now())) return { phase: 'locked', locksAt };
  return { phase: 'open', locksAt };
}

/** The NFL's week, within the regular season (see pickemWeeks for which weeks are open, live and done). */
export function weekToShow(s: PickemSeason): number {
  return Math.min(Math.max(1, s.nflWeek), s.lastWeek);
}

/**
 * The weeks on the page: the one open for picks, the one being played (picks locked and shown),
 * and the last one finished. While a week is under way, the next is already open, so there's
 * always a card to fill in until the regular season's last week kicks off.
 */
export async function pickemWeeks(s: PickemSeason): Promise<{ open: number | null; live: number | null; done: number | null }> {
  const w = weekToShow(s);
  const { phase } = await phaseFor(s.season, w, true);
  const next = w < s.lastWeek ? w + 1 : null;
  if (phase === 'open') return { open: w, live: null, done: w > 1 ? w - 1 : null };
  if (phase === 'locked') return { open: next, live: w, done: w > 1 ? w - 1 : null };
  return { open: next, live: null, done: w };
}

/**
 * The forecast's chance each game's side A wins (`a` as the slate lists it), before kickoff. Games
 * without projections yet (no lineups) are left out: no favourite, and no upset to be had.
 */
async function sideOdds(s: PickemSeason, week: number, list: { matchupId: number; a: { rosterId: number } }[]): Promise<Map<number, number>> {
  const { weekForecasts } = await import('@/lib/sim/weekForecasts');
  const f = await weekForecasts(s.leagueId, s.season, week, false).catch(() => null);
  return new Map((f?.fixtures ?? []).filter(x => x.forecast.a.projectedFinal + x.forecast.b.projectedFinal > 0)
    .map(x => [x.matchupId, x.a.rosterId === list.find(g => g.matchupId === x.matchupId)?.a.rosterId ? x.forecast.aWinProb : 1 - x.forecast.aWinProb]));
}

/** One week's card for the whole league. Picks are only in it once they're locked. */
export async function pickemWeek(s: PickemSeason, week: number): Promise<{ week: PickemWeek; picks: Record<string, WeekPicks> }> {
  const byRoster = await teams(s.leagueId);
  const [list, { phase, locksAt }, stored] = await Promise.all([
    games(s.leagueId, week, byRoster), phaseFor(s.season, week, true), readWeek(s.leagueId, s.season, week),
  ]);
  // The favourite, for a hint while picks are open (the projections are the slow part, so only then).
  const probs = phase === 'open' ? await sideOdds(s, week, list) : new Map<number, number>();
  // Kept while it's open, so the sim picks from the odds as they stood before kickoff.
  if (phase === 'open' && probs.size) await getRedis().client?.set(ODDS(s.leagueId, s.season, week), JSON.stringify([...probs]), 30 * 86_400).catch(() => {});
  // Locked: anyone who didn't pick gets the sim's card.
  if (phase !== 'open') Object.assign(stored, await withSims(s, week, stored, list, byRoster));
  const open = phase === 'open';
  const out: PickemGame[] = list.map(g => {
    const game: PickemGame = { ...g, aWinProb: probs.get(g.matchupId) ?? null };
    if (!open) {
      let a = 0, b = 0;
      for (const p of Object.values(stored)) { const v = p.picks[String(g.matchupId)]; if (v === g.a.rosterId) a++; else if (v === g.b.rosterId) b++; }
      game.split = { a, b };
    }
    if (phase === 'final') game.winner = resultOf(g).winner;
    // Before kickoff the scores are last week's leftovers or zeros: not shown.
    if (open) { game.a = { ...game.a, points: 0 }; game.b = { ...game.b, points: 0 }; }
    return game;
  });
  return {
    week: { season: s.season, week, phase, locksAt, games: out, entered: Object.keys(stored) },
    picks: open ? {} : stored,
  };
}

/**
 * The week's cards with the sim's filled in for every manager who didn't pick, kept once made.
 * Only in a week someone actually played: a week nobody picked stays empty.
 */
async function withSims(s: PickemSeason, week: number, stored: Record<string, WeekPicks>, slate: { matchupId: number; a: { rosterId: number }; b: { rosterId: number } }[], byRoster: Map<number, Omit<PickemTeam, 'points'>>): Promise<Record<string, WeekPicks>> {
  if (!slate.length || !Object.values(stored).some(p => !p.auto)) return stored;
  const missing = [...byRoster.values()].filter(t => t.userId && !stored[t.userId]);
  if (!missing.length) return stored;
  const r = getRedis().client;
  let odds = new Map<number, number>();
  try { odds = new Map(JSON.parse((await r?.get(ODDS(s.leagueId, s.season, week))) ?? '[]') as [number, number][]); } catch { /* a coin flip each */ }
  const at = new Date().toISOString();
  const all = { ...stored };
  for (const t of missing) all[t.userId] = simulatePicks(slate, t.rosterId, odds, `${s.leagueId}:${s.season}:${week}:${t.userId}`, at);
  await r?.set(KEY(s.leagueId, s.season, week), JSON.stringify(all)).catch(() => {});
  return all;
}

/**
 * The cron's turn (api/ai/cron): the open week's odds kept for the sim, and the sims' cards made
 * for a week that's locked, so they're there even if nobody opens the page.
 */
export async function pickemTick(): Promise<void> {
  const s = await pickemSeason();
  const w = await pickemWeeks(s);
  await Promise.all([w.open, w.live, w.done].filter((x): x is number => x !== null).map(x => pickemWeek(s, x)));
}

/** One manager's own card for a week (theirs to see before the lock). */
export async function myPicks(s: PickemSeason, week: number, userId: string): Promise<WeekPicks | null> {
  return (await readWeek(s.leagueId, s.season, week))[userId] ?? null;
}

// ── Picking ──────────────────────────────────────────────────────────────────

export class PickemError extends Error { constructor(message: string, public status = 400) { super(message); } }

const hash = (k: string) => createHash('sha256').update(k).digest();

/**
 * The key that holds a team nobody has signed in for: checked if it has one, issued if not.
 * Returns a new key to hand back to the browser, or null when the one given was right.
 */
async function holdTeam(leagueId: string, userId: string, key: string | null): Promise<string | null> {
  const r = redis();
  let keys: Record<string, string> = {};
  try { keys = JSON.parse((await r.get(KEYS(leagueId))) ?? '{}'); } catch { /* none yet */ }
  const held = keys[userId];
  if (held) {
    if (!key) throw new PickemError('This team\'s picks are being made on another device.', 403);
    const a = Buffer.from(held, 'hex'), b = hash(key);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new PickemError('This team\'s picks are being made on another device.', 403);
    return null;
  }
  const fresh = randomBytes(18).toString('base64url');
  keys[userId] = hash(fresh).toString('hex');
  await r.set(KEYS(leagueId), JSON.stringify(keys));
  return fresh;
}

/**
 * Saves a manager's card for the open week: replaces their picks, checked against the slate.
 * `signedIn`: they're signed in to this franchise (no key needed). Returns a key when one was
 * issued for this browser to keep.
 */
export async function savePicks(s: PickemSeason, week: number, userId: string, input: { picks: Record<string, number>; lock?: number | null }, auth: { signedIn: boolean; managed: boolean; key: string | null }): Promise<{ picks: WeekPicks; key: string | null }> {
  if (!auth.signedIn && auth.managed) throw new PickemError('Sign in to make this team\'s picks.', 401);
  const first = weekToShow(s);
  if (week < first || week > first + 1 || week > s.lastWeek) throw new PickemError('That week isn\'t open for picks.');
  const byRoster = await teams(s.leagueId);
  const [slate, { phase }] = await Promise.all([games(s.leagueId, week, byRoster), phaseFor(s.season, week, true)]);
  if (phase !== 'open') throw new PickemError('Picks for this week are locked: the games have kicked off.', 409);
  const mine = [...byRoster.values()].find(t => t.userId === userId);
  if (!mine) throw new PickemError('That team isn\'t in this league.', 404);

  const picks: Record<string, number> = {};
  for (const g of slate) {
    if (g.a.rosterId === mine.rosterId || g.b.rosterId === mine.rosterId) continue;
    const v = Number(input.picks?.[String(g.matchupId)]);
    if (v === g.a.rosterId || v === g.b.rosterId) picks[String(g.matchupId)] = v;
  }
  const lock = input.lock != null && picks[String(input.lock)] !== undefined ? Number(input.lock) : null;
  const key = auth.signedIn ? null : await holdTeam(s.leagueId, userId, auth.key);

  const r = redis();
  const k = KEY(s.leagueId, s.season, week);
  const [all, probs] = await Promise.all([readWeek(s.leagueId, s.season, week), sideOdds(s, week, slate)]);
  // Each pick keeps the odds it was made at: a pick that hasn't changed keeps its first odds.
  const before = all[userId];
  const odds: Record<string, number> = {};
  for (const g of slate) {
    const id = String(g.matchupId), side = picks[id];
    if (side === undefined) continue;
    if (before?.picks[id] === side && before.odds?.[id] !== undefined) { odds[id] = before.odds[id]; continue; }
    const pa = probs.get(g.matchupId);
    if (pa !== undefined) odds[id] = Math.round((side === g.a.rosterId ? pa : 1 - pa) * 1000) / 1000;
  }
  const card: WeekPicks = { picks, lock, odds, at: new Date().toISOString() };
  if (Object.keys(picks).length) all[userId] = card; else delete all[userId];
  await r.set(k, JSON.stringify(all));
  return { picks: card, key };
}

// ── The table ────────────────────────────────────────────────────────────────

export interface WeekResult { week: number; scores: { userId: string; s: WeekScore }[]; slate: number }

/** Every finished week's scores, this season (regular season). */
export async function finishedWeeks(s: PickemSeason): Promise<WeekResult[]> {
  const last = Math.min(s.lastWeek, s.nflWeek);
  const weeks = Array.from({ length: last }, (_, i) => i + 1);
  const raw = await getRedis().client?.mget(weeks.map(w => KEY(s.leagueId, s.season, w))).catch(() => null);
  const stored = weeks.map((_, i) => { try { return raw?.[i] ? JSON.parse(raw[i]!) as Record<string, WeekPicks> : {}; } catch { return {}; } });
  const byRoster = await teams(s.leagueId);
  const rosterOf = new Map([...byRoster.values()].map(t => [t.userId, t.rosterId]));
  const out: WeekResult[] = [];
  await Promise.all(weeks.map(async (w, i) => {
    if (!Object.keys(stored[i]).length) return;
    if ((await weekPhase(s.season, w).catch(() => 'upcoming')) !== 'final') return;
    const slate = await games(s.leagueId, w, byRoster);
    stored[i] = await withSims(s, w, stored[i], slate, byRoster);
    const results = slate.map(resultOf);
    out.push({
      week: w,
      slate: Math.max(0, results.length - 1),
      scores: Object.entries(stored[i]).map(([userId, p]) => ({ userId, s: scoreWeek(p, results, rosterOf.get(userId) ?? null) })),
    });
  }));
  return out.sort((a, b) => a.week - b.week);
}

export interface PickemTable {
  rows: (TableRow & { teamName: string; avatar: string })[];
  /** The latest finished week's best and worst, for the page's headline. */
  lastWeek: { week: number; best: { userId: string; points: number; right: number; wrong: number }; worst: { userId: string; points: number; right: number; wrong: number } } | null;
  /** The Cup's holder, once the regular season's over. */
  champion: string | null;
}

export async function pickemTable(s: PickemSeason): Promise<PickemTable> {
  const [weeks, byRoster] = await Promise.all([finishedWeeks(s), teams(s.leagueId)]);
  const rows = new Map<string, TableRow>();
  for (const w of weeks) for (const x of w.scores) addWeek(rows, x.userId, w.week, x.s);
  const who = new Map([...byRoster.values()].map(t => [t.userId, t]));
  const table = seasonTable(rows).map(r => ({ ...r, teamName: who.get(r.userId)?.teamName ?? 'A former manager', avatar: who.get(r.userId)?.avatar ?? '' }));
  const latest = weeks[weeks.length - 1];
  const ex = latest ? weekExtremes(latest.scores, latest.slate) : null;
  const flat = (x: { userId: string; s: WeekScore }) => ({ userId: x.userId, points: x.s.points, right: x.s.right, wrong: x.s.wrong });
  return {
    rows: table,
    lastWeek: ex && latest ? { week: latest.week, best: flat(ex.best), worst: flat(ex.worst) } : null,
    champion: s.over ? cupHolder(table) : null,
  };
}

/** Past seasons' Cup winners, kept when a season's Cup is decided, for the trophy's base. */
const CHAMPS = 'lp_pickem_champions';
export async function pickemChampions(s: PickemSeason, table: PickemTable): Promise<{ season: string; name: string }[]> {
  const r = getRedis().client;
  let list: { season: string; name: string }[] = [];
  try { list = JSON.parse((await r?.get(CHAMPS)) ?? '[]'); } catch { /* none */ }
  if (table.champion) {
    const name = table.rows.find(r => r.userId === table.champion)?.teamName ?? 'A former manager';
    if (!list.some(c => c.season === s.season)) {
      list = [...list, { season: s.season, name }].sort((a, b) => a.season.localeCompare(b.season));
      await r?.set(CHAMPS, JSON.stringify(list)).catch(() => {});
    }
  }
  return list;
}

// ── For The Desk Weekly ──────────────────────────────────────────────────────

/**
 * What the Desk knows about Pick'em in a week: everyone's score that week, the best and the worst
 * predictor, and the season's leader. Null when nobody picked. Written for the script's context.
 */
export async function pickemForDesk(week: number): Promise<string | null> {
  try {
    const s = await pickemSeason();
    if (week > s.lastWeek) return null;
    const weeks = await finishedWeeks(s);
    const w = weeks.find(x => x.week === week);
    if (!w || w.scores.length < 2) return null;
    const byRoster = await teams(s.leagueId);
    const name = new Map([...byRoster.values()].map(t => [t.userId, t.teamName]));
    const rows = new Map<string, TableRow>();
    for (const x of weeks.filter(x => x.week <= week)) for (const y of x.scores) addWeek(rows, y.userId, x.week, y.s);
    const table = seasonTable(rows);
    const ex = weekExtremes(w.scores, w.slate);
    const lines = [
      `PICK'EM (every manager picks the league's other games each week; a right pick is a point, a "lock" is worth two):`,
      ...[...w.scores].sort((a, b) => b.s.points - a.s.points).map(x => `- ${name.get(x.userId) ?? 'A manager'}: ${x.s.right} right, ${x.s.wrong} wrong, ${x.s.points} points${x.s.upsets ? `, ${x.s.upsets} upset${x.s.upsets === 1 ? '' : 's'} called` : ''}${x.s.lockRight === false ? ' (blew their lock)' : x.s.lockRight ? ' (hit their lock)' : ''}${x.s.auto ? ' (did not pick: the sim picked for them)' : ''}`),
      ex ? `Best predictor of week ${week}: ${name.get(ex.best.userId)}. Worst: ${name.get(ex.worst.userId)}, ${ex.worst.s.right} for ${ex.worst.s.right + ex.worst.s.wrong}.` : '',
      table[0] ? `Season leader for the Pick'em Cup: ${name.get(table[0].userId)} with ${table[0].points} points.` : '',
    ].filter(Boolean);
    return lines.join('\n');
  } catch {
    return null;
  }
}

// ── Who's who ────────────────────────────────────────────────────────────────

/** Whether `key` holds this team's picks (or nobody holds them yet). */
export async function keyHolds(leagueId: string, userId: string, key: string | null): Promise<boolean> {
  let keys: Record<string, string> = {};
  try { keys = JSON.parse((await getRedis().client?.get(KEYS(leagueId))) ?? '{}'); } catch { /* none */ }
  const held = keys[userId];
  if (!held) return true;
  if (!key) return false;
  const a = Buffer.from(held, 'hex'), b = hash(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The league's teams, for "which team are you". */
export async function pickemTeams(s: PickemSeason): Promise<Omit<PickemTeam, 'points'>[]> {
  return [...(await teams(s.leagueId)).values()].filter(t => t.userId).sort((a, b) => a.teamName.localeCompare(b.teamName));
}

// ── Winnings ─────────────────────────────────────────────────────────────────

export interface PickemPayouts {
  season: number;
  lastWeek: number;
  /** Each finished week's scores, by user id (that's the franchise id). */
  weeks: { week: number; scores: Map<string, WeekScore> }[];
  champion: string | null;
}

const payoutsMemo = new Map<string, { at: number; p: Promise<PickemPayouts> }>();

/** The season's winnings so far, read once every few minutes (every franchise's books ask). */
export async function pickemPayouts(): Promise<PickemPayouts> {
  const s = await pickemSeason();
  const hit = payoutsMemo.get(s.leagueId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.p;
  const p = (async () => {
    const weeks = await finishedWeeks(s);
    const table = new Map<string, TableRow>();
    for (const w of weeks) for (const x of w.scores) addWeek(table, x.userId, w.week, x.s);
    const rows = seasonTable(table);
    return {
      season: Number(s.season), lastWeek: s.lastWeek,
      weeks: weeks.map(w => ({ week: w.week, scores: new Map(w.scores.map(x => [x.userId, x.s])) })),
      champion: s.over ? cupHolder(rows) : null,
    };
  })();
  payoutsMemo.set(s.leagueId, { at: Date.now(), p });
  p.catch(() => payoutsMemo.delete(s.leagueId));
  return p;
}

