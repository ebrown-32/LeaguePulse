/**
 * Franchise shapes and the rules for what a manager may set. Pure, so the
 * browser and the tests share them with the server.
 */

export type ClaimStatus = 'pending' | 'approved' | 'declined' | 'withdrawn';

export interface Claim {
  id: string;
  franchiseId: string;
  /** The franchise's name when the claim was made, for the admin's list. */
  teamName: string;
  userId: string;
  email: string;
  name: string;
  /** What the claimant wrote to the admin, if anything. */
  note: string | null;
  status: ClaimStatus;
  at: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

/**
 * How a franchise's stadium looks: cosmetic only, it never touches the economy.
 * The style is the building itself (lib/franchise/stadiumStyles says how each
 * one grows with the upgrades); the rest dresses it.
 */
export interface StadiumLook {
  style: 'bowl' | 'horseshoe' | 'grandstand' | 'dome' | 'cantilever' | 'coliseum';
  facade: 'concrete' | 'brick' | 'glass' | 'steel' | 'stone';
  /** The second team color, for trim, split seats, flags and the end zone lettering. Null picks white or black to suit. */
  accent: string | null;
  seats: 'team' | 'split' | 'classic' | 'mono';
  /** How the grass is mowed. */
  turf: 'stripes' | 'checker' | 'plain';
  field: 'green' | 'blue' | 'black' | 'team';
  endZone: 'color' | 'argyle' | 'plain';
  /** Painted in both end zones; the team's name when null. */
  endZoneText: string | null;
  /** For styles with a roof that moves: open, closed, or closed at night and in winter. */
  roof: 'auto' | 'open' | 'closed';
  lights: 'warm' | 'white' | 'team';
  crowd: 'mixed' | 'colorout' | 'whiteout' | 'blackout';
  setting: 'city' | 'park' | 'waterfront' | 'mountains' | 'desert';
}
export const LOOK_OPTIONS = {
  style: ['bowl', 'horseshoe', 'grandstand', 'dome', 'cantilever', 'coliseum'],
  facade: ['concrete', 'brick', 'glass', 'steel', 'stone'],
  seats: ['team', 'split', 'classic', 'mono'],
  turf: ['stripes', 'checker', 'plain'],
  field: ['green', 'blue', 'black', 'team'],
  endZone: ['color', 'argyle', 'plain'],
  roof: ['auto', 'open', 'closed'],
  lights: ['warm', 'white', 'team'],
  crowd: ['mixed', 'colorout', 'whiteout', 'blackout'],
  setting: ['city', 'park', 'waterfront', 'mountains', 'desert'],
} as const;
type Choice = keyof typeof LOOK_OPTIONS;
export const DEFAULT_LOOK: StadiumLook = {
  style: 'bowl', facade: 'concrete', accent: null, seats: 'team', turf: 'stripes', field: 'green', endZone: 'color',
  endZoneText: null, roof: 'auto', lights: 'warm', crowd: 'mixed', setting: 'city',
};

/**
 * A stored look, whatever it was saved as, made whole: looks saved before a
 * choice existed get its default (the first looks had a facade, seats and a
 * turf of 'stripes', 'checker' or 'classic', the last meaning grass end zones
 * with diagonals). Unknown values fall back too, so a look never breaks a page.
 */
export function normalizeLook(input: unknown): StadiumLook {
  const l = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_LOOK };
  for (const k of Object.keys(LOOK_OPTIONS) as Choice[]) {
    if ((LOOK_OPTIONS[k] as readonly string[]).includes(String(l[k]))) (out as Record<string, unknown>)[k] = l[k];
  }
  if (l.turf === 'classic') { out.turf = 'plain'; if (!l.endZone) out.endZone = 'argyle'; }
  if (typeof l.accent === 'string' && HEX.test(l.accent)) out.accent = l.accent.toLowerCase();
  if (typeof l.endZoneText === 'string') out.endZoneText = cleanEndZone(l.endZoneText);
  return out;
}

const cleanEndZone = (s: string) => s.replace(/[^\p{L}\p{N} '&.!-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.endZoneText) || null;

/** What a manager sets on their franchise. Null means unset. */
export interface FranchiseIdentity {
  color: string | null;
  motto: string | null;
  bio: string | null;
  /** Their name for the stadium ("Fight Milk Coliseum"); the stadium's tier name otherwise. */
  stadiumName: string | null;
  look: StadiumLook | null;
}

export const LIMITS = { motto: 80, bio: 600, stadiumName: 40, endZoneText: 24 } as const;

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A manager's edit, checked: the fields it sets (only those it names, so
 * saving the stadium's look leaves the motto alone), or what is wrong with it.
 */
export function checkIdentity(input: unknown): Partial<FranchiseIdentity> | string {
  const o = (input ?? {}) as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(o, k);
  const out: Partial<FranchiseIdentity> = {};
  const text = (v: unknown, max: number, what: string): string | null | Error => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string') return new Error(`The ${what} must be text.`);
    const s = v.replace(/\s+/g, ' ').trim();
    if (s.length > max) return new Error(`Keep the ${what} under ${max} characters.`);
    return s || null;
  };
  if (has('motto')) {
    const motto = text(o.motto, LIMITS.motto, 'motto');
    if (motto instanceof Error) return motto.message;
    out.motto = motto;
  }
  if (has('stadiumName')) {
    const name = text(o.stadiumName, LIMITS.stadiumName, 'stadium name');
    if (name instanceof Error) return name.message;
    out.stadiumName = name;
  }
  if (has('bio')) {
    // The bio keeps its paragraphs.
    const bioRaw = typeof o.bio === 'string' ? o.bio.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : o.bio;
    if (bioRaw !== null && bioRaw !== undefined && bioRaw !== '' && typeof bioRaw !== 'string') return 'The bio must be text.';
    if (typeof bioRaw === 'string' && bioRaw.length > LIMITS.bio) return `Keep the bio under ${LIMITS.bio} characters.`;
    out.bio = (bioRaw as string) || null;
  }
  if (has('color')) {
    const color = o.color === null || o.color === undefined || o.color === '' ? null : String(o.color);
    if (color !== null && !HEX.test(color)) return 'Pick a color.';
    out.color = color?.toLowerCase() ?? null;
  }
  if (has('look')) {
    if (o.look === null) out.look = null;
    else {
      const l = (o.look ?? {}) as Record<string, unknown>;
      // Every choice it names must be a known one; what it leaves out takes the default.
      for (const k of Object.keys(LOOK_OPTIONS) as Choice[]) {
        if (l[k] !== undefined && !(LOOK_OPTIONS[k] as readonly string[]).includes(String(l[k]))) return `Pick a ${k === 'endZone' ? 'end zone' : k} from the list.`;
      }
      if (l.accent !== undefined && l.accent !== null && l.accent !== '' && !HEX.test(String(l.accent))) return 'Pick an accent color.';
      if (l.endZoneText !== undefined && l.endZoneText !== null && typeof l.endZoneText !== 'string') return 'The end zone text must be text.';
      if (typeof l.endZoneText === 'string' && l.endZoneText.trim().length > LIMITS.endZoneText) return `Keep the end zone text under ${LIMITS.endZoneText} characters.`;
      out.look = normalizeLook(l);
    }
  }
  return out;
}
