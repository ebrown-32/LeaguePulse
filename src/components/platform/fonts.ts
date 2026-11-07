import localFont from 'next/font/local';

/**
 * The product site's display face. Archivo's width axis lets headlines and
 * scoreboard numbers run slightly condensed, like a matchday programme, while
 * body copy keeps the app's own text face.
 *
 * Bundled (src/fonts, OFL) rather than fetched from Google Fonts at build time,
 * so a Google Fonts hiccup can't fail a deploy. The file carries both the
 * weight and width axes.
 */
export const productDisplay = localFont({
  src: '../../fonts/archivo-latin-wdth-normal.woff2',
  variable: '--font-lp-display',
  weight: '100 900',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});
