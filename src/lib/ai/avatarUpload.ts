/**
 * Rules for uploaded persona portraits, shared by the browser that produces
 * them and the routes that store and serve them.
 *
 * Portraits live inside the personalities record, which is written to Redis as
 * a single value. That makes size a correctness concern rather than a nicety:
 * a cast of twenty at a megabyte each would exceed the request limit on an
 * Upstash free tier and fail the save for every persona at once, not just the
 * one being edited. Hence a hard per-image cap enforced on both sides.
 */

/** Raster only. The browser re-encodes through a canvas, so this is what it
 *  can actually emit, and it excludes SVG, which can carry markup. */
const ALLOWED = ['image/webp', 'image/png', 'image/jpeg'] as const;

/** Decoded bytes, not base64 characters. Comfortably fits a 256px portrait. */
export const MAX_AVATAR_BYTES = 96 * 1024;

/** Portraits are stored and displayed at this edge length. */
export const AVATAR_PX = 256;

const DATA_URI = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/;

export interface DecodedAvatar {
  mediaType: string;
  bytes: Buffer;
}

/** Decoded size of a base64 payload, without allocating it. */
export function base64Bytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * Validate a portrait data URI.
 *
 * Returns the reason it was rejected, or null when it is acceptable. Callers
 * on the server must treat anything non-null as a hard failure: this is the
 * only thing standing between the personalities record and arbitrary
 * attacker-chosen bytes served back under our own origin.
 */
export function avatarProblem(value: unknown): string | null {
  if (typeof value !== 'string') return 'Portrait must be a string.';
  const m = DATA_URI.exec(value);
  if (!m) return 'Portrait must be a base64 PNG, JPEG or WebP data URI.';
  if (!(ALLOWED as readonly string[]).includes(m[1])) return `Unsupported image type ${m[1]}.`;
  const size = base64Bytes(m[2]);
  if (size > MAX_AVATAR_BYTES) {
    return `Portrait is ${Math.round(size / 1024)}KB; the limit is ${MAX_AVATAR_BYTES / 1024}KB.`;
  }
  return null;
}

/** Split a validated data URI into the parts a Response needs. */
export function decodeAvatar(value: string): DecodedAvatar | null {
  const m = DATA_URI.exec(value);
  if (!m) return null;
  return { mediaType: m[1], bytes: Buffer.from(m[2], 'base64') };
}
