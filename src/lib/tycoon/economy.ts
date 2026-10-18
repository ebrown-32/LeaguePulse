/**
 * The franchise economy: a pure, deterministic replay.
 *
 * Every franchise starts the same (a small field, middling fans, a little
 * VC) on opening day of its first season in the league, and walks forward a
 * day at a time to now, through every archived season:
 *   every day     merchandise and sponsors pay a little, upkeep is paid
 *   game days     the week's real result: a crowd comes (or does not), buys
 *                 food, parks, and goes home happier or angrier
 *   decisions     the manager's price changes and purchases, at the moment
 *                 they were made
 *
 * Until a manager takes over, the old front office runs it: fair prices, and
 * each offseason a share of the season's earnings put back into the place
 * (more after a winning season), the owner taking the rest. A manager's
 * first decision of either kind ends that for good.
 *
 * Fans follow the team. Interest (0 to 100) drifts toward a target set by
 * recent form, how the team scored against the league that week and the
 * stadium; prices well above what fans think is
 * fair breed resentment, which costs interest until prices come down.
 * Interest sets the fair price and how many come, so winning earns room to
 * charge more and losing punishes greed.
 *
 * Money is dollars; VC (one per $4,000 of profit) is what upgrades are bought with.
 * Same inputs, same result, always: nothing here reads a clock or a random
 * source (crowd noise comes from a hash of the game).
 */

import { EMPTY_FACILITIES, TRACK, TRACKS, facilityStats, nextLevel, type Facilities, type FacilityStats, type TrackId } from './catalog.ts';

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
  /**
   * Whether this franchise hosted (lib/franchise/venue). Only the host opens
   * its gates and draws a crowd. On the road a franchise earns its share of
   * the gate and the league's TV money (ROAD_SHARE of what a home date would
   * have made it) and pays no game-day staff; the result moves its fans the
   * same either way. Left out, a game is a home game.
   */
  home?: boolean;
  /**
   * The league's Game of the Week (lib/gameOfWeek): the whole league is watching, so the host's
   * stadium all but sells out (BIG_GAME) and both sides earn more from the gate.
   */
  big?: boolean;
}

export interface Prices { ticket: number; concession: number; parking: number }

export type Decision =
  | { at: number; kind: 'prices'; prices: Prices }
  | { at: number; kind: 'build'; track: TrackId }
  /** A promotion night run before a home game (PROMOS): 0 to PROMO_MAX for how well it went. */
  | { at: number; kind: 'promo'; promo: PromoId; score: number };

/**
 * Promotion nights: once a week, a manager can run one promotion at their next
 * home game, through the promo minigame on the manage page. Each trades something for fan interest:
 * Dollar Beer Night costs that game's food money (beer for a dollar), the others cost VC up front.
 * How well it's run (0 to PROMO_MAX) scales what the fans get from it.
 */
export type PromoId = 'beer' | 'fireworks' | 'bobblehead';
export const PROMO_MAX = 6;
export const PROMOS: Record<PromoId, { name: string; cost: number; interest: number; concession?: number; blurb: string }> = {
  beer: { name: 'Dollar Beer Night', cost: 0, interest: 1.0, concession: 1, blurb: 'Food at a dollar for the night: the fans love it, the concession stands earn less.' },
  fireworks: { name: 'Fireworks Night', cost: 60, interest: 0.8, blurb: 'A show after the final whistle, paid for up front.' },
  bobblehead: { name: 'Bobblehead Giveaway', cost: 25, interest: 0.5, blurb: 'A bobblehead for the first 10,000 through the gates. Cheap and cheerful.' },
};
export const isPromo = (v: unknown): v is PromoId => typeof v === 'string' && v in PROMOS;

/** One promotion a week; one booked is kept for a home game within PROMO_KEEP. */
export const PROMO_COOLDOWN = 6 * 86_400_000;
export const PROMO_KEEP = 10 * 86_400_000;

export interface GameReport {
  key: string; season: number; week: number; at: number; postseason: boolean;
  /** Hosted, or on the road (no crowd, no gate). */
  home: boolean;
  result: 'W' | 'L' | 'T'; points: number; oppPoints: number; opponent: string;
  attendance: number; capacity: number; fill: number;
  prices: Prices; fairTicket: number;
  /**
   * `premium`: at home, what a franchise's one home date in two weeks adds (premium pricing, every
   * suite and sponsor); `road`: on the road, its share of the gate and the league's TV money.
   */
  revenue: { tickets: number; concessions: number; parking: number; suites: number; sponsors: number; premium: number; road: number };
  costs: { operations: number };
  profit: number;
  interest: number; interestChange: number;
  /** The promotion run at this game, if any, and how well. */
  promo?: { id: PromoId; score: number };
}

