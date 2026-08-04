import type { MetadataRoute } from 'next';
import { getTheme } from '@/lib/themeStorage';

// Reflects the league's actual branding (custom logo/name/accent color if set)
// rather than generic LeaguePulse defaults, so what gets added to the home
// screen matches what the league actually sees in the app.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const theme = await getTheme();
  const name = theme.leagueName ? `${theme.leagueName} | League Pulse` : 'League Pulse';
  const icon = theme.logoUrl || '/logo.png';
  // Comma-separated hsl() syntax, not the newer space-separated CSS Color 4
  // form — some Android WebView manifest parsers still choke on the latter.
  const themeColor = `hsl(${theme.primaryH}, ${theme.primaryS}%, 44%)`;

  return {
    name,
    short_name: theme.leagueName || 'League Pulse',
    description: "Your league's home for standings, matchups, history, and more.",
    start_url: '/',
    display: 'standalone',
    background_color: 'hsl(222, 40%, 3%)',
    theme_color: themeColor,
    icons: [
      { src: icon, sizes: 'any', type: 'image/png', purpose: 'any' },
      { src: icon, sizes: 'any', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
