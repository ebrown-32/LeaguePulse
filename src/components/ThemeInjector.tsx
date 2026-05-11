import { unstable_noStore as noStore } from 'next/cache';
import { getTheme } from '@/lib/themeStorage';
import { fontPairs, type TxColors, DEFAULT_TX_DARK, DEFAULT_TX_LIGHT } from '@/lib/themeConfig';

/**
 * Server component. Fetches the admin-saved theme from storage and injects
 * CSS variable overrides + the correct Google Font <link>.
 * noStore() ensures this always reads the latest saved theme, never cached.
 */
export async function ThemeInjector() {
  noStore();
  const theme = await getTheme();
  const pair  = fontPairs[theme.fontPair] ?? fontPairs['bricolage-dm'];

  const hLight = theme.primaryHLight ?? theme.primaryH;
  const sLight = theme.primarySLight ?? theme.primaryS;
  // Light mode: lower lightness keeps the accent legible on white
  const primaryLight = `${hLight} ${sLight}% 35%`;
  // Dark mode: brighter accent pops on the dark background
  const primaryDark  = `${theme.primaryH} ${theme.primaryS}% 44%`;

  const radius = `${theme.radiusRem}rem`;

  function r(hex: string, a: number) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function txVars(c: TxColors) {
    return `
      --tx-trade:        ${c.trade};
      --tx-trade-muted:  ${r(c.trade, 0.10)};
      --tx-trade-dim:    ${r(c.trade, 0.30)};
      --tx-trade-grad:   linear-gradient(to right,${r(c.trade,0.80)},${r(c.trade,0.40)},transparent);
      --tx-waiver:       ${c.waiver};
      --tx-waiver-muted: ${r(c.waiver, 0.10)};
      --tx-waiver-dim:   ${r(c.waiver, 0.30)};
      --tx-waiver-grad:  linear-gradient(to right,${r(c.waiver,0.80)},${r(c.waiver,0.40)},transparent);
      --tx-fa:           ${c.freeAgent};
      --tx-fa-muted:     ${r(c.freeAgent, 0.10)};
      --tx-fa-dim:       ${r(c.freeAgent, 0.30)};
      --tx-fa-grad:      linear-gradient(to right,${r(c.freeAgent,0.80)},${r(c.freeAgent,0.40)},transparent);
    `;
  }

  const light = theme.txColorsLight ?? DEFAULT_TX_LIGHT;
  const dark  = theme.txColorsDark  ?? DEFAULT_TX_DARK;

  const css = `
    :root {
      --primary: ${primaryLight};
      --ring:    ${primaryLight};
      --radius:  ${radius};
      --font-display: '${pair.display}';
      --font-body:    '${pair.body}';
      ${txVars(light)}
    }
    .dark {
      --primary: ${primaryDark};
      --ring:    ${primaryDark};
      ${txVars(dark)}
    }
  `.trim();

  const fontsUrl = `https://fonts.googleapis.com/css2?${pair.googleQuery}&display=swap`;

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* crossOrigin must be empty string for anonymous CORS */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href={fontsUrl} rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </>
  );
}
