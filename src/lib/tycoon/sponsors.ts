/**
 * Sponsorships: the brands that want a piece of a franchise, and the deals it signs with them.
 * Pure, like the economy that replays them (economy.ts): the browser, the server and the tests
 * share these rules.
 *
 *   The brands    made up, every one (no real company is named or meant), in four tiers: the shop
 *                 down the road, the regional name, the national one, the global one. Bigger brands
 *                 only call once the franchise is worth their while (its stadium, its fans, its
 *                 banners). Some are loved in town (fans like seeing them, they pay a little less);
 *                 some are shady (they pay a third more, and the fans hold it against you).
 *   The slots     what a franchise has to sell: the sideline boards (always), the video boards,
 *                 the pouring rights, the blimp, and the stadium's name. Each but the first has to
 *                 be built toward (a video board to sell, a stadium worth naming).
 *   The offers    three a slot, new every Tuesday, priced off what the franchise is worth to a
 *                 sponsor today: seats, fan interest, titles. Each runs a number of home games.
 *   The structure the manager's call on every deal, and a bet on their own team:
 *                   Guaranteed   the full fee every home game, whatever happens
 *                   Balanced     70% of it, a bonus for every win, another for a sellout
 *                   Incentive    40% of it, a big bonus for every win, and one for a statement
 *                                week (a top-two score in the league)
 *                 Wins and scores are the franchise's real fantasy results, home or away.
 *   The clauses   some offers carry one: a walk-away (15% more, but three straight losses and
 *                 they're gone), or an escalator (10% less to start, 6% more after every win).
 *   Longer deals  pay a signing bonus up front, and lock in today's price: a franchise on the
 *                 rise leaves money on the table, one about to slide is glad of it.
 *   Loyalty       a deal seen through earns a star with that brand (up to three), each worth 8%
 *                 on its next offer. A brand that walked takes its stars with it; a buyout costs one.
 */

import type { Facilities } from './catalog.ts';

export type SlotId = 'sideline' | 'boards' | 'pouring' | 'skies' | 'naming';
export type Structure = 'guaranteed' | 'balanced' | 'incentive';
export type Clause = 'walk' | 'escalator' | null;
export type Vibe = 'loved' | 'neutral' | 'shady';

export interface Brand {
  id: string; name: string; tagline: string; category: string;
  /** 1 the shop down the road, 4 a global name. */
  tier: 1 | 2 | 3 | 4;
  vibe: Vibe;
  /** Its colours: the field its name sits on, the name, and a second colour. */
  bg: string; ink: string; accent: string;
  /** The shape its mark is drawn from. */
  mark: 'ring' | 'shield' | 'bolt' | 'hex' | 'star' | 'wave';
  slots: SlotId[];
}

const b = (id: string, name: string, tagline: string, category: string, tier: Brand['tier'], vibe: Vibe, bg: string, ink: string, accent: string, mark: Brand['mark'], slots: SlotId[]): Brand =>
  ({ id, name, tagline, category, tier, vibe, bg, ink, accent, mark, slots });

