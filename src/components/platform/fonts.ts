import { Archivo } from 'next/font/google';

/**
 * The product site's display face. Archivo's width axis lets headlines and
 * scoreboard numbers run slightly condensed, like a matchday programme, while
 * body copy keeps the app's own text face.
 */
export const productDisplay = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-lp-display',
  display: 'swap',
});
