/**
 * The one shape most of a stadium is made of: a ribbon swept around the
 * stadium's outline (lib/franchise/stadiumBlueprint). At every angle the
 * ribbon has the same kind of cross-section, a list of (r, y) points, and
 * consecutive points become a strip of faces all the way round. Two points
 * at one r make a wall, two at one y a ring of floor, a staircase of points a
 * deck of seats; when the cross-section changes with the angle the shape
 * follows (a home side that climbs). A sweep short of a full ring can be
 * closed at its ends.
 *
 * Faces are flat-shaded (each strip its own normals) so steps read as steps,
 * and each strip can take its own color, so one mesh carries seats, risers
 * and fascia.
 */

import { BufferGeometry, Color, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';
import { TAU, type Deck, type Outline } from '@/lib/franchise/stadiumBlueprint';

export type Pt = [r: number, y: number];

export interface RibbonOptions {
  /** Faces around the sweep; by default about 160 for a full ring. */
  segs?: number;
  /** A color per strip (k is the strip's index, -1 for the end caps). */
  color?: (a: number, k: number) => Color;
  /** Close a partial sweep at both ends, down to the ground. */
  caps?: boolean;
}

export function ribbonGeometry(o: Outline, from: number, to: number, profile: (a: number) => Pt[], opts: RibbonOptions = {}): BufferGeometry {
  const span = to - from;
  const full = span >= TAU - 1e-6;
  const segs = opts.segs ?? Math.max(8, Math.round((160 * span) / TAU));
  const profiles = Array.from({ length: segs + 1 }, (_, i) => profile(from + (span * i) / segs));
  const pos: number[] = [];
  const col: number[] = [];
  const point = (a: number, [r, y]: Pt) => { const [dx, dz] = o.dir(a); return [dx * r, y, dz * r]; };
  const tri = (p: number[][], c?: Color) => {
    for (const v of p) { pos.push(v[0], v[1], v[2]); if (c) col.push(c.r, c.g, c.b); }
  };

  for (let i = 0; i < segs; i++) {
    const a0 = from + (span * i) / segs, a1 = from + (span * (i + 1)) / segs;
    const P = profiles[i], Q = profiles[i + 1];
    const m = Math.min(P.length, Q.length);
    for (let k = 0; k < m - 1; k++) {
      const c = opts.color?.((a0 + a1) / 2, k);
      const p0 = point(a0, P[k]), p1 = point(a0, P[k + 1]), q0 = point(a1, Q[k]), q1 = point(a1, Q[k + 1]);
      tri([p0, q0, q1], c); tri([p0, q1, p1], c);
    }
  }

  if (!full && opts.caps) {
    for (const a of [from, to]) {
      const prof = profile(a);
      const ring: Pt[] = [...prof, [prof.at(-1)![0], 0], [prof[0][0], 0]];
      const flat = ring.map(([r, y]) => new Vector2(r, y));
      if (ShapeUtils.isClockWise(flat)) { flat.reverse(); ring.reverse(); }
      const c = opts.color?.(a, -1);
      for (const [i, j, k] of ShapeUtils.triangulateShape(flat, [])) tri([point(a, ring[i]), point(a, ring[j]), point(a, ring[k])], c);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  if (col.length) g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * A deck's cross-section: the concourse and fascia under its front when it is
 * raised over another, then its steps, a riser and a tread a row.
 */
export function deckProfile(d: Deck, rows: number): Pt[] {
  const out: Pt[] = [];
  if (d.floor !== undefined) out.push([d.inner - 0.06, d.floor], [d.inner, d.floor]);
  out.push([d.inner, d.base]);
  for (let j = 0; j < rows; j++) {
    const y = d.base + (d.height * (j + 1)) / rows;
    out.push([d.inner + (d.depth * j) / rows, y], [d.inner + (d.depth * (j + 1)) / rows, y]);
  }
  return out;
}

/** What a strip of deckProfile() is, by its index. */
export function deckStrip(d: Deck, k: number): 'concourse' | 'fascia' | 'riser' | 'tread' | 'cap' {
  if (k < 0) return 'cap';
  const o = d.floor !== undefined ? 2 : 0;
  if (k < o) return k === 0 ? 'concourse' : 'fascia';
  return (k - o) % 2 === 0 ? 'riser' : 'tread';
}

/** Bends a round geometry (round in x and z) to the outline, for the dome. */
export function bendToOutline<G extends BufferGeometry>(g: G, o: Outline): G {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (!r) continue;
    const [nx, nz] = o.around(Math.atan2(z, x), r);
    p.setX(i, nx); p.setZ(i, nz);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
