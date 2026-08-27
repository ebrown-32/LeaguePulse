/**
 * DiceBear avatars for the AI personalities.
 *
 * Generated from a seed rather than stored as files, so a persona's face is
 * stable, free, and changes only when the admin changes the style or seed.
 * SVG is requested because DiceBear allows 50 SVG requests a second against 10
 * for raster formats, and it stays crisp at every size the feed uses.
 */

const BASE = 'https://api.dicebear.com/10.x';

/** Styles offered in the admin picker. Curated for faces that read as people
 *  or mascots at small sizes; the abstract pattern styles look like noise in a
 *  byline. */
export const AVATAR_STYLES = [
  'adventurer',
  'avataaars',
  'big-smile',
  'bottts',
  'croodles',
  'fun-emoji',
  'lorelei',
  'micah',
  'miniavs',
  'notionists',
  'open-peeps',
  'personas',
  'pixel-art',
  'thumbs',
] as const;

export type AvatarStyle = (typeof AVATAR_STYLES)[number];

export const DEFAULT_AVATAR_STYLE: AvatarStyle = 'notionists';

/**
 * The style the cast uses. avataaars is the one with real wardrobe: blazers,
 * hoodies, hats, glasses and facial hair, which is what lets each writer look
 * like a distinct person rather than a random blob.
 */
export const CAST_STYLE: AvatarStyle = 'avataaars';

export interface AvatarConfig {
  /**
   * An uploaded portrait, stored as a `data:image/...;base64,` URI.
   *
   * Takes precedence over every DiceBear setting below: an admin who uploads a
   * real photo means it, and the generated face becomes the fallback rather
   * than a competing option.
   */
  avatarImage?: string;
  /** DiceBear style id. */
  avatarStyle?: string;
  /** Seed controlling which face inside that style. Defaults to the persona id. */
  avatarSeed?: string;
  /**
   * Extra DiceBear options for this persona, e.g. `{ clothing: 'blazerAndShirt' }`.
   *
   * A seed alone gives a random face, which is fine for anonymity and useless
   * for a cast of characters: a loud anchor in a cowboy hat and a buttoned-up
   * commissioner should not look interchangeable. Pinning hair, clothing and
   * expression per persona is what makes them recognisable.
   */
  avatarOptions?: Record<string, string>;
}

function isKnownStyle(style: string | undefined): style is AvatarStyle {
  return Boolean(style) && (AVATAR_STYLES as readonly string[]).includes(style!);
}

/** Where an uploaded portrait is served from. */
export const UPLOADED_AVATAR_PREFIX = '/api/ai/avatar/';

/** djb2. Only needs to change when the bytes change, not to be collision-proof. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** True for the URLs `personaAvatarUrl` hands back for uploaded portraits. */
export function isUploadedAvatar(url: string | undefined): boolean {
  return Boolean(url?.startsWith(UPLOADED_AVATAR_PREFIX));
}

/**
 * Build the avatar URL for a persona.
 *
 * `fallbackSeed` is the persona id, so an admin who never touches the avatar
 * settings still gets a distinct, stable face per personality.
 */
export function personaAvatarUrl(
  persona: AvatarConfig & { id?: string; name?: string },
  opts: { size?: number } = {},
): string {
  // An uploaded portrait is served by reference, never inlined. This URL is
  // stored on every feed post at generation time; a ~20KB data URI there would
  // multiply across the whole post store. Going through a route keeps the post
  // record tiny and means re-uploading a portrait updates posts already
  // published, which inlining would not.
  if (persona.avatarImage && persona.id) {
    return `${UPLOADED_AVATAR_PREFIX}${encodeURIComponent(persona.id)}?v=${hash(persona.avatarImage)}`;
  }

  const style = isKnownStyle(persona.avatarStyle) ? persona.avatarStyle : DEFAULT_AVATAR_STYLE;
  const seed = (persona.avatarSeed || persona.id || persona.name || 'leaguepulse').trim();
  const params = new URLSearchParams({ seed });
  if (opts.size) params.set('size', String(opts.size));
  for (const [k, v] of Object.entries(persona.avatarOptions ?? {})) {
    if (v) params.set(k, v);
  }
  return `${BASE}/${style}/svg?${params}`;
}