/** Every one invented for this game. */
export const BRANDS: Brand[] = [
  // The shop down the road.
  b('goal-line-grill', 'Goal Line Grill', 'Fourth and hungry.', 'Restaurant', 1, 'loved', '#7A1F1F', '#FFE9C7', '#F2A33A', 'ring', ['sideline', 'pouring']),
  b('touchback-tires', 'Touchback Tires', 'We bring it out to the 25.', 'Auto', 1, 'neutral', '#16181D', '#F4D03F', '#E74C3C', 'ring', ['sideline', 'boards']),
  b('snap-count-coffee', 'Snap Count Coffee', 'On two. On two.', 'Coffee', 1, 'loved', '#3B2A20', '#F5E6D3', '#C98B4B', 'ring', ['sideline', 'pouring', 'boards']),
  b('pylon-plumbing', 'Pylon Plumbing', 'We fix leaks. Not your secondary.', 'Home services', 1, 'loved', '#0E4D64', '#FFFFFF', '#FF8A3D', 'shield', ['sideline']),
  b('scramble-diner', 'Scramble Diner', 'Breakfast under pressure.', 'Restaurant', 1, 'neutral', '#FFD23F', '#2B2B2B', '#D7263D', 'star', ['sideline', 'pouring']),
  b('bye-week-mattress', 'Bye Week Mattress', 'Rest like you have nothing to play for.', 'Retail', 1, 'neutral', '#243B6B', '#EAF0FF', '#9DB4FF', 'wave', ['sideline', 'boards']),
  // The regional name.
  b('fourth-and-goal-brewing', 'Fourth & Goal Brewing', 'Go for it.', 'Brewery', 2, 'loved', '#1F3D2B', '#F3E9C9', '#E0A526', 'shield', ['pouring', 'sideline', 'boards']),
  b('first-down-federal', 'First Down Federal', 'Move the chains on your savings.', 'Credit union', 2, 'neutral', '#0B3C5D', '#FFFFFF', '#3FA7D6', 'shield', ['boards', 'sideline', 'naming']),
  b('goal-to-go-rentals', 'Goal-to-Go Rentals', 'Everything you need inside the 10.', 'Equipment', 2, 'neutral', '#B3001B', '#FFFFFF', '#FFC914', 'bolt', ['sideline', 'boards', 'skies']),
  b('sideline-solar', 'Sideline Solar', 'Power from the bench.', 'Energy', 2, 'loved', '#FF9F1C', '#1B1B1B', '#FFFFFF', 'star', ['boards', 'skies', 'naming']),
  b('prevent-defense-insurance', 'Prevent Defense Insurance', 'We only lose late.', 'Insurance', 2, 'neutral', '#2E294E', '#F7F7FF', '#F46036', 'shield', ['boards', 'sideline', 'naming']),
  b('lucky-flea-flicker', 'Lucky Flea Flicker Casino', 'Trick plays pay.', 'Gaming', 2, 'shady', '#0D0D0D', '#FFD700', '#C1121F', 'star', ['sideline', 'boards', 'skies', 'naming']),
  // The national one.
  b('blitz-cola', 'Blitz Cola', 'Bring the pressure.', 'Soft drink', 3, 'neutral', '#D90429', '#FFFFFF', '#2B2D42', 'bolt', ['pouring', 'boards', 'skies', 'naming']),
  b('kickoff-air', 'Kickoff Air', 'Every flight opens on time.', 'Airline', 3, 'neutral', '#003566', '#FFFFFF', '#FFC300', 'wave', ['skies', 'boards', 'naming']),
  b('two-point-trust', 'Two-Point Trust', 'We always go for the extra.', 'Bank', 3, 'neutral', '#0A2540', '#E6F1FF', '#00D4AA', 'hex', ['naming', 'boards', 'sideline']),
  b('end-zone-energy', 'End Zone Energy', 'Spike it.', 'Energy drink', 3, 'neutral', '#39FF14', '#0B0B0B', '#0B0B0B', 'bolt', ['pouring', 'sideline', 'skies']),
  b('play-clock-watches', 'Play Clock Watches', 'Forty seconds of elegance.', 'Watches', 3, 'loved', '#1C1C1C', '#E5C07B', '#FFFFFF', 'ring', ['boards', 'naming']),
  b('sure-thing-sportsbook', 'SureThing Wagers', 'Nothing is. That is the fun.', 'Gaming', 3, 'shady', '#101820', '#00E676', '#FFFFFF', 'hex', ['sideline', 'boards', 'skies', 'naming']),
  // The global one.
  b('hail-mary-mutual', 'Hail Mary Mutual', 'Covered, from anywhere on the field.', 'Insurance', 4, 'neutral', '#14213D', '#FFFFFF', '#FCA311', 'shield', ['naming', 'boards', 'skies']),
  b('checkdown-motors', 'Checkdown Motors', 'The safe choice goes a long way.', 'Automaker', 4, 'neutral', '#111111', '#E8E8E8', '#C1121F', 'hex', ['naming', 'boards', 'sideline']),
  b('longsnap-logistics', 'Longsnap Logistics', 'Fifteen yards, every time.', 'Shipping', 4, 'neutral', '#4A2C82', '#FFFFFF', '#FFB703', 'bolt', ['skies', 'naming', 'boards']),
  b('pigskin-pay', 'Pigskin Pay', 'Money, handed off clean.', 'Payments', 4, 'loved', '#0F766E', '#F0FDFA', '#FDE047', 'ring', ['naming', 'boards', 'sideline', 'pouring']),
  b('totally-legit-crypto', 'TotallyLegit Coin', 'Trust us. Seriously.', 'Crypto', 4, 'shady', '#0B0B14', '#B388FF', '#00E5FF', 'hex', ['naming', 'boards', 'skies', 'sideline']),
];
export const BRAND: Record<string, Brand> = Object.fromEntries(BRANDS.map(x => [x.id, x]));

