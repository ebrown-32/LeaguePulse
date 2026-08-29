import './globals.css';
import { unstable_noStore as noStore } from 'next/cache';
import { Space_Grotesk, DM_Sans } from 'next/font/google';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import PageTransition from '@/components/layout/PageTransition';
import ChatWidget from '@/components/chat/ChatWidget';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeInjector } from '@/components/ThemeInjector';
import { InstallPromptProvider } from '@/components/pwa/InstallPromptProvider';
import { getTheme } from '@/lib/themeStorage';
import Analytics from '@/components/analytics/Analytics';
import ParticleField from '@/components/ParticleField';
import type { Metadata } from 'next';
import { DEFAULT_THEME } from '@/lib/themeConfig';
import RouteProgress from '@/components/layout/RouteProgress';

const displayFont = Space_Grotesk({
  subsets:  ['latin'],
  variable: '--font-display-fallback',
  weight:   ['400', '500', '600', '700'],
  display:  'swap',
});

const bodyFont = DM_Sans({
  subsets:  ['latin'],
  variable: '--font-body-fallback',
  weight:   ['300', '400', '500', '600', '700'],
  display:  'swap',
});

/**
 * Title and favicon come from admin-saved theme storage, so a league can put
 * its own name in the browser tab without editing code.
 *
 * This has to be `generateMetadata` rather than a static `metadata` export:
 * the values live in Redis, and a static object is evaluated once at build
 * time, which is why the tab said "League Pulse" no matter what was saved.
 * noStore() keeps an admin change from waiting on a redeploy.
 */
export async function generateMetadata(): Promise<Metadata> {
  noStore();
  const theme = await getTheme().catch(() => DEFAULT_THEME);

  const title = theme.siteTitle?.trim() || theme.leagueName?.trim() || 'League Pulse';
  const description = theme.siteDescription?.trim()
    || 'A new way to consume fantasy football. Give your league a pulse.';
  // Falls back through the custom icon, then the league logo, then the bundled
  // default, so there is always something in the tab.
  //
  // The default lives in public/ rather than src/app/. Next auto-emits a
  // file-based src/app/favicon.ico ahead of anything declared here, and
  // browsers prefer that .ico, so while it sat there the admin's chosen icon
  // was silently ignored.
  const icon = theme.faviconUrl?.trim() || theme.logoUrl?.trim() || '/favicon.ico';

  return {
    title,
    description,
    icons: { icon: [{ url: icon, href: icon }], shortcut: icon, apple: icon },
    openGraph: { title, description, images: [{ url: theme.logoUrl?.trim() || '/logo.png' }] },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Same reason as ThemeInjector: the nav/footer league name and logo come
  // from admin-saved theme storage, so this must never be served from a
  // cached render or an admin save appears to "not apply" until redeploy.
  noStore();
  const theme = await getTheme();

  return (
    <html lang="en" data-bg={theme.background} data-motion={theme.motion} suppressHydrationWarning>
      <body
        className={`
          ${displayFont.variable} ${bodyFont.variable}
          min-h-screen bg-background text-foreground antialiased
        `}
      >
        <RouteProgress />
        <ThemeInjector />
        {theme.background === 'particles' && <ParticleField />}
        <ThemeProvider>
          <InstallPromptProvider logoUrl={theme.logoUrl} leagueName={theme.leagueName}>
            <Analytics />
            <div className="flex min-h-screen flex-col">
              <Navbar logoUrl={theme.logoUrl} leagueName={theme.leagueName} />
              <main className="flex-1 pb-[env(safe-area-inset-bottom)]">
                <PageTransition>{children}</PageTransition>
              </main>
              <Footer />
              <ChatWidget />
            </div>
          </InstallPromptProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
