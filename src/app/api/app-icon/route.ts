/**
 * The league's app icon, from its own logo (see src/lib/appIcon.ts):
 * /api/app-icon?size=192&purpose=any&v=<logo version>.
 *
 * Served for the league at this address. A league still on the LeaguePulse
 * default gets the LeaguePulse icon. The version in the URL changes with the
 * logo, so each version is cached for good.
 */

import { getTheme } from '@/lib/themeStorage';
import { leagueLogoBytes, renderAppIcon, type IconPurpose } from '@/lib/appIcon';

export const dynamic = 'force-dynamic';

const SIZES = new Set([180, 192, 512]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const size = Number(url.searchParams.get('size'));
  if (!SIZES.has(size)) return new Response(null, { status: 404 });
  const purpose: IconPurpose = url.searchParams.get('purpose') === 'maskable' ? 'maskable' : 'any';
  const cache = url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';

  const theme = await getTheme().catch(() => null);
  const logo = await leagueLogoBytes(theme?.logoUrl, url.origin);
  if (logo) {
    try {
      const png = await renderAppIcon(logo, size, purpose);
      return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': cache } });
    } catch (err) {
      console.error('[app-icon] could not draw the logo', err);
    }
  }
  // The LeaguePulse icon, as shipped.
  const file = purpose === 'maskable' ? 'leaguepulse-maskable-512.png' : size === 180 ? 'leaguepulse-apple.png' : `leaguepulse-${size === 512 ? 512 : 192}.png`;
  return Response.redirect(new URL(`/brand/${file}`, url.origin), 302);
}