export interface Slot {
  id: SlotId; name: string;
  /** What the sponsor gets, in the stadium. */
  about: string;
  /** Its share of a franchise's sponsor value: the name is worth the most. */
  weight: number;
  /** What has to be built before it can be sold, and whether it is. */
  needs: string;
  open: (f: Facilities) => boolean;
  /** "{brand} Field": what the stadium is called under a naming deal. */
}
export const SLOTS: Slot[] = [
  { id: 'sideline', name: 'Sideline boards', about: 'Their name on the boards along both sidelines.', weight: 0.3, needs: 'Yours from day one', open: () => true },
  { id: 'boards', name: 'Video boards', about: 'Their name on every screen between plays.', weight: 0.45, needs: 'Build a video board', open: f => f.videoboard >= 1 },
  { id: 'pouring', name: 'Pouring rights', about: 'The only one of its kind sold at your stands.', weight: 0.4, needs: 'Build concourse stands (concessions, level 2)', open: f => f.concessions >= 2 },
  { id: 'skies', name: 'The blimp', about: 'Their blimp, circling over every home game.', weight: 0.35, needs: 'Reach atmosphere, level 2', open: f => f.atmosphere >= 2 },
  { id: 'naming', name: 'Naming rights', about: 'Their name on the building, lit over the plaza.', weight: 1, needs: 'Build the stadium to level 2', open: f => f.stadium >= 2 },
];
export const SLOT: Record<SlotId, Slot> = Object.fromEntries(SLOTS.map(s => [s.id, s])) as Record<SlotId, Slot>;
export const isSlot = (v: unknown): v is SlotId => typeof v === 'string' && v in SLOT;
export const isStructure = (v: unknown): v is Structure => v === 'guaranteed' || v === 'balanced' || v === 'incentive';

export const STRUCTURE: Record<Structure, { name: string; blurb: string; base: number; win: number; sellout: number; statement: number }> = {
  guaranteed: { name: 'Guaranteed', blurb: 'The full fee, every home game, win or lose.', base: 1, win: 0, sellout: 0, statement: 0 },
  balanced: { name: 'Balanced', blurb: 'Most of the fee, a bonus for every win and every sellout.', base: 0.7, win: 0.2, sellout: 0.1, statement: 0 },
  incentive: { name: 'Incentive', blurb: 'Less up front, a lot more when you win, and for a top-two score in the league.', base: 0.4, win: 0.45, sellout: 0, statement: 0.3 },
};

export const TERMS = [4, 8, 12] as const;
/** Up front, as a multiple of the per-game fee: the reward for a longer commitment. */
export const SIGNING: Record<number, number> = { 4: 0, 8: 1, 12: 2 };
export const LOYALTY_MAX = 3;
export const LOYALTY_STEP = 0.08;
export const WALK_LOSSES = 3;
export const ESCALATOR = { start: 0.9, step: 0.06, cap: 1.6 };
const VIBE_PAY: Record<Vibe, number> = { loved: 0.9, neutral: 1, shady: 1.35 };
/** What the fans make of a brand on signing day, in points of interest. */
export const VIBE_FANS: Record<Vibe, number> = { loved: 2, neutral: 0, shady: -3 };
const TIER_PAY = [0, 1, 1.25, 1.6, 2.1];

/** What a sponsor sees in a franchise. */
export interface Standing { capacity: number; interest: number; titles: number }

/** What a franchise is worth to a sponsor, a home game, in dollars. */
export function sponsorValue(s: Standing): number {
  return Math.round(40_000 + s.capacity * 6 * (s.interest / 50) + Math.min(s.titles, 5) * 40_000);
}

/** The biggest brands that will take the call. */
export function tierFor(s: Standing): 1 | 2 | 3 | 4 {
  if (s.titles >= 1 && s.capacity >= 46_000 || s.capacity >= 64_000 && s.interest >= 70) return 4;
  if (s.capacity >= 46_000 && s.interest >= 60 || s.titles >= 2) return 3;
  if (s.capacity >= 24_000 || s.interest >= 60) return 2;
  return 1;
}

function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return (h >>> 0) / 2 ** 32;
}

/** The week offers belong to: they change every Tuesday (UTC). */
export function offerWeek(now: number): number {
  // 6 January 1970 was a Tuesday.
  return Math.floor((now - 5 * 86_400_000) / (7 * 86_400_000));
}

export interface Offer {
  id: string; slot: SlotId; brand: string;
  /** Home games it runs. */
  term: number;
  clause: Clause;
  /** The full fee a home game, in dollars, before the structure takes its share. */
  fee: number;
  /** This brand's loyalty stars, already in the fee. */
  loyalty: number;
}

