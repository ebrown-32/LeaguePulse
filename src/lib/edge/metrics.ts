/**
 * The Edge's research numbers, pure: the server builds the dataset (lib/edge/research), and the
 * browser, the server and the tests all read it with these.
 *
 *   A game        one player's week: league-scored points, who he played, where he finished at
 *                 his position that week, and his usage (share of snaps, targets, carries, air
 *                 yards, red-zone looks). Only weeks he played are kept.
 *   A profile     a player's season from his games: points a game, the last three, his floor and
 *                 ceiling (the 20th and 80th percentile game), how steady he is, how often he
 *                 finishes a starter at his position, and which way his usage is going.
 *   Replacement   the points a game of the best player at a position a league this size leaves
 *                 on the bench or the wire. Value over it (VOR) compares across positions.
 *   A matchup     what a defense has given up to a position, a game, in this league's scoring:
 *                 ranked 1 (gives up the most) to 32.
 *   A lineup      the best lineup a roster can field for the league's slots, by any number a
 *                 player carries (a projection, his average).
 *
 * Everything is computed from real, final stat lines; nothing here invents a number.
 */

export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
export const POSITIONS: Pos[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

export interface Game {
  w: number;
  /** The NFL team he played for that week, and against. */
  tm: string; opp: string;
  pts: number;
  /** His finish at his position that week (1 is the top scorer). */
  rk: number;
  /** Share of his team's offensive snaps, 0 to 1. */
  snp?: number;
  tgt?: number; tgtSh?: number; rec?: number; recYd?: number;
  air?: number; airSh?: number;
  car?: number; carSh?: number; rushYd?: number;
  /** Red-zone targets and carries (and pass attempts, for a quarterback). */
  rz?: number;
  td?: number;
  passAtt?: number; passYd?: number; passTd?: number; int?: number;
}

/** The field's view of a player (lib/market), where the site has it. */
export interface Market {
  /** Latest week: share of sampled leagues rostering and starting him. */
  rostered: number; started: number;
  /** Share of leagues that added and dropped him that week. */
  adds: number; drops: number;
  /** Winning waiver bids, as a share of budget: the median and the 75th percentile. */
  bid50: number | null; bid75: number | null;
  /** Trades he was acquired in, over the last three weeks, per 100 leagues. */
  traded: number;
  /** Rostered and started share by week, oldest first, for the trend. */
  trend: { w: number; r: number; s: number }[];
}

export interface Player {
  id: string; name: string; pos: Pos; team: string;
  /** Injury status as Sleeper reports it ("Questionable", "Out", "IR"), when there is one. */
  inj?: string;
  exp?: number;
  /** The roster he's on in this league (null: a free agent), and whether he's in its lineup. */
  owner: number | null;
  starting?: boolean;
  games: Game[];
  /** This week's projection in the league's scoring, when Sleeper has one. */
  proj: number | null;
  mkt?: Market;
}

export interface TeamInfo { rosterId: number; userId: string; name: string; avatar: string; wins: number; losses: number; ties: number; pf: number }
/** A defense against a position: points a game allowed, and its rank (1 gives up the most). */
export interface Allowed { ppg: number; rank: number; games: number }
export interface Research {
  season: string;
  /**
   * The last final week, and the week being set: the next one, or the one after once most of
   * its games have kicked off (a week that's nearly played has no lineup left to set).
   */
  through: number; week: number;
  /** NFL teams whose game in the week being set has kicked off: their players are locked. */
  locked: string[];
  scoring: string;
  /** The league's lineup slots, bench and IR left out. */
  slots: string[];
  teams: TeamInfo[];
  /** Who plays whom in the league in the week being set, by roster id. */
  fixtures: [number, number][];
  players: Player[];
  /** dvp[defense][position]. */
  dvp: Record<string, Partial<Record<Pos, Allowed>>>;
  /** Each NFL team's opponents from the week being set on: "@DAL", "DAL", or "BYE". */
  schedule: Record<string, { w: number; opp: string | null; home: boolean }[]>;
  calendar: WeekCalendar;
  /** The field these market numbers come from, when the site has a market. */
  field: { label: string; leagues: number; week: number } | null;
}

/**
 * The week's dates, as the league and the NFL have them. Only what's known: a league whose
 * provider doesn't say when waivers run has no waiver days here, not a guess.
 */
export interface WeekCalendar {
  /** The week's NFL games: kickoff (ISO) and both teams. */
  games: { at: string; home: string; away: string }[];
  /** NFL teams with no game this week. */
  byes: string[];
  /** Weekdays waivers run (0 is Sunday); every day for a league with daily waivers. Empty: not known. */
  waiverDays: number[];
  /** Whether waivers are won with a budget (FAAB), and its size. */
  faab: number | null;
  /** When trading closes: the moment, or the week it closes after. Null: no deadline, or not known. */
  tradeDeadline: { at?: string; afterWeek?: number } | null;
  /** The first week of the playoffs, and the last of the regular season. */
  playoffStart: number | null;
}

// ── A player's profile ───────────────────────────────────────────────────────

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/** A starter's finish at each position, and a bust's: a top-12 quarterback, a top-24 back. */
export const STARTER_RANK: Record<Pos, number> = { QB: 12, RB: 24, WR: 24, TE: 12, K: 12, DEF: 12 };
export const BUST_RANK: Record<Pos, number> = { QB: 20, RB: 40, WR: 48, TE: 20, K: 20, DEF: 20 };

export interface Profile {
  gp: number; total: number;
  ppg: number; last3: number;
  /** last3 minus ppg: which way he's going. */
  trend: number;
  floor: number; ceiling: number; sd: number;
  best: number;
  /** Weeks he finished a starter at his position, and weeks he busted. */
  starterWeeks: number; bustWeeks: number;
  /** Season averages of his usage, and the last three games'. */
  snp: number | null; snp3: number | null;
  tgtSh: number | null; tgtSh3: number | null;
  carSh: number | null; carSh3: number | null;
  airSh: number | null;
  rz: number; rz3: number;
  /** Targets plus carries a game: his opportunities. */
  opp: number; opp3: number;
}

const avgOf = (gs: Game[], k: keyof Game): number | null => {
  const xs = gs.map(g => g[k]).filter((x): x is number => typeof x === 'number');
  return xs.length ? mean(xs) : null;
};

export function profile(p: Pick<Player, 'pos' | 'games'>): Profile {
  const gs = p.games, pts = gs.map(g => g.pts), l3 = gs.slice(-3);
  const ppg = mean(pts), last3 = mean(l3.map(g => g.pts));
  const sd = pts.length > 1 ? Math.sqrt(mean(pts.map(x => (x - ppg) ** 2))) : 0;
  const opps = (g: Game) => (g.tgt ?? 0) + (g.car ?? 0);
  return {
    gp: gs.length, total: pts.reduce((a, b) => a + b, 0), ppg, last3, trend: gs.length >= 4 ? last3 - ppg : 0,
    floor: quantile(pts, 0.2), ceiling: quantile(pts, 0.8), sd, best: pts.length ? Math.max(...pts) : 0,
    starterWeeks: gs.filter(g => g.rk <= STARTER_RANK[p.pos]).length,
    bustWeeks: gs.filter(g => g.rk > BUST_RANK[p.pos]).length,
    snp: avgOf(gs, 'snp'), snp3: avgOf(l3, 'snp'),
    tgtSh: avgOf(gs, 'tgtSh'), tgtSh3: avgOf(l3, 'tgtSh'),
    carSh: avgOf(gs, 'carSh'), carSh3: avgOf(l3, 'carSh'),
    airSh: avgOf(gs, 'airSh'),
    rz: mean(gs.map(g => g.rz ?? 0)), rz3: mean(l3.map(g => g.rz ?? 0)),
    opp: mean(gs.map(opps)), opp3: mean(l3.map(opps)),
  };
}

// ── Replacement level ────────────────────────────────────────────────────────

const FLEX: Record<string, Pos[]> = {
  FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'], WRRB_FLEX: ['RB', 'WR'],
};
export const eligible = (slot: string): Pos[] => FLEX[slot] ?? (POSITIONS.includes(slot as Pos) ? [slot as Pos] : []);

/**
 * How many players at each position a league starts, flex slots shared out the way leagues use
 * them (a flex is a back or a receiver far more often than a tight end; a superflex is a
 * quarterback).
 */
export function startersPerTeam(slots: string[]): Record<Pos, number> {
  const n: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const s of slots) {
    if (s === 'FLEX') { n.RB += 0.45; n.WR += 0.45; n.TE += 0.1; }
    else if (s === 'SUPER_FLEX') n.QB += 1;
    else if (s === 'REC_FLEX') { n.WR += 0.8; n.TE += 0.2; }
    else if (s === 'WRRB_FLEX') { n.RB += 0.5; n.WR += 0.5; }
    else if (POSITIONS.includes(s as Pos)) n[s as Pos] += 1;
  }
  return n;
}

