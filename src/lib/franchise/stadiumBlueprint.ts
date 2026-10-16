/**
 * What a stadium is made of, for a style (lib/franchise/stadiumStyles) and what
 * the franchise has built (lib/tycoon/catalog): its stands and their decks, the
 * roof, where the boards hang and the lights stand, and the style's own pieces
 * (a berm and a colonnade, a press box). The 3D view (team/[userId]/tycoon/
 * Stadium3D) draws exactly this, so it holds the geometry rules and the tests
 * can check them: seats never on the field, more decks as levels are bought.
 *
 * Plan view: x runs goal to goal, z sideline to sideline, (0, 0) is midfield.
 * Every stadium's footprint is a superellipse ("outline"); a point on it is an
 * angle a (0 is the east end zone, pi/2 the near sideline at +z) and a size r.
 * The home side is the far sideline (-z), which the camera looks into.
 *
 * Pure, no three.js.
 */

import type { Facilities } from '@/lib/tycoon/catalog';
import type { StadiumLook } from './model';

export const OVAL = 1.45; // stadiums are longer than they are wide
export const TAU = Math.PI * 2;
/** A field corner with the bench areas around it, world units from midfield: what the stands must clear. */
export const FIELD_CORNER: [number, number] = [3.66, 1.97];
/** The wall between the field and the first row. */
export const PODIUM = 0.12;

export interface Outline {
  square: number;
  /** The outline's direction at angle a: around(a, r) is dir(a) times r. */
  dir(a: number): [number, number];
  around(a: number, r: number): [number, number];
  /** The outline size passing through (x, z): around()'s inverse. */
  reach(x: number, z: number): number;
}

/** A superellipse: square 2 is an ellipse, higher hugs the rectangular field closer. */
export function makeOutline(square: number): Outline {
  const e = 2 / square;
  const dir = (a: number): [number, number] => {
    const c = Math.cos(a), s = Math.sin(a);
    return [Math.sign(c) * Math.abs(c) ** e * OVAL, Math.sign(s) * Math.abs(s) ** e];
  };
  return {
    square, dir,
    around: (a, r) => { const [x, z] = dir(a); return [x * r, z * r]; },
    reach: (x, z) => ((Math.abs(x) / OVAL) ** square + Math.abs(z) ** square) ** (1 / square),
  };
}

/**
 * One deck of seats at an angle: it starts at `inner`, runs `depth` back and
 * climbs `height` from `base`. A deck raised over another has a `floor`, the
 * height of the concourse under its front, where suites or a fascia go.
 */
export interface Deck { inner: number; depth: number; base: number; height: number; floor?: number }

export interface Stand {
  id: string;
  /** The sweep in radians, from < to; a full ring when it spans TAU. */
  from: number; to: number;
  /** Rows of steps per deck. */
  rows: number;
  decks: (a: number) => Deck[];
  /** The outer wall starts this high (0 is the ground); null for no wall. */
  wallFrom: number | null;
}

export interface Board {
  x: number; y: number; z: number;
  /** Turned to face midfield. */
  ry: number;
  w: number; h: number;
  kind: 'screen' | 'scoreboard' | 'cube';
  /** Posts under it this tall, or a tower when `tower`. */
  legs: number;
  tower?: boolean;
  /** Hung from the roof on cables this long, instead of standing. */
  hung?: number;
}

export type Roof =
  /** A ring over the back of the top deck, `span` deep. */
  | { kind: 'canopy'; span: number }
  | { kind: 'dome'; rise: number }
  /** Pitched roofs over the named stands, posts at the front. */
  | { kind: 'gable'; stands: string[]; lift: number }
  /** A roof over every seat, open over the field, with panels that close the opening when `moving`. */
  | { kind: 'membrane'; moving: boolean };

