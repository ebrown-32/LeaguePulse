'use client';

/**
 * How much the 3D stadium draws, fitted to the device. Phones and small
 * laptops get softer (or no) shadows and a thinner crowd of cars, fans and
 * trees; a desktop gets everything. The view also steps its resolution down
 * (and back up) as it runs, if frames start to drop.
 *
 * Resolution is the one thing phones keep: the view is small on a phone, so
 * even two device pixels per CSS pixel is fewer pixels than a desktop draws,
 * and below that a phone's dense screen shows every pixel as grain.
 */

export type Tier = 'high' | 'medium' | 'low';

export interface Quality {
  tier: Tier;
  /** The most device pixels per CSS pixel the canvas uses. */
  maxDpr: number;
  /** The fewest it will step down to when frames drop: below this it looks grainy. */
  minDpr: number;
  /** Shadow map size, or 0 for no shadows. */
  shadows: 0 | 1024 | 2048;
  /** Multisampling: only worth it below about 1.5 device pixels per CSS pixel. */
  antialias: boolean;
  /** Share of the moving and scattered detail to draw: cars, fans, outskirt trees, smoke. */
  detail: number;
}

export const QUALITY: Record<Tier, Omit<Quality, 'tier' | 'antialias'>> = {
  high: { maxDpr: 2, minDpr: 1, shadows: 2048, detail: 1 },
  medium: { maxDpr: 1.5, minDpr: 1, shadows: 1024, detail: 0.6 },
  low: { maxDpr: 1, minDpr: 0.75, shadows: 0, detail: 0.35 },
};

/** A phone's small view at a phone's density: sharp, and still fewer pixels than a desktop. */
const PHONE_DPR = { max: 2, min: 1.5 };

/** A first guess from what the browser says about the device; the frame rate refines it as the view runs. */
export function detectQuality(): Quality {
  if (typeof window === 'undefined') return { tier: 'high', antialias: true, ...QUALITY.high };
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const memory = nav.deviceMemory ?? 8, cores = nav.hardwareConcurrency ?? 8;
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const small = Math.min(window.screen?.width ?? 1920, window.screen?.height ?? 1080) < 700;
  const saveData = nav.connection?.saveData ?? false;
  // Safari reports no memory and only a couple of cores, whatever the phone: a core count alone
  // doesn't mark an iPhone as slow (it would draw a third of its pixels).
  const reported = nav.deviceMemory !== undefined;
  let tier: Tier = 'high';
  if (saveData || memory <= 2 || (reported && cores <= 2)) tier = 'low';
  else if (touch || small || memory <= 4 || cores <= 4) tier = memory <= 3 || (reported && cores <= 4) ? 'low' : 'medium';
  const q = { ...QUALITY[tier] };
  if (touch && small && !saveData) { q.maxDpr = PHONE_DPR.max; q.minDpr = PHONE_DPR.min; }
  const dpr = Math.min(window.devicePixelRatio || 1, q.maxDpr);
  return { tier, ...q, minDpr: Math.min(q.minDpr, dpr), antialias: dpr < 2 };
}
