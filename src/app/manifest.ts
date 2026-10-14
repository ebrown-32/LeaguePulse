import type { MetadataRoute } from 'next';
import { getTheme } from '@/lib/themeStorage';

// Reflects the league's actual branding (custom logo/name/accent color if set)
// rather than generic LeaguePulse defaults, so what gets added to the home
// screen matches what the league actually sees in the app.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const theme = await getTheme();
  // Hosted: the league's own name until its admin sets one.
  const tenantName = process.env.LP_HOSTED === '1'
    ? (await (await import('@/lib/tenant/context')).currentTenant().catch(() => null))?.leagueName?.trim() || null
    : null;
  const leagueName = theme.leagueName?.trim() || tenantName;
  const name = leagueName ? `${leagueName} | LeaguePulse` : 'League Pulse';
  const icon = theme.logoUrl || '/logo.png';
  // The LeaguePulse default ships proper app icons: sized PNGs and a maskable
  // one Android can crop to its own shape.
  const brandIcons = icon.startsWith('/brand/');
  // Comma-separated hsl() syntax, not the newer space-separated CSS Color 4
  // form — some Android WebView manifest parsers still choke on the latter.
  const themeColor = `hsl(${theme.primaryH}, ${theme.primaryS}%, 44%)`;

  return {
    name,
    short_name: leagueName || 'League Pulse',
    description: "Your league's home for standings, matchups, history, and more.",
    start_url: '/',
    display: 'standalone',
    background_color: 'hsl(222, 40%, 3%)',
    theme_color: themeColor,
    icons: brandIcons
      ? [
          { src: '/brand/leaguepulse-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/brand/leaguepulse-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/brand/leaguepulse-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      : [
          { src: icon, sizes: 'any', type: 'image/png', purpose: 'any' },
          { src: icon, sizes: 'any', type: 'image/png', purpose: 'maskable' },
        ],
  };
}