/**
 * Replacement level at each position: the points a game of the first player past the league's
 * starters there (teams times starters), among players with at least `minGames`.
 */
export function replacement(players: Player[], teams: number, slots: string[], minGames = 3): Record<Pos, number> {
  const per = startersPerTeam(slots);
  const out = {} as Record<Pos, number>;
  for (const pos of POSITIONS) {
    const ppg = players.filter(p => p.pos === pos && p.games.length >= minGames).map(p => mean(p.games.map(g => g.pts))).sort((a, b) => b - a);
    const n = Math.round(teams * per[pos]);
    out[pos] = ppg.length ? ppg[Math.min(n, ppg.length - 1)] : 0;
  }
  return out;
}

// ── Matchups ─────────────────────────────────────────────────────────────────

/** A matchup as a grade: A (a soft defense) to F, from the defense's rank against the position. */
export function grade(rank: number | undefined, of = 32): { letter: 'A' | 'B' | 'C' | 'D' | 'F'; tone: 'good' | 'ok' | 'mid' | 'poor' | 'bad' } | null {
  if (!rank) return null;
  const k = (rank - 1) / Math.max(1, of - 1);
  if (k < 0.2) return { letter: 'A', tone: 'good' };
  if (k < 0.4) return { letter: 'B', tone: 'ok' };
  if (k < 0.6) return { letter: 'C', tone: 'mid' };
  if (k < 0.8) return { letter: 'D', tone: 'poor' };
  return { letter: 'F', tone: 'bad' };
}

