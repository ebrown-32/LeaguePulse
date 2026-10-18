/**
 * One season of the demo league, played out: made-up managers (cast.ts) drafting real NFL
 * players, setting lineups, working the waiver wire and trading, every week scored from what
 * those players really did that week. The result is in Sleeper's shapes (league, users, rosters,
 * matchups, transactions, brackets, the draft), served by serve.ts like any league.
 *
 * Decisions only ever use what a manager could have known at the time, with one allowance: a
 * manager knows who actually suited up in a finished week (they read the injury report), unless
 * they're the sort who never does. The draft board is the previous season's production.
 *
 * Deterministic: the same inputs make the same season, for every visitor, on every server, and
 * a live week's points changing never changes anything decided before it. Pure.
 */

import { CAST, LEAGUE_NAME, type CastMember, type Style } from './cast.ts';
import {
  FIRST_SEASON, LAST_WEEK, PLAYOFF_START, PLAYOFF_TEAMS, REGULAR_WEEKS, ROSTER_POSITIONS, ROUNDS, SCORING, TEAMS, leagueSettings,
} from './settings.ts';
import { demoLeagueId, demoUserId } from '../providers/ids.ts';

// ── Inputs ──────────────────────────────────────────────────────────────────

/** One week of the real games: each player's points, and who played. */
export interface WeekData {
  pts: Record<string, number>;
  /** Players with a game that week (a finished week: those who took the field). */
  played: string[];
}

export interface PlayerInfo { position: string; first_name?: string; last_name?: string; team?: string | null; injury_status?: string | null }

export interface SeasonInput {
  season: number;
  /** The previous season's totals: the draft board. */
  prior: Record<string, { pts: number; gp: number }>;
  /** This season's totals so far, for players with no previous season (rookies) and for who's in the league. */
  current: Record<string, { pts: number; gp: number }>;
  /** Weeks with stats: finished ones, and the one being played. */
  weeks: Record<number, WeekData>;
  /** The week being played right now, if any (its stats are partial). */
  live: number | null;
  /** The last week whose games are over. */
  final: number;
  directory: Record<string, PlayerInfo>;
}

