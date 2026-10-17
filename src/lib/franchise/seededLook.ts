/**
 * A stadium of its own for every franchise nobody has dressed yet: a style, a
 * finish, seats, a field, a setting and the rest, picked from the franchise's
 * id, so the same team always has the same stadium (on every page, for every
 * visitor) until its manager makes it theirs. Claiming changes nothing; saving
 * a look in the studio replaces it.
 *
 * Pure and seeded.
 */

import { COLOR_SLOTS, DEFAULT_LOOK, FEATURES, LOOK_OPTIONS, type ColorSlot, type StadiumLook } from './model.ts';

function rng(seed: string) {
  // FNV-1a over the id, then a small mixing generator.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = h >>> 0 || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; };
}

/** One of the options, by weight (the same order as the list); evenly when there are no weights. */
function pick<T extends string>(r: () => number, options: readonly T[], weights?: number[]): T {
  const w = weights ?? options.map(() => 1), total = w.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < options.length; i++) { x -= w[i]; if (x < 0) return options[i]; }
  return options[options.length - 1];
}

const ACCENTS = ['#ffffff', '#15181c', '#d4a017', '#b8bec6', '#1f2a44', '#c8102e', '#f26a21', '#1f7a3a', '#00a3ad'];
// Paint that goes with any team color: neutrals, darks and metals.
const FINISHES: Partial<Record<ColorSlot, string[]>> = {
  roof: ['#f4f6f8', '#2a2e33', '#d9dee3', '#b8bec6'],
  steel: ['#2a2e33', '#b8bec6', '#d4a017', '#f4f6f8'],
  podium: ['#15181c', '#2c3e50', '#3a3f45'],
  trim: ['#f4f6f8', '#15181c', '#d4a017'],
  boards: ['#15181c', '#d9dee3', '#d4a017'],
  posts: ['#f4f6f8', '#d4a017'],
};

export function seededLook(franchiseId: string): StadiumLook {
  const r = rng(`stadium:${franchiseId}`);
  const look: StadiumLook = {
    ...DEFAULT_LOOK,
    style: pick(r, LOOK_OPTIONS.style),
    facade: pick(r, LOOK_OPTIONS.facade),
    accent: r() < 0.5 ? null : pick(r, ACCENTS),
    seats: pick(r, LOOK_OPTIONS.seats, [3, 2, 1.2, 1, 1.4, 1.4]),
    turf: pick(r, LOOK_OPTIONS.turf, [3, 1.5, 1]),
    field: pick(r, LOOK_OPTIONS.field, [16, 1.2, 1.2, 1.6]),
    endZone: pick(r, LOOK_OPTIONS.endZone, [3, 1.2, 1]),
    lights: pick(r, LOOK_OPTIONS.lights, [5, 3.5, 1.5]),
    crowd: pick(r, LOOK_OPTIONS.crowd, [5.5, 2, 1.3, 1.2]),
    setting: pick(r, LOOK_OPTIONS.setting),
    district: pick(r, LOOK_OPTIONS.district),
    tailgate: pick(r, LOOK_OPTIONS.tailgate, [1.5, 5.5, 3]),
    plaza: pick(r, LOOK_OPTIONS.plaza),
    features: FEATURES.filter(f => r() < (f === 'banners' ? 0.7 : 0.35)),
    colors: {},
  };
  // About a third come with a part or two painted.
  if (r() < 0.35) {
    const slots = COLOR_SLOTS.filter(k => FINISHES[k]);
    for (let n = 1 + Math.floor(r() * 2); n > 0; n--) {
      const k = slots[Math.floor(r() * slots.length)];
      look.colors[k] = pick(r, FINISHES[k]!);
    }
  }
  return look;
}

/** Classic team colors, all strong enough to carry a page's accents. */
export const TEAM_COLORS = [
  '#c8102e', '#1f4fa8', '#1f7a3a', '#f26a21', '#5b2a86', '#00a3ad', '#7a1f2b', '#d4a017',
  '#0b2a4a', '#e64d8b', '#4b9cd3', '#b5651d', '#1b1d21', '#6b7d1f', '#004c54', '#ff8200',
  '#8a8d8f', '#0076b6', '#9e1b32', '#f1b82d', '#2e8b57', '#4f2683', '#a05a2c', '#3c5a99',
] as const;

/**
 * A color for every franchise that hasn't picked one, each different from the
 * rest of the league's where the palette allows. Each starts from a color its
 * id points at and takes the next free one, so a team keeps its color unless
 * another unpicked team's start collided with it. Managers' own picks are left
 * as they are (and not avoided: a seeded color may match one).
 */
export function seededColors(ids: string[]): Map<string, string> {
  const out = new Map<string, string>(), used = new Set<string>();
  for (const id of [...new Set(ids)].sort()) {
    const start = Math.floor(rng(`color:${id}`)() * TEAM_COLORS.length);
    let pick: string = TEAM_COLORS[start];
    for (let k = 0; k < TEAM_COLORS.length; k++) {
      const c = TEAM_COLORS[(start + k) % TEAM_COLORS.length];
      if (!used.has(c)) { pick = c; break; }
    }
    used.add(pick);
    out.set(id, pick);
  }
  return out;
}
