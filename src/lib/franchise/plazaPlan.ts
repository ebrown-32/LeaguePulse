/**
 * The plaza around a stadium, laid out: what stands on it and where people walk, the same for
 * every style, measured out from the stadium's own outline (stadiumBlueprint), so a round bowl,
 * a square grandstand and Memorial's cross all get a plaza that fits them.
 *
 * Out from the stadium wall (distances in outline size past the footprint):
 *
 *   0.40 to 0.58   the inner promenade, a walkway along the wall
 *   0.66 to 1.02   the band: concession stands, restrooms that can't go under the seats, the
 *                  statue and fountain, benches, lamps and planters
 *   1.16 to 1.38   the outer promenade, then the ring road's curb at 1.40
 *
 * The four gates stay clear, each with a paved apron and a flag either side against the wall; the main one (the camera's
 * side, +z) has the team's medallion in the paving and the fountain and the first legend's statue
 * either side of it; the other two legends stand by the east and back gates.
 * Concession stands gather into food courts between the gates. Walkers keep to the promenades,
 * stepping out around anything in the way.
 *
 * Pure and seeded: the same stadium always gets the same plaza.
 */

import { TAU, type Outline } from './stadiumBlueprint.ts';
import type { StadiumLook } from './model';

export const PLAZA = {
  inner: 0.49, band: 0.84, outer: 1.27, edge: 1.4,
  /** Half the band's width: what stands in it keeps inside this. */
  bandHalf: 0.18,
  /** Arc length kept clear either side of a gate. */
  gateClear: 0.95,
  /** Arc length a slot in the band takes. */
  slot: 0.52,
} as const;

/** The gates, by angle: the main gate on the camera's side first. */
export const GATES = [Math.PI / 2, (3 * Math.PI) / 2, 0, Math.PI];

/** A place on the plaza, turned so its local x points straight out from the stadium. */
export interface PlazaSpot { x: number; z: number; ry: number; nx: number; nz: number; a: number; d: number }

export type PlazaKind = 'stand' | 'restroom' | 'bench' | 'lamp' | 'planter' | 'flag';
export interface PlazaItem extends PlazaSpot { kind: PlazaKind }

/** Something walkers step around: `cap` is as far as a lane may swerve for it (small things, near the band). */
export interface Obstacle { x: number; z: number; r: number; cap?: number }

export interface PlazaPlan {
  stands: PlazaSpot[];
  restrooms: PlazaSpot[];
  benches: PlazaSpot[];
  lamps: PlazaSpot[];
  planters: PlazaSpot[];
  flags: PlazaSpot[];
  /** The legend statues, greatest first: by the main gate, then the east gate and the back one. */
  statues: PlazaSpot[];
  /** The first of them. */
  statue: PlazaSpot | null;
  fountain: PlazaSpot | null;
  /** The team store, beside the west gate, running along the band. */
  store: PlazaSpot | null;
  /** The main gate's medallion in the paving. */
  medallion: PlazaSpot;
  /** The gates' angles, for the aprons. */
  gates: number[];
  /** What walkers step around. */
  obstacles: Obstacle[];
}

/** A spot at angle a, `d` past the footprint. */
export function plazaSpot(o: Outline, footprint: number, a: number, d: number): PlazaSpot {
  const r = footprint + d;
  const [x, z] = o.around(a, r);
  const [x1, z1] = o.around(a - 0.004, r), [x2, z2] = o.around(a + 0.004, r);
  // The outward normal: the tangent turned a quarter, whichever way points away from midfield.
  let nx = z2 - z1, nz = -(x2 - x1);
  if (nx * x + nz * z < 0) { nx = -nx; nz = -nz; }
  const len = Math.hypot(nx, nz) || 1;
  nx /= len; nz /= len;
  return { x, z, ry: Math.atan2(-nz, nx), nx, nz, a, d };
}