export interface StoryEvent { at: number; kind: 'build' | 'sellout' | 'record' | 'unrest' | 'streak' | 'milestone' | 'prices' | 'start' | 'title' | 'covered' | 'promo'; title: string; detail: string }

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
  /** True once a manager has made any decision: the old front office stops building. */
  managed: boolean;
  games: GameReport[];
  days: Day[];
  story: StoryEvent[];
  /** Built cost of everything, in VC: part of the franchise's value. */
  invested: number;
  /** Championships won: banners, a lasting draw for fans and merchandise, and value. */
  titles: number;
  /**
   * VC the owner has put in to cover bills the bank couldn't: the bank never goes below zero.
   * Not part of the franchise's value (it was never earned).
   */
  covered: number;
  /** Whether the bank is empty right now, with the owner covering the bills. */
  broke: boolean;
  /** A promotion waiting for the next home game, and when the last was run (see PROMOS). */
  promo: { id: PromoId; score: number; at: number } | null;
  lastPromoAt: number;
}

export const DAY = 86_400_000;
export const VC_PER_DOLLAR = 1 / 4_000;

/**
 * Money as players see it: one currency, dollars. The economy keeps its books in its own unit (one
 * per $4,000 of profit, so prices in the catalog stay small numbers); everything shown converts
 * at that rate, so a game's profit lands in the bank as the same dollars it made.
 */
