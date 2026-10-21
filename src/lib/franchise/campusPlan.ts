/**
 * The grounds around a stadium, laid out: the site plan the 3D view draws
 * (team/[userId]/tycoon/Grounds). From the stadium's footprint, its parking
 * level, the crowd and the manager's choices (StadiumLook: setting, district,
 * tailgating, plaza, extras) it places, in order and never on top of each other:
 *
 *   the ring road, and four avenues out to the edge of town
 *   parking lots in the quarters between the avenues, stalls and cars in them
 *   walkways from each lot to the ring, signalled crosswalks over it, and
 *   crosswalks where the sidewalks meet the avenues and side streets
 *   tailgates behind the cars, and an overflow field when it's rowdy
 *   the district past the parking: downtown blocks, a college campus,
 *   suburban streets, or farmland
 *   streetlights, street trees, and the extras (a statue, a fountain, food
 *   trucks, a Ferris wheel)
 *   the routes traffic and fans move along: cars keeping right, stopping at
 *   the stop signs and the crosswalk signals, fans waiting at the curb
 *
 * Plan view as in stadiumBlueprint: x goal to goal, z sideline to sideline,
 * the home stand at -z, the camera's side +z. Placement goes through an
 * occupancy grid, so a later piece only lands where nothing is already.
 *
 * Pure and seeded: the same stadium always gets the same town.
 */

import { OVAL, type Outline } from './stadiumBlueprint.ts';
import { featureSpots } from './plazaPlan.ts';
import type { StadiumLook } from './model';

export interface Rect { x: number; z: number; w: number; d: number }
export interface Lot extends Rect { paved: boolean; grass?: boolean; /** Stall rows run along x when true. */ long: boolean }
export interface Car { x: number; z: number; ry: number; color: number; size: 0 | 1 | 2 /* car, SUV, truck */ }
export interface Segment { x1: number; z1: number; x2: number; z2: number; w: number }
export interface Building extends Rect { h: number; ry: number; kind: 'office' | 'tower' | 'hall' | 'house' | 'barn' | 'shop' | 'clock'; color: number; roof: 'flat' | 'pitched' }
/** Who wears what: resolved to real colors by the renderer from the team's. */
export type Tint = 'team' | 'accent' | 'white' | 'stripe';
export interface Tailgate { x: number; z: number; ry: number; tent: Tint | null; grill: boolean; chairs: number; cornhole: boolean; flag: boolean; people: number }
export interface Spot { x: number; z: number; ry?: number; s?: number }
export interface Field extends Rect { rows: number; along: 'x' | 'z'; crop: number }
/**
 * A path something moves along, as points about STEP apart. `vmax` is the
 * fastest it is taken at each point (slower through the turns); `holds` are
 * where along it, by distance, a mover may have to wait.
 */
export interface Route { pts: [number, number][]; loop: boolean; length: number; vmax: number[]; holds: Hold[] }
/** A stop line at a signal, a stop sign, or (for fans) the curb at a crosswalk. */
export interface Hold { s: number; kind: 'signal' | 'stop'; signal?: number }
/** A signal at a crosswalk on the ring: a pole each side, each facing the traffic that keeps to that side. */
export interface Signal { x: number; z: number; poles: { x: number; z: number; ry: number }[] }

export interface CampusPlan {
  plaza: number; ring: number; ringOut: number;
  /** Where the bay begins, on the waterfront. */
  shore: number | null;
  avenues: Segment[];
  streets: Segment[];
  gravel: Segment[];
  sidewalks: Segment[];
  lots: Lot[];
  stallLines: Spot[];
  cars: Car[];
  curbCars: Car[];
  walkways: Segment[];
  /** Where people cross a road: the line they walk, `w` the crossing's width. */
  crosswalks: Segment[];
  /** Painted across a lane where cars stop. */
  stopLines: Segment[];
  signals: Signal[];
  /** The ring's outer sidewalk, as arcs (angles) broken where the avenues meet it. */
  ringWalk: [number, number][];
  /** The size of the district's street grid. */
  block: number;
  tailgates: Tailgate[];
  rvs: Spot[];
  partyTent: Spot | null;
  buildings: Building[];
  yards: Rect[];
  driveways: Segment[];
  parks: Rect[];
  fields: Field[];
  fences: Segment[];
  trees: Spot[];
  pines: Spot[];
  cacti: Spot[];
  shrubs: Spot[];
  hay: Spot[];
  benches: Spot[];
  lights: Spot[];
  garage: Spot | null;
  rail: number | null;
  waterTower: Spot | null;
  statue: Spot | null;
  fountain: Spot | null;
  trucks: Spot[];
  ferris: Spot | null;
  /** Where cars drive, keeping right, and where fans walk to the gates. */
  traffic: Route[];
  fans: Route[];
  /** How far the avenues run, past the haze. */
  far: number;
}

/** The edge of town: the plan stops here, the backdrop takes over past it. */
export const EDGE = 48;
/** The avenues and their traffic run on to here, well into the haze, so cars come and go out of sight. */
export const FAR = 110;
/**
 * How far out the camera can get (Stadium3D's orbit: 34 from the stadium at the
 * lowest angle it allows, a little past that to be safe). Nothing inside it
 * stands taller than the camera can pass over.
 */
export const CAMERA_REACH = 36;
/** Points along a route are about this far apart. */
export const STEP = 0.2;

/**
 * The crosswalk signals, all on one cycle, each a few seconds off the last:
 * cars go, then amber, then red; once every car has stopped, the walk sign,
 * then a stretch with no new walkers so the last ones clear before green.
 */
export const CYCLE = 18;
export function signalPhase(t: number, i: number): { car: 'green' | 'amber' | 'red'; walk: boolean } {
  const p = (((t + i * 4.1) % CYCLE) + CYCLE) % CYCLE;
  return { car: p < 10.5 ? 'green' : p < 12 ? 'amber' : 'red', walk: p >= 12.4 && p < 14.6 };
}

