/**
 * The franchise economy: a pure, deterministic replay.
 *
 * Starting from the season's opening day with a head start set by the
 * franchise's history (legacy), it walks forward a day at a time to now:
 *   every day     merchandise and sponsors pay a little, upkeep is paid
 *   game days     the week's real result: a crowd comes (or does not), buys
 *                 food, parks, and goes home happier or angrier
 *   decisions     the manager's price changes and purchases, at the moment
 *                 they were made
 *
 * Fans follow the team. Interest (0 to 100) drifts toward a target set by
 * recent form, how the team scored against the league that week, the
 * stadium and the franchise's legacy; prices well above what fans think is
 * fair breed resentment, which costs interest until prices come down.
 * Interest sets the fair price and how many come, so winning earns room to
 * charge more and losing punishes greed.
 *
 * Money is dollars; VC (one per $4,000 of profit) is what upgrades are bought with.
 * Same inputs, same result, always: nothing here reads a clock or a random
 * source (crowd noise comes from a hash of the game).
 */

import { EMPTY_FACILITIES, TRACK, TRACKS, facilityStats, nextLevel, type Facilities, type FacilityStats, type TrackId } from './catalog.ts';

export interface Legacy { titles: number; finals: number; winPct: number; seasons: number }

export interface GameDay {
  key: string; season: number; week: number;
  /** When the game is final (epoch ms): the day it counts. */
  at: number;
  points: number; oppPoints: number;
  postseason: boolean;
  /** This team's scoring rank that week, 1 is best, of `teams`. */
  rank: number; teams: number;
  opponent: string;
  /** The opponent's win share this season before this game, 0 to 1. */
  oppWinPct: number;
}

export interface Prices { ticket: number; concession: number; parking: number }

export type Decision =
  | { at: number; kind: 'prices'; prices: Prices }
  | { at: number; kind: 'build'; track: TrackId };

export interface GameReport {
  key: string; season: number; week: number; at: number; postseason: boolean;
  result: 'W' | 'L' | 'T'; points: number; oppPoints: number; opponent: string;
  attendance: number; capacity: number; fill: number;
  prices: Prices; fairTicket: number;
  revenue: { tickets: number; concessions: number; parking: number; suites: number; sponsors: number };
  costs: { operations: number };
  profit: number;
  interest: number; interestChange: number;
}

export interface StoryEvent { at: number; kind: 'build' | 'sellout' | 'record' | 'unrest' | 'streak' | 'milestone' | 'prices' | 'start'; title: string; detail: string }

export interface Day { at: number; vc: number; interest: number; merch: number; sponsors: number; upkeep: number }

export interface EconomyState {
  vc: number;
  interest: number;
  /** Recent results, weighted toward the latest: 0 (all losses) to 1. */
  form: number;
  resentment: number;
  facilities: Facilities;
  prices: Prices;
  /** True while prices follow the old front office's rule (no manager has set them). */
  autopilot: boolean;
  games: GameReport[];
  days: Day[];
  story: StoryEvent[];
  /** Built cost of everything, in VC: part of the franchise's value. */
  invested: number;
}

export const DAY = 86_400_000;
export const VC_PER_DOLLAR = 1 / 4_000;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);

/** How strong a franchise's history is, about 0 to 100. */
export function legacyScore(l: Legacy): number {
  return clamp(l.titles * 12 + l.finals * 4 + l.winPct * 40 + Math.min(l.seasons, 10) * 1.5, 0, 100);
}

/** Where a franchise starts: fan interest, a stadium and VC in proportion to its history. */
export function startingState(l: Legacy): EconomyState {
  const score = legacyScore(l);
  const stadium = score >= 55 ? 2 : score >= 28 ? 1 : 0;
  // An inherited stadium comes with the lots and restrooms a stadium that size would have.
  const facilities: Facilities = { ...EMPTY_FACILITIES, stadium, parking: stadium, restrooms: stadium >= 2 ? 1 : 0 };
  const interest = clamp(32 + score * 0.45, 25, 82);
  const state: EconomyState = {
    vc: Math.round(150 + score * 10), interest, form: clamp(l.winPct, 0.2, 0.8), resentment: 0, facilities,
    prices: { ticket: 0, concession: 0, parking: 0 }, autopilot: true, games: [], days: [], story: [], invested: 0,
  };
  const { exact: _, ...fair } = fairPrices(state);
  state.prices = fair;
  return state;
}

/** What fans think is fair, given how keen they are and how good the place is. */
export function fairPrices(s: Pick<EconomyState, 'interest' | 'facilities'>): Prices & { exact: Prices } {
  const f = facilityStats(s.facilities);
  const exact = {
    ticket: 18 + s.interest * 0.55 + f.appeal * 0.35,
    concession: 6 + f.food * 2.2,
    parking: 10 + f.appeal * 0.2,
  };
  return { ticket: round5(exact.ticket), concession: Math.round(exact.concession * 2) / 2, parking: Math.round(exact.parking), exact };
}