// ── Randomness, seeded ─────────────────────────────────────────────────────

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A generator for one purpose: its own seed, so one decision never shifts another. */
function rng(...parts: (string | number)[]) {
  let a = hash(parts.join('|'));
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => { const u = Math.max(1e-9, next()), v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return { next, normal, pick: <T>(xs: T[]) => xs[Math.floor(next() * xs.length)] };
}

// ── The draft ──────────────────────────────────────────────────────────────

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
type Pos = typeof POSITIONS[number];
const isPos = (p: string): p is Pos => (POSITIONS as readonly string[]).includes(p);

/** How deep each position runs before it's replacement level, for value over replacement. */
const REPLACEMENT: Record<Pos, number> = { QB: 13, RB: 30, WR: 32, TE: 12, K: 10, DEF: 10 };
const CAP: Record<Pos, number> = { QB: 2, RB: 6, WR: 6, TE: 2, K: 1, DEF: 1 };
const NEED: Partial<Record<Pos, number>> = { QB: 1, RB: 2, WR: 2, TE: 1 };

function styleLean(style: Style, pos: Pos, round: number, have: Record<Pos, number>): number {
  switch (style) {
    case 'zeroRB': return pos === 'RB' && round <= 5 ? 0.6 : pos === 'WR' && round <= 6 ? 1.18 : 1;
    case 'robustRB': return pos === 'RB' && round <= 6 ? 1.25 : 1;
    case 'qbFirst': return pos === 'QB' && have.QB === 0 ? 2.2 : 1;
    default: return 1;
  }
}

interface Drafted { pick: number; round: number; slot: number; rosterId: number; playerId: string }

function draft(input: SeasonInput, order: CastMember[]): Drafted[] {
  const { season, prior, current, directory } = input;
  // Who's in the league this season: anyone who has played in it (a finished season), or who is
  // on a team now (this one).
  const live = input.live != null || input.final < LAST_WEEK;
  const pool = Object.keys(directory).filter(id => {
    const p = directory[id];
    if (!p || !isPos(p.position)) return false;
    if (current[id]?.gp) return true;
    return live && Boolean(p.team) && Boolean(prior[id]?.gp);
  });
  // A rookie's value: a guess at their season, made blind (well short of it, and noisy).
  const board = new Map<string, number>();
  for (const id of pool) {
    const was = prior[id];
    const value = was && was.gp >= 4 ? (was.pts / was.gp) * 16 : (current[id]?.gp ? (current[id].pts / current[id].gp) * 16 * 0.6 : 0);
    board.set(id, value);
  }
  const baseline = {} as Record<Pos, number>;
  for (const pos of POSITIONS) {
    const vals = pool.filter(id => directory[id].position === pos).map(id => board.get(id)!).sort((a, b) => b - a);
    baseline[pos] = vals[REPLACEMENT[pos]] ?? 0;
  }
  // Each manager reads the board through their own eyes.
  const eyes = new Map<number, Map<string, number>>();
  order.forEach((c, slot) => {
    const r = rng('draft-eyes', season, c.key);
    const sd = 0.12 + 0.35 * (1 - c.skill);
    const m = new Map<string, number>();
    for (const id of pool) m.set(id, board.get(id)! * Math.exp(r.normal() * sd));
    eyes.set(slot, m);
  });

  const taken = new Set<string>();
  const have = order.map(() => ({ QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }) as Record<Pos, number>);
  const picks: Drafted[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    const slots = round % 2 ? order.map((_, i) => i) : order.map((_, i) => order.length - 1 - i);
    for (const slot of slots) {
      const c = order[slot], h = have[slot];
      const left = ROUNDS - round + 1;
      const needs = (Object.entries(NEED) as [Pos, number][]).reduce((s, [p, n]) => s + Math.max(0, n - h[p]), 0) + (h.K ? 0 : 1) + (h.DEF ? 0 : 1);
      let best: string | null = null, bestScore = -Infinity;
      for (const id of pool) {
        if (taken.has(id)) continue;
        const pos = directory[id].position as Pos;
        if (h[pos] >= CAP[pos]) continue;
        // A kicker and a defense in the last two rounds, never sooner.
        if ((pos === 'K' || pos === 'DEF') && round < ROUNDS - 1) continue;
        // Whatever's left must still fill the starting spots.
        if (left <= needs && !((NEED[pos] ?? 1) > h[pos] || ((pos === 'K' || pos === 'DEF') && !h[pos]))) continue;
        const v = eyes.get(slot)!.get(id)!;
        const score = (v - baseline[pos]) * styleLean(c.style, pos, round, h) + (pos === 'K' || pos === 'DEF' ? v : 0);
        if (score > bestScore) { bestScore = score; best = id; }
      }
      if (!best) continue;
      taken.add(best);
      h[directory[best].position as Pos]++;
      picks.push({ pick: picks.length + 1, round, slot: slot + 1, rosterId: rosterIdOf(c), playerId: best });
    }
  }
  return picks;
}

// ── Lineups ────────────────────────────────────────────────────────────────

const FLEX = new Set(['RB', 'WR', 'TE']);
const OUT = new Set(['Out', 'IR', 'PUP', 'Sus', 'COV', 'NA', 'DNR']);

/** What a manager expects of a player in week w: last year's rate, blended with this year's as it comes in. */
function expected(id: string, w: number, input: SeasonInput): number {
  const was = input.prior[id];
  const base = was && was.gp >= 4 ? was.pts / was.gp : 6;
  let pts = 0, gp = 0;
  for (let k = 1; k < w; k++) {
    const wk = input.weeks[k];
    if (!wk || k > input.final) continue;
    if (wk.played.includes(id)) { pts += wk.pts[id] ?? 0; gp++; }
  }
  if (!gp) return base;
  const weight = Math.min(0.75, gp / 6);
  return base * (1 - weight) + (pts / gp) * weight;
}

/** Whether the manager thinks the player suits up: a finished week, whether they did; otherwise the injury report and the bye. */
function available(id: string, w: number, input: SeasonInput): boolean {
  const wk = input.weeks[w];
  if (wk && w <= input.final) return wk.played.includes(id);
  if (wk && wk.played.length) return wk.played.includes(id) && !OUT.has(String(input.directory[id]?.injury_status ?? ''));
  return !OUT.has(String(input.directory[id]?.injury_status ?? ''));
}

function setLineup(players: string[], c: CastMember, w: number, input: SeasonInput): string[] {
  const r = rng('lineup', input.season, w, c.key);
  const checks = c.style === 'couch' ? r.next() < 0.45 : true;
  const sd = 0.08 + 0.4 * (1 - c.skill);
  const score = new Map(players.map(id => {
    const ok = !checks || available(id, w, input);
    return [id, ok ? expected(id, w, input) * Math.exp(r.normal() * sd) : -1] as const;
  }));
  const pos = (id: string) => input.directory[id]?.position ?? '';
  const used = new Set<string>();
  const take = (fits: (p: string) => boolean) => {
    let best: string | null = null;
    for (const id of players) if (!used.has(id) && fits(pos(id)) && (best === null || score.get(id)! > score.get(best)!)) best = id;
    if (best) used.add(best);
    return best ?? '0';
  };
  return ROSTER_POSITIONS.filter(p => p !== 'BN').map(slot =>
    slot === 'FLEX' ? take(p => FLEX.has(p)) : take(p => p === slot));
}

// ── The schedule ───────────────────────────────────────────────────────────

/** Round robin by the circle method: each round, every team once. */
function roundRobin(n: number): [number, number][][] {
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const rounds: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const games: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) games.push([ids[i], ids[n - 1 - i]]);
    rounds.push(games);
    ids.splice(1, 0, ids.pop()!);
  }
  return rounds;
}