const dist = (p: readonly [number, number], q: readonly [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** A quadratic curve from p0 to p2 drawn towards p1, as points (p0 left off: the path is already there). */
function quad(p0: [number, number], p1: [number, number], p2: [number, number]): [number, number][] {
  const n = Math.max(3, Math.ceil((dist(p0, p1) + dist(p1, p2)) / STEP));
  return Array.from({ length: n }, (_, k) => {
    const t = (k + 1) / n, u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  });
}

/**
 * A route through some points, resampled every STEP. `vmax` slows it for the
 * bends, braking in good time before each one.
 */
function makeRoute(raw: [number, number][], loop: boolean, cruise: number): Route {
  const src = loop ? [...raw, raw[0]] : raw;
  const pts: [number, number][] = [src[0]];
  let carry = 0;
  for (let i = 0; i < src.length - 1; i++) {
    const [x1, z1] = src[i], [x2, z2] = src[i + 1], L = Math.hypot(x2 - x1, z2 - z1);
    let d = STEP - carry;
    while (d <= L) { pts.push([x1 + ((x2 - x1) * d) / L, z1 + ((z2 - z1) * d) / L]); d += STEP; }
    carry = L - (d - STEP);
  }
  if (loop) pts.pop(); else if (carry > 1e-6) pts.push(src[src.length - 1]);
  const n = pts.length, length = loop ? n * STEP : (n - 2) * STEP + Math.max(STEP * 0.01, dist(pts[n - 2], pts[n - 1]));
  const heading = (i: number) => { const a = pts[(i + n) % n], b = pts[(i + 1 + n) % n]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  const vmax = pts.map((_, i) => {
    if (!loop && (i === 0 || i >= n - 2)) return cruise;
    const turn = Math.abs(Math.atan2(Math.sin(heading(i) - heading(i - 1)), Math.cos(heading(i) - heading(i - 1))));
    return Math.min(cruise, Math.sqrt(0.55 / Math.max(1e-4, turn / STEP)));
  });
  // Brake ahead of a bend rather than in it (twice round for a loop).
  for (let pass = 0; pass < (loop ? 2 : 1); pass++) {
    for (let i = n - 2; i >= 0; i--) vmax[i] = Math.min(vmax[i], Math.sqrt(vmax[i + 1] ** 2 + 2 * 1.2 * STEP));
    if (loop) vmax[n - 1] = Math.min(vmax[n - 1], Math.sqrt(vmax[0] ** 2 + 2 * 1.2 * STEP));
  }
  return { pts, loop, length, vmax, holds: [] };
}

/** Where along a route s is, and which way it heads there: [x, z, dx, dz]. */
export function pointAt(r: Route, s: number): [number, number, number, number] {
  const n = r.pts.length;
  const t = r.loop ? (((s % r.length) + r.length) % r.length) / STEP : Math.max(0, Math.min(n - 1.001, s / STEP));
  const i = Math.floor(t), f = t - i, a = r.pts[i % n], b = r.pts[(i + 1) % n];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (b[0] - a[0]) / L, (b[1] - a[1]) / L];
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; };
}

/** Which ground is taken, in quarter-unit cells. */
class Grid {
  static C = 0.25; static H = 58; static N = (2 * Grid.H) / Grid.C;
  cells = new Uint8Array(Grid.N * Grid.N);
  private idx(x: number, z: number) {
    const i = Math.floor((x + Grid.H) / Grid.C), j = Math.floor((z + Grid.H) / Grid.C);
    return i < 0 || j < 0 || i >= Grid.N || j >= Grid.N ? -1 : j * Grid.N + i;
  }
  /** Every cell the rectangle touches, edges included, so nothing can sit half over another thing. */
  private each(r: Rect, fn: (k: number) => boolean | void) {
    const i0 = Math.floor((r.x - r.w / 2 + Grid.H) / Grid.C), i1 = Math.floor((r.x + r.w / 2 - 1e-6 + Grid.H) / Grid.C);
    const j0 = Math.floor((r.z - r.d / 2 + Grid.H) / Grid.C), j1 = Math.floor((r.z + r.d / 2 - 1e-6 + Grid.H) / Grid.C);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i < 0 || j < 0 || i >= Grid.N || j >= Grid.N ? -1 : j * Grid.N + i;
      if (fn(k) === false) return false;
    }
    return true;
  }
  take(r: Rect) { this.each(r, k => { if (k >= 0) this.cells[k] = 1; }); }
  free(r: Rect) { return this.each(r, k => k >= 0 && this.cells[k] === 0) as boolean; }
  at(x: number, z: number) { const k = this.idx(x, z); return k < 0 || this.cells[k] === 1; }
  /** A segment as a band `pad` wide either side. */
  takeSegment(s: Segment, pad = 0) {
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1), n = Math.max(1, Math.ceil(len / (Grid.C / 2)));
    for (let i = 0; i <= n; i++) {
      const x = s.x1 + ((s.x2 - s.x1) * i) / n, z = s.z1 + ((s.z2 - s.z1) * i) / n, h = s.w / 2 + pad;
      this.take({ x, z, w: 2 * h, d: 2 * h });
    }
  }
}

export interface CampusInput {
  outline: Outline;
  /** The stadium's outline size (stadiumBlueprint footprint). */
  footprint: number;
  /** Parking level, 0 to 4 (lib/tycoon/catalog). */
  parking: number;
  /** How full the last game was, 0 to 1. */
  fill: number;
  look: Pick<StadiumLook, 'setting' | 'district' | 'tailgate' | 'plaza' | 'features'>;
}

