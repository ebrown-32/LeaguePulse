'use client';

import { AVATAR_PX, MAX_AVATAR_BYTES, base64Bytes } from './avatarUpload';

/**
 * Turn a file the admin picked into a portrait small enough to store.
 *
 * Every image is redrawn onto a canvas and re-encoded rather than being read
 * and embedded as-is. That does three jobs at once: it bounds the size (phone
 * photos are several megabytes and the record holding them has a hard limit),
 * it squares off the crop so the cast looks uniform, and it discards whatever
 * the original file contained beyond pixels, including EXIF location data from
 * a camera roll and any markup in an SVG. What comes out is only ever raster.
 */

/** Encoders to try in order; the first the browser supports and that fits wins. */
const ENCODERS: { type: string; quality: number }[] = [
  { type: 'image/webp', quality: 0.85 },
  { type: 'image/webp', quality: 0.7 },
  { type: 'image/webp', quality: 0.55 },
  { type: 'image/jpeg', quality: 0.82 },
  { type: 'image/jpeg', quality: 0.65 },
];

export class AvatarTooLargeError extends Error {}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image.')); };
    img.src = url;
  });
}

/**
 * Read `file` and return a square data URI at most `MAX_AVATAR_BYTES` decoded.
 * Throws with a message fit to show the admin.
 */
export async function fileToAvatarDataUri(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');

  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error('That image has no dimensions.');

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process the image.');

  ctx.imageSmoothingQuality = 'high';
  // Centre crop to a square, so a portrait or landscape photo keeps its middle
  // rather than being squashed into the circle the UI renders it in.
  ctx.drawImage(
    img,
    (img.naturalWidth - side) / 2,
    (img.naturalHeight - side) / 2,
    side, side,
    0, 0, AVATAR_PX, AVATAR_PX,
  );

  for (const enc of ENCODERS) {
    const uri = canvas.toDataURL(enc.type, enc.quality);
    // A browser without the codec silently hands back PNG; skip that result
    // rather than mislabelling it, and let a later entry handle it.
    if (!uri.startsWith(`data:${enc.type};base64,`)) continue;
    if (base64Bytes(uri.split(',')[1] ?? '') <= MAX_AVATAR_BYTES) return uri;
  }

  // Last resort: PNG is always available, and at 256px it usually fits.
  const png = canvas.toDataURL('image/png');
  if (base64Bytes(png.split(',')[1] ?? '') <= MAX_AVATAR_BYTES) return png;

  throw new AvatarTooLargeError(
    'That image would not compress small enough. Try a simpler or less detailed picture.',
  );
}