const rosterIdOf = (c: CastMember) => CAST.indexOf(c) + 1;

// ── The season ─────────────────────────────────────────────────────────────

export interface Season {
  league: any; users: any[]; rosters: any[]; drafts: any[]; picks: any[];
  matchups: Record<number, any[]>; transactions: Record<number, any[]>;
  winners_bracket: any[]; losers_bracket: any[];
}

/** When week w's moves happen: the Wednesday before its games (the NFL season opens the first Thursday after Labor Day). */
function weekStart(season: number, w: number): number {
  const sept1 = new Date(Date.UTC(season, 8, 1));
  const labor = 1 + ((8 - sept1.getUTCDay()) % 7);
  const opener = Date.UTC(season, 8, labor + 3, 15);
  return opener + ((w - 1) * 7 - 1) * 86_400_000;
}

export function playSeason(input: SeasonInput): Season {
  const { season } = input;
  const id = demoLeagueId(season);
  const order = [...CAST].sort((a, b) => rng('order', season, a.key).next() - rng('order', season, b.key).next());
  const picks = draft(input, order);

  const roster = new Map<number, string[]>(CAST.map(c => [rosterIdOf(c), [] as string[]]));
  for (const p of picks) roster.get(p.rosterId)!.push(p.playerId);
  const owned = () => new Set([...roster.values()].flat());
  const budget = new Map(CAST.map(c => [rosterIdOf(c), 100]));
  // Who came in when: a manager keeps a pickup a few weeks, and their early picks all season.
  const addedIn = new Map<string, number>();
  const core = new Set(picks.filter(p => p.round <= 7).map(p => p.playerId));
  const moves = new Map(CAST.map(c => [rosterIdOf(c), 0]));
  const record = new Map(CAST.map(c => [rosterIdOf(c), { w: 0, l: 0, t: 0, pf: 0, pa: 0 }]));

  const rounds = roundRobin(TEAMS);
  const shift = hash(`sched|${season}`) % rounds.length;
  const regular = Array.from({ length: REGULAR_WEEKS }, (_, w) => rounds[(w + shift) % rounds.length]);

  const matchups: Record<number, any[]> = {};
  const transactions: Record<number, any[]> = {};
  let txn = 0;
  const posOf = (pid: string) => input.directory[pid]?.position ?? '';
  const lastPlayed = input.live ?? input.final;
  const scoredThrough = Math.min(LAST_WEEK, lastPlayed);

  // Playoff seeding and the bracket, filled in as the weeks are played.
  let seeds: number[] = [];
  const bracket: any[] = [];
  const winnerOf = (m: number) => bracket.find(b => b.m === m)?.w ?? null;
  const loserOf = (m: number) => bracket.find(b => b.m === m)?.l ?? null;

  for (let w = 1; w <= LAST_WEEK; w++) {
    const moved: any[] = [];
    // ── Before the week: waivers, and now and then a trade. Only once the previous week is over.
    if (w >= 2 && w <= Math.min(input.final + 1, LAST_WEEK)) {
      const r = rng('waivers', season, w);
      const have = owned();
      const hot = (pid: string) => (input.weeks[w - 1]?.pts[pid] ?? 0) + 0.5 * (input.weeks[w - 2]?.pts[pid] ?? 0);
      const free = Object.keys(input.weeks[w - 1]?.pts ?? {})
        .filter(pid => !have.has(pid) && FLEX.has(posOf(pid)) && hot(pid) >= 16)
        .sort((a, b) => hot(b) - hot(a)).slice(0, 5);
      const appetite: Record<Style, number> = { waiverHawk: 0.92, analytics: 0.55, trader: 0.45, balanced: 0.4, zeroRB: 0.5, robustRB: 0.4, qbFirst: 0.35, couch: 0.04 };
      const claimed = new Set<string>();
      const claims = new Map<number, number>();
      const limit = (c: CastMember) => (c.style === 'waiverHawk' ? 2 : 1);
      for (const pid of free) {
        const bids = CAST.map(c => {
          const rid = rosterIdOf(c);
          if ((claims.get(rid) ?? 0) >= limit(c)) return null;
          if (r.next() > appetite[c.style] * (w > PLAYOFF_START ? 0.4 : 1)) return null;
          const bench = roster.get(rid)!
            .filter(x => FLEX.has(posOf(x)) && !core.has(x) && w - (addedIn.get(x) ?? -9) > 3)
            .sort((a, b) => expected(a, w, input) - expected(b, w, input));
          const drop = bench[0];
          if (!drop || expected(drop, w, input) * 1.8 > hot(pid)) return null;
          const purse = budget.get(rid)!;
          const bid = Math.min(purse, Math.round((c.style === 'waiverHawk' ? 0.3 : 0.12) * purse * (0.4 + r.next()) * Math.min(2, hot(pid) / 15)));
          return { rid, drop, bid, tie: r.next() };
        }).filter((x): x is NonNullable<typeof x> => Boolean(x)).sort((a, b) => b.bid - a.bid || b.tie - a.tie);
        const win = bids.find(b => roster.get(b.rid)!.includes(b.drop));
        if (!win || claimed.has(pid)) continue;
        claimed.add(pid);
        const list = roster.get(win.rid)!;
        list.splice(list.indexOf(win.drop), 1, pid);
        budget.set(win.rid, budget.get(win.rid)! - win.bid);
        claims.set(win.rid, (claims.get(win.rid) ?? 0) + 1);
        addedIn.set(pid, w);
        moves.set(win.rid, moves.get(win.rid)! + 1);
        moved.push(move('waiver', w, [win.rid], { [pid]: win.rid }, { [win.drop]: win.rid }, { waiver_bid: win.bid }));
      }
      // Trades, up to the deadline.
      if (w >= 3 && w <= 11) {
        const t = rng('trade', season, w);
        const trader = CAST.find(c => c.style === 'trader')!;
        if (t.next() < 0.32) {
          const a = t.next() < 0.55 ? trader : t.pick(CAST);
          const b = t.pick(CAST.filter(c => c !== a));
          const ra = rosterIdOf(a), rb = rosterIdOf(b);
          const give = (rid: string[], pos: string) => rid.filter(x => posOf(x) === pos).sort((x, y) => expected(y, w, input) - expected(x, w, input));
          const pos = t.pick(['RB', 'WR', 'WR', 'TE', 'QB']);
          const other = pos === 'RB' ? 'WR' : pos === 'WR' ? 'RB' : t.pick(['RB', 'WR']);
          const fromA = give(roster.get(ra)!, pos)[1];
          const target = fromA ? expected(fromA, w, input) : 0;
          const fromB = give(roster.get(rb)!, other).find(x => Math.abs(expected(x, w, input) - target) <= Math.max(2, target * 0.25));
          if (fromA && fromB) {
            const la = roster.get(ra)!, lb = roster.get(rb)!;
            la.splice(la.indexOf(fromA), 1, fromB);
            lb.splice(lb.indexOf(fromB), 1, fromA);
            moves.set(ra, moves.get(ra)! + 1); moves.set(rb, moves.get(rb)! + 1);
            moved.push(move('trade', w, [ra, rb], { [fromA]: rb, [fromB]: ra }, { [fromA]: ra, [fromB]: rb }, {}));
          }
        }
      }
    }
    transactions[w] = moved;

    // ── The games.
    const played = w <= scoredThrough;
    const lineups = new Map(CAST.map(c => [rosterIdOf(c), setLineup(roster.get(rosterIdOf(c))!, c, w, input)]));
    const ptsOf = (pid: string) => (played ? input.weeks[w]?.pts[pid] ?? 0 : 0);
    const total = (rid: number) => Math.round(lineups.get(rid)!.reduce((s, pid) => s + (pid === '0' ? 0 : ptsOf(pid)), 0) * 100) / 100;

    // Who plays whom: the schedule, then the bracket.
    const games: [number, number, number][] = [];
    if (w <= REGULAR_WEEKS) regular[w - 1].forEach(([x, y], i) => games.push([x, y, i + 1]));
    else if (seeds.length) {
      if (w === PLAYOFF_START) {
        games.push([seeds[2], seeds[5], 1], [seeds[3], seeds[4], 2]);
      } else if (w === PLAYOFF_START + 1 && winnerOf(1) && winnerOf(2)) {
        games.push([seeds[0], winnerOf(2), 3], [seeds[1], winnerOf(1), 4], [loserOf(1), loserOf(2), 5]);
      } else if (w === PLAYOFF_START + 2 && winnerOf(3) && winnerOf(4)) {
        games.push([winnerOf(3), winnerOf(4), 6], [loserOf(3), loserOf(4), 7]);
      }
    }
    const matchOf = new Map<number, number>();
    for (const [x, y, m] of games) { matchOf.set(x, m); matchOf.set(y, m); }

    matchups[w] = CAST.map(c => {
      const rid = rosterIdOf(c), lineup = lineups.get(rid)!, players = [...roster.get(rid)!];
      return {
        roster_id: rid, matchup_id: matchOf.get(rid) ?? null, points: total(rid), custom_points: null,
        starters: lineup, starters_points: lineup.map(pid => (pid === '0' ? 0 : ptsOf(pid))),
        players, players_points: Object.fromEntries(players.map(pid => [pid, ptsOf(pid)])),
      };
    });

    // ── After the week, once it's over: the standings, and the bracket.
    if (w > input.final) continue;
    if (w <= REGULAR_WEEKS) {
      for (const [x, y] of regular[w - 1]) {
        const px = total(x), py = total(y), rx = record.get(x)!, ry = record.get(y)!;
        rx.pf += px; rx.pa += py; ry.pf += py; ry.pa += px;
        if (px > py) { rx.w++; ry.l++; } else if (py > px) { ry.w++; rx.l++; } else { rx.t++; ry.t++; }
      }
      if (w === REGULAR_WEEKS) {
        seeds = [...record.keys()].sort((a, b) => {
          const ra = record.get(a)!, rb = record.get(b)!;
          return rb.w + rb.t / 2 - (ra.w + ra.t / 2) || rb.pf - ra.pf;
        }).slice(0, PLAYOFF_TEAMS);
      }
    } else {
      const round = w - PLAYOFF_START + 1;
      for (const [x, y, m] of games) {
        const px = total(x), py = total(y);
        // A tie goes to the higher seed.
        const xWins = px > py || (px === py && seeds.indexOf(x) < seeds.indexOf(y));
        const place = m === 5 ? 5 : m === 6 ? 1 : m === 7 ? 3 : undefined;
        // Where each side came from, as Sleeper records it: a seed, or a game's winner or loser.
        const from: Record<number, object> = { 3: { t2_from: { w: 2 } }, 4: { t2_from: { w: 1 } }, 5: { t1_from: { l: 1 }, t2_from: { l: 2 } }, 6: { t1_from: { w: 3 }, t2_from: { w: 4 } }, 7: { t1_from: { l: 3 }, t2_from: { l: 4 } } };
        bracket.push({ r: round, m, t1: x, t2: y, w: xWins ? x : y, l: xWins ? y : x, ...(from[m] ?? {}), ...(place ? { p: place } : {}) });
      }
    }
  }

  function move(type: 'waiver' | 'trade', w: number, rids: number[], adds: Record<string, number>, drops: Record<string, number>, settings: Record<string, number>) {
    const at = weekStart(season, w) + (++txn) * 61_000;
    const by = CAST[rids[0] - 1];
    return {
      transaction_id: `${id}-t${txn}`, type, status: 'complete', leg: w, created: at, status_updated: at,
      roster_ids: rids, consenter_ids: rids, creator: demoUserId(by.key), adds, drops,
      settings: type === 'waiver' ? settings : null, waiver_budget: [], draft_picks: [], metadata: null,
    };
  }

  // ── Everything else, in Sleeper's shapes.
  const done = input.final >= LAST_WEEK;
  const users = CAST.map(c => ({
    user_id: demoUserId(c.key), display_name: c.handle, avatar: `/demo/teams/${c.key}.svg`, is_owner: Boolean(c.owner), is_bot: false,
    league_id: id, metadata: { team_name: c.team, avatar: `/demo/teams/${c.key}.svg` },
  }));
  const rosters = CAST.map(c => {
    const rid = rosterIdOf(c), rec = record.get(rid)!;
    const last = matchups[Math.min(Math.max(1, lastPlayed), LAST_WEEK)]?.find(m => m.roster_id === rid);
    const split = (v: number) => ({ whole: Math.floor(v), dec: Math.round((v - Math.floor(v)) * 100) });
    const pf = split(rec.pf), pa = split(rec.pa);
    return {
      roster_id: rid, owner_id: demoUserId(c.key), co_owners: null, league_id: id,
      players: [...roster.get(rid)!], starters: last?.starters ?? [], reserve: [], taxi: [],
      settings: {
        wins: rec.w, losses: rec.l, ties: rec.t, fpts: pf.whole, fpts_decimal: pf.dec, fpts_against: pa.whole, fpts_against_decimal: pa.dec,
        waiver_position: 1, waiver_budget_used: 100 - budget.get(rid)!, total_moves: moves.get(rid)!, division: 0,
      },
      metadata: null,
    };
  });
  const draftId = id;
  const start = weekStart(season, 1) - 9 * 86_400_000;
  const drafts = [{
    draft_id: draftId, league_id: id, season: String(season), sport: 'nfl', season_type: 'regular', status: 'complete', type: 'snake',
    start_time: start, last_picked: start + 2 * 3_600_000, created: start - 30 * 86_400_000,
    settings: { teams: TEAMS, rounds: ROUNDS, pick_timer: 90 },
    draft_order: Object.fromEntries(order.map((c, i) => [demoUserId(c.key), i + 1])),
    slot_to_roster_id: Object.fromEntries(order.map((c, i) => [String(i + 1), rosterIdOf(c)])),
    metadata: { name: `${LEAGUE_NAME} ${season}`, scoring_type: 'ppr' },
  }];
  const pickRows = picks.map(p => {
    const info = input.directory[p.playerId] ?? { position: '' };
    return {
      draft_id: draftId, round: p.round, pick_no: p.pick, draft_slot: p.slot, roster_id: p.rosterId,
      picked_by: demoUserId(CAST[p.rosterId - 1].key), player_id: p.playerId, is_keeper: null,
      metadata: { first_name: info.first_name ?? '', last_name: info.last_name ?? (info.position === 'DEF' ? 'Defense' : ''), position: info.position, team: info.team ?? (info.position === 'DEF' ? p.playerId : '') },
    };
  });
  const league = {
    league_id: id, name: LEAGUE_NAME, season: String(season), sport: 'nfl', season_type: 'regular',
    status: done ? 'complete' : 'in_season', total_rosters: TEAMS,
    previous_league_id: season > FIRST_SEASON ? demoLeagueId(season - 1) : null, draft_id: draftId,
    avatar: null, roster_positions: ROSTER_POSITIONS, scoring_settings: SCORING,
    settings: leagueSettings(Math.min(input.final, LAST_WEEK), Math.min(Math.max(1, lastPlayed), LAST_WEEK)),
    metadata: { demo: 'true' },
  };
  return { league, users, rosters, drafts, picks: pickRows, matchups, transactions, winners_bracket: bracket, losers_bracket: [] };
}