export const toDollars = (units: number) => units / VC_PER_DOLLAR;
export function cash(units: number): string {
  const d = toDollars(units), a = Math.abs(d), sign = d < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3).toLocaleString('en-US')}k`;
  return `${sign}$${Math.round(a)}`;
}
/** What a championship adds to a franchise's value, for good: the banner. */
export const TITLE_VALUE = 30_000_000;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Money in or out of the bank, which never goes below zero: what it can't cover, the owner does
 * (a build honored from before the economy was rebalanced, upkeep through a long offseason, a
 * game in an empty stadium). Told once each time the bank runs dry.
 */
function move(s: EconomyState, vc: number, at: number): void {
  s.vc += vc;
  if (s.vc >= 0) { if (s.broke && s.vc >= 25) s.broke = false; return; }
  s.covered += -s.vc;
  s.vc = 0;
  if (!s.broke) {
    s.broke = true;
    s.story.push({ at, kind: 'covered', title: 'The owner covered the bills', detail: 'The bank ran dry, so the owner paid the rest. Every game from here refills it.' });
  }
}
const round5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);

/** Where every franchise starts, on opening day of its first season. */
export function startingState(): EconomyState {
  const state: EconomyState = {
    vc: 150, interest: 40, form: 0.5, resentment: 0, facilities: { ...EMPTY_FACILITIES },
    prices: { ticket: 0, concession: 0, parking: 0 }, autopilot: true, managed: false, games: [], days: [], story: [], invested: 0, titles: 0,
    covered: 0, broke: false, promo: null, lastPromoAt: 0,
  };
  const { exact: _, ...fair } = fairPrices(state);
  state.prices = fair;
  return state;
}

/** Upgrades that add room for fans: the old front office only builds them when fans fill what is there. */
const ROOM: ReadonlySet<TrackId> = new Set(['stadium', 'seating', 'parking']);
/** What the old front office keeps in the bank each offseason; the owner takes the rest. */
export const FRONT_OFFICE_RESERVE = 2_000;

/**
 * The old front office's offseason, before a manager takes over: it puts a
 * share of what the season earned back into the place (more after a winning
 * season), cheapest upgrades first, and more room for fans only when recent
 * crowds filled nine seats in ten. The owner takes the rest, down to a
 * working reserve, so years of unspent profit do not pile up as value.
 */
function frontOfficeOffseason(s: EconomyState, at: number, earned: number, winning: boolean) {
  let budget = Math.max(0, earned) * (winning ? 0.6 : 0.3);
  const recent = s.games.filter(g => g.home).slice(-7);
  const full = recent.length >= 4 && recent.reduce((a, g) => a + g.fill, 0) / recent.length >= 0.9;
  for (;;) {
    const pick = TRACKS.filter(t => full || !ROOM.has(t.id))
      .map(t => ({ track: t.id, n: nextLevel(s.facilities, t.id) }))
      .flatMap(o => (o.n && 'spec' in o.n ? [{ track: o.track, level: o.n.level, spec: o.n.spec }] : []))
      .sort((a, b) => a.spec.cost - b.spec.cost)[0];
    if (!pick || pick.spec.cost > budget || pick.spec.cost > s.vc) break;
    budget -= pick.spec.cost; s.vc -= pick.spec.cost; s.invested += pick.spec.cost;
    s.facilities = { ...s.facilities, [pick.track]: pick.level };
    tell(s, { at, kind: 'build', title: `Built: ${pick.spec.name}`, detail: `${TRACK[pick.track].name}, by the old front office.` });
  }
  if (s.vc > FRONT_OFFICE_RESERVE) s.vc = FRONT_OFFICE_RESERVE;
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
  game: { postseason?: boolean; oppWinPct?: number; key?: string; big?: boolean } = {},
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
  if (game.big) demand = Math.max(demand * BIG_GAME.draw, BIG_GAME.floor * Math.min(1, priceEffect));
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
  // Champions sell more: each title adds 15% to merchandise, up to five.
  const merch = Math.round((300 + 900 * f.store) * Math.pow(s.interest / 50, 1.6) * (0.8 + 0.4 * s.form) * (1 + 0.15 * Math.min(s.titles, 5)));
  const sponsors = Math.round(f.board * f.appeal * 30);
  const upkeep = Math.round(f.upkeep / 7);
  return { merch, sponsors, upkeep };
}

/**
 * Home and road, balanced. Only half the league's stadiums open each week, so a home date earns
 * its gate plus HOME_PREMIUM of it (the franchise's one home date in two weeks: premium pricing,
 * every suite and sponsor) and a road week earns ROAD_SHARE of what that gate would have been (the
 * visitors' cut and the league's TV money). Over a season that is the money every franchise always
 * made; within it, a home date is worth three road weeks.
 */
export const HOME_PREMIUM = 0.5;

/**
 * A Game of the Week: demand up by a quarter, and at least nineteen seats in twenty sold unless
 * tickets are priced above fair (gouging still empties seats, spotlight or not); and the gate is
 * worth a third more, at home and on the road.
 */
export const BIG_GAME = { draw: 1.25, floor: 0.95, bonus: 0.35 };
export const ROAD_SHARE = 0.5;

/** When home games started driving the money (17 October 2026): builds before it are honored as made. */
export const REBALANCED_AT = Date.UTC(2026, 9, 17);

function playGame(s: EconomyState, g: GameDay): GameReport {
  const home = g.home !== false;
  // A promotion waiting for a home game: the fans' reward, and Dollar Beer Night's dollar food.
  if (s.promo && g.at - s.promo.at > PROMO_KEEP) s.promo = null;
  const promo = home && s.promo ? { id: s.promo.id, score: s.promo.score } : null;
  if (promo) { s.interest = clamp(s.interest + promo.score * PROMOS[promo.id].interest, 5, 100); s.promo = null; }
  const tonight = promo && PROMOS[promo.id].concession !== undefined ? { ...s.prices, concession: PROMOS[promo.id].concession! } : s.prices;
  const before = s.interest;
  const projected = projectGame(s, tonight, g);
  // On the road the other team's stadium fills; this one stays dark, and its share comes in.
  const gate = Math.max(0, projected.profit);
  const bonus = g.big ? BIG_GAME.bonus : 0;
  const premium = home ? Math.round(gate * (HOME_PREMIUM + bonus)) : 0, road = home ? 0 : Math.round(gate * ROAD_SHARE * (1 + bonus));
  const p = home
    ? { ...projected, profit: projected.profit + premium, revenue: { ...projected.revenue, premium, road: 0 } }
    : { ...projected, attendance: 0, fill: 0, operations: 0, profit: road, revenue: { tickets: 0, concessions: 0, parking: 0, suites: 0, sponsors: 0, premium: 0, road } };
  const f = facilityStats(s.facilities);
  const result: GameReport['result'] = g.points > g.oppPoints ? 'W' : g.points < g.oppPoints ? 'L' : 'T';

  // Fans react to the result, the week, the stadium and the prices.
  s.form = s.form * 0.65 + (result === 'W' ? 1 : result === 'T' ? 0.5 : 0) * 0.35;
  const weekShare = g.teams > 1 ? 1 - (g.rank - 1) / (g.teams - 1) : 0.5;
  const target = 20 + 45 * s.form + 15 * weekShare + 0.08 * f.appeal + 2 * f.atmosphere;
  s.interest += (target - s.interest) * (0.3 - 0.04 * f.atmosphere * (target < s.interest ? 1 : 0));
  if (g.postseason && result === 'W') s.interest += 5;
  const overprice = s.prices.ticket / p.fairTicket;
  s.resentment = overprice > 1.15 ? s.resentment + (overprice - 1.15) * 8 : s.resentment * 0.7;
  s.interest -= s.resentment * 0.5;
  if (home && p.fill < 0.55) s.interest -= 1.5;
  s.interest = clamp(s.interest, 5, 100);

  const report: GameReport = {
    key: g.key, season: g.season, week: g.week, at: g.at, postseason: g.postseason, home, result,
    points: g.points, oppPoints: g.oppPoints, opponent: g.opponent,
    attendance: p.attendance, capacity: p.capacity, fill: p.fill, prices: { ...s.prices }, fairTicket: p.fairTicket,
    revenue: p.revenue, costs: { operations: p.operations }, profit: p.profit,
    interest: Math.round(s.interest * 10) / 10, interestChange: Math.round((s.interest - before) * 10) / 10,
    ...(promo ? { promo } : {}),
  };
  move(s, p.profit * VC_PER_DOLLAR, g.at);
  return report;
}

function tell(s: EconomyState, e: StoryEvent) { s.story.push(e); }

/**
 * The whole replay. `start` is opening day of the franchise's first season
 * (epoch ms); `now` is where it stops: today, or the end of a former
 * franchise's last season.
 */
export function simulate(o: {
  games: GameDay[]; decisions: Decision[]; start: number; now: number; titles?: number[];
  /**
   * Builds made before this moment happen as they were made, even if the bank can't cover them
   * in today's economy (it was rebalanced under them; see REBALANCED_AT): the owner covers the
   * difference. Builds after it must be affordable, as always: nothing is bought on credit.
   */
  grandfatherBefore?: number;
  /**
   * A bankroll from the owner, in VC, put in the bank on a day (the demo league's, each season:
   * see lib/demo/site). After the old front office's off-season, which keeps only a reserve.
   */
  grant?: { at: number; vc: number };
}): EconomyState {
  const s = startingState();
  let granted = !o.grant;
  const games = [...o.games].sort((a, b) => a.at - b.at);
  // A title is won with the season's last game.
  const won = new Set(o.titles ?? []);
  const seasonEnd = new Map<number, number>();
  for (const g of games) seasonEnd.set(g.season, Math.max(seasonEnd.get(g.season) ?? 0, g.at));
  const decisions = [...o.decisions].sort((a, b) => a.at - b.at);
  let gi = 0, di = 0, streak = 0, best = 0, milestone = 1_000, season = 0, seasonStartVc = s.vc;
  const waiting: Decision[] = [];

  for (let day = o.start; day <= o.now; day += DAY) {
    const end = Math.min(day + DAY, o.now + 1);
    if (!granted && o.grant && o.grant.at < end) {
      granted = true;
      move(s, o.grant.vc, o.grant.at);
      tell(s, { at: o.grant.at, kind: 'start', title: 'Deep pockets', detail: `The owner opened the books with ${cash(o.grant.vc)} to build something special.` });
    }
    // Decisions made today, in order.
    while (di < decisions.length && decisions[di].at < end) {
      const d = decisions[di++];
      // Anything else in the log (a retired feature's entries) changes nothing.
      if (d.kind !== 'prices' && d.kind !== 'build' && d.kind !== 'promo') continue;
      // Setting prices or building takes the franchise over from the old front office; a promotion doesn't.
      if (d.kind !== 'promo') s.managed = true;
      if (d.kind === 'prices') {
        s.prices = { ...d.prices }; s.autopilot = false;
        tell(s, { at: d.at, kind: 'prices', title: 'New prices', detail: `Tickets $${d.prices.ticket}, food $${d.prices.concession}, parking $${d.prices.parking}.` });
      } else if (d.kind === 'promo') {
        // Once a week too, and only one the bank can pay for.
        if (d.at - s.lastPromoAt < PROMO_COOLDOWN || !isPromo(d.promo) || s.vc < PROMOS[d.promo].cost) continue;
        const p = PROMOS[d.promo], score = clamp(Math.round(d.score), 0, PROMO_MAX);
        s.lastPromoAt = d.at;
        if (p.cost) move(s, -p.cost, d.at);
        s.promo = { id: d.promo, score, at: d.at };
        tell(s, { at: d.at, kind: 'promo', title: `${p.name} is on`, detail: `${score} of ${PROMO_MAX} for the setup${p.cost ? `, ${cash(p.cost)} spent` : ''}. It runs at the next home game.` });
      } else waiting.push(d);
    }
    // Builds, in order. One from before the economy was rebalanced is a fact: it happens as it was
    // made, and what the bank can't cover the owner does. After that, a build needs the money.
    for (const d of waiting.splice(0)) {
      if (d.kind !== 'build') continue;
      const next = nextLevel(s.facilities, d.track);
      if (!next || !('spec' in next)) continue;
      if (s.vc < next.spec.cost && !(o.grandfatherBefore && d.at < o.grandfatherBefore)) continue;
      move(s, -next.spec.cost, d.at); s.invested += next.spec.cost; s.facilities = { ...s.facilities, [d.track]: next.level };
      tell(s, { at: d.at, kind: 'build', title: `Built: ${next.spec.name}`, detail: `${TRACK[d.track].name}, ${next.spec.blurb}` });
    }
    // The old front office keeps prices fair until a manager sets their own.
    if (s.autopilot) { const { exact: _, ...fair } = fairPrices(s); s.prices = fair; }

    const f = facilityStats(s.facilities);
    const m = dailyMoney(s, f);
    move(s, (m.merch + m.sponsors - m.upkeep) * VC_PER_DOLLAR, day);

    while (gi < games.length && games[gi].at < end) {
      const g = games[gi++];
      if (g.season !== season) {
        if (season && !s.managed) {
          const last = s.games.filter(x => x.season === season);
          const wins = last.filter(x => x.result === 'W').length + last.filter(x => x.result === 'T').length / 2;
          frontOfficeOffseason(s, g.at, s.vc - seasonStartVc, last.length > 0 && wins / last.length >= 0.5);
        }
        season = g.season;
        seasonStartVc = s.vc;
        tell(s, { at: g.at, kind: 'start', title: `The ${season} season`, detail: `${facilityStats(s.facilities).stadiumName}, ${Math.round(s.interest)} fan interest, ${cash(s.vc)} in the bank.` });
      }
      const r = playGame(s, g);
      s.games.push(r);
      if (won.has(g.season) && g.at === seasonEnd.get(g.season)) {
        s.titles += 1;
        s.interest = clamp(s.interest + 12, 5, 100);
        tell(s, { at: g.at, kind: 'title', title: `Champions, ${g.season}`, detail: s.titles === 1 ? 'The first banner goes up. The whole town is wearing the colors.' : `Banner number ${s.titles}. A dynasty sells itself.` });
      }
      streak = r.result === 'W' ? Math.max(1, streak + 1) : r.result === 'L' ? Math.min(-1, streak - 1) : 0;
      if (!r.home) { /* the crowd was the other team's */ }
      else if (r.fill >= 0.995) tell(s, { at: g.at, kind: 'sellout', title: 'Sold out', detail: `Every one of ${r.capacity.toLocaleString('en-US')} seats, week ${g.week}.` });
      else if (r.attendance > best && s.games.length > 1) tell(s, { at: g.at, kind: 'record', title: 'Record crowd', detail: `${r.attendance.toLocaleString('en-US')} came for week ${g.week}.` });
      if (r.home) best = Math.max(best, r.attendance);
      if (s.resentment > 2.5 && r.interestChange < 0) tell(s, { at: g.at, kind: 'unrest', title: 'Fans are grumbling', detail: `Tickets at $${r.prices.ticket} feel steep when fair is about $${Math.round(r.fairTicket)}.` });
      if (streak === 3 || streak === 5) tell(s, { at: g.at, kind: 'streak', title: `${streak} straight wins`, detail: 'The bandwagon is filling up.' });
      if (streak === -3) tell(s, { at: g.at, kind: 'streak', title: 'Three losses running', detail: 'Empty seats are starting to show.' });
    }
    if (s.vc >= milestone) { tell(s, { at: day, kind: 'milestone', title: `${cash(milestone)} in the bank`, detail: 'A war chest worth spending.' }); milestone *= 5; }
    s.days.push({ at: day, vc: Math.round(s.vc), interest: Math.round(s.interest * 10) / 10, merch: m.merch, sponsors: m.sponsors, upkeep: m.upkeep });
  }
  s.vc = Math.round(s.vc);
  return s;
}

/** A franchise's worth, in dollars: what it has built, its war chest, its fans, what it earns, and its titles. */
export function franchiseValue(s: EconomyState): number {
  const recent = s.games.slice(-4);
  const earning = recent.length ? recent.reduce((a, g) => a + g.profit, 0) / recent.length : 0;
  return Math.round((s.invested + s.vc) * 4_000 + Math.max(0, earning) * 17 * 4 + s.interest * 400_000 + facilityStats(s.facilities).capacity * 1_500 + s.titles * TITLE_VALUE);
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
