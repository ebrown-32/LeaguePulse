/**
 * The LeaguePulse mark, "Turf Line": a turf-green tile with a heartbeat drawn across it like a
 * yard line, ending in a signal-orange live dot. One source for every place it is drawn (the
 * product's components, league sites' "Powered by", share images and the icon files in
 * public/brand, rendered from these numbers).
 *
 * Two drawings of the same mark on a 64 unit grid: `regular`, and `small` for 24 px and under
 * (a favicon), where the line is heavier and the dot larger so both survive at 16 px.
 */

export const BRAND = {
  turf: '#0A7550',
  turfLight: '#3DD598',
  paper: '#F7F6F2',
  ink: '#121417',
  signal: '#EE5A2E',
} as const;

export interface MarkDrawing { line: string; stroke: number; dot: { cx: number; cy: number; r: number } }

export const MARK: { regular: MarkDrawing; small: MarkDrawing } = {
  regular: { line: 'M9 35H21L27 17L35 47L40 35H44', stroke: 5, dot: { cx: 51.5, cy: 35, r: 5.5 } },
  small: { line: 'M8 35H20L27 15L35 49L40 35H43', stroke: 7.5, dot: { cx: 52, cy: 35, r: 7 } },
};

/** The drawing for a mark shown `px` wide. */
export const markFor = (px: number): MarkDrawing => (px <= 24 ? MARK.small : MARK.regular);

/**
 * The mark as an SVG document: the app icon (rounded tile), or `maskable` (full bleed, the
 * drawing held inside the safe zone a launcher may crop to a circle).
 */
export function markSvg(o: { small?: boolean; maskable?: boolean; tile?: string; line?: string } = {}): string {
  const d = o.small ? MARK.small : MARK.regular;
  const tile = o.tile ?? BRAND.turf, line = o.line ?? BRAND.paper;
  const art = `<path d="${d.line}" fill="none" stroke="${line}" stroke-width="${d.stroke}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${d.dot.cx}" cy="${d.dot.cy}" r="${d.dot.r}" fill="${BRAND.signal}"/>`;
  return o.maskable
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${tile}"/><g transform="translate(10.24 10.24) scale(0.68)">${art}</g></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${tile}"/>${art}</svg>`;
}