/** The band, measured: angles at even arc lengths, so slots are the same size on any outline. */
function arcTable(o: Outline, r: number) {
  const N = 1440, at: number[] = [0];
  let prev = o.around(0, r);
  for (let i = 1; i <= N; i++) {
    const p = o.around((i / N) * TAU, r);
    at.push(at[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
    prev = p;
  }
  const length = at[N];
  /** The angle at arc length s (wrapping). */
  const angleAt = (s: number) => {
    const t = ((s % length) + length) % length;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; (at[m] <= t ? (lo = m) : (hi = m)); }
    const f = (t - at[lo]) / Math.max(1e-9, at[hi] - at[lo]);
    return ((lo + f) / N) * TAU;
  };
  /** The arc length at angle a. */
  const lengthAt = (a: number) => {
    const t = ((a % TAU) + TAU) % TAU / TAU * N, i = Math.floor(t);
    return at[i] + (at[Math.min(N, i + 1)] - at[i]) * (t - i);
  };
  return { length, angleAt, lengthAt };
}

/** Arc distance between two arc lengths on a loop of `length`. */
const apart = (s1: number, s2: number, length: number) => { const d = Math.abs(s1 - s2) % length; return Math.min(d, length - d); };

export function plazaPlan(o: Outline, footprint: number, opts: {
  concessions: number;
  /** Restroom blocks that don't fit under the seats and stand on the plaza instead. */
  restrooms: number;
  features: StadiumLook['features'];
  plaza: StadiumLook['plaza'];
  /** The team store's level: 0 for none. */
  store?: number;
  /** Light towers (x, z), which the inner promenade steps around. */
  towers?: [number, number, number][];
}): PlazaPlan {
  const band = arcTable(o, footprint + PLAZA.band);
  const L = band.length;
  const spotAt = (s: number, d: number = PLAZA.band) => plazaSpot(o, footprint, band.angleAt(s), d);
  const gateS = GATES.map(g => band.lengthAt(g));
  const main = gateS[0];

  // The band's slots, and which are taken.
  const n = Math.max(8, Math.floor(L / PLAZA.slot));
  const step = L / n;
  const slots = Array.from({ length: n }, (_, i) => ({ s: i * step, taken: false }));
  const nearGate = (s: number) => gateS.some(g => apart(s, g, L) < PLAZA.gateClear);
  for (const sl of slots) if (nearGate(sl.s)) sl.taken = true;
  const takeNear = (s: number, half: number) => { for (const sl of slots) if (apart(sl.s, s, L) < half) sl.taken = true; };

  // The fountain and the greatest legend either side of the main gate; the next two by the east
  // gate and the back one (the west has the store).
  const { statueS, fountainS, othersS } = featureArcs(gateS);
  const statues = opts.features.includes('statue') ? [statueS, ...othersS].map(s => spotAt(s)) : [];
  const statue = statues[0] ?? null;
  const fountain = opts.features.includes('fountain') ? spotAt(fountainS) : null;
  if (statues.length) [statueS, ...othersS].forEach(s => takeNear(s, 0.78));
  if (fountain) takeNear(fountainS, 0.9);

  // The team store, beside the west gate: the bigger it's built, the more of the band it takes.
  const storeS = gateS[3] + PLAZA.gateClear + 0.8;
  const store = opts.store ? spotAt(storeS) : null;
  if (store) takeNear(storeS, 0.45 + 0.13 * (opts.store ?? 0));

  // Food courts: stands fill out from the middle of each quarter, the quarters taking turns.
  const sorted = [...gateS].sort((x, y) => x - y);
  const quarters = sorted.map((g, i) => ({ mid: ((g + (sorted[i + 1] ?? sorted[0] + L)) / 2) % L }));
  const free = () => slots.filter(sl => !sl.taken);
  const pickNear = (s: number) => free().sort((a, b) => apart(a.s, s, L) - apart(b.s, s, L))[0] ?? null;
  const stands: PlazaSpot[] = [];
  for (let k = 0; k < opts.concessions * 6; k++) {
    const q = quarters[k % quarters.length];
    const sl = pickNear(q.mid);
    if (!sl) break;
    sl.taken = true;
    stands.push(spotAt(sl.s));
  }

  // Restroom blocks, two slots each, where a quarter has room.
  const restrooms: PlazaSpot[] = [];
  for (let k = 0; k < opts.restrooms; k++) {
    const pair = slots.findIndex((sl, i) => !sl.taken && !slots[(i + 1) % n].taken);
    if (pair < 0) break;
    slots[pair].taken = slots[(pair + 1) % n].taken = true;
    restrooms.push(spotAt(slots[pair].s + step / 2));
  }

  // Furniture in what's left: a bench, then a lamp, then a planter, round and round. A garden plaza is
  // planters wherever there's room.
  const benches: PlazaSpot[] = [], lamps: PlazaSpot[] = [], planters: PlazaSpot[] = [];
  // Measured straight, too: round a square stadium's corners, arc length undersells how close things are.
  const roomy = (sl: { s: number }) => [...statues.map(st => [st, 0.5] as const), [fountain, 0.62] as const].every(([f, r]) => {
    if (!f) return true;
    const p = spotAt(sl.s), q = f as PlazaSpot;
    return Math.hypot(p.x - q.x, p.z - q.z) > (r as number);
  });
  free().filter(roomy).forEach((sl, i) => {
    if (opts.plaza === 'garden' && i % 3 !== 1) { planters.push(spotAt(sl.s)); return; }
    const k = i % 3;
    if (k === 0) benches.push(spotAt(sl.s));
    else if (k === 1) lamps.push(spotAt(sl.s, PLAZA.band - 0.12));
    else planters.push(spotAt(sl.s));
  });

  // A flag either side of each gate, against the wall, and the medallion in front of the main one.
  const flags = gateS.flatMap(g => [g - 0.5, g + 0.5].map(s => spotAt(s, 0.2)));
  const medallion = spotAt(main, PLAZA.band);

  const obstacles: Obstacle[] = [
    // Walked all the way round: they have the band to themselves.
    ...statues.map(st => ({ x: st.x, z: st.z, r: 0.28 })),
    ...(fountain ? [{ x: fountain.x, z: fountain.z, r: 0.42 }] : []),
    // Stepped past: a light tower's mast, a flagpole.
    ...(opts.towers ?? []).map(t => ({ x: t[0], z: t[1], r: 0.07, cap: 0.09 })),
    ...flags.map(f => ({ x: f.x, z: f.z, r: 0.03, cap: 0.09 })),
  ];
  if (store) obstacles.push({ x: store.x, z: store.z, r: 0.2 });
  return { stands, restrooms, benches, lamps, planters, flags, statues, statue, fountain, store, medallion, gates: GATES, obstacles };
}

/** Along the band, where the fountain and the statues go: beside the gates, past what's kept clear. */
function featureArcs(gateS: number[]) {
  const beside = PLAZA.gateClear + 0.45;
  return { statueS: gateS[0] + beside, fountainS: gateS[0] - beside, othersS: [gateS[2] + beside, gateS[1] - beside] };
}

/** Where the first statue and the fountain stand, for the site plan (campusPlan). */
export function featureSpots(o: Outline, footprint: number) {
  const band = arcTable(o, footprint + PLAZA.band);
  const { statueS, fountainS } = featureArcs(GATES.map(g => band.lengthAt(g)));
  const at = (s: number) => plazaSpot(o, footprint, band.angleAt(s), PLAZA.band);
  return { statue: at(statueS), fountain: at(fountainS) };
}

/**
 * A walker's lane: the promenade at distance `d`, stepping out around obstacles. Points about
 * `step` apart around the loop, with the arc length to each, so walkers move at an even pace.
 */
export function promenade(o: Outline, footprint: number, d: number, obstacles: Obstacle[], step = 0.08) {
  const r = footprint + d;
  const loop = arcTable(o, r);
  const n = Math.max(24, Math.ceil(loop.length / step));
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = loop.angleAt((i / n) * loop.length);
    const s = plazaSpot(o, footprint, a, d);
    let x = s.x, z = s.z;
    // Out (or in) around anything within reach, by a smooth bump.
    for (const ob of obstacles) {
      const dx = x - ob.x, dz = z - ob.z, dist = Math.hypot(dx, dz), clear = ob.r + 0.06, reach = clear + 0.22;
      if (dist < reach) {
        const push = Math.min(ob.cap ?? Infinity, Math.max(0, clear + 0.03 - dist) + 0.03 * (1 - dist / reach));
        const side = (dx * s.nx + dz * s.nz) >= 0 ? 1 : -1;
        x += s.nx * push * side; z += s.nz * push * side;
      }
    }
    pts.push([x, z]);
  }
  const cum = [0];
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n], q = pts[i - 1];
    cum.push(cum[i - 1] + Math.hypot(p[0] - q[0], p[1] - q[1]));
  }
  return { pts, cum, length: cum[n] };
}

/** The point a walker reaches `s` along a promenade. */
export function along(lane: ReturnType<typeof promenade>, s: number): [number, number] {
  const { pts, cum, length } = lane;
  const t = ((s % length) + length) % length;
  let lo = 0, hi = pts.length;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; (cum[m] <= t ? (lo = m) : (hi = m)); }
  const f = (t - cum[lo]) / Math.max(1e-9, cum[lo + 1] - cum[lo]);
  const p = pts[lo], q = pts[(lo + 1) % pts.length];
  return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
}
