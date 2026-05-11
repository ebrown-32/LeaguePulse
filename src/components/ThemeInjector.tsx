import { unstable_noStore as noStore } from 'next/cache';
import { getTheme } from '@/lib/themeStorage';
import { fontPairs } from '@/lib/themeConfig';

/**
 * Server component. Fetches the admin-saved theme from storage and injects
 * CSS variable overrides + the correct Google Font <link>.
 * noStore() ensures this always reads the latest saved theme, never cached.
 */
export async function ThemeInjector() {
  noStore();
  const theme = await getTheme();
  const pair  = fontPairs[theme.fontPair] ?? fontPairs['bricolage-dm'];

  // Light mode: keep the lightness a bit lower so teal stays legible on white
  const primaryLight = `${theme.primaryH} ${theme.primaryS}% 35%`;
  // Dark mode: brighter teal pops on the obsidian background
  const primaryDark  = `${theme.primaryH} ${theme.primaryS}% 44%`;

  const radius = `${theme.radiusRem}rem`;

  const css = `
    :root {
      --primary: ${primaryLight};
      --ring:    ${primaryLight};
      --radius:  ${radius};
      --font-display: '${pair.display}';
      --font-body:    '${pair.body}';
    }
    .dark {
      --primary: ${primaryDark};
      --ring:    ${primaryDark};
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