export const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/** A player's next opponent and how soft it is for his position. */
export function nextMatchup(r: Pick<Research, 'schedule' | 'dvp' | 'week'>, p: Pick<Player, 'team' | 'pos'>, week = r.week) {
  const g = r.schedule[p.team]?.find(x => x.w === week);
  if (!g) return null;
  if (!g.opp) return { bye: true as const, opp: null, home: false, allowed: null };
  return { bye: false as const, opp: g.opp, home: g.home, allowed: r.dvp[g.opp]?.[p.pos] ?? null };
}

// ── Lineups ──────────────────────────────────────────────────────────────────

export interface Slotted<T> { slot: string; player: T | null }

/**
 * The best lineup for the league's slots: the fixed positions first, each with the best player
 * left at it, then the flexes with the best left that fits. `value` is whatever is being
 * maximised; a player without one sits.
 */
export function bestLineup<T extends { id: string; pos: Pos }>(roster: T[], slots: string[], value: (p: T) => number | null): Slotted<T>[] {
  const pool = roster.map(p => ({ p, v: value(p) })).filter((x): x is { p: T; v: number } => x.v !== null).sort((a, b) => b.v - a.v);
  const used = new Set<string>();
  const out: Slotted<T>[] = slots.map(slot => ({ slot, player: null }));
  // Narrowest slots first, so a flex never takes the only tight end.
  const order = out.map((s, i) => ({ i, n: eligible(s.slot).length })).filter(x => x.n > 0).sort((a, b) => a.n - b.n);
  for (const { i } of order) {
    const fits = eligible(out[i].slot);
    const pick = pool.find(x => !used.has(x.p.id) && fits.includes(x.p.pos));
    if (pick) { used.add(pick.p.id); out[i].player = pick.p; }
  }
  return out;
}