export interface Blueprint {
  style: StadiumLook['style'];
  outline: Outline;
  /** Where the seats begin. */
  inner: number;
  stands: Stand[];
  /** The outline size that holds everything built. */
  footprint: number;
  /** The tallest stand. */
  top: number;
  roof: Roof | null;
  /** Light towers: x, z, height. */
  towers: [number, number, number][];
  boards: Board[];
  /** Glass suites: in front of a deck of a stand, over a sweep. */
  suites: { stand: string; deck: number; from: number; to: number }[];
  /** A press box along the top of a stand. */
  pressBox: { stand: string; height: number } | null;
  /** A grass berm the bowl is sunk into: from r up at height h, down to the ground `run` further out. */
  berm: { r: number; h: number; run: number } | null;
  colonnade: { from: number; to: number; r: number; base: number; h: number } | null;
  torch: [number, number, number] | null;
  /** A ribbon board along the wall at the front of the first deck, all the way round. */
  ribbon: { deck: 0 } | null;
}

/** Deck heights for the levels built: the stadium level adds decks, seating makes each one deeper. */
function deckHeights(f: Facilities, n: number): number[] {
  return Array.from({ length: n }, (_, i) => 0.55 + 0.12 * f.seating + (i === 0 ? 0.1 : 0));
}

/** Decks stacked from `inner`, each scaled by k (taller and deeper together), `gaps` the room under each deck (0.08 after the first, by default). */
function stack(inner: number, heights: number[], k: number, gaps: number[] = [], start = PODIUM): Deck[] {
  const out: Deck[] = [];
  let r = inner, y = start;
  heights.forEach((h, i) => {
    const gap = gaps[i] ?? (i > 0 ? 0.08 : 0);
    const floor = y;
    y += gap;
    const height = h * k, depth = h * 0.9 * k;
    out.push({ inner: r, depth, base: y, height, ...(gap > 0 ? { floor } : {}) });
    r += depth + 0.06; y += height;
  });
  return out;
}

export const outerOf = (d: Deck[]) => { const l = d.at(-1)!; return l.inner + l.depth; };
export const topOf = (d: Deck[]) => { const l = d.at(-1)!; return l.base + l.height; };

/** Turned to face midfield from (x, z). */
const facing = (x: number, z: number) => Math.atan2(-x, -z);

const SQUARE: Record<StadiumLook['style'], number> = { bowl: 4, horseshoe: 4, grandstand: 9, dome: 2.6, cantilever: 5, coliseum: 2.2 };

/** Board sizes by video board level (1 to 3). */
const BOARD = [[0.9, 0.35], [1.4, 0.55], [2.2, 0.85], [3.2, 1.15]];

