/**
 * Where a league's app icon is, at a size: generated from its own logo (see
 * appIcon.ts and /api/app-icon), or the LeaguePulse icon for a league still on
 * the default. The logo's version is in the URL, because phones cache app
 * icons hard and a new logo has to be a new address.
 *
 * No imports: used by the layout, the manifest and the install prompt.
 */

export type AppIconSize = 180 | 192 | 512;

export function hasOwnLogo(logoUrl: string | null | undefined): boolean {
  const u = logoUrl?.trim();
  return Boolean(u) && !u!.startsWith('/brand/');
}

function version(logoUrl: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < logoUrl.length; i++) { h ^= logoUrl.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

export function appIconUrl(logoUrl: string | null | undefined, size: AppIconSize, purpose: 'any' | 'maskable' = 'any'): string {
  if (!hasOwnLogo(logoUrl)) {
    if (purpose === 'maskable') return '/brand/leaguepulse-maskable-512.png';
    return size === 180 ? '/brand/leaguepulse-apple.png' : `/brand/leaguepulse-${size}.png`;
  }
  return `/api/app-icon?size=${size}${purpose === 'maskable' ? '&purpose=maskable' : ''}&v=${version(logoUrl!.trim())}`;
}