/** A small, repeatable wobble for a game, so crowds are not perfectly predictable. */
function noise(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return 0.96 + ((h >>> 0) % 1000) / 1000 * 0.08;
}

/**
 * One game day's gate and spend, without changing anything: what the economy
 * uses, and what the manager's controls preview ("what if I charge $80?").
 */
export function projectGame(
  s: Pick<EconomyState, 'interest' | 'facilities'>,
  prices: Prices,
  game: { postseason?: boolean; oppWinPct?: number; key?: string } = {},
) {
  const f = facilityStats(s.facilities);
  const fair = fairPrices(s).exact;
  const keen = 0.55 + 0.6 * s.interest / 100;
  const priceEffect = Math.pow(fair.ticket / Math.max(1, prices.ticket), 1.6);
  const draw = (game.postseason ? 1.2 : 1) * (0.95 + 0.1 * (game.oppWinPct ?? 0.5));
  let demand = keen * priceEffect * draw * (0.88 + 0.15 * (f.comfort - 0.82) / 0.18) * (game.key ? noise(game.key) : 1);
  // Not enough parking keeps some fans home; a gouging lot keeps a few more away.
  const carsWanted = f.capacity * Math.min(1, demand) / 2.8;
  demand *= 0.8 + 0.2 * Math.min(1, f.parking / Math.max(1, carsWanted));
  if (prices.parking > fair.parking * 1.3) demand *= 0.96;
  const attendance = Math.round(f.capacity * clamp(demand, 0, 1));
  const items = Math.min(5, (1.2 + 0.45 * f.food) * Math.pow(fair.concession / Math.max(0.5, prices.concession), 1.3));
  const cars = Math.min(attendance / 2.8, f.parking);
  const revenue = {
    tickets: Math.round(attendance * prices.ticket),
    concessions: Math.round(attendance * items * prices.concession * f.comfort),
    parking: Math.round(cars * prices.parking * Math.min(1, Math.pow(fair.parking / Math.max(1, prices.parking), 0.7))),
    suites: Math.round(f.suites * (15_000 + s.interest * 150)),
    sponsors: Math.round(f.board * (20_000 + f.appeal * 800)),
  };
  const operations = Math.round(50_000 + attendance * 9);
  const total = Object.values(revenue).reduce((a, b) => a + b, 0);
  return { attendance, capacity: f.capacity, fill: attendance / f.capacity, revenue, operations, profit: total - operations, fairTicket: fair.ticket, demand };
}

/** Daily money between games: the store, sponsors on the board, and upkeep. */
function dailyMoney(s: EconomyState, f: FacilityStats) {
  const merch = Math.round((300 + 900 * f.store) * Math.pow(s.interest / 50, 1.6) * (0.8 + 0.4 * s.form));
  const sponsors = Math.round(f.board * f.appeal * 30);
  const upkeep = Math.round(f.upkeep / 7);
  return { merch, sponsors, upkeep };
}

function playGame(s: EconomyState, g: GameDay): GameReport {
  const before = s.interest;
  const p = projectGame(s, s.prices, g);
  const f = facilityStats(s.facilities);
  const result: GameReport['result'] = g.points > g.oppPoints ? 'W' : g.points < g.oppPoints ? 'L' : 'T';

  // Fans react to the result, the week, the stadium and the prices.
  s.form = s.form * 0.65 + (result === 'W' ? 1 : result === 'T' ? 0.5 : 0) * 0.35;
  const weekShare = g.teams > 1 ? 1 - (g.rank - 1) / (g.teams - 1) : 0.5;
  const target = 20 + 45 * s.form + 15 * weekShare + 0.15 * f.appeal + 4 * f.atmosphere;
  s.interest += (target - s.interest) * (0.3 - 0.04 * f.atmosphere * (target < s.interest ? 1 : 0));
  if (g.postseason && result === 'W') s.interest += 5;
  const overprice = s.prices.ticket / p.fairTicket;
  s.resentment = overprice > 1.15 ? s.resentment + (overprice - 1.15) * 8 : s.resentment * 0.7;
  s.interest -= s.resentment * 0.5;
  if (p.fill < 0.55) s.interest -= 1.5;
  s.interest = clamp(s.interest, 5, 100);

  const report: GameReport = {
    key: g.key, season: g.season, week: g.week, at: g.at, postseason: g.postseason, result,
    points: g.points, oppPoints: g.oppPoints, opponent: g.opponent,
    attendance: p.attendance, capacity: p.capacity, fill: p.fill, prices: { ...s.prices }, fairTicket: p.fairTicket,
    revenue: p.revenue, costs: { operations: p.operations }, profit: p.profit,
    interest: Math.round(s.interest * 10) / 10, interestChange: Math.round((s.interest - before) * 10) / 10,
  };
  s.vc += p.profit * VC_PER_DOLLAR;
  return report;
}

function tell(s: EconomyState, e: StoryEvent) { s.story.push(e); }