/** Statuses that mean he isn't playing: never a start. */
const SIDELINED = new Set(['Out', 'IR', 'PUP', 'Sus', 'Doubtful', 'NA', 'DNR', 'COV']);
export const sidelined = (p: Pick<Player, 'inj'>) => SIDELINED.has(p.inj ?? '');

/** What to set a lineup by: what he's expected to score, and nothing if he's sidelined or on a bye. */
export function startValue(r: Pick<Research, 'schedule' | 'dvp' | 'week'>, p: Player): number | null {
  if (sidelined(p) || nextMatchup(r, p)?.bye) return null;
  return expected(p);
}

/**
 * The best lineup a roster can still field this week. A starter whose game has kicked off stays
 * where he is, and a bench player whose game has kicked off can't come in; the open slots go to
 * the best of who's left, by `startValue`.
 */
export function lineupForWeek(r: Pick<Research, 'schedule' | 'dvp' | 'week' | 'slots' | 'locked'>, roster: Player[]): Slotted<Player>[] {
  const isLocked = (p: Player) => r.locked.includes(p.team);
  const out: Slotted<Player>[] = r.slots.map(slot => ({ slot, player: null }));
  // Locked starters first, each into the narrowest open slot that takes him.
  for (const p of roster.filter(x => x.starting && isLocked(x))) {
    const open = out.map((s, i) => ({ i, fits: eligible(s.slot) })).filter(x => !out[x.i].player && x.fits.includes(p.pos)).sort((a, b) => a.fits.length - b.fits.length)[0];
    if (open) out[open.i].player = p;
  }
  const openSlots = out.map((s, i) => ({ s, i })).filter(x => !x.s.player);
  const rest = bestLineup(roster.filter(p => !isLocked(p)), openSlots.map(x => x.s.slot), p => startValue(r, p));
  openSlots.forEach((x, k) => { out[x.i].player = rest[k].player; });
  return out;
}

/** What a player is expected to score this week: his projection, else his recent form. */
export function expected(p: Player): number | null {
  if (p.proj !== null) return p.proj;
  if (!p.games.length) return null;
  const pr = profile(p);
  return pr.gp >= 3 ? (pr.last3 + pr.ppg) / 2 : pr.ppg;
}

// ── Teams ────────────────────────────────────────────────────────────────────

export interface TeamStrength {
  rosterId: number;
  /** Points a game from the best lineup of season averages, by position group, and in all. */
  byPos: Record<Pos, number>;
  lineup: number;
  /** The same for the bench's best few: depth. */
  bench: number;
  /** Value over replacement of the best lineup. */
  vor: number;
  /** This week: the best lineup by projection. */
  projected: number;
  /** The lineup's average matchup rank this week (lower is softer), over players with a game. */
  matchup: number | null;
}

export function teamStrength(r: Research, rosterId: number, repl: Record<Pos, number>): TeamStrength {
  const roster = r.players.filter(p => p.owner === rosterId);
  const ppg = (p: Player) => (p.games.length ? mean(p.games.map(g => g.pts)) : null);
  const best = bestLineup(roster, r.slots, ppg);
  const byPos: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  let lineup = 0, vor = 0;
  const inLineup = new Set<string>();
  for (const s of best) {
    if (!s.player) continue;
    const v = ppg(s.player) ?? 0;
    byPos[s.player.pos] += v; lineup += v; vor += v - repl[s.player.pos];
    inLineup.add(s.player.id);
  }
  const bench = roster.filter(p => !inLineup.has(p.id) && p.pos !== 'K' && p.pos !== 'DEF').map(p => ppg(p) ?? 0).sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0);
  const now = lineupForWeek(r, roster);
  const ranks = now.map(s => (s.player ? nextMatchup(r, s.player)?.allowed?.rank : undefined)).filter((x): x is number => typeof x === 'number');
  return {
    rosterId, byPos, lineup, bench, vor,
    projected: now.reduce((a, s) => a + (s.player ? expected(s.player) ?? 0 : 0), 0),
    matchup: ranks.length ? mean(ranks) : null,
  };
}

/** Each value's rank among the list, 1 the highest. */
export function rankOf(values: number[], v: number): number {
  return values.filter(x => x > v).length + 1;
}
