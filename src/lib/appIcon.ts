/**
 * A league's app icon, made from its own logo: what its site looks like on a
 * phone's home screen once installed.
 *
 * Phones want a square, opaque PNG at fixed sizes (180 for iPhone, 192 and
 * 512 for Android), and Android also wants a "maskable" one it can crop to
 * its own shape. An uploaded logo is none of those: any shape, any format,
 * often transparent (which iOS fills with black). So it is drawn onto a
 * proper icon:
 *
 *   a logo with transparency   centred on a solid square: white, or near
 *                              black when the logo is mostly light, so a
 *                              white crest does not vanish; the maskable one
 *                              with more room, inside the circle Android may
 *                              cut to
 *   an opaque logo (a photo,   fills the icon edge to edge, as an app icon
 *   a ready-made tile)         would, maskable too
 *
 * Server only (sharp).
 */

import sharp from 'sharp';

/** The league's own logo as image bytes, or null when it uses the LeaguePulse default (or it cannot be read). */
export async function leagueLogoBytes(logoUrl: string | null | undefined, origin: string): Promise<Buffer | null> {
  const u = logoUrl?.trim();
  if (!u || u.startsWith('/brand/')) return null;
  if (u.startsWith('/api/league-logo')) {
    const { getRedis } = await import('@/lib/redisClient');
    const dataUri = await getRedis().client?.get('league_logo').catch(() => null);
    const m = dataUri ? /^data:image\/[a-z+]+;base64,(.+)$/.exec(dataUri) : null;
    return m ? Buffer.from(m[1], 'base64') : null;
  }
  const res = await fetch(u.startsWith('/') ? `${origin}${u}` : u, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res?.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
  return Buffer.from(await res.arrayBuffer());
}

export type IconPurpose = 'any' | 'maskable';

export async function renderAppIcon(logo: Buffer, size: number, purpose: IconPurpose): Promise<Buffer> {
  const img = sharp(logo, { density: 384 }); // density: SVG logos rasterise sharply
  const stats = await img.clone().stats();
  const opaque = stats.isOpaque;

  if (opaque) {
    // A ready-made tile fills the icon, maskable included: it was made to be
    // seen edge to edge, and padding it with one colour shows a seam against
    // anything but a flat background.
    return img.clone().resize(size, size, { fit: 'cover' }).flatten({ background: '#ffffff' }).png().toBuffer();
  }

  // Transparent: on white, or on near-black when the logo itself is mostly
  // light. Brightness of the visible pixels only: the clear ones are no colour.
  const { data } = await img.clone().resize(64, 64, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let lum = 0, weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    lum += a * (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    weight += a;
  }
  const light = weight > 0 && lum / weight > 0.8;
  const background = light ? { r: 18, g: 20, b: 23 } : { r: 255, g: 255, b: 255 };
  const inner = Math.round(size * (purpose === 'maskable' ? 0.62 : 0.78));
  const art = await img.clone().resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: art, gravity: 'centre' }]).png().toBuffer();
}