/** The whole replay. `start` is opening day (epoch ms); `now` is where it stops. */
export function simulate(o: { legacy: Legacy; games: GameDay[]; decisions: Decision[]; start: number; now: number }): EconomyState {
  const s = startingState(o.legacy);
  tell(s, { at: o.start, kind: 'start', title: 'Opening day', detail: `${facilityStats(s.facilities).stadiumName}, ${Math.round(s.interest)} fan interest, ${Math.round(s.vc)} VC in the bank.` });
  const games = [...o.games].sort((a, b) => a.at - b.at);
  const decisions = [...o.decisions].sort((a, b) => a.at - b.at);
  let gi = 0, di = 0, streak = 0, best = 0, milestone = 1_000;

  for (let day = o.start; day <= o.now; day += DAY) {
    const end = Math.min(day + DAY, o.now + 1);
    // Decisions made today, in order.
    while (di < decisions.length && decisions[di].at < end) {
      const d = decisions[di++];
      if (d.kind === 'prices') {
        s.prices = { ...d.prices }; s.autopilot = false;
        tell(s, { at: d.at, kind: 'prices', title: 'New prices', detail: `Tickets $${d.prices.ticket}, food $${d.prices.concession}, parking $${d.prices.parking}.` });
      } else {
        const next = nextLevel(s.facilities, d.track);
        if (next && 'spec' in next && s.vc >= next.spec.cost) {
          s.vc -= next.spec.cost; s.invested += next.spec.cost; s.facilities = { ...s.facilities, [d.track]: next.level };
          tell(s, { at: d.at, kind: 'build', title: `Built: ${next.spec.name}`, detail: `${TRACK[d.track].name}, ${next.spec.blurb}` });
        }
      }
    }
    // The old front office keeps prices fair until a manager sets their own.
    if (s.autopilot) { const { exact: _, ...fair } = fairPrices(s); s.prices = fair; }

    const f = facilityStats(s.facilities);
    const m = dailyMoney(s, f);
    s.vc += (m.merch + m.sponsors - m.upkeep) * VC_PER_DOLLAR;

    while (gi < games.length && games[gi].at < end) {
      const g = games[gi++];
      const r = playGame(s, g);
      s.games.push(r);
      streak = r.result === 'W' ? Math.max(1, streak + 1) : r.result === 'L' ? Math.min(-1, streak - 1) : 0;
      if (r.fill >= 0.995) tell(s, { at: g.at, kind: 'sellout', title: 'Sold out', detail: `Every one of ${r.capacity.toLocaleString('en-US')} seats, week ${g.week}.` });
      else if (r.attendance > best && s.games.length > 1) tell(s, { at: g.at, kind: 'record', title: 'Record crowd', detail: `${r.attendance.toLocaleString('en-US')} came for week ${g.week}.` });
      best = Math.max(best, r.attendance);
      if (s.resentment > 2.5 && r.interestChange < 0) tell(s, { at: g.at, kind: 'unrest', title: 'Fans are grumbling', detail: `Tickets at $${r.prices.ticket} feel steep when fair is about $${Math.round(r.fairTicket)}.` });
      if (streak === 3 || streak === 5) tell(s, { at: g.at, kind: 'streak', title: `${streak} straight wins`, detail: 'The bandwagon is filling up.' });
      if (streak === -3) tell(s, { at: g.at, kind: 'streak', title: 'Three losses running', detail: 'Empty seats are starting to show.' });
    }
    if (s.vc >= milestone) { tell(s, { at: day, kind: 'milestone', title: `${milestone.toLocaleString('en-US')} VC`, detail: 'A war chest worth spending.' }); milestone *= 5; }
    s.days.push({ at: day, vc: Math.round(s.vc), interest: Math.round(s.interest * 10) / 10, merch: m.merch, sponsors: m.sponsors, upkeep: m.upkeep });
  }
  s.vc = Math.round(s.vc);
  return s;
}

/** A franchise's worth, in dollars: what it has built, its war chest, its fans, and what it earns. */
export function franchiseValue(s: EconomyState): number {
  const recent = s.games.slice(-4);
  const earning = recent.length ? recent.reduce((a, g) => a + g.profit, 0) / recent.length : 0;
  return Math.round((s.invested + s.vc) * 4_000 + Math.max(0, earning) * 17 * 4 + s.interest * 400_000 + facilityStats(s.facilities).capacity * 1_500);
}

/** What the next purchase on each track costs, and whether the franchise can afford it. */
export function shop(s: EconomyState) {
  return TRACKS.map(t => {
    const n = nextLevel(s.facilities, t.id);
    return {
      track: t.id, name: t.name, about: t.about, level: s.facilities[t.id], max: t.levels.length,
      next: n && 'spec' in n ? { ...n.spec, level: n.level, affordable: s.vc >= n.spec.cost } : null,
      blocked: n && 'blocked' in n ? n.blocked : null,
    };
  });
}