/** The terms of a deal as signed: the fee split by the structure chosen. Dollars. */
export interface Terms { base: number; win: number; sellout: number; statement: number; signing: number }
export function termsOf(o: Offer, structure: Structure): Terms {
  const k = STRUCTURE[structure], start = o.clause === 'escalator' ? ESCALATOR.start : 1;
  const r = (x: number) => Math.round(x / 1000) * 1000;
  return { base: r(o.fee * k.base * start), win: r(o.fee * k.win), sellout: r(o.fee * k.sellout), statement: r(o.fee * k.statement), signing: r(o.fee * (SIGNING[o.term] ?? 0) * k.base) };
}

/**
 * This week's offers for a slot: up to three brands that sell there, are big enough to call and
 * aren't already a partner, each with a term and maybe a clause. The same every time it's asked
 * in the same week, so an offer seen is an offer that can be signed.
 */
export function offersFor(o: { franchiseId: string; slot: SlotId; week: number; standing: Standing; taken: string[]; loyalty: Record<string, number> }): Offer[] {
  const top = tierFor(o.standing), value = sponsorValue(o.standing), slot = SLOT[o.slot];
  const pool = BRANDS.filter(x => x.slots.includes(o.slot) && x.tier <= top && !o.taken.includes(x.id))
    // The biggest names that will call come first, with the week's luck deciding among them.
    .map(x => ({ x, k: hash(`${o.franchiseId}|${o.slot}|${o.week}|${x.id}`) + (x.tier === top ? 0.35 : x.tier === top - 1 ? 0.15 : 0) }))
    .sort((a, c) => c.k - a.k).slice(0, 3).map(p => p.x);
  return pool.map((brand, i) => {
    const h = hash(`${o.franchiseId}|${o.slot}|${o.week}|${brand.id}|terms`);
    const term = TERMS[(Math.floor(h * 97) + i) % TERMS.length];
    const c = hash(`${o.franchiseId}|${o.slot}|${o.week}|${brand.id}|clause`);
    const clause: Clause = c < 0.28 ? 'walk' : c < 0.5 ? 'escalator' : null;
    const stars = Math.min(LOYALTY_MAX, o.loyalty[brand.id] ?? 0);
    // What they'd pay: the franchise's value, this slot's share, the brand's size and manners, a little luck.
    const fee = value * slot.weight * TIER_PAY[brand.tier] * VIBE_PAY[brand.vibe] * (0.9 + 0.2 * h) * (clause === 'walk' ? 1.15 : 1) * (1 + stars * LOYALTY_STEP);
    return { id: `${o.week}:${o.slot}:${brand.id}`, slot: o.slot, brand: brand.id, term, clause, fee: Math.round(fee / 1000) * 1000, loyalty: stars };
  });
}

/** A deal in force. Dollars; `base` moves under an escalator. */
export interface Deal extends Terms {
  slot: SlotId; brand: string; structure: Structure; clause: Clause;
  term: number;
  /** Home games left, and what it has paid so far. */
  left: number; earned: number;
  /** The fee it started at (an escalator's cap is counted from it). */
  base0: number;
  signedAt: number;
  wins: number; losses: number;
  /** Losses in a row, for a walk-away clause. */
  skid: number;
}

/** What buying a deal out costs: half the guaranteed money still to come. Dollars. */
export const buyoutCost = (d: Pick<Deal, 'base' | 'left'>) => Math.round((d.base * d.left * 0.5) / 1000) * 1000;

/**
 * What a deal would pay over its term at a win rate and a sellout rate (0 to 1), in dollars: for
 * the range a manager is shown before signing. Two games for every home game (home and away
 * alternate); a statement week is taken as one in five.
 */
export function projectDeal(t: Terms, term: number, winRate: number, selloutRate: number, clause: Clause = null): number {
  const games = term * 2, wins = games * winRate;
  let base = t.base * term;
  if (clause === 'escalator') {
    // The fee after each win, averaged over the term.
    let fee = t.base, sum = 0;
    for (let g = 0; g < games; g++) { if (g % 2 === 0) sum += fee; fee = Math.min(t.base / ESCALATOR.start * ESCALATOR.cap, fee * (1 + ESCALATOR.step * winRate)); }
    base = sum;
  }
  return Math.round(t.signing + base + t.win * wins + t.sellout * term * selloutRate + t.statement * games * 0.2);
}

/** "Blitz Cola Field": the building's name under a naming deal. */
export function namedStadium(brand: Brand, capacity: number): string {
  const kind = capacity >= 64_000 ? 'Stadium' : capacity >= 40_000 ? 'Field' : capacity >= 20_000 ? 'Park' : 'Grounds';
  return `${brand.name} ${kind}`;
}