export function campusPlan({ outline, footprint, parking, fill, look }: CampusInput): CampusPlan {
  const r = rng(4242 + Math.round(footprint * 10));
  const sq = outline.square;
  const plaza = footprint + 1.4, ring = plaza + 0.2, ringOut = ring + 0.7;
  // How far the outline at size R reaches along each axis, for x (or z) off the centre line.
  const zEdge = (x: number, R: number) => Math.pow(Math.max(0, R ** sq - (Math.abs(x) / OVAL) ** sq), 1 / sq);
  const xEdge = (z: number, R: number) => OVAL * Math.pow(Math.max(0, R ** sq - Math.abs(z) ** sq), 1 / sq);
  const g = new Grid();
  const desert = look.setting === 'desert', mountains = look.setting === 'mountains';

  const plan: CampusPlan = {
    plaza, ring, ringOut, shore: null, avenues: [], streets: [], gravel: [], sidewalks: [], lots: [], stallLines: [], cars: [], curbCars: [],
    walkways: [], crosswalks: [], stopLines: [], signals: [], ringWalk: [], block: 6, far: FAR, tailgates: [], rvs: [], partyTent: null, buildings: [], yards: [], driveways: [], parks: [], fields: [], fences: [],
    trees: [], pines: [], cacti: [], shrubs: [], hay: [], benches: [], lights: [], garage: null, rail: null, waterTower: null,
    statue: null, fountain: null, trucks: [], ferris: null, traffic: [], fans: [],
  };

  // The stadium, its plaza and the ring road.
  for (let x = -Grid.H; x < Grid.H; x += Grid.C) for (let z = -Grid.H; z < Grid.H; z += Grid.C) {
    if (outline.reach(x + Grid.C / 2, z + Grid.C / 2) < ringOut + 0.45) g.take({ x: x + Grid.C / 2, z: z + Grid.C / 2, w: Grid.C * 0.9, d: Grid.C * 0.9 });
  }

  // ── Parking: two lots a level, in the quarters between the avenues ───────────
  const AVE = 1.6; // half the avenue corridor: road, sidewalks and a curb strip
  const lw = 10, ld = 4.6;
  const nsLot = (sx: number, sz: number): Lot => {
    const x0 = AVE, zr = zEdge(x0, ringOut);
    return { x: sx * (x0 + lw / 2), z: sz * (zr + 0.7 + ld / 2), w: lw, d: ld, paved: parking >= 1, long: true };
  };
  const ewLot = (sx: number, sz: number): Lot => {
    const z0 = AVE, xr = xEdge(z0, ringOut);
    return { x: sx * (xr + 0.7 + ld / 2), z: sz * (z0 + lw / 2), w: ld, d: lw, paved: parking >= 1, long: false };
  };
  const order = [nsLot(-1, -1), nsLot(1, -1), nsLot(-1, 1), nsLot(1, 1), ewLot(1, -1), ewLot(1, 1), ewLot(-1, -1), ewLot(-1, 1)];
  plan.lots = order.slice(0, Math.min(8, 2 + 2 * parking));
  for (const l of plan.lots) g.take({ ...l, w: l.w + 0.3, d: l.d + 0.3 });

  // The bay, past the north lots.
  if (look.setting === 'waterfront') {
    const north = Math.min(...plan.lots.map(l => l.z - l.d / 2), -(ringOut + 6));
    plan.shore = north - 3.5;
    g.take({ x: 0, z: (plan.shore - Grid.H) / 2, w: 2 * Grid.H, d: Grid.H + plan.shore });
  }

  // ── Roads: the ring and four avenues ───────────────────────────────────────
  const north = plan.shore !== null ? plan.shore + 0.4 : -FAR;
  // Each avenue by the angle it leaves the ring at, its direction out, and how far it runs.
  const AVENUES = [
    { a: -Math.PI / 2, u: [0, -1] as const, end: -north },
    { a: Math.PI / 2, u: [0, 1] as const, end: FAR },
    { a: 0, u: [1, 0] as const, end: FAR },
    { a: Math.PI, u: [-1, 0] as const, end: FAR },
  ];
  /** How far out along an avenue's axis the outline at size R is. */
  const axis = (av: (typeof AVENUES)[number], R: number) => Math.hypot(...outline.around(av.a, R));
  plan.avenues = AVENUES.map(av => {
    const d0 = axis(av, ringOut) - 0.1;
    return { x1: av.u[0] * d0, z1: av.u[1] * d0, x2: av.u[0] * av.end, z2: av.u[1] * av.end, w: 1 };
  });
  for (const a of plan.avenues) g.takeSegment(a, 0.55);
  // The ring sidewalk (ringOut to ringOut + 0.32) stops either side of each avenue; a crosswalk takes it across.
  const WALK_R = ringOut + 0.16;
  const gapAt = (av: (typeof AVENUES)[number]) => {
    // The angle off the axis where the sidewalk is half an avenue (and a curb) to the side.
    let lo = 0, hi = 0.6;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2, [x, z] = outline.around(av.a + m, WALK_R);
      (Math.abs(x * av.u[1] - z * av.u[0]) < 0.52 ? (lo = m) : (hi = m));
    }
    return lo;
  };
  const gaps = AVENUES.map(av => [av.a - gapAt(av), av.a + gapAt(av)] as [number, number]).sort((p1, p2) => p1[0] - p2[0]);
  plan.ringWalk = gaps.map((gp, i) => [gp[1], i + 1 < gaps.length ? gaps[i + 1][0] : gaps[0][0] + Math.PI * 2] as [number, number]);
  for (const av of AVENUES) {
    const d = axis(av, WALK_R), px = -av.u[1], pz = av.u[0];
    plan.crosswalks.push({ x1: av.u[0] * d + px * 0.5, z1: av.u[1] * d + pz * 0.5, x2: av.u[0] * d - px * 0.5, z2: av.u[1] * d - pz * 0.5, w: 0.3 });
  }
  /** Where the avenue sidewalks are cut for a side street meeting them: [avenue index, side, from, to] along the axis. */
  const cuts: [number, number, number, number][] = [];

  // Garage and rail, at the levels that build them.
  if (parking >= 3) {
    const ne = plan.lots[1];
    const gr = { x: ne.x, z: ne.z - ne.d / 2 - 1.6, w: 3.4, d: 2.4 };
    if (g.free(gr)) { g.take(gr); plan.garage = { x: gr.x, z: gr.z }; }
  }
  if (parking >= 4) {
    const south = Math.max(...plan.lots.map(l => l.z + l.d / 2));
    plan.rail = south + 1.5;
    g.take({ x: 0, z: plan.rail, w: 2 * Grid.H, d: 1.2 });
  }

  // ── Stalls, cars and tailgates ────────────────────────────────────────────
  const parkedShare = Math.min(0.97, 0.15 + fill * 0.85);
  const tailShare = look.tailgate === 'off' ? 0 : (look.tailgate === 'rowdy' ? 0.3 : 0.12) * (0.4 + fill * 0.6);
  const tints: Tint[] = ['team', 'team', 'accent', 'white', 'stripe'];
  const TAILGATES = 150; // enough for a party, few enough to draw
  plan.lots.forEach(l => {
    const length = l.long ? l.w : l.d, depth = l.long ? l.d : l.w;
    const sw = 0.34, sd = 0.6, aisle = 0.62;
    const perRow = Math.floor((length - 0.4) / sw);
    const pairs = Math.max(1, Math.floor((depth - 0.2) / (2 * sd + aisle)));
    for (let p = 0; p < pairs; p++) {
      const band = -depth / 2 + 0.2 + p * (2 * sd + aisle);
      // The first row of a pair faces the aisle after it, the second the aisle before it.
      for (const [row, toAisle] of [[band + sd / 2, 1], [band + sd * 1.5 + aisle, -1]] as const) {
        for (let i = 0; i < perRow; i++) {
          const a = -length / 2 + 0.2 + sw / 2 + i * sw;
          const at = l.long ? { x: l.x + a, z: l.z + row } : { x: l.x + row, z: l.z + a };
          plan.stallLines.push(l.long ? { x: at.x + sw / 2, z: at.z, ry: 0 } : { x: at.x, z: at.z + sw / 2, ry: Math.PI / 2 });
          if (r() >= parkedShare) continue;
          const roll = r();
          plan.cars.push({ x: at.x, z: at.z, ry: l.long ? Math.PI / 2 : 0, color: Math.floor(r() * 12), size: roll < 0.62 ? 0 : roll < 0.9 ? 1 : 2 });
          if (r() < tailShare && plan.tailgates.length < TAILGATES) {
            // Out the back, into the aisle.
            const off = toAisle * (sd / 2 + aisle / 2);
            plan.tailgates.push({
              x: l.long ? at.x : at.x + off, z: l.long ? at.z + off : at.z, ry: l.long ? 0 : Math.PI / 2,
              tent: r() < (look.tailgate === 'rowdy' ? 0.8 : 0.55) ? tints[Math.floor(r() * tints.length)] : null,
              grill: r() < 0.6, chairs: 2 + Math.floor(r() * 3), cornhole: r() < 0.22, flag: r() < 0.35,
              people: Math.round((2 + r() * 3) * (0.5 + fill * 0.5)),
            });
          }
        }
      }
    }
  });

  // Rowdy: an overflow field on the grass with RVs and a party tent.
  if (look.tailgate === 'rowdy') {
    const se = plan.lots.find(l => l.x > 0 && l.z > 0 && l.long) ?? plan.lots[plan.lots.length - 1];
    const field: Lot = { x: se.x, z: se.z + se.d / 2 + (plan.rail !== null ? 2.6 : 0.6) + 2.6, w: 9, d: 4.6, paved: false, grass: true, long: true };
    if (g.free(field)) {
      g.take(field);
      plan.lots.push(field);
      for (let i = 0; i < 5; i++) plan.rvs.push({ x: field.x - field.w / 2 + 1 + i * 1.75, z: field.z - field.d / 2 + 0.7, ry: 0 });
      plan.partyTent = { x: field.x + 1.2, z: field.z + 0.6 };
      for (let i = 0; i < 26; i++) {
        const x = field.x - field.w / 2 + 0.5 + r() * (field.w - 1), z = field.z + 1.6 + (r() - 0.5) * 1.4;
        if (Math.abs(x - plan.partyTent.x) < 1.6) continue;
        if (r() < fill + 0.2) plan.cars.push({ x, z, ry: Math.PI / 2 + (r() - 0.5) * 0.5, color: Math.floor(r() * 12), size: r() < 0.6 ? 0 : 1 });
      }
    }
  }

  // ── Walkways: from each lot to the nearest gate, across the ring road ──────
  // The path runs to the curb, a signalled crosswalk takes it over the ring, and it picks up again on the plaza.
  const gates = [Math.PI / 2, 1.5 * Math.PI, 0, Math.PI];
  const crossings: number[] = []; // the angle of each ring crosswalk, by signal
  for (const l of plan.lots) {
    const inward = l.long ? -Math.sign(l.z) : -Math.sign(l.x);
    // The lot's edge nearest the stadium.
    const A: [number, number] = l.long ? [l.x, l.z + inward * (l.d / 2)] : [l.x + inward * (l.w / 2), l.z];
    // The point of the ring straight towards midfield from there, then the nearest gate.
    const a = Math.atan2(A[1], A[0] / OVAL);
    const B = outline.around(a, ringOut + 0.15), C = outline.around(a, ring - 0.15);
    const gate = gates.reduce((best, g2) => (Math.abs(Math.atan2(Math.sin(g2 - a), Math.cos(g2 - a))) < Math.abs(Math.atan2(Math.sin(best - a), Math.cos(best - a))) ? g2 : best));
    const ga = a + Math.atan2(Math.sin(gate - a), Math.cos(gate - a)) * 0.35; // lean towards the gate
    const D = outline.around(ga, footprint + 0.45);
    // Paved from the lot to the curb; across the plaza the fans just walk on its paving.
    plan.walkways.push({ x1: A[0], z1: A[1], x2: B[0], z2: B[1], w: 0.42 });
    const [ox, oz] = outline.around(a, ringOut), [ix, iz] = outline.around(a, ring);
    plan.crosswalks.push({ x1: ox, z1: oz, x2: ix, z2: iz, w: 0.42 });
    g.takeSegment({ x1: A[0], z1: A[1], x2: B[0], z2: B[1], w: 0.42 }, 0.15);
    const signal = crossings.length;
    crossings.push(a);
    plan.signals.push({ x: (ox + ix) / 2, z: (oz + iz) / 2, poles: [] });
    // Fans come out from among the cars at either end of the lot's near edge, along it to the path, and wait at the curb for the walk sign.
    const along = l.long ? l.w : l.d;
    for (const end of [-1, 1]) {
      const e = end * (along / 2 - 0.3), inset = -inward * 0.1;
      const E: [number, number] = l.long ? [l.x + e, A[1] + inset] : [A[0] + inset, l.z + e];
      const F: [number, number] = l.long ? [A[0], A[1] + inset] : [A[0] + inset, A[1]];
      const route = makeRoute([E, F, A, B, C, D], false, 1);
      route.holds.push({ s: route.length - dist(C, D) - dist(B, C), kind: 'signal', signal });
      plan.fans.push(route);
    }
  }

  // ── Extras on the plaza and by the avenues ────────────────────────────────
  const has = (f: StadiumLook['features'][number]) => look.features.includes(f);
  // Either side of the main gate, where the plaza's layout (plazaPlan) keeps room for them.
  const feature = featureSpots(outline, footprint);
  if (has('statue')) plan.statue = { x: feature.statue.x, z: feature.statue.z, ry: feature.statue.ry + Math.PI / 2 };
  if (has('fountain')) plan.fountain = { x: feature.fountain.x, z: feature.fountain.z, ry: 0 };
  if (has('foodtrucks')) {
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1, z = ringOut + 1.2 + Math.floor(i / 2) * 1.5;
      plan.trucks.push({ x: side * 1.22, z, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
  }
  if (has('ferriswheel')) {
    // The nearest open ground on the camera's side.
    for (const d of [ringOut + 9, ringOut + 12, ringOut + 15, ringOut + 18]) {
      for (const a of [0.35, 0.55, 0.2, 0.75, 1.0]) {
        const x = Math.cos(a) * d * OVAL * 0.8, z = Math.sin(a) * d * 0.95;
        const spot = { x, z, w: 4.4, d: 2.4 };
        if (!plan.ferris && g.free(spot)) { g.take(spot); plan.ferris = { x, z, ry: -0.25 }; }
      }
    }
  }

  // ── The district past the parking ─────────────────────────────────────────
  const G = look.district === 'suburbs' ? 5 : look.district === 'countryside' ? 8 : 6;
  const lineSegments = (vertical: boolean, c: number, w: number): Segment[] => {
    // Along a grid line, wherever the ground is not already taken.
    const out: Segment[] = [];
    let start: number | null = null;
    for (let t = -EDGE; t <= EDGE; t += 0.5) {
      const x = vertical ? c : t, z = vertical ? t : c;
      const ok = !g.at(x, z) && outline.reach(x, z) > ringOut + 3;
      if (ok && start === null) start = t;
      if ((!ok || t >= EDGE) && start !== null) {
        if (t - start > 2) out.push(vertical ? { x1: c, z1: start, x2: c, z2: t, w } : { x1: start, z1: c, x2: t, z2: c, w });
        start = null;
      }
    }
    return out;
  };
  const streetW = look.district === 'countryside' ? 0.5 : 0.62;
  const grid: Segment[] = [];
  for (let k = -Math.floor(EDGE / G); k <= Math.floor(EDGE / G); k++) {
    if (k === 0) continue; // the avenues
    grid.push(...lineSegments(true, k * G, streetW), ...lineSegments(false, k * G, streetW));
  }
  // A side street stopped short of an avenue runs on to its curb; the avenue's sidewalk crosses it on a crosswalk.
  const rural = look.district === 'countryside';
  for (const st of grid) {
    const vertical = st.x1 === st.x2, c = vertical ? st.x1 : st.z1;
    // The avenue it would meet: one running across it, on its side of town.
    const ai = vertical ? (c > 0 ? 2 : 3) : (c < 0 ? 0 : 1);
    const av = plan.avenues[ai], from = Math.hypot(av.x1, av.z1), to = Math.hypot(av.x2, av.z2);
    if (Math.abs(c) < from + 1 || Math.abs(c) > to - 1) continue;
    for (const k of [1, 2] as const) {
      const key = vertical ? (`z${k}` as const) : (`x${k}` as const), end = st[key];
      if (Math.abs(end) > 2.2) continue;
      const side = Math.sign(end) || 1, ext: Rect = vertical ? { x: c, z: (end + side * 0.5) / 2, w: st.w, d: Math.abs(end - side * 0.5) } : { x: (end + side * 0.5) / 2, z: c, w: Math.abs(end - side * 0.5), d: st.w };
      if (plan.lots.some(l => Math.abs(ext.x - l.x) * 2 < ext.w + l.w && Math.abs(ext.z - l.z) * 2 < ext.d + l.d)) continue;
      st[key] = side * 0.5;
      cuts.push([ai, side, Math.abs(c) - st.w / 2 - 0.02, Math.abs(c) + st.w / 2 + 0.02]);
      if (!rural) plan.crosswalks.push(vertical
        ? { x1: c - st.w / 2, z1: side * 0.65, x2: c + st.w / 2, z2: side * 0.65, w: 0.28 }
        : { x1: side * 0.65, z1: c - st.w / 2, x2: side * 0.65, z2: c + st.w / 2, w: 0.28 });
    }
  }
  for (const s of grid) g.takeSegment(s, rural ? 0.05 : 0.12);
  if (rural) plan.gravel = grid; else plan.streets = grid;
  plan.block = G;

  // The avenues' sidewalks: from the ring's sidewalk out, broken where side streets cross.
  plan.avenues.forEach((av, ai) => {
    const vertical = av.x1 === av.x2, ux = Math.sign(av.x2 - av.x1), uz = Math.sign(av.z2 - av.z1), end = Math.hypot(av.x2, av.z2);
    for (const side of [-1, 1]) {
      const start = vertical ? zEdge(0.65, ringOut + 0.3) : xEdge(0.65, ringOut + 0.3);
      const breaks = cuts.filter(cu => cu[0] === ai && cu[1] === side).sort((p1, p2) => p1[2] - p2[2]);
      let d = start;
      for (const [, , b0, b1] of [...breaks, [ai, side, end, end] as const]) {
        if (b0 - d > 0.05) plan.sidewalks.push(vertical
          ? { x1: side * 0.65, z1: uz * d, x2: side * 0.65, z2: uz * b0, w: 0.28 }
          : { x1: ux * d, z1: side * 0.65, x2: ux * b0, z2: side * 0.65, w: 0.28 });
        d = b1;
      }
    }
  });

  const PALETTES = {
    office: desert ? ['#d9c3a0', '#cdb08a', '#e4d2b4', '#bfa27c'] : ['#8a96a3', '#a3adb7', '#6f7c89', '#b9c2ca', '#5c6b7a', '#c9c2b6'],
    hall: desert ? ['#d8b48a', '#c99f73'] : ['#9c4a32', '#8a3f2b', '#a85a3c', '#b5654a'],
    house: desert ? ['#e7d3b1', '#d9b98f', '#efe0c4', '#cfae86'] : ['#e8e1d3', '#c9d6df', '#e6d3b8', '#d9c4c4', '#c8d8c0', '#f0e6c8', '#b9c7d6'],
  };
  const pick = (xs: string[]) => Math.floor(r() * xs.length);
  const cells: { cx: number; cz: number; dist: number }[] = [];
  for (let i = -Math.ceil(EDGE / G); i < Math.ceil(EDGE / G); i++) for (let j = -Math.ceil(EDGE / G); j < Math.ceil(EDGE / G); j++) {
    const cx = (i + 0.5) * G, cz = (j + 0.5) * G;
    if (Math.abs(cx) > EDGE || Math.abs(cz) > EDGE) continue;
    // Past about here the haze has it, and small houses are not worth drawing.
    const dist = Math.hypot(cx / OVAL, cz);
    if (look.district === 'suburbs' && dist > 42) continue;
    cells.push({ cx, cz, dist });
  }
  cells.sort((a, b) => a.dist - b.dist);
  const inset = look.district === 'countryside' ? 0.65 : streetW / 2 + 0.4;
  /** A tree or a bale only where the ground is open: never in a lot, on a road or in the stadium. */
  const plant = (list: Spot[], at: Spot) => { if (!g.at(at.x, at.z)) list.push(at); };
  const place = (b: Building) => { if (g.free(b)) { g.take({ ...b, w: b.w + 0.2, d: b.d + 0.2 }); plan.buildings.push(b); return true; } return false; };

  let clockPlaced = false, towerPlaced = false;
  for (const { cx, cz, dist } of cells) {
    const inner = G - 2 * inset, block: Rect = { x: cx, z: cz, w: inner, d: inner };
    if (look.district === 'downtown') {
      const roll = r();
      if (roll < 0.1 && g.free(block)) {
        // A pocket park.
        g.take(block); plan.parks.push(block);
        for (let t = 0; t < 6; t++) plan.trees.push({ x: cx + (r() - 0.5) * inner * 0.8, z: cz + (r() - 0.5) * inner * 0.8, s: 0.8 + r() * 0.5 });
        plan.benches.push({ x: cx, z: cz + 0.6, ry: 0 }, { x: cx, z: cz - 0.6, ry: Math.PI });
        continue;
      }
      const split = roll < 0.45 ? 1 : roll < 0.8 ? 2 : 4;
      const parts: Rect[] = split === 1 ? [block] : split === 2
        ? [{ x: cx - inner / 4, z: cz, w: inner / 2 - 0.2, d: inner }, { x: cx + inner / 4, z: cz, w: inner / 2 - 0.2, d: inner }]
        : [-1, 1].flatMap(a => [-1, 1].map(b => ({ x: cx + (a * inner) / 4, z: cz + (b * inner) / 4, w: inner / 2 - 0.2, d: inner / 2 - 0.2 })));
      for (const p of parts) {
        const far = Math.max(0, dist - 16);
        const h = 1 + r() * 1.8 + far * (0.12 + r() * 0.2);
        // Out past where the camera can go, the towers; within it, nothing tall enough to block the view or swallow the camera.
        const reach = Math.hypot(p.x, p.z), tall = !towerPlaced && reach > CAMERA_REACH && r() < 0.3;
        if (tall) towerPlaced = true;
        const capped = reach > CAMERA_REACH ? Math.min(h, 9) : Math.min(h, 2.4 + Math.max(0, reach - 14) * 0.17);
        place({ ...p, w: p.w * (0.75 + r() * 0.2), d: p.d * (0.75 + r() * 0.2), h: tall ? 11 + r() * 4 : capped, ry: 0, kind: tall || capped > 5 ? 'tower' : 'office', color: pick(PALETTES.office), roof: 'flat' });
      }
    } else if (look.district === 'college') {
      if (!clockPlaced && cz > 0 && g.free(block)) {
        // The quad with the clock tower, on the camera's side.
        clockPlaced = true; g.take(block); plan.parks.push(block);
        plan.buildings.push({ x: cx, z: cz, w: 0.9, d: 0.9, h: 4.2, ry: 0, kind: 'clock', color: 0, roof: 'pitched' });
        quadPaths(plan, block, r);
        continue;
      }
      if (r() < 0.32 && g.free(block)) {
        g.take(block); plan.parks.push(block); quadPaths(plan, block, r);
        continue;
      }
      // Halls around the edge of the block, a courtyard in the middle.
      const L = inner - 0.4, T = 1.3;
      const halls: Rect[] = [
        { x: cx, z: cz - inner / 2 + T / 2, w: L, d: T }, { x: cx, z: cz + inner / 2 - T / 2, w: L * (0.6 + r() * 0.4), d: T },
        { x: cx - inner / 2 + T / 2, z: cz, w: T, d: L * 0.55 },
      ];
      for (const hRect of halls) if (r() < 0.85) place({ ...hRect, h: 0.9 + r() * 0.8, ry: 0, kind: 'hall', color: pick(PALETTES.hall), roof: desert ? 'flat' : 'pitched' });
      plant(plan.trees, { x: cx + 0.6, z: cz + 0.3, s: 1 }); plant(plan.trees, { x: cx - 0.4, z: cz + 0.8, s: 0.9 });
    } else if (look.district === 'suburbs') {
      // Houses facing the streets around the block, each with a yard, a driveway and a tree.
      for (const [ox, oz, ry] of [[-0.78, -1, 0], [0.78, -1, 0], [-0.78, 1, Math.PI], [0.78, 1, Math.PI]] as const) {
        const x = cx + ox, z = cz + oz * (inner / 2 - 0.62);
        const yard: Rect = { x, z, w: 1.5, d: 1.2 };
        if (!g.free(yard)) continue;
        g.take(yard);
        plan.yards.push(yard);
        plan.buildings.push({ x, z: z - oz * 0.05, w: 0.95, d: 0.75, h: 0.48, ry, kind: 'house', color: pick(PALETTES.house), roof: desert ? 'flat' : 'pitched' });
        plan.driveways.push({ x1: x + 0.55, z1: z, x2: x + 0.55, z2: z + oz * 0.75, w: 0.28 });
        if (r() < 0.55) plan.curbCars.push({ x: x + 0.55, z: z + oz * 0.45, ry: 0, color: Math.floor(r() * 12), size: r() < 0.5 ? 0 : 1 });
        if (r() < 0.8) (mountains ? plan.pines : desert ? plan.cacti : plan.trees).push({ x: x - 0.55, z: z - oz * 0.35, s: 0.7 + r() * 0.4 });
        plan.fences.push({ x1: x - 0.74, z1: z - oz * 0.6, x2: x + 0.74, z2: z - oz * 0.6, w: 0.03 });
      }
    } else {
      // Countryside: fields, with a farmstead here and there and the water tower near town.
      if (!plan.waterTower && g.free({ x: cx, z: cz, w: 1.6, d: 1.6 }) && cz > 0) {
        g.take({ x: cx, z: cz, w: 1.6, d: 1.6 });
        plan.waterTower = { x: cx, z: cz };
      }
      const field = (b: Rect) => { g.take(b); plan.fields.push({ ...b, rows: Math.max(4, Math.round((8 + r() * 8) * (b.w / inner))), along: r() < 0.5 ? 'x' : 'z', crop: Math.floor(r() * 4) }); };
      const woods = (b: Rect) => {
        for (let t = 0; t < Math.round(14 * (b.w * b.d) / (inner * inner)); t++) plant(mountains || r() < 0.4 ? plan.pines : plan.trees, { x: b.x + (r() - 0.5) * b.w, z: b.z + (r() - 0.5) * b.d, s: 0.8 + r() * 0.6 });
      };
      if (g.free(block)) {
        // A whole block: a farmstead, a wood or a field.
        const roll = r();
        if (roll < 0.22) {
          g.take(block);
          plan.buildings.push({ x: cx - 0.8, z: cz, w: 1.9, d: 1.4, h: 1.1, ry: 0, kind: 'barn', color: 0, roof: 'pitched' });
          plan.hay.push({ x: cx + 1.4, z: cz + 1.2 }, { x: cx + 1.9, z: cz + 1.1 }, { x: cx + 1.6, z: cz + 1.7 });
          for (const [x1, z1, x2, z2] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
            plan.fences.push({ x1: cx + x1 * inner / 2, z1: cz + z1 * inner / 2, x2: cx + x2 * inner / 2, z2: cz + z2 * inner / 2, w: 0.03 });
          }
        } else if (roll < 0.32) woods(block);
        else field(block);
      } else {
        // Part of the block is lots or road: farm whatever quarters are left open, so the land runs right up to the parking.
        const q = inner / 2 - 0.15;
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const part: Rect = { x: cx + (a * inner) / 4, z: cz + (b * inner) / 4, w: q, d: q };
          if (!g.free(part)) continue;
          if (r() < 0.75) field(part); else woods(part);
        }
      }
    }
  }

  // ── Streetlights, street trees, scattered greenery ────────────────────────
  for (const a of plan.avenues) {
    const len = Math.hypot(a.x2 - a.x1, a.z2 - a.z1), n = Math.floor(len / 2.4);
    const vertical = a.x1 === a.x2;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = a.x1 + (a.x2 - a.x1) * t, z = a.z1 + (a.z2 - a.z1) * t;
      for (const side of [-1, 1]) {
        const lx = vertical ? x + side * 0.85 : x, lz = vertical ? z : z + side * 0.85;
        plan.lights.push({ x: lx, z: lz, ry: vertical ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2) });
        const tx = vertical ? x + side * 1.2 : x + 1.2, tz = vertical ? z + 1.2 : z + side * 1.2;
        if (!g.at(tx, tz) && i % 2 === 0) (desert ? plan.shrubs : mountains ? plan.pines : plan.trees).push({ x: tx, z: tz, s: 0.75 });
      }
    }
  }
  const clearOf = (a: number) => !gaps.some(([g0, g1]) => a > g0 - 0.03 && a < g1 + 0.03)
    && !crossings.some(c => Math.abs(Math.atan2(Math.sin(c - a), Math.cos(c - a))) < 0.07);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 - Math.PI;
    if (!clearOf(a) || !clearOf(a + Math.PI * 2)) continue;
    const [x, z] = outline.around(a, ringOut + 0.25);
    plan.lights.push({ x, z, ry: -a - Math.PI / 2 });
  }
  const want = { city: 160, park: 320, waterfront: 140, mountains: 300, desert: 120 }[look.setting];
  for (let tries = 0, n = 0; n < want && tries < 6000; tries++) {
    const x = (r() - 0.5) * 2 * EDGE, z = (r() - 0.5) * 2 * EDGE;
    if (g.at(x, z) || g.at(x + 0.3, z) || g.at(x, z + 0.3)) continue;
    n++;
    const s = 0.7 + r() * 0.7;
    if (desert) (r() < 0.55 ? plan.cacti : plan.shrubs).push({ x, z, s });
    else if (mountains || r() < 0.3) plan.pines.push({ x, z, s });
    else plan.trees.push({ x, z, s });
  }

  // Past the edge of the plan, woods and scrub thinning into the haze, so the land never just stops.
  for (let tries = 0, n = 0; n < 1100 && tries < 8000; tries++) {
    const a = r() * Math.PI * 2, d = EDGE + Math.pow(r(), 1.4) * 46, x = Math.cos(a) * d * 1.1, z = Math.sin(a) * d;
    if (plan.shore !== null && z < plan.shore + 1) continue;
    if (Math.abs(x) < 1.6 || Math.abs(z) < 1.6) continue; // the avenues run on out here
    if (plan.rail !== null && Math.abs(z - plan.rail) < 0.8) continue;
    n++;
    const s = 0.9 + r() * 0.9;
    if (desert) (r() < 0.4 ? plan.cacti : plan.shrubs).push({ x, z, s });
    else (mountains || r() < 0.45 ? plan.pines : plan.trees).push({ x, z, s });
  }

  // A garden plaza's planters are the plaza's own (plazaPlan), between the promenades.

  // ── Traffic, keeping right ────────────────────────────────────────────────
  // The ring is two lanes: the inner one runs with the stadium on its right, all the way round. The outer
  // lane carries cars in from an avenue (a stop sign, then right onto the ring) a quarter of the way round
  // and right out onto the next avenue, so no two streams of cars ever cross.
  const Ri = ring + 0.175, Ro = ringOut - 0.175, LANE = 0.25;
  const arc = (a0: number, a1: number, R: number) => {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * R * 6));
    return Array.from({ length: n + 1 }, (_, k) => outline.around(a0 + ((a1 - a0) * k) / n, R));
  };
  /** The angle a set distance along the outline at size R from angle a, one way or the other. */
  const arcStep = (a: number, R: number, d: number, dir: 1 | -1) => {
    const p0 = outline.around(a, R);
    let lo = 0, hi = 1;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; (dist(outline.around(a + dir * m, R), p0) < d ? (lo = m) : (hi = m)); }
    return a + dir * lo;
  };
  const inner = makeRoute(arc(0, Math.PI * 2, Ri).slice(0, -1), true, 0.8);
  plan.traffic.push(inner);
  const open = AVENUES.filter(av => av.end >= FAR - 1);
  const through: Route[] = [];
  for (const av of open) {
    // The next avenue going the way the outer lane runs (decreasing angle).
    const next = open.filter(o => o !== av).reduce((best, o) => {
      const d = (((av.a - o.a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), db = (((av.a - best.a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return d < db ? o : best;
    });
    const turn = (((av.a - next.a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2;
    const oIn: [number, number] = [av.u[1] * LANE, -av.u[0] * LANE], oOut: [number, number] = [-next.u[1] * LANE, next.u[0] * LANE];
    const on = (u: readonly [number, number], d: number, o: [number, number]): [number, number] => [u[0] * d + o[0], u[1] * d + o[1]];
    const aIn = arcStep(av.a, Ro, 0.7, -1), aOut = arcStep(av.a - turn, Ro, 0.7, 1);
    const stopAt = on(av.u, axis(av, ringOut + 0.5), oIn);
    const pts: [number, number][] = [
      on(av.u, FAR, oIn), stopAt,
      ...quad(on(av.u, axis(av, ringOut + 0.05), oIn), on(av.u, axis(av, Ro), oIn), outline.around(aIn, Ro)),
      ...arc(aIn, aOut, Ro).slice(1, -1),
      ...quad(outline.around(aOut, Ro), on(next.u, axis(next, Ro), oOut), on(next.u, axis(next, ringOut + 0.05), oOut)),
      on(next.u, FAR, oOut),
    ];
    const route = makeRoute(pts, false, 1.1);
    route.holds.push({ s: dist(pts[0], stopAt), kind: 'stop' });
    through.push(route);
  }
  plan.traffic.push(...through);
  // Every car on the ring stops at the line before a crosswalk when its signal says so.
  crossings.forEach((a, signal) => {
    for (const [route, R] of [[inner, Ri] as const, ...through.map(t => [t, Ro] as const)]) {
      const at = route.pts.findIndex(pt => dist(pt, outline.around(a, R)) < STEP * 0.75);
      if (at < 0) continue;
      route.holds.push({ s: Math.max(0, at * STEP - 0.42), kind: 'signal', signal });
    }
    // A signal pole on each side, upstream of the crossing, facing the cars that keep to that side.
    const outerFrom = arcStep(a, ringOut + 0.08, 0.34, 1), innerFrom = arcStep(a, ring - 0.08, 0.34, -1);
    const facing = (from: number, R: number, dir: 1 | -1) => {
      const p1 = outline.around(from, R), p2 = outline.around(from + dir * 0.01, R);
      return Math.atan2(-(p2[1] - p1[1]), p2[0] - p1[0]); // towards the oncoming cars
    };
    const [px, pz] = outline.around(outerFrom, ringOut + 0.08), [qx, qz] = outline.around(innerFrom, ring - 0.08);
    plan.signals[signal].poles.push({ x: px, z: pz, ry: facing(outerFrom, ringOut + 0.08, 1) }, { x: qx, z: qz, ry: facing(innerFrom, ring - 0.08, -1) });
  });
  for (const route of plan.traffic) {
    route.holds.sort((h1, h2) => h1.s - h2.s);
    for (const h of route.holds) {
      const [x, z, tx, tz] = pointAt(route, h.s);
      plan.stopLines.push({ x1: x - tz * 0.2, z1: z + tx * 0.2, x2: x + tz * 0.2, z2: z - tx * 0.2, w: 0.05 });
    }
  }
  return plan;
}

/** A quad: lawn crossed corner to corner and down the middle by paths, trees along them, benches. */
function quadPaths(plan: CampusPlan, b: Rect, r: () => number) {
  const hw = b.w / 2 - 0.2, hd = b.d / 2 - 0.2;
  plan.walkways.push(
    { x1: b.x - hw, z1: b.z - hd, x2: b.x + hw, z2: b.z + hd, w: 0.26 },
    { x1: b.x - hw, z1: b.z + hd, x2: b.x + hw, z2: b.z - hd, w: 0.26 },
    { x1: b.x, z1: b.z - hd, x2: b.x, z2: b.z + hd, w: 0.26 },
  );
  for (let t = 0; t < 8; t++) {
    const s = (t + 0.5) / 8;
    plan.trees.push({ x: b.x - hw + 2 * hw * s + 0.4, z: b.z - hd + 2 * hd * s - 0.4, s: 0.7 + r() * 0.3 });
  }
  plan.benches.push({ x: b.x + 0.5, z: b.z, ry: Math.PI / 2 }, { x: b.x - 0.5, z: b.z, ry: -Math.PI / 2 });
}
