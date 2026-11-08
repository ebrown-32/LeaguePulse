/**
 * How the league's trophy looks (components/trophies LeagueTrophy), as the league's admin set it
 * in the admin panel's Trophy tab, kept in the league's settings (api/trophy). Unset, the default:
 * gold on obsidian, a crystal football, wing handles, everything glowing in the league's colour.
 *
 * Client-safe: just the shape, the choices and the checking.
 */

export const TROPHY_METALS = ['gold', 'silver', 'rose', 'black'] as const;
export const TROPHY_BASES = ['obsidian', 'marble', 'walnut'] as const;
export const TROPHY_CROWNS = ['football', 'orb', 'crown', 'star', 'flame'] as const;
export const TROPHY_HANDLES = ['wings', 'loops', 'none'] as const;

export interface TrophyStyle {
  /** The trophy's own name, engraved on its plaque ("The Gazette Cup"). Empty: the league's name. */
  name: string;
  metal: (typeof TROPHY_METALS)[number];
  base: (typeof TROPHY_BASES)[number];
  /** What floats above the chalice. */
  crown: (typeof TROPHY_CROWNS)[number];
  handles: (typeof TROPHY_HANDLES)[number];
  /** The glow: the league's own colour, or one of the admin's (#rrggbb). */
  glow: 'league' | string;
  /** The rings of light round the crown, the motes rising, the runes turning on the plinth. */
  orbits: boolean;
  motes: boolean;
  runes: boolean;
}

export const DEFAULT_TROPHY: TrophyStyle = {
  name: '', metal: 'gold', base: 'obsidian', crown: 'football', handles: 'wings', glow: 'league',
  orbits: true, motes: true, runes: true,
};

export const TROPHY_LABELS = {
  metal: { gold: 'Gold', silver: 'Silver', rose: 'Rose gold', black: 'Black chrome' },
  base: { obsidian: 'Obsidian', marble: 'Marble', walnut: 'Walnut' },
  crown: { football: 'Crystal football', orb: 'Crystal orb', crown: 'Crown', star: 'Star', flame: 'Eternal flame' },
  handles: { wings: 'Wings', loops: 'Loops', none: 'None' },
} as const;

const oneOf = <T extends readonly string[]>(xs: T, v: unknown, d: T[number]): T[number] => (typeof v === 'string' && (xs as readonly string[]).includes(v) ? v : d);

/** A saved or submitted style, checked: anything unknown falls back to the default. */
export function cleanTrophyStyle(raw: unknown): TrophyStyle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const glow = typeof r.glow === 'string' && /^#[0-9a-f]{6}$/i.test(r.glow) ? r.glow.toLowerCase() : 'league';
  return {
    name: typeof r.name === 'string' ? r.name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) : '',
    metal: oneOf(TROPHY_METALS, r.metal, DEFAULT_TROPHY.metal),
    base: oneOf(TROPHY_BASES, r.base, DEFAULT_TROPHY.base),
    crown: oneOf(TROPHY_CROWNS, r.crown, DEFAULT_TROPHY.crown),
    handles: oneOf(TROPHY_HANDLES, r.handles, DEFAULT_TROPHY.handles),
    glow,
    orbits: r.orbits !== false, motes: r.motes !== false, runes: r.runes !== false,
  };
}