export function blueprint(style: StadiumLook['style'], f: Facilities): Blueprint {
  const outline = makeOutline(SQUARE[style] ?? 4);
  const inner = outline.reach(...FIELD_CORNER) + 0.17;
  const level = Math.max(0, Math.min(4, f.stadium));
  const n = 1 + Math.min(3, level);
  const heights = deckHeights(f, n);
  const suiteGap = f.suites > 0 ? 0.14 + 0.06 * f.suites : 0.08;
  const gaps = [0, suiteGap];
  const [bw, bh] = BOARD[Math.max(0, Math.min(3, f.videoboard))];

  const bp: Blueprint = {
    style, outline, inner, stands: [], footprint: inner, top: PODIUM, roof: null, towers: [], boards: [], suites: [],
    pressBox: null, berm: null, colonnade: null, torch: null, ribbon: null,
  };
  const ring = (id: string, decks: (a: number) => Deck[], from = 0, to = TAU, wallFrom: number | null = 0): Stand =>
    ({ id, from, to, rows: 6, decks, wallFrom });
  // Light towers at angles, just outside the stands.
  const towersAt = (angles: number[]) => angles.map(a => {
    const [x, z] = outline.around(a, bp.footprint + 0.5);
    return [x, z, bp.top + 1.4] as [number, number, number];
  });
  // A board above the stands at angle a, or standing in an open end.
  const boardOver = (a: number, scale = 1): Board => {
    const [x, z] = outline.around(a, bp.footprint - 0.6);
    return { x, y: bp.top + (bh * scale) / 2 + 0.25, z, ry: facing(x, z), w: bw * scale, h: bh * scale, kind: 'screen', legs: 0.5 };
  };

  switch (style) {
    case 'bowl': {
      bp.stands.push(ring('bowl', () => stack(inner, heights, 1, gaps)));
      measure(bp);
      if (level >= 3) bp.roof = { kind: 'canopy', span: 0.9 + 0.4 * (level - 3) };
      bp.towers = towersAt([1, 3, 5, 7].map(k => (k * Math.PI) / 4));
      if (f.videoboard > 0) bp.boards.push(boardOver(0));
      if (f.videoboard >= 3) bp.boards.push(boardOver(Math.PI));
      if (f.suites > 0 && n > 1) bp.suites.push({ stand: 'bowl', deck: 1, from: 0, to: TAU });
      break;
    }
    case 'horseshoe': {
      const gap = 0.5; // the open end, either side of east
      bp.stands.push(ring('shoe', () => stack(inner, heights, 1, gaps), gap, TAU - gap));
      measure(bp);
      bp.towers = towersAt([Math.PI / 2 - 0.55, Math.PI / 2 + 0.55, 1.5 * Math.PI - 0.55, 1.5 * Math.PI + 0.55]);
      if (f.videoboard > 0) {
        // In the open end, on legs, then on a tower of its own.
        const [x] = outline.around(0, inner + 0.9);
        const scale = 1.5, h = bh * scale, tower = level >= 4 || f.videoboard >= 3;
        const legs = tower ? bp.top * 0.8 : 0.5;
        bp.boards.push({ x, y: legs + h / 2, z: 0, ry: facing(x, 0), w: bw * scale, h, kind: 'screen', legs, tower });
      }
      if (f.suites > 0 && n > 1) for (const c of [Math.PI / 2, 1.5 * Math.PI]) bp.suites.push({ stand: 'shoe', deck: 1, from: c - 0.75, to: c + 0.75 });
      break;
    }
    case 'grandstand': {
      // The sideline stands run goal line to goal line; the corners stay open.
      const w = 0.62;
      const home = Math.max(1, n), away = Math.max(1, n - 1);
      bp.stands.push(ring('home', () => stack(inner, deckHeights(f, home), 1.08, gaps), 1.5 * Math.PI - w, 1.5 * Math.PI + w));
      bp.stands.push(ring('away', () => stack(inner, deckHeights(f, away), 1, gaps), Math.PI / 2 - w, Math.PI / 2 + w));
      if (f.seating > 0) {
        // Bleachers behind each end zone, deeper with each seating level.
        const h = 0.3 + 0.12 * f.seating, e = 0.45;
        bp.stands.push(ring('east', () => stack(inner, [h], 1), -e, e));
        bp.stands.push(ring('west', () => stack(inner, [h], 1), Math.PI - e, Math.PI + e));
        for (const s of bp.stands.slice(2)) s.rows = 4;
      }
      measure(bp);
      const pressBox = f.suites > 0 ? 0.16 + 0.07 * f.suites : 0;
      if (pressBox) bp.pressBox = { stand: 'home', height: pressBox };
      bp.roof = { kind: 'gable', stands: ['home', 'away'], lift: 0.3 + pressBox };
      if (f.videoboard > 0) {
        const [x] = outline.around(0, inner + (f.seating > 0 ? 0.9 + 0.12 * f.seating : 0.5));
        const h = bh * 1.1, legs = 0.55 + 0.1 * f.videoboard;
        bp.boards.push({ x, y: legs + h / 2, z: 0, ry: facing(x, 0), w: bw * 1.1, h, kind: f.videoboard >= 2 ? 'screen' : 'scoreboard', legs });
      }
      break;
    }
    case 'dome': {
      bp.stands.push(ring('dome', () => stack(inner, heights, 1, gaps)));
      measure(bp);
      bp.roof = { kind: 'dome', rise: 0.3 + 0.04 * level };
      if (f.videoboard > 0) bp.boards.push({ x: 0, y: bp.top + 0.6 + bh / 2, z: 0, ry: 0, w: bw * 0.8, h: bh, kind: 'cube', legs: 0 });
      if (f.suites > 0 && n > 1) bp.suites.push({ stand: 'dome', deck: 1, from: 0, to: TAU });
      break;
    }
    case 'cantilever': {
      // The home side (-z, sin a < 0) climbs; the near side sits lower so the camera sees in.
      const k = (a: number) => { const s = Math.sin(a); return s < 0 ? 1 + 0.38 * s * s : 1 - 0.08 * s * s; };
      const towerGaps = [0, ...heights.slice(1).map((_, i) => (i < f.suites ? suiteGap : 0.08))];
      bp.stands.push(ring('bowl', a => stack(inner, heights, k(a), towerGaps)));
      measure(bp);
      bp.roof = { kind: 'membrane', moving: level >= 3 };
      // Hung under the roof's edge over each end zone.
      const hang = (a: number): Board => {
        const [x, z] = outline.around(a, inner + 0.6), h = bh * 0.9, y = bp.top + 0.6 - 0.25 - h / 2;
        return { x, y, z, ry: facing(x, z), w: bw * 0.9, h, kind: 'screen', legs: 0, hung: 0.25 };
      };
      if (f.videoboard > 0) bp.boards.push(hang(0));
      if (f.videoboard >= 2) bp.boards.push(hang(Math.PI));
      if (f.videoboard >= 2) bp.ribbon = { deck: 0 };
      for (let d = 1; d <= Math.min(f.suites, n - 1); d++) bp.suites.push({ stand: 'bowl', deck: d, from: Math.PI + 0.55, to: TAU - 0.55 });
      break;
    }
    case 'coliseum': {
      // The first deck is sunk into a berm; decks above it leave the east end open for the colonnade.
      const gap = 0.55;
      const lower = () => stack(inner, [heights[0]], 1);
      bp.stands.push(ring('bowl', lower, 0, TAU, null));
      const o0 = outerOf(lower()), t0 = topOf(lower());
      bp.berm = { r: o0 + 0.02, h: t0, run: 2.2 };
      if (n > 1) {
        bp.stands.push(ring('upper', () => {
          const base = lower();
          return stack(outerOf(base) + 0.06, heights.slice(1), 1, [suiteGap], topOf(base));
        }, gap, TAU - gap));
      }
      measure(bp);
      bp.footprint = Math.max(bp.footprint, o0 + 2.2);
      const colTop = Math.max(t0 + 0.9 + 0.3 * level, bp.top * 0.85);
      bp.colonnade = { from: -gap + 0.06, to: gap - 0.06, r: o0 + 0.25, base: t0, h: colTop - t0 };
      bp.towers = towersAt([1, 3, 5, 7].map(k => (k * Math.PI) / 4));
      const [cx] = outline.around(0, o0 + 0.25);
      if (f.atmosphere > 0) bp.torch = [cx, colTop + 0.18, 0];
      if (f.videoboard > 0) {
        const y = colTop + 0.45 + (f.atmosphere > 0 ? 0.5 : 0) + bh / 2;
        bp.boards.push({ x: cx + 0.15, y, z: 0, ry: facing(cx, 0), w: bw, h: bh, kind: 'screen', legs: y - bh / 2 - colTop });
      }
      if (f.suites > 0 && n > 1) for (const c of [Math.PI / 2, 1.5 * Math.PI]) bp.suites.push({ stand: 'upper', deck: 0, from: c - 0.8, to: c + 0.8 });
      break;
    }
  }
  return bp;
}

