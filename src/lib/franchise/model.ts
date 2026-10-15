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

/** How a franchise's stadium looks: cosmetic only, it never touches the economy. */
export interface StadiumLook {
  facade: 'concrete' | 'brick' | 'glass' | 'steel';
  seats: 'team' | 'classic' | 'mono';
  turf: 'stripes' | 'checker' | 'classic';
}
export const LOOK_OPTIONS = {
  facade: ['concrete', 'brick', 'glass', 'steel'],
  seats: ['team', 'classic', 'mono'],
  turf: ['stripes', 'checker', 'classic'],
} as const;
export const DEFAULT_LOOK: StadiumLook = { facade: 'concrete', seats: 'team', turf: 'stripes' };

/** What a manager sets on their franchise. Null means unset. */
export interface FranchiseIdentity {
  color: string | null;
  motto: string | null;
  bio: string | null;
  /** Their name for the stadium ("Fight Milk Coliseum"); the stadium's tier name otherwise. */
  stadiumName: string | null;
  look: StadiumLook | null;
}

export const LIMITS = { motto: 80, bio: 600, stadiumName: 40 } as const;

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
      const pick = <K extends keyof typeof LOOK_OPTIONS>(k: K) =>
        (LOOK_OPTIONS[k] as readonly string[]).includes(String(l[k])) ? l[k] as StadiumLook[K] : null;
      const look = { facade: pick('facade'), seats: pick('seats'), turf: pick('turf') };
      if (!look.facade || !look.seats || !look.turf) return 'Pick a facade, seats and turf.';
      out.look = look as StadiumLook;
    }
  }
  return out;
}
