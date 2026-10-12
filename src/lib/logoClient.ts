'use client';

/**
 * Turn an uploaded logo into something small enough to store.
 *
 * Unlike a portrait, a logo keeps its shape and its transparency: it is fitted
 * inside a square rather than cropped to one, and encoded as WebP (which keeps
 * an alpha channel) with PNG as the fallback. Redrawing on a canvas also
 * strips anything in the file beyond pixels, such as markup in an SVG.
 */

export const LOGO_PX = 512;
export const MAX_LOGO_BYTES = 256 * 1024;

const ENCODERS: { type: string; quality?: number }[] = [
  { type: 'image/webp', quality: 0.9 },
  { type: 'image/webp', quality: 0.75 },
  { type: 'image/png' },
];

const bytesOf = (dataUri: string) => Math.floor((dataUri.length - dataUri.indexOf(',') - 1) * 0.75);

export async function fileToLogoDataUri(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file is not an image.'));
      i.src = url;
    });
    const scale = Math.min(1, LOGO_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process the image.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    for (const e of ENCODERS) {
      const out = canvas.toDataURL(e.type, e.quality);
      if (out.startsWith(`data:${e.type}`) && bytesOf(out) <= MAX_LOGO_BYTES) return out;
    }
    throw new Error('That logo is too detailed to store. Try a simpler or smaller image.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