/** Sets the footprint and the top from the stands. */
function measure(bp: Blueprint) {
  for (const s of bp.stands) {
    for (let i = 0; i <= 48; i++) {
      const a = s.from + ((s.to - s.from) * i) / 48;
      const d = s.decks(a);
      bp.footprint = Math.max(bp.footprint, outerOf(d));
      bp.top = Math.max(bp.top, topOf(d));
    }
  }
}

export interface SeatSpot { x: number; y: number; z: number; a: number; deck: number }

/** Every seat's spot on the steps, for the crowd: position, angle around the bowl, and deck. */
export function seatSpots(bp: Blueprint, spacing = 0.085): SeatSpot[] {
  // Seats are spaced by distance along each row, not by angle: the outline is
  // squarer than a circle, so even steps of angle crowd the corners and spread
  // the long sidelines (the 50-yard line) thin.
  const out: SeatSpot[] = [];
  const N = 480;
  for (const s of bp.stands) {
    const span = s.to - s.from;
    const decks = Array.from({ length: N + 1 }, (_, i) => s.decks(s.from + (span * i) / N));
    for (let d = 0; d < decks[0].length; d++) {
      for (let row = 0; row < s.rows; row++) {
        // The row as a path: points along it and the distance to each.
        const path: { x: number; y: number; z: number; a: number; len: number }[] = [];
        for (let i = 0; i <= N; i++) {
          const at = decks[i][d];
          if (!at) continue;
          const a = s.from + (span * i) / N;
          const [x, z] = bp.outline.around(a, at.inner + (at.depth * (row + 0.5)) / s.rows);
          const prev = path.at(-1);
          path.push({ x, z, a, y: at.base + (at.height * (row + 1)) / s.rows + 0.045, len: prev ? prev.len + Math.hypot(x - prev.x, z - prev.z) : 0 });
        }
        const total = path.at(-1)?.len ?? 0;
        const count = Math.max(4, Math.round(total / spacing));
        let j = 0;
        for (let n = 0; n < count; n++) {
          const want = ((n + 0.5) / count) * total;
          while (j < path.length - 2 && path[j + 1].len < want) j++;
          const p = path[j], q = path[j + 1] ?? p, t = q.len > p.len ? (want - p.len) / (q.len - p.len) : 0;
          out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t, a: p.a + (q.a - p.a) * t, deck: d });
        }
      }
    }
  }
  return out;
}

