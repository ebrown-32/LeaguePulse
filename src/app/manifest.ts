import type { MetadataRoute } from 'next';
import { getTheme } from '@/lib/themeStorage';
import { appIconUrl } from '@/lib/appIconUrl';

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
  // App icons drawn from the league's own logo (or the LeaguePulse icons for
  // a league on the default): sized PNGs, and a maskable one Android can crop
  // to its own shape without cutting into the logo.
  const icon = (size: 192 | 512, purpose: 'any' | 'maskable' = 'any') =>
    ({ src: appIconUrl(theme.logoUrl, size, purpose), sizes: `${size}x${size}`, type: 'image/png', purpose });
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
    icons: [icon(192), icon(512), icon(512, 'maskable')],
  };
}
