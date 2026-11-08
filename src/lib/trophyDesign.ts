/**
 * How a season's championship ring and the league's trophy look, decided from the season and the
 * league, so the same title always gets the same ring and no two seasons share one.
 *
 * Pure: no rendering here (components/trophies draws them). Used for every season without a
 * hand-made ring model (lib/ringModels), past or still to be played.
 */

export type Metal = 'gold' | 'white' | 'rose';
export type TopShape = 'round' | 'octagon' | 'square' | 'shield';
export type BandStyle = 'smooth' | 'ridged' | 'faceted';

export interface RingDesign {
  metal: Metal;
  /** The top's enamel field: the league's colour, or a deep classic when there isn't one. */
  enamel: string;
  /** The centre stone. */
  stone: string;
  top: TopShape;
  band: BandStyle;
  /** Small stones in the halo around the centre. */
  halo: number;
  /** Prongs holding the centre stone. */
  prongs: 4 | 6;
  /** A second, raised tier on the top. */
  tiered: boolean;
}

export const METALS: Record<Metal, { color: string; roughness: number }> = {
  gold: { color: '#E8B04B', roughness: 0.16 },
  white: { color: '#D9DEE6', roughness: 0.12 },
  rose: { color: '#E3A285', roughness: 0.16 },
};

const STONES = ['#F4F8FF', '#F4F8FF', '#FFD86B', '#7FB8FF', '#FF6B7E', '#7EF0C2'];
const CLASSIC_ENAMELS = ['#14365E', '#6B1420', '#0F4D3A', '#2A2A33'];

/** A seeded generator: the same seed gives the same sequence. */
export function seeded(seed: string): () => number {
  let s = 2166136261;
  for (const c of seed) { s ^= c.charCodeAt(0); s = Math.imul(s, 16777619) >>> 0; }
  s ||= 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

/**
 * A season's ring. `accent` is the league's own colour (CSS), used for the enamel most seasons, so
 * a league's rings read as a set; every few seasons one breaks from it.
 */
export function ringDesign(season: string, league: string, accent?: string | null): RingDesign {
  const r = seeded(`${league}::${season}`);
  const metal = pick(r, ['gold', 'gold', 'gold', 'white', 'rose'] as const);
  const classic = r() < 0.25 || !accent;
  return {
    metal,
    enamel: classic ? pick(r, CLASSIC_ENAMELS) : accent!,
    stone: pick(r, STONES),
    top: pick(r, ['round', 'octagon', 'square', 'shield'] as const),
    band: pick(r, ['smooth', 'ridged', 'faceted'] as const),
    halo: pick(r, [12, 14, 16, 18, 20] as const),
    prongs: r() < 0.5 ? 4 : 6,
    tiered: r() < 0.55,
  };
}

/** The league's colour from the page's theme (its --primary, "H S% L%"), for three.js. */
export function themeAccent(): string | null {
  if (typeof document === 'undefined') return null;
  const v = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  const m = /^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(v);
  return m ? `hsl(${m[1]}, ${m[2]}%, ${m[3]}%)` : null;
}
