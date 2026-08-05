import { unstable_noStore as noStore } from 'next/cache';
import { getTheme } from '@/lib/themeStorage';
import { buildThemeCss, fontPairs, DEFAULT_THEME } from '@/lib/themeConfig';

/**
 * Server component. Fetches the admin-saved theme from storage and injects
 * the CSS variable overrides (full surface palette + accent + radius + fonts)
 * plus the matching Google Font <link>.
 *
 * The CSS itself is built by buildThemeCss() in themeConfig.ts, which the
 * admin panel's live preview also uses — one source of truth, so a preview
 * can never disagree with what actually ships.
 *
 * noStore() ensures this always reads the latest saved theme, never cached.
 */
export async function ThemeInjector() {
  noStore();
  const theme = await getTheme();
  const pair  = fontPairs[theme.fontPair] ?? fontPairs[DEFAULT_THEME.fontPair];

  const css = buildThemeCss(theme);
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