/** A small, repeatable hash in [0, 1). */
function hash(...n: number[]) {
  let h = 2166136261;
  for (const v of n) { h ^= Math.round(v * 1000); h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * The seats a crowd of `fill` (0 to 1 of capacity) sits in: exactly that share
 * of them, best seats first, the way a real crowd fills a stadium. Low rows
 * near midfield go first; the top rows and the end zone corners empty first.
 * Each section varies a little (one upper section half full, the next nearly
 * empty) and a few single seats go unsold among the rest, so the edge of the
 * crowd looks like people rather than a line.
 */
export function seatsFilled<S extends Pick<SeatSpot, 'x' | 'y' | 'a' | 'deck'>>(bp: Blueprint, spots: S[], fill: number): S[] {
  const want = Math.round(spots.length * Math.max(0, Math.min(1, fill)));
  if (want >= spots.length) return spots;
  const xMax = Math.max(1e-6, ...spots.map(s => Math.abs(s.x)));
  const span = Math.max(1e-6, bp.top - PODIUM);
  const worse = spots.map((s, i) => {
    const high = (s.y - PODIUM) / span; // the climb
    const end = (Math.abs(s.x) / xMax) ** 1.5; // away from midfield, toward the end zones
    const section = Math.floor(((((s.a % TAU) + TAU) % TAU) / TAU) * 40);
    return { i, score: high + 0.55 * end + 0.3 * (hash(section, s.deck) - 0.5) + 0.08 * (hash(i, 7) - 0.5) };
  });
  worse.sort((p, q) => p.score - q.score);
  return worse.slice(0, want).map(w => spots[w.i]);
}

/** Whether the roof is closed: by choice, or for 'auto' at night and in the cold months. */
export function roofClosed(choice: StadiumLook['roof'], night: number, month = new Date().getMonth()): boolean {
  if (choice === 'open') return false;
  if (choice === 'closed') return true;
  return night > 0.5 || month === 11 || month <= 1;
}
